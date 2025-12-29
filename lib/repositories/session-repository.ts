import { db } from '@/lib/db';
import { SessionStatus, SimulationSession, SimulationMessage } from '@/generated/prisma/client';

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
    const metrics = await db.sessionMetrics.findUnique({
      where: { sessionId },
    });

    if (metrics) {
      await db.sessionMetrics.update({
        where: { sessionId },
        data: {
          totalMessages: metrics.totalMessages + 1,
        },
      });
    } else {
      await db.sessionMetrics.create({
        data: {
          sessionId,
          totalMessages: 1,
        },
      });
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
      },
    });
  }
}

