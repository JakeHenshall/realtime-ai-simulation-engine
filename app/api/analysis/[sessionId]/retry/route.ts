import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { analysisQueue } from '@/lib/jobs/analysis-queue';
import { SessionStatus } from '@prisma/client';
import { getRequestId } from '@/lib/middleware/request-id';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rate-limit';
import { createRequestLogger } from '@/lib/logger';
// Initialize worker on import
import '@/lib/jobs/worker';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  try {
    const { sessionId } = await params;

    const rateLimitResult = await checkRateLimit(request, sessionId);
    if (!rateLimitResult.allowed) {
      logger.warn({ sessionId }, 'Rate limit exceeded');
      return createRateLimitResponse(rateLimitResult.msBeforeNext);
    }

    const session = await db.simulationSession.findUnique({
      where: { id: sessionId },
      include: { analysis: true },
    });

    if (!session) {
      return NextResponse.json({ error: 'Session not found', requestId }, { status: 404 });
    }

    if (session.status !== SessionStatus.COMPLETED) {
      return NextResponse.json(
        { error: 'Session must be completed to analyze', requestId },
        { status: 400 }
      );
    }

    if (session.analysis) {
      return NextResponse.json(
        { message: 'Analysis already exists', requestId },
        { status: 200 }
      );
    }

    analysisQueue.enqueue({
      sessionId,
      attempts: 0,
      maxAttempts: 3,
    });

    logger.info({ sessionId }, 'Analysis retry queued');
    const response = NextResponse.json({ status: 'queued', requestId }, { status: 202 });
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      'Failed to retry analysis'
    );
    return NextResponse.json({ error: 'Failed to retry analysis', requestId }, { status: 500 });
  }
}
