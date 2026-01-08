import { NextRequest } from 'next/server';
import { pubsub, StreamEvent } from '@/lib/pubsub';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import { SessionNotFoundError } from '@/lib/services/session-service';
import { createRequestLogger } from '@/lib/logger';
import { getRequestId } from '@/lib/middleware/request-id';

const sessionService = new SessionService(new SessionRepository());

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  try {
    const { sessionId } = await params;
    logger.info({ sessionId }, 'SSE connection request');
    
    await sessionService.getSession(sessionId);

    const clientId = `${Date.now()}-${Math.random()}`;
    pubsub.subscribe(sessionId, clientId);
    logger.info({ sessionId, clientId }, 'Client subscribed to session');

    const stream = new ReadableStream({
      start(controller) {
        const handler = (event: StreamEvent) => {
          try {
            logger.debug({ sessionId, eventType: event.type }, 'Sending event to client');
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch (error) {
            logger.error({ sessionId, error }, 'Error sending event');
            controller.error(error);
          }
        };

        pubsub.on(`session:${sessionId}`, handler);
        logger.debug({ sessionId }, 'Event handler registered');

        request.signal.addEventListener('abort', () => {
          logger.info({ sessionId }, 'Connection aborted');
          pubsub.off(`session:${sessionId}`, handler);
          pubsub.unsubscribe(sessionId, clientId);
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
    logger.error({ error }, 'Failed to establish SSE connection');
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
