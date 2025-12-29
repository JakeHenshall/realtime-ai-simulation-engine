import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
} from '@/lib/services/session-service';
import { analysisQueue } from '@/lib/jobs/analysis-queue';
import { SessionStatus } from '@/generated/prisma/client';
// Initialize worker on import
import '@/lib/jobs/worker';

const sessionService = new SessionService(new SessionRepository());

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { error } = body;

    const session = await sessionService.endSession(id, error);

    // Queue analysis job for completed sessions (not errors)
    if (session.status === SessionStatus.COMPLETED) {
      analysisQueue.enqueue({
        sessionId: id,
        attempts: 0,
        maxAttempts: 3,
      });
    }

    return NextResponse.json(session);
  } catch (err) {
    if (err instanceof SessionNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }

    if (err instanceof InvalidStateTransitionError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to end session' },
      { status: 500 }
    );
  }
}

