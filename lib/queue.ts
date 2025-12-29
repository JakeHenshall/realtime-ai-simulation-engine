// Queue functionality disabled - database models not available
// import { Queue, Worker, Job } from 'bullmq';
// import { getRedis } from './redis';
import { logger } from './logger';
// import { db } from './db';
// import { callAI } from './ai';
// Note: ActionType and ActionStatus enums not in schema - using string literals
type ActionType = 'THINK' | 'COMMUNICATE' | 'OBSERVE' | 'DECIDE';
type ActionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
// import { publishSimulationEvent } from './realtime';

// const redis = getRedis();

// Queue disabled - models not available
export const agentActionQueue: any = null;

export interface AgentActionJob {
  agentId: string;
  simulationId: string;
  actionType: ActionType;
  context: Record<string, any>;
}

export function createAgentActionJob(data: AgentActionJob, priority = 0) {
  throw new Error('Queue functionality not available - database models not implemented');
}

// Worker to process agent actions
export function startAgentActionWorker(): any {
  throw new Error('Worker functionality not available - database models not implemented');
  /* const worker = new Worker<AgentActionJob>(
    'agent-actions',
    async (job: Job<AgentActionJob>) => {
      const { agentId, simulationId, actionType, context } = job.data;

      logger.info({ agentId, actionType, jobId: job.id }, 'Processing agent action');

      try {
        // Get agent and simulation context
        const agent = await db.agent.findUnique({
          where: { id: agentId },
          include: { simulation: true },
        });

        if (!agent) {
          throw new Error(`Agent ${agentId} not found`);
        }

        // Get recent events for context
        const recentEvents = await db.simulationEvent.findMany({
          where: { simulationId },
          orderBy: { timestamp: 'desc' },
          take: 10,
        });

        // Build AI prompt based on action type
        const systemPrompt = buildSystemPrompt(agent, actionType);
        const userPrompt = buildUserPrompt(actionType, context, recentEvents);

        // Call AI
        const aiResponse = await callAI({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.8,
          maxTokens: 300,
          cacheKey: `${agentId}-${actionType}-${JSON.stringify(context).slice(0, 100)}`,
        });

        // Create action record
        const action = await db.agentAction.create({
          data: {
            agentId,
            type: actionType,
            content: JSON.stringify(context),
            result: JSON.stringify({ response: aiResponse.content }),
            status: 'COMPLETED',
            completedAt: new Date(),
          },
        });

        // Create event
        const event = await db.simulationEvent.create({
          data: {
            simulationId,
            agentId,
            type: 'AGENT_ACTION',
            data: JSON.stringify({
              actionId: action.id,
              actionType,
              response: aiResponse.content,
            }),
          },
        });

        // Publish real-time event
        await publishSimulationEvent(simulationId, {
          type: 'AGENT_ACTION',
          data: {
            actionId: action.id,
            agentId,
            actionType,
            response: aiResponse.content,
            agentName: agent.name,
          },
          agentId,
        });

        // Update agent status
        await db.agent.update({
          where: { id: agentId },
          data: {
            status: 'IDLE',
            lastActionAt: new Date(),
          },
        });

        // Update analytics
        await updateAnalytics(simulationId);

        logger.info({ agentId, actionId: action.id }, 'Agent action completed');

        return { actionId: action.id, response: aiResponse.content };
      } catch (error: any) {
        logger.error({ agentId, error: error.message }, 'Agent action failed');

        // Update action status
        await db.agentAction.updateMany({
          where: {
            agentId,
            status: 'PROCESSING',
          },
          data: {
            status: 'FAILED',
            error: error.message,
            retryCount: { increment: 1 },
          },
        });

        throw error;
      }
    },
    {
      connection: redis,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, error: err.message }, 'Job failed');
  });

  return worker;
  */
}

// Functions disabled - database models not available

