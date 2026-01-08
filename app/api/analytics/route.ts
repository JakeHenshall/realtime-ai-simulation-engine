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

    const { searchParams } = new URL(request.url);
    const page = Math.max(parseInt(searchParams.get('page') || '1', 10), 1);
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '20', 10), 1), 50);
    const skip = (page - 1) * limit;

    const [sessions, totalCount] = await Promise.all([
      db.simulationSession.findMany({
        where: {
          status: SessionStatus.COMPLETED,
        },
        include: {
          preset: true,
          analysis: true,
        },
        orderBy: { completedAt: 'desc' },
        take: limit,
        skip,
      }),
      db.simulationSession.count({
        where: {
          status: SessionStatus.COMPLETED,
        },
      }),
    ]);

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

    // Calculate aggregate stats from ALL completed sessions
    const allSessions = await db.simulationSession.findMany({
      where: {
        status: SessionStatus.COMPLETED,
      },
      include: {
        analysis: true,
      },
    });

    let totalDuration = 0;
    let countWithDuration = 0;
    let totalClarity = 0;
    let totalAccuracy = 0;
    let totalEmpathy = 0;
    let countWithScores = 0;

    allSessions.forEach((session) => {
      if (session.startedAt && session.completedAt) {
        totalDuration += Math.round(
          (session.completedAt.getTime() - session.startedAt.getTime()) / 1000
        );
        countWithDuration++;
      }

      if (session.analysis?.insights) {
        try {
          const parsed = JSON.parse(session.analysis.insights);
          if (parsed.scores) {
            totalClarity += parsed.scores.clarity || 0;
            totalAccuracy += parsed.scores.accuracy || 0;
            totalEmpathy += parsed.scores.empathy || 0;
            countWithScores++;
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    const avgDuration = countWithDuration > 0 ? Math.round(totalDuration / countWithDuration) : 0;
    const avgClarity = countWithScores > 0 ? Math.round(totalClarity / countWithScores) : 0;
    const avgAccuracy = countWithScores > 0 ? Math.round(totalAccuracy / countWithScores) : 0;
    const avgEmpathy = countWithScores > 0 ? Math.round(totalEmpathy / countWithScores) : 0;

    logger.info({ sessionCount: sessionsWithDuration.length, page, totalCount }, 'Analytics fetched');
    const response = NextResponse.json({
      sessions: sessionsWithDuration,
      pagination: {
        page,
        limit,
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
      },
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
