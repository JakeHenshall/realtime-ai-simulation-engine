import { NextRequest } from 'next/server';
import Redis from 'ioredis';
import { checkRateLimit, apiRateLimiter } from '@/lib/rate-limit';

export async function GET(request: NextRequest) {
  const clientIp = request.headers.get('x-forwarded-for') || request.ip || 'unknown';

  try {
    await checkRateLimit(apiRateLimiter, clientIp);
  } catch (error: any) {
    return new Response(error.message, { status: 429 });
  }

  const { searchParams } = new URL(request.url);
  const simulationId = searchParams.get('simulationId');

  if (!simulationId) {
    return new Response('simulationId is required', { status: 400 });
  }

  // Set up SSE headers
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const stream = new ReadableStream({
    async start(controller) {
      const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
      const subscriber = new Redis(redisUrl);

      const channel = `simulation:${simulationId}`;

      // Subscribe to simulation events
      subscriber.subscribe(channel);

      subscriber.on('message', (ch, message) => {
        if (ch === channel) {
          try {
            const data = `data: ${message}\n\n`;
            controller.enqueue(new TextEncoder().encode(data));
          } catch (error) {
            console.error('Error sending SSE message:', error);
          }
        }
      });

      // Send initial connection message
      const initMessage = `data: ${JSON.stringify({ type: 'connected', simulationId })}\n\n`;
      controller.enqueue(new TextEncoder().encode(initMessage));

      // Keep connection alive with heartbeat
      const heartbeatInterval = setInterval(() => {
        try {
          const heartbeat = `data: ${JSON.stringify({ type: 'heartbeat', timestamp: Date.now() })}\n\n`;
          controller.enqueue(new TextEncoder().encode(heartbeat));
        } catch (error) {
          clearInterval(heartbeatInterval);
          subscriber.unsubscribe(channel);
          subscriber.quit();
          controller.close();
        }
      }, 30000); // Every 30 seconds

      // Cleanup on close
      request.signal.addEventListener('abort', () => {
        clearInterval(heartbeatInterval);
        subscriber.unsubscribe(channel);
        subscriber.quit();
        controller.close();
      });
    },
  });

  return new Response(stream, { headers });
}

