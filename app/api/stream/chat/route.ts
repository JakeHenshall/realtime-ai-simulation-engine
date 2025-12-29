import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import { SessionNotFoundError } from '@/lib/services/session-service';
import { streamingLLM } from '@/lib/streaming-llm';
import { PromptComposer } from '@/lib/prompts/prompt-composer';
import { pubsub, StreamEvent } from '@/lib/pubsub';
import { SessionStatus } from '@/generated/prisma/client';
import { metricsAnalyzer } from '@/lib/metrics/analyzer';
import { behaviorAdapter } from '@/lib/metrics/behavior-adapter';

const sessionService = new SessionService(new SessionRepository());
const promptComposer = new PromptComposer();
const repository = new SessionRepository();

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sessionId, message } = body;

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    if (!message || typeof message !== 'string') {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const session = await sessionService.getSession(sessionId);

    if (session.status !== SessionStatus.ACTIVE) {
      return NextResponse.json({ error: 'Session must be active' }, { status: 400 });
    }

    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    const userMessage = await sessionService.appendMessage(sessionId, 'user', message);

    // Get session with messages for context
    const sessionWithMessages = await sessionService.getSession(sessionId);
    const sessionData = sessionWithMessages as any;
    const allMessages = (sessionData.messages || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    const recentMessages = allMessages.slice(-10);

    // Calculate current session metrics
    const sessionMetrics = metricsAnalyzer.calculateSessionMetrics(allMessages);
    
    // Update metrics in database
    await repository.updateBehaviorMetrics(sessionId, sessionMetrics);

    // Determine behavior adaptation based on metrics
    const adaptation = behaviorAdapter.adaptBehavior(sessionMetrics);

    const systemPrompt = promptComposer.buildSystemPrompt({
      persona: {
        name: 'AI Assistant',
        role: 'assistant',
        traits: ['helpful', 'professional'],
        communicationStyle: 'professional',
      },
      objective: {
        primary: 'Provide helpful and accurate responses',
      },
      pressure: (sessionData.preset?.pressure as any) ?? 'MEDIUM',
      behaviorModifier: adaptation.modifier,
      safetyEnforcement: true,
    });

    const userPrompt = promptComposer.buildUserPrompt({
      context: message,
      recentMessages,
    });

    (async () => {
      try {
        let fullResponse = '';

        for await (const chunk of streamingLLM.streamChat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          onChunk: (chunk) => {
            if (chunk.content && !firstTokenTime) {
              firstTokenTime = Date.now();
            }

            const event: StreamEvent = {
              type: chunk.done ? 'done' : 'token',
              data: chunk.content,
              metadata: {
                sessionId,
                messageId: userMessage.id,
                latency: firstTokenTime
                  ? {
                      timeToFirstToken: firstTokenTime - startTime,
                      totalTime: chunk.done ? Date.now() - startTime : undefined,
                    }
                  : undefined,
              },
            };

            pubsub.publish(sessionId, event);
          },
        })) {
          fullResponse += chunk.content;
        }

        const assistantMessage = await sessionService.appendMessage(
          sessionId,
          'assistant',
          fullResponse,
          {
            latency: {
              timeToFirstToken: firstTokenTime ? firstTokenTime - startTime : undefined,
              totalTime: Date.now() - startTime,
            },
            behaviorModifier: adaptation.modifier,
            adaptationReason: adaptation.reason,
          }
        );

        // Recalculate metrics with the new message and update
        const updatedMessages = [...allMessages, { role: 'assistant', content: fullResponse }];
        const updatedMetrics = metricsAnalyzer.calculateSessionMetrics(updatedMessages);
        await repository.updateBehaviorMetrics(sessionId, updatedMetrics);

        const doneEvent: StreamEvent = {
          type: 'done',
          data: '',
          metadata: {
            sessionId,
            messageId: assistantMessage.id,
            latency: {
              timeToFirstToken: firstTokenTime ? firstTokenTime - startTime : undefined,
              totalTime: Date.now() - startTime,
            },
          },
        };

        pubsub.publish(sessionId, doneEvent);
      } catch (error) {
        const errorEvent: StreamEvent = {
          type: 'error',
          data: error instanceof Error ? error.message : 'Unknown error',
          metadata: {
            sessionId,
          },
        };

        pubsub.publish(sessionId, errorEvent);
      }
    })();

    return NextResponse.json({
      messageId: userMessage.id,
      sessionId,
      status: 'processing',
    });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json({ error: 'Failed to process message' }, { status: 500 });
  }
}

