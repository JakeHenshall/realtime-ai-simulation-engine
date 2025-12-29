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
    logger.info({ sessionId: id }, 'Session started');
    const response = NextResponse.json(session);
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
