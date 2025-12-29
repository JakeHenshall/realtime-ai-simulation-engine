import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { SessionStatus } from '@/generated/prisma/client';

export async function GET() {
  try {
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

    return NextResponse.json({
      sessions: sessionsWithDuration,
      stats: {
        totalCount,
        avgDuration,
        avgClarity,
        avgAccuracy,
        avgEmpathy,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch analytics' },
      { status: 500 }
    );
  }
}

