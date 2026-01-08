export interface AnalysisJob {
  sessionId: string;
  attempts: number;
  maxAttempts: number;
  nextRetryAt?: Date;
}

// Global singleton for Next.js dev mode hot reload persistence
declare global {
  var __analysisQueue__: InProcessQueue | undefined;
}

class InProcessQueue {
  private queue: AnalysisJob[] = [];
  private processing = false;
  private processor?: (job: AnalysisJob) => Promise<void>;

  enqueue(job: AnalysisJob): void {
    console.log('[AnalysisQueue] Enqueueing job for session:', job.sessionId);
    this.queue.push(job);
    this.process();
  }

  setProcessor(processor: (job: AnalysisJob) => Promise<void>): void {
    console.log('[AnalysisQueue] Processor set, queue length:', this.queue.length);
    this.processor = processor;
    this.process();
  }

  private async process(): Promise<void> {
    if (this.processing || !this.processor || this.queue.length === 0) {
      return;
    }

    this.processing = true;
    console.log('[AnalysisQueue] Processing started, queue length:', this.queue.length);

    try {
      while (this.queue.length > 0) {
        const now = new Date();
        const readyJobs: AnalysisJob[] = [];
        const delayedJobs: AnalysisJob[] = [];

        // Separate ready jobs from delayed ones
        for (const job of this.queue) {
          if (!job.nextRetryAt || job.nextRetryAt <= now) {
            readyJobs.push(job);
          } else {
            delayedJobs.push(job);
          }
        }

        // Update queue with delayed jobs first
        this.queue = delayedJobs;

        // Process ready jobs
        for (const job of readyJobs) {
          try {
            console.log('[AnalysisQueue] Processing job for session:', job.sessionId);
            await this.processor(job);
            console.log('[AnalysisQueue] Job completed for session:', job.sessionId);
          } catch (error) {
            console.error('[AnalysisQueue] Job failed for session:', job.sessionId, error);
            // If job has retries left, re-queue with backoff
            if (job.attempts < job.maxAttempts) {
              const backoffMs = Math.min(1000 * Math.pow(2, job.attempts), 30000); // Max 30s
              job.attempts++;
              job.nextRetryAt = new Date(Date.now() + backoffMs);
              this.queue.push(job);
              console.log('[AnalysisQueue] Job re-queued, attempt:', job.attempts);
            }
            // Otherwise, job is failed - could log or handle differently
          }
        }

        // If there are delayed jobs, wait a bit before checking again
        if (this.queue.length > 0 && this.queue.every((j) => j.nextRetryAt && j.nextRetryAt > now)) {
          const nextRetry = Math.min(
            ...this.queue
              .map((j) => j.nextRetryAt?.getTime() || Infinity)
              .filter((t) => t !== Infinity)
          );
          if (nextRetry !== Infinity) {
            const waitTime = Math.max(0, nextRetry - Date.now());
            await this.sleep(Math.min(waitTime, 5000)); // Max 5s wait
          }
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

// Use global singleton to persist across hot reloads
export const analysisQueue = global.__analysisQueue__ || (global.__analysisQueue__ = new InProcessQueue());

