import { getRedis } from './redis';
import { logger } from './logger';

export async function publishSimulationEvent(
  simulationId: string,
  event: {
    type: string;
    data: any;
    agentId?: string;
  }
): Promise<void> {
  try {
    const redis = getRedis();
    const channel = `simulation:${simulationId}`;
    const message = JSON.stringify({
      ...event,
      timestamp: new Date().toISOString(),
    });

    await redis.publish(channel, message);
    logger.debug({ simulationId, eventType: event.type }, 'Published real-time event');
  } catch (error) {
    logger.error({ error, simulationId }, 'Failed to publish real-time event');
  }
}

