import { db } from '@/lib/db';
import { SessionStatus, SimulationSession, SimulationMessage } from '@prisma/client';
import { logger } from '@/lib/logger';

export interface CreateSessionData {
  name: string;
  presetId?: string;
}

export interface AppendMessageData {
  role: string;
  content: string;
  metadata?: string;
}

export class SessionRepository {
  async create(data: CreateSessionData): Promise<SimulationSession> {
    return db.simulationSession.create({
      data: {
        name: data.name,
        presetId: data.presetId,
        status: SessionStatus.PENDING,
      },
    });
  }

  async findById(id: string): Promise<SimulationSession | null> {
    return db.simulationSession.findUnique({
      where: { id },
      include: {
        preset: true,
        messages: {
          orderBy: { timestamp: 'asc' },
        },
        metrics: true,
        analysis: true,
      },
    });
  }

  async updateStatus(
    id: string,
    status: SessionStatus,
    startedAt?: Date,
    completedAt?: Date
  ): Promise<SimulationSession> {
    return db.simulationSession.update({
      where: { id },
      data: {
        status,
        startedAt,
        completedAt,
      },
    });
  }

  async appendMessage(
    sessionId: string,
    data: AppendMessageData
  ): Promise<SimulationMessage> {
    const message = await db.simulationMessage.create({
      data: {
        sessionId,
        role: data.role,
        content: data.content,
        metadata: data.metadata,
      },
    });

    await this.incrementMessageCount(sessionId);

    return message;
  }

  private async incrementMessageCount(sessionId: string): Promise<void> {
    try {
      // Try to update first - this is the most common case
      const updated = await db.sessionMetrics.updateMany({
        where: { sessionId },
        data: {
          totalMessages: { increment: 1 },
        },
      });

      // If no rows were updated, create the metrics record
      if (updated.count === 0) {
        try {
          await db.sessionMetrics.create({
            data: {
              sessionId,
              totalMessages: 1,
            },
          });
        } catch (error: any) {
          // If creation fails due to unique constraint (race condition),
          // try to update again as another process must have created it
          if (error.code === 'P2002') {
            await db.sessionMetrics.update({
              where: { sessionId },
              data: {
                totalMessages: { increment: 1 },
              },
            });
          } else {
            throw error;
          }
        }
      }
    } catch (error) {
      // Log but don't fail the message append operation
      logger.warn({ sessionId, error }, 'Failed to increment message count');
    }
  }

  async updateBehaviorMetrics(
    sessionId: string,
    metrics: { evasiveness?: number; contradiction?: number; sentiment?: number }
  ): Promise<void> {
    const existing = await db.sessionMetrics.findUnique({
      where: { sessionId },
    });

    if (existing) {
      await db.sessionMetrics.update({
        where: { sessionId },
        data: {
          evasiveness: metrics.evasiveness ?? existing.evasiveness,
          contradiction: metrics.contradiction ?? existing.contradiction,
          sentiment: metrics.sentiment ?? existing.sentiment,
        },
      });
    } else {
      await db.sessionMetrics.create({
        data: {
          sessionId,
          totalMessages: 0,
          evasiveness: metrics.evasiveness,
          contradiction: metrics.contradiction,
          sentiment: metrics.sentiment,
        },
      });
    }
  }

  async list(limit = 50, offset = 0): Promise<SimulationSession[]> {
    return db.simulationSession.findMany({
      take: limit,
      skip: offset,
      orderBy: { createdAt: 'desc' },
      include: {
        preset: true,
        metrics: true,
        analysis: true,
      },
    });
  }

}
