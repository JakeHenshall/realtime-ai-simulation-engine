import { SessionStatus } from '@prisma/client';
import { SessionRepository } from '@/lib/repositories/session-repository';

export class InvalidStateTransitionError extends Error {
  constructor(currentStatus: SessionStatus, targetStatus: SessionStatus) {
    super(
      `Invalid state transition from ${currentStatus} to ${targetStatus}`
    );
    this.name = 'InvalidStateTransitionError';
  }
}

export class SessionNotFoundError extends Error {
  constructor(sessionId: string) {
    super(`Session ${sessionId} not found`);
    this.name = 'SessionNotFoundError';
  }
}

export class SessionService {
  private repository: SessionRepository;

  constructor(repository: SessionRepository) {
    this.repository = repository;
  }

  private isValidTransition(
    from: SessionStatus,
    to: SessionStatus
  ): boolean {
    const validTransitions: Record<SessionStatus, SessionStatus[]> = {
      [SessionStatus.PENDING]: [SessionStatus.ACTIVE, SessionStatus.ERROR],
      [SessionStatus.ACTIVE]: [
        SessionStatus.PAUSED,
        SessionStatus.COMPLETED,
        SessionStatus.ERROR,
      ],
      [SessionStatus.PAUSED]: [SessionStatus.ACTIVE, SessionStatus.ERROR],
      [SessionStatus.COMPLETED]: [],
      [SessionStatus.ERROR]: [],
    };

    return validTransitions[from]?.includes(to) ?? false;
  }

  async createSession(name: string, presetId?: string) {
    return this.repository.create({ name, presetId });
  }

  async startSession(sessionId: string) {
    const session = await this.repository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (!this.isValidTransition(session.status, SessionStatus.ACTIVE)) {
      throw new InvalidStateTransitionError(
        session.status,
        SessionStatus.ACTIVE
      );
    }

    return this.repository.updateStatus(
      sessionId,
      SessionStatus.ACTIVE,
      new Date()
    );
  }

  async pauseSession(sessionId: string) {
    const session = await this.repository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (!this.isValidTransition(session.status, SessionStatus.PAUSED)) {
      throw new InvalidStateTransitionError(
        session.status,
        SessionStatus.PAUSED
      );
    }

    return this.repository.updateStatus(sessionId, SessionStatus.PAUSED);
  }

  async resumeSession(sessionId: string) {
    const session = await this.repository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (!this.isValidTransition(session.status, SessionStatus.ACTIVE)) {
      throw new InvalidStateTransitionError(
        session.status,
        SessionStatus.ACTIVE
      );
    }

    return this.repository.updateStatus(sessionId, SessionStatus.ACTIVE);
  }

  async endSession(sessionId: string, error?: string) {
    const session = await this.repository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    const targetStatus = error ? SessionStatus.ERROR : SessionStatus.COMPLETED;

    if (!this.isValidTransition(session.status, targetStatus)) {
      throw new InvalidStateTransitionError(session.status, targetStatus);
    }

    return this.repository.updateStatus(
      sessionId,
      targetStatus,
      undefined,
      new Date()
    );
  }

  async appendMessage(
    sessionId: string,
    role: string,
    content: string,
    metadata?: Record<string, unknown>
  ) {
    const session = await this.repository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    if (session.status !== SessionStatus.ACTIVE) {
      throw new InvalidStateTransitionError(
        session.status,
        SessionStatus.ACTIVE
      );
    }

    return this.repository.appendMessage(sessionId, {
      role,
      content,
      metadata: metadata ? JSON.stringify(metadata) : undefined,
    });
  }

  async getSession(sessionId: string) {
    const session = await this.repository.findById(sessionId);

    if (!session) {
      throw new SessionNotFoundError(sessionId);
    }

    return session;
  }
}

