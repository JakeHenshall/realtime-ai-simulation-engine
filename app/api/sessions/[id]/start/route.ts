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

const sessionService = new SessionService(new SessionRepository());

type PresetConfig = {
  openingMessage?: string;
  openingMessages?: string[];
};

const DEFAULT_OPENING_MESSAGES: Record<string, string[]> = {
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

const resolveOpeningMessage = (sessionData: {
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

  const fallbackPool = DEFAULT_OPENING_MESSAGES[presetName];
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
    const openingMessage = resolveOpeningMessage(sessionData);
    
    // Create opening message in background, but return it immediately
    if (openingMessage && existingMessages.length === 0) {
      // Don't await - let it happen in background for instant response
      sessionService.appendMessage(id, 'assistant', openingMessage, {
        type: 'opening-message',
      }).catch((err) => {
        logger.error({ error: err instanceof Error ? err.message : 'Unknown error' }, 'Failed to save opening message');
      });
    }
    
    logger.info({ sessionId: id }, 'Session started');
    const response = NextResponse.json({
      ...session,
      openingMessage: openingMessage && existingMessages.length === 0 ? openingMessage : undefined,
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
