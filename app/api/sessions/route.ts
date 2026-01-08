import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
} from '@/lib/services/session-service';
import { withApiWrapper } from '@/lib/middleware/api-wrapper';
import { createSessionSchema } from '@/lib/validation/api-schemas';
import { z } from 'zod';

const sessionService = new SessionService(new SessionRepository());

const querySchema = z.object({
  limit: z.string().regex(/^\d+$/).transform(Number).optional(),
  offset: z.string().regex(/^\d+$/).transform(Number).optional(),
});

export const POST = withApiWrapper(
  async (request: NextRequest, { logger, validatedBody }) => {
    const { name, presetId } = validatedBody;

    try {
      const session = await sessionService.createSession(name, presetId);
      logger.info({ sessionId: session.id }, 'Session created');
      return NextResponse.json(session, { status: 201 });
    } catch (error) {
      if (error instanceof InvalidStateTransitionError) {
        logger.warn({ error: error.message }, 'Invalid state transition');
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      throw error;
    }
  },
  {
    validateBody: createSessionSchema,
  }
);

export const GET = withApiWrapper(
  async (request: NextRequest, { logger }) => {
    const { searchParams } = new URL(request.url);
    
    // Validate and sanitize query parameters
    const limitStr = searchParams.get('limit') || '50';
    const offsetStr = searchParams.get('offset') || '0';
    
    const limit = Math.min(Math.max(parseInt(limitStr, 10) || 50, 1), 100);
    const offset = Math.max(parseInt(offsetStr, 10) || 0, 0);
    
    if (isNaN(limit) || isNaN(offset)) {
      return NextResponse.json(
        { error: 'Invalid limit or offset parameter' },
        { status: 400 }
      );
    }

    const repository = new SessionRepository();
    const sessions = await repository.list(limit, offset);
    logger.info({ count: sessions.length }, 'Sessions fetched');
    return NextResponse.json(sessions);
  }
);
