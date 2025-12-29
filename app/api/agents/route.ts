import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';
import { getOrCreateUserId } from '@/lib/auth';
import { createAgentSchema } from '@/lib/validation';

export async function POST(request: NextRequest) {
  try {
    const userId = getOrCreateUserId(request);
    const clientIp = request.headers.get('x-forwarded-for') || request.ip || 'unknown';

    await checkRateLimit(apiRateLimiter, clientIp);

    const body = await request.json();
    const data = createAgentSchema.parse(body);

    // Verify simulation exists
    const simulation = await db.simulation.findUnique({
      where: { id: data.simulationId },
    });

    if (!simulation) {
      return NextResponse.json({ error: 'Simulation not found' }, { status: 404 });
    }

    const agent = await db.agent.create({
      data: {
        simulationId: data.simulationId,
        name: data.name,
        role: data.role,
        personality: data.personality,
        status: 'IDLE',
      },
    });

    // Create initial event
    await db.simulationEvent.create({
      data: {
        simulationId: data.simulationId,
        agentId: agent.id,
        type: 'SYSTEM',
        data: JSON.stringify({ message: `Agent ${agent.name} joined the simulation` }),
      },
    });

    logger.info({ agentId: agent.id, simulationId: data.simulationId, userId }, 'Agent created');

    return NextResponse.json(agent, { status: 201 });
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to create agent');

    if (error.message.includes('Rate limit')) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    if (error.name === 'ZodError') {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }

    return NextResponse.json({ error: 'Failed to create agent' }, { status: 500 });
  }
}

