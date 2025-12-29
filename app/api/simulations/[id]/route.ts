import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getOrCreateUserId } from '@/lib/auth';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';
import { updateSimulationSchema } from '@/lib/validation';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const clientIp = request.headers.get('x-forwarded-for') || request.ip || 'unknown';
    await checkRateLimit(apiRateLimiter, clientIp);

    const simulation = await db.simulation.findUnique({
      where: { id },
      include: {
        agents: {
          orderBy: { createdAt: 'asc' },
        },
        events: {
          orderBy: { timestamp: 'desc' },
          take: 100,
        },
        analytics: true,
      },
    });

    if (!simulation) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
    }

    return NextResponse.json(simulation);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch simulation');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json({ error: 'Failed to fetch simulation' }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getOrCreateUserId(request);
    const clientIp = request.headers.get('x-forwarded-for') || request.ip || 'unknown';

    await checkRateLimit(apiRateLimiter, clientIp);

    const body = await request.json();
    const data = updateSimulationSchema.parse(body);

    const simulation = await db.simulation.update({
      where: { id },
      data,
    });

    logger.info({ simulationId: id, userId, status: data.status }, 'Simulation updated');

    return NextResponse.json(simulation);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to update simulation');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to update simulation' }, { status: 500 });
  }
}

