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
import { appendMessageSchema } from '@/lib/validation/api-schemas';
import { ZodError } from 'zod';

const sessionService = new SessionService(new SessionRepository());

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  try {
    const { id } = await params;

    // Rate limiting by session ID
    const rateLimitResult = await checkRateLimit(request, id);
    if (!rateLimitResult.allowed) {
      logger.warn({ sessionId: id }, 'Rate limit exceeded');
      return createRateLimitResponse(rateLimitResult.msBeforeNext);
    }

    // Validate body
    let body: { role: string; content: string; metadata?: Record<string, any> };
    try {
      const rawBody = await request.json();
      body = appendMessageSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ errors: error.issues }, 'Validation error');
        return NextResponse.json(
          { error: 'Validation failed', details: error.issues, requestId },
          { status: 400 }
        );
      }
      throw error;
    }

    const message = await sessionService.appendMessage(
      id,
      body.role,
      body.content,
      body.metadata
    );

    logger.info({ sessionId: id, messageId: message.id }, 'Message appended');
    const response = NextResponse.json(message, { status: 201 });
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      logger.warn({ sessionId: (await params).id }, 'Session not found');
      return NextResponse.json({ error: error.message, requestId }, { status: 404 });
    }

    if (error instanceof InvalidStateTransitionError) {
      logger.warn({ sessionId: (await params).id, error: error.message }, 'Invalid state transition');
      return NextResponse.json({ error: error.message, requestId }, { status: 400 });
    }

    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to append message');
    return NextResponse.json({ error: 'Failed to append message', requestId }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  try {
    const { id } = await params;

    // Rate limiting by session ID
    const rateLimitResult = await checkRateLimit(request, id);
    if (!rateLimitResult.allowed) {
      logger.warn({ sessionId: id }, 'Rate limit exceeded');
      return createRateLimitResponse(rateLimitResult.msBeforeNext);
    }

    const session = await sessionService.getSession(id);
    
    // Type assertion needed because getSession returns session with messages included
    const sessionWithMessages = session as typeof session & { messages: any[] };

    logger.info({ sessionId: id, messageCount: sessionWithMessages.messages?.length || 0 }, 'Messages fetched');
    const response = NextResponse.json(sessionWithMessages.messages || []);
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      logger.warn({ sessionId: (await params).id }, 'Session not found');
      return NextResponse.json({ error: error.message, requestId }, { status: 404 });
    }

    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to fetch messages');
    return NextResponse.json({ error: 'Failed to fetch messages', requestId }, { status: 500 });
  }
}
