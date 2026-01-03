import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SessionStatus } from '@prisma/client';
import { getRequestId } from '@/lib/middleware/request-id';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rate-limit';
import { createRequestLogger } from '@/lib/logger';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  try {
    // Rate limiting
    const rateLimitResult = await checkRateLimit(request);
    if (!rateLimitResult.allowed) {
      logger.warn('Rate limit exceeded');
      return createRateLimitResponse(rateLimitResult.msBeforeNext);
    }
    const sessions = await db.simulationSession.findMany({
      where: {
        status: SessionStatus.COMPLETED,
      },
      include: {
        preset: true,
        analysis: true,
      },
      orderBy: { completedAt: 'desc' },
      take: 100,
    });

    const sessionsWithDuration = sessions.map((session) => {
      let duration = null;
      if (session.startedAt && session.completedAt) {
        duration = Math.round(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000
        );
      }

      let scores = null;
      if (session.analysis?.insights) {
        try {
          const parsed = JSON.parse(session.analysis.insights);
          if (parsed.scores) {
            scores = parsed.scores;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }

      return {
        id: session.id,
        name: session.name,
        preset: session.preset?.name || null,
        duration,
        scores,
        completedAt: session.completedAt,
      };
    });

    // Calculate aggregate stats
    const completedSessions = sessionsWithDuration.filter((s) => s.duration !== null);
    const sessionsWithScores = sessionsWithDuration.filter((s) => s.scores !== null);

    const totalCount = completedSessions.length;
    const avgDuration =
      completedSessions.length > 0
        ? Math.round(
            completedSessions.reduce((sum, s) => sum + (s.duration || 0), 0) /
              completedSessions.length
          )
        : 0;

    const avgClarity =
      sessionsWithScores.length > 0
        ? Math.round(
            sessionsWithScores.reduce(
              (sum, s) => sum + (s.scores?.clarity || 0),
              0
            ) / sessionsWithScores.length
          )
        : 0;

    const avgAccuracy =
      sessionsWithScores.length > 0
        ? Math.round(
            sessionsWithScores.reduce(
              (sum, s) => sum + (s.scores?.accuracy || 0),
              0
            ) / sessionsWithScores.length
          )
        : 0;

    const avgEmpathy =
      sessionsWithScores.length > 0
        ? Math.round(
            sessionsWithScores.reduce(
              (sum, s) => sum + (s.scores?.empathy || 0),
              0
            ) / sessionsWithScores.length
          )
        : 0;

    logger.info({ sessionCount: sessionsWithDuration.length }, 'Analytics fetched');
    const response = NextResponse.json({
      sessions: sessionsWithDuration,
      stats: {
        totalCount,
        avgDuration,
        avgClarity,
        avgAccuracy,
        avgEmpathy,
      },
    });
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to fetch analytics');
    return NextResponse.json(
      { error: 'Failed to fetch analytics', requestId },
      { status: 500 }
    );
  }
}
