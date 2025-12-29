// import { startAgentActionWorker } from './queue';
import { logger } from './logger';
// import { Worker } from 'bullmq';

let worker: any = null;

export function startWorker() {
  if (worker) {
    logger.warn('Worker already started');
    return worker;
  }

  logger.info('Worker functionality not available - database models not implemented');
  throw new Error('Worker functionality not available - database models not implemented');
  // worker = startAgentActionWorker();
  // return worker;
}

export async function stopWorker() {
  if (worker) {
    logger.info('Stopping agent action worker');
    await worker.close();
    worker = null;
  }
}

