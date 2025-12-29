import { NextRequest } from 'next/server';
import { pubsub, StreamEvent } from '@/lib/pubsub';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import { SessionNotFoundError } from '@/lib/services/session-service';

const sessionService = new SessionService(new SessionRepository());

export async function GET(
  request: NextRequest,
  { params }: { params: { sessionId: string } }
) {
  try {
    await sessionService.getSession(params.sessionId);

    const clientId = `${Date.now()}-${Math.random()}`;
    pubsub.subscribe(params.sessionId, clientId);

    const stream = new ReadableStream({
      start(controller) {
        const handler = (event: StreamEvent) => {
          try {
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));

            if (event.type === 'done' || event.type === 'error') {
              controller.close();
            }
          } catch (error) {
            controller.error(error);
          }
        };

        pubsub.on(`session:${params.sessionId}`, handler);

        request.signal.addEventListener('abort', () => {
          pubsub.off(`session:${params.sessionId}`, handler);
          pubsub.unsubscribe(params.sessionId, clientId);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      },
    });
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Failed to establish SSE connection' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

