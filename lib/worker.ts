import { startAgentActionWorker } from './queue';
import { logger } from './logger';
import { Worker } from 'bullmq';

let worker: Worker | null = null;

export function startWorker() {
  if (worker) {
    logger.warn('Worker already started');
    return worker;
  }

  logger.info('Starting agent action worker');
  worker = startAgentActionWorker();
  return worker;
}

export async function stopWorker() {
  if (worker) {
    logger.info('Stopping agent action worker');
    await worker.close();
    worker = null;
  }
}

