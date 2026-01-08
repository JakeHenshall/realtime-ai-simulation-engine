import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
} from '@/lib/services/session-service';
import { getRequestId } from '@/lib/middleware/request-id';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rate-limit';
import { createRequestLogger } from '@/lib/logger';
import OpenAI from 'openai';

const sessionService = new SessionService(new SessionRepository());

type PresetConfig = {
  openingMessage?: string;
  openingMessages?: string[];
};

const SCENARIO_PROMPTS: Record<string, string[]> = {
  'Crisis Management': [
    "Simulated Critical System Outage: core services are down for thousands of users. You're the on-call lead. What are your first three actions and how will you communicate?",
    'Simulated Critical System Outage: database writes are timing out across the platform. What is your immediate triage plan and who do you notify?',
    'Simulated Critical System Outage: a bad deploy just rolled out and core APIs are failing. What do you do in the first 5 minutes?',
  ],
  'Customer Support Escalation': [
    'A frustrated customer is on the line about a critical service failure. How do you open the conversation and gather the key details?',
    'You receive an urgent escalation: a key customer cannot access their account. How do you respond and begin troubleshooting?',
    'A customer threatens to churn after a repeated outage. What do you say first and what information do you request?',
  ],
  'Team Collaboration': [
    'You are leading a team meeting where priorities are in conflict. How do you open and align the group on the agenda?',
    'Two stakeholders disagree on the roadmap. How do you frame the discussion and set a productive tone?',
    'A cross-functional team is split on resource allocation. How do you kick off the meeting to drive consensus?',
  ],
};

const pickRandomMessage = (messages: string[]): string => {
  const trimmed = messages.map((message) => message.trim()).filter(Boolean);
  if (trimmed.length === 0) {
    return '';
  }
  const index = Math.floor(Math.random() * trimmed.length);
  return trimmed[index] ?? '';
};

const getScenarioPrompt = (sessionData: {
  preset?: { name?: string; config?: string } | null;
}): string | null => {
  const presetName = sessionData.preset?.name ?? '';

  const config = sessionData.preset?.config;
  if (config) {
    try {
      const parsed = JSON.parse(config) as PresetConfig;
      if (Array.isArray(parsed.openingMessages) && parsed.openingMessages.length > 0) {
        const picked = pickRandomMessage(parsed.openingMessages);
        if (picked) {
          return picked;
        }
      }
    } catch {
      // Ignore invalid preset config JSON.
    }
  }

  const fallbackPool = SCENARIO_PROMPTS[presetName];
  if (fallbackPool?.length) {
    return pickRandomMessage(fallbackPool) || null;
  }

  if (config) {
    try {
      const parsed = JSON.parse(config) as PresetConfig;
      if (parsed.openingMessage?.trim()) {
        return parsed.openingMessage.trim();
      }
    } catch {
      // Ignore invalid preset config JSON.
    }
  }

  return null;
};

const generateOpeningMessageFromOpenAI = async (
  scenarioPrompt: string,
  presetName: string
): Promise<string> => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
  });

  const systemPrompt = getSystemPromptForPreset(presetName);

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: scenarioPrompt },
    ],
    temperature: 0.7,
    max_tokens: 300,
  });

  return response.choices[0]?.message?.content || scenarioPrompt;
};

const getSystemPromptForPreset = (presetName: string): string => {
  switch (presetName) {
    case 'Customer Support Escalation':
      return `You are a Senior Customer Support Specialist. Generate an opening response to begin a customer support simulation scenario. Be direct, empathetic, and action-oriented. This is the first message to set the scene for the user to respond to. Keep it concise (2-3 sentences max). Do not use emojis.`;
    case 'Team Collaboration':
      return `You are a Senior Team Leader. Generate an opening response to begin a team collaboration simulation scenario. Be direct, outcome-focused, and set clear expectations. This is the first message to set the scene for the user to respond to. Keep it concise (2-3 sentences max). Do not use emojis.`;
    default:
      return `You are a Senior Incident Commander. Generate an opening response to begin a crisis management simulation scenario. Be calm, direct, and operational. This is the first message to set the scene for the user to respond to. Keep it concise (2-3 sentences max). Do not use emojis.`;
  }
};

export async function POST(
  request: NextRequest,
  routeContext: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  try {
    const { id } = await routeContext.params;

    // Rate limiting by session ID
    const rateLimitResult = await checkRateLimit(request, id);
    if (!rateLimitResult.allowed) {
      logger.warn({ sessionId: id }, 'Rate limit exceeded');
      return createRateLimitResponse(rateLimitResult.msBeforeNext);
    }

    const session = await sessionService.startSession(id);
    const sessionData = (await sessionService.getSession(id)) as any;
    const existingMessages = sessionData?.messages ?? [];
    const scenarioPrompt = getScenarioPrompt(sessionData);
    const presetName = sessionData.preset?.name ?? '';
    
    let openingMessage: string | null = null;
    
    // Only generate opening message if there are NO messages (including any that might have been created concurrently)
    if (scenarioPrompt && existingMessages.length === 0) {
      // Double-check messages again after getting session to prevent race conditions
      const freshSessionData = (await sessionService.getSession(id)) as any;
      const freshMessages = freshSessionData?.messages ?? [];
      
      if (freshMessages.length === 0) {
        try {
          openingMessage = await generateOpeningMessageFromOpenAI(scenarioPrompt, presetName);
          
          // Await the message save to prevent race conditions
          await sessionService.appendMessage(id, 'assistant', openingMessage, {
            type: 'opening-message',
            provider: 'openai',
          });
        } catch (err) {
          // Fallback to scenario prompt if OpenAI fails
          logger.warn({ error: err instanceof Error ? err.message : 'Unknown error' }, 'OpenAI opening message generation failed, using fallback');
          openingMessage = scenarioPrompt;
          try {
            await sessionService.appendMessage(id, 'assistant', openingMessage, {
              type: 'opening-message',
              provider: 'fallback',
            });
          } catch (saveErr) {
            logger.error({ error: saveErr instanceof Error ? saveErr.message : 'Unknown error' }, 'Failed to save opening message');
          }
        }
      } else {
        // Message already exists, use the first one as opening message for response
        openingMessage = freshMessages[0].content;
      }
    }
    
    logger.info({ sessionId: id, provider: 'openai' }, 'Session started with OpenAI-generated opening');
    const response = NextResponse.json({
      ...session,
      openingMessage: openingMessage || undefined,
    });
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      logger.warn({ sessionId: (await routeContext.params).id }, 'Session not found');
      return NextResponse.json({ error: error.message, requestId }, { status: 404 });
    }

    if (error instanceof InvalidStateTransitionError) {
      logger.warn({ sessionId: (await routeContext.params).id, error: error.message }, 'Invalid state transition');
      return NextResponse.json({ error: error.message, requestId }, { status: 400 });
    }

    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to start session');
    return NextResponse.json({ error: 'Failed to start session', requestId }, { status: 500 });
  }
}
