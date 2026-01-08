import { analysisQueue } from './analysis-queue';
import { analysisService } from '../analysis/analysis-service';
import { logger } from '../logger';

// Track if worker has been started
declare global {
  var __analysisWorkerStarted__: boolean | undefined;
}

/**
 * Initialize the analysis queue worker
 * This should be called once when the app starts
 */
export function startAnalysisWorker(): void {
  if (global.__analysisWorkerStarted__) {
    console.log('[AnalysisWorker] Already started, skipping');
    return;
  }
  
  global.__analysisWorkerStarted__ = true;
  
  analysisQueue.setProcessor(async (job) => {
    console.log('[AnalysisWorker] Processing job:', job.sessionId);
    await analysisService.processAnalysisJob(job);
  });

  console.log('[AnalysisWorker] Worker started');
  logger.info('Analysis queue worker started');
}

// Auto-start worker when module is imported
if (typeof window === 'undefined') {
  // Only run on server side
  startAnalysisWorker();
}

