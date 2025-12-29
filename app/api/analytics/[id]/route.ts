import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const clientIp = request.headers.get('x-forwarded-for') || request.ip || 'unknown';
    await checkRateLimit(apiRateLimiter, clientIp);

    const analytics = await db.simulationAnalytics.findUnique({
      where: { simulationId: params.id },
    });

    if (!analytics) {
      return NextResponse.json({ error: 'Analytics not found' }, { status: 404 });
    }

    // Get additional real-time metrics
    const [activeAgents, pendingActions, recentErrors] = await Promise.all([
      db.agent.count({
        where: {
          simulationId: params.id,
          status: { in: ['THINKING', 'ACTING'] },
        },
      }),
      db.agentAction.count({
        where: {
          agent: { simulationId: params.id },
          status: 'PENDING',
        },
      }),
      db.simulationEvent.count({
        where: {
          simulationId: params.id,
          type: 'ERROR',
          timestamp: {
            gte: new Date(Date.now() - 3600000), // Last hour
          },
        },
      }),
    ]);

    return NextResponse.json({
      ...analytics,
      activeAgents,
      pendingActions,
      recentErrors,
    });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch analytics');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json({ error: 'Failed to fetch analytics' }, { status: 500 });
  }
}

