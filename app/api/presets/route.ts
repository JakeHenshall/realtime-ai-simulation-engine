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
      openingMessages: [
        'A frustrated customer is on the line about a critical service failure. How do you open the conversation and gather the key details?',
        'You receive an urgent escalation: a key customer cannot access their account. How do you respond and begin troubleshooting?',
        'A customer threatens to churn after a repeated outage. What do you say first and what information do you request?',
      ],
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
      openingMessages: [
        'You are leading a team meeting where priorities are in conflict. How do you open and align the group on the agenda?',
        'Two stakeholders disagree on the roadmap. How do you frame the discussion and set a productive tone?',
        'A cross-functional team is split on resource allocation. How do you kick off the meeting to drive consensus?',
      ],
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
      openingMessages: [
        "Simulated Critical System Outage: core services are down for thousands of users. You're the on-call lead. What are your first three actions and how will you communicate?",
        'Simulated Critical System Outage: database writes are timing out across the platform. What is your immediate triage plan and who do you notify?',
        'Simulated Critical System Outage: a bad deploy just rolled out and core APIs are failing. What do you do in the first 5 minutes?',
      ],
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    logger.error({ error: errorMessage, stack: errorStack }, 'Failed to fetch presets');
    
    // Return detailed error in development, generic in production
    return NextResponse.json(
      { 
        error: 'Failed to fetch presets', 
        message: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
        requestId 
      },
      { status: 500 }
    );
  }
}
