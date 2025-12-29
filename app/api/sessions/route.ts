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
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    const repository = new SessionRepository();
    const sessions = await repository.list(limit, offset);
    logger.info({ count: sessions.length }, 'Sessions fetched');
    return NextResponse.json(sessions);
  }
);

