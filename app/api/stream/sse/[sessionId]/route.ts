import { NextRequest } from 'next/server';
import { pubsub, StreamEvent } from '@/lib/pubsub';
import { SessionService } from '@/lib/services/session-service';
import { SessionRepository } from '@/lib/repositories/session-repository';
import { SessionNotFoundError } from '@/lib/services/session-service';

const sessionService = new SessionService(new SessionRepository());

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    console.log(`[SSE Route] Connection request for session ${sessionId}`);
    
    await sessionService.getSession(sessionId);

    const clientId = `${Date.now()}-${Math.random()}`;
    pubsub.subscribe(sessionId, clientId);
    console.log(`[SSE Route] Client ${clientId} subscribed to session ${sessionId}`);

    const stream = new ReadableStream({
      start(controller) {
        const handler = (event: StreamEvent) => {
          try {
            console.log(`[SSE Route] Sending ${event.type} event to client for session ${sessionId}`);
            const data = `data: ${JSON.stringify(event)}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch (error) {
            console.error(`[SSE Route] Error sending event:`, error);
            controller.error(error);
          }
        };

        pubsub.on(`session:${sessionId}`, handler);
        console.log(`[SSE Route] Event handler registered for session ${sessionId}`);

        request.signal.addEventListener('abort', () => {
          console.log(`[SSE Route] Connection aborted for session ${sessionId}`);
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
    console.error(`[SSE Route] Error:`, error);
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
