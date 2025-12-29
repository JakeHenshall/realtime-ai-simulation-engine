import { db } from '../db';
import { sessionAnalyzer, AnalysisResult } from './session-analyzer';
import { logger } from '../logger';
import { AnalysisJob } from '../jobs/analysis-queue';

export class AnalysisService {
  /**
   * Process an analysis job with retry logic
   */
  async processAnalysisJob(job: AnalysisJob): Promise<void> {
    const { sessionId } = job;

    try {
      // Get session with messages
      const session = await db.simulationSession.findUnique({
        where: { id: sessionId },
        include: {
          messages: {
            orderBy: { timestamp: 'asc' },
          },
          preset: true,
        },
      });

      if (!session) {
        logger.error({ sessionId }, 'Session not found for analysis');
        return;
      }

      // Only analyze completed sessions
      if (session.status !== 'COMPLETED') {
        logger.warn({ sessionId, status: session.status }, 'Skipping analysis for non-completed session');
        return;
      }

      // Check if analysis already exists
      const existing = await db.sessionAnalysis.findUnique({
        where: { sessionId },
      });

      if (existing) {
        logger.info({ sessionId }, 'Analysis already exists, skipping');
        return;
      }

      // Prepare messages for analysis
      const messages = session.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      if (messages.length === 0) {
        logger.warn({ sessionId }, 'No messages to analyze');
        return;
      }

      logger.info({ sessionId, attempt: job.attempts }, 'Starting session analysis');

      // Perform analysis
      const result = await sessionAnalyzer.analyzeSession(messages, {
        name: session.name,
        preset: session.preset?.name,
      });

      // Store results
      await db.sessionAnalysis.create({
        data: {
          sessionId,
          summary: result.summary,
          insights: JSON.stringify({
            scores: result.scores,
            insights: result.insights,
          }),
        },
      });

      logger.info(
        {
          sessionId,
          scores: result.scores,
        },
        'Session analysis completed successfully'
      );
    } catch (error) {
      logger.error(
        {
          sessionId,
          attempt: job.attempts,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        'Analysis job failed'
      );

      // Re-throw to trigger retry logic in queue
      throw error;
    }
  }
}

export const analysisService = new AnalysisService();

