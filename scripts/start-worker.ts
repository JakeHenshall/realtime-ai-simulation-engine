import { startWorker } from '../lib/worker';
import { logger } from '../lib/logger';

logger.info('Starting agent action worker...');

const worker = startWorker();

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down worker...');
  await worker.close();
  process.exit(0);
});

