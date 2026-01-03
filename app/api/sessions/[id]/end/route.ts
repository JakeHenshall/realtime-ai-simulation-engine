import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
} from '@/lib/services/session-service';
import { analysisQueue } from '@/lib/jobs/analysis-queue';
import { SessionStatus } from '@prisma/client';
import { getRequestId } from '@/lib/middleware/request-id';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rate-limit';
import { createRequestLogger } from '@/lib/logger';
import { endSessionSchema } from '@/lib/validation/api-schemas';
import { ZodError } from 'zod';
// Initialize worker on import
import '@/lib/jobs/worker';

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
    let body: { error?: string } = {};
    try {
      const rawBody = await request.json().catch(() => ({}));
      body = endSessionSchema.parse(rawBody);
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ errors: error.issues }, 'Validation error');
        return NextResponse.json(
          { error: 'Validation failed', details: error.issues, requestId },
          { status: 400 }
        );
      }
    }

    const session = await sessionService.endSession(id, body.error);

    // Queue analysis job for completed sessions (not errors)
    if (session.status === SessionStatus.COMPLETED) {
      analysisQueue.enqueue({
        sessionId: id,
        attempts: 0,
        maxAttempts: 3,
      });
      logger.info({ sessionId: id }, 'Analysis job queued');
    }

    logger.info({ sessionId: id, status: session.status }, 'Session ended');
    const response = NextResponse.json(session);
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      logger.warn({ sessionId: (await params).id }, 'Session not found');
      return NextResponse.json({ error: err.message, requestId }, { status: 404 });
    }

    if (err instanceof InvalidStateTransitionError) {
      logger.warn({ sessionId: (await params).id, error: err.message }, 'Invalid state transition');
      return NextResponse.json({ error: err.message, requestId }, { status: 400 });
    }

    logger.error({ error: err instanceof Error ? err.message : 'Unknown error' }, 'Failed to end session');
    return NextResponse.json({ error: 'Failed to end session', requestId }, { status: 500 });
  }
}

