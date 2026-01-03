import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestId } from '@/lib/middleware/request-id';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rate-limit';
import { createRequestLogger } from '@/lib/logger';
import { PressureLevel } from '@prisma/client';

export const runtime = 'nodejs';

const defaultPresets = [
  {
    name: 'Customer Support Escalation',
    description: 'Handle a frustrated customer with a complex technical issue',
    pressure: PressureLevel.HIGH,
    config: JSON.stringify({
      customerTone: 'frustrated',
      issueComplexity: 'high',
      timeLimit: 15,
      escalationRisk: true,
    }),
  },
  {
    name: 'Team Collaboration',
    description: 'Facilitate a team meeting with conflicting opinions',
    pressure: PressureLevel.MEDIUM,
    config: JSON.stringify({
      participants: 5,
      topic: 'project_priorities',
      conflictLevel: 'moderate',
      timeLimit: 30,
    }),
  },
  {
    name: 'Crisis Management',
    description: 'Respond to a critical system outage under time pressure',
    pressure: PressureLevel.CRITICAL,
    config: JSON.stringify({
      severity: 'critical',
      affectedUsers: 10000,
      timeLimit: 5,
      communicationChannels: ['slack', 'email', 'phone'],
    }),
  },
];

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

    let presets = await db.scenarioPreset.findMany({
      orderBy: { createdAt: 'desc' },
    });

    if (presets.length === 0) {
      await db.scenarioPreset.createMany({
        data: defaultPresets,
      });
      presets = await db.scenarioPreset.findMany({
        orderBy: { createdAt: 'desc' },
      });
    }

    logger.info({ count: presets.length }, 'Presets fetched');
    const response = NextResponse.json(presets);
    response.headers.set('x-request-id', requestId);
    return response;
  } catch (error) {
    logger.error({ error: error instanceof Error ? error.message : 'Unknown error' }, 'Failed to fetch presets');
    return NextResponse.json(
      { error: 'Failed to fetch presets', requestId },
      { status: 500 }
    );
  }
}
