import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  try {
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    await checkRateLimit(apiRateLimiter, clientIp);

    const { searchParams } = new URL(request.url);
    const simulationId = searchParams.get('simulationId');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where = simulationId ? { simulationId } : {};

    const events = await db.simulationEvent.findMany({
      where,
      include: {
        agent: {
          select: {
            id: true,
            name: true,
            role: true,
          },
        },
      },
      orderBy: { timestamp: 'desc' },
      take: Math.min(limit, 500),
      skip: offset,
    });

    return NextResponse.json(events);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch events');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
  }
}

