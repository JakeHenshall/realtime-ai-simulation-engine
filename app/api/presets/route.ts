import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getRequestId } from '@/lib/middleware/request-id';
import { checkRateLimit, createRateLimitResponse } from '@/lib/middleware/rate-limit';
import { createRequestLogger } from '@/lib/logger';

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

    const presets = await db.scenarioPreset.findMany({
      orderBy: { createdAt: 'desc' },
    });

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

