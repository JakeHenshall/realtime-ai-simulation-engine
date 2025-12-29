import { Queue, Worker, Job } from 'bullmq';
import { getRedis } from './redis';
import { logger } from './logger';
import { db } from './db';
import { callAI } from './ai';
// Note: ActionType and ActionStatus enums not in schema - using string literals
type ActionType = 'THINK' | 'COMMUNICATE' | 'OBSERVE' | 'DECIDE';
type ActionStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
import { publishSimulationEvent } from './realtime';

const redis = getRedis();

export const agentActionQueue = new Queue('agent-actions', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: {
      age: 3600,
      count: 1000,
    },
    removeOnFail: {
      age: 86400,
    },
  },
});

export interface AgentActionJob {
  agentId: string;
  simulationId: string;
  actionType: ActionType;
  context: Record<string, any>;
}

export function createAgentActionJob(data: AgentActionJob, priority = 0) {
  return agentActionQueue.add(
    'process-agent-action',
    data,
    {
      priority,
      jobId: `agent-action-${data.agentId}-${Date.now()}`,
    }
  );
}

// Worker to process agent actions
export function startAgentActionWorker() {
  const worker = new Worker<AgentActionJob>(
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
}

function buildSystemPrompt(agent: any, actionType: ActionType): string {
  const basePrompt = `You are ${agent.name}, a ${agent.role} in a real-time simulation.
${agent.personality ? `Personality: ${agent.personality}` : ''}

Your goal is to act naturally and respond to situations in character.`;

  switch (actionType) {
    case 'THINK':
      return `${basePrompt}\n\nThink about the current situation and what you should do next.`;
    case 'COMMUNICATE':
      return `${basePrompt}\n\nCommunicate with other agents or express your thoughts.`;
    case 'OBSERVE':
      return `${basePrompt}\n\nObserve what's happening around you and report your observations.`;
    case 'DECIDE':
      return `${basePrompt}\n\nMake a decision based on the current situation.`;
    default:
      return basePrompt;
  }
}

function buildUserPrompt(
  actionType: ActionType,
  context: Record<string, any>,
  recentEvents: any[]
): string {
  const eventsContext = recentEvents
    .slice(0, 5)
    .map((e) => {
      try {
        const data = JSON.parse(e.data);
        return `- ${e.type}: ${JSON.stringify(data)}`;
      } catch {
        return `- ${e.type}: ${e.data}`;
      }
    })
    .join('\n');

  return `Current context:
${JSON.stringify(context, null, 2)}

Recent events:
${eventsContext || 'None'}

Action type: ${actionType}
Provide a brief, natural response (1-2 sentences max).`;
}

async function updateAnalytics(simulationId: string) {
  const [totalEvents, totalActions, actions] = await Promise.all([
    db.simulationEvent.count({ where: { simulationId } }),
    db.agentAction.count({
      where: {
        agent: { simulationId },
        status: 'COMPLETED',
      },
    }),
    db.agentAction.findMany({
      where: {
        agent: { simulationId },
        status: 'COMPLETED' },
      select: { createdAt: true, completedAt: true },
    }),
  ]);

  const latencies = actions
    .filter((a) => a.completedAt)
    .map((a) => (a.completedAt!.getTime() - a.createdAt.getTime()));

  const avgLatency = latencies.length > 0
    ? latencies.reduce((a, b) => a + b, 0) / latencies.length
    : null;

  const failedActions = await db.agentAction.count({
    where: {
      agent: { simulationId },
      status: 'FAILED',
    },
  });

  const errorRate = totalActions > 0 ? failedActions / totalActions : 0;

  await db.simulationAnalytics.upsert({
    where: { simulationId },
    create: {
      simulationId,
      totalEvents,
      totalActions,
      avgLatency,
      errorRate,
    },
    update: {
      totalEvents,
      totalActions,
      avgLatency,
      errorRate,
    },
  });
}

