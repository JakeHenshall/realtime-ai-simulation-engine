import { analysisQueue } from './analysis-queue';
import { analysisService } from '../analysis/analysis-service';
import { logger } from '../logger';

/**
 * Initialize the analysis queue worker
 * This should be called once when the app starts
 */
export function startAnalysisWorker(): void {
  analysisQueue.setProcessor(async (job) => {
    await analysisService.processAnalysisJob(job);
  });

  logger.info('Analysis queue worker started');
}

// Auto-start worker when module is imported
if (typeof window === 'undefined') {
  // Only run on server side
  startAnalysisWorker();
}

