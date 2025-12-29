import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, apiRateLimiter, simulationRateLimiter } from '@/lib/rate-limit';
import { createSimulationSchema } from '@/lib/validation';
import { getOrCreateUserId } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const userId = getOrCreateUserId(request);
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    // Rate limiting
    await checkRateLimit(apiRateLimiter, clientIp);
    await checkRateLimit(simulationRateLimiter, userId);

    const body = await request.json();
    const data = createSimulationSchema.parse(body);

    const simulation = await db.simulation.create({
      data: {
        name: data.name,
        description: data.description,
        status: 'ACTIVE',
      },
    });

    // Create analytics record
    await db.simulationAnalytics.create({
      data: {
        simulationId: simulation.id,
        totalEvents: 0,
        totalActions: 0,
        errorRate: 0,
      },
    });

    logger.info({ simulationId: simulation.id, userId }, 'Simulation created');

    return NextResponse.json(simulation, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create simulation');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create simulation' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = getOrCreateUserId(request);
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';

    await checkRateLimit(apiRateLimiter, clientIp);

    const simulations = await db.simulation.findMany({
      include: {
        agents: true,
        analytics: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return NextResponse.json(simulations);
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to fetch simulations');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    return NextResponse.json({ error: 'Failed to fetch simulations' }, { status: 500 });
  }
}

