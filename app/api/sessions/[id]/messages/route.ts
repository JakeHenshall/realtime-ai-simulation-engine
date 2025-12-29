import { NextRequest, NextResponse } from 'next/server';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import {
  InvalidStateTransitionError,
  SessionNotFoundError,
} from '@/lib/services/session-service';

const sessionService = new SessionService(new SessionRepository());

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { role, content, metadata } = body;

    if (!role || typeof role !== 'string') {
      return NextResponse.json(
        { error: 'Role is required and must be a string' },
        { status: 400 }
      );
    }

    if (!content || typeof content !== 'string') {
      return NextResponse.json(
        { error: 'Content is required and must be a string' },
        { status: 400 }
      );
    }

    const message = await sessionService.appendMessage(
      id,
      role,
      content,
      metadata
    );

    return NextResponse.json(message, { status: 201 });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    if (error instanceof InvalidStateTransitionError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: 'Failed to append message' },
      { status: 500 }
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await sessionService.getSession(id);
    
    // Type assertion needed because getSession returns session with messages included
    const sessionWithMessages = session as typeof session & { messages: any[] };

    return NextResponse.json(sessionWithMessages.messages || []);
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(
      { error: 'Failed to fetch messages' },
      { status: 500 }
    );
  }
}

