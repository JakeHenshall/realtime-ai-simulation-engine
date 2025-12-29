import { EventEmitter } from 'events';

export interface StreamEvent {
  type: 'token' | 'done' | 'error';
  data: string;
  metadata?: {
    sessionId: string;
    messageId?: string;
    latency?: {
      timeToFirstToken?: number;
      totalTime?: number;
    };
  };
}

class PubSub extends EventEmitter {
  private subscriptions = new Map<string, Set<string>>();

  subscribe(sessionId: string, clientId: string): void {
    if (!this.subscriptions.has(sessionId)) {
      this.subscriptions.set(sessionId, new Set());
    }
    this.subscriptions.get(sessionId)!.add(clientId);
  }

  unsubscribe(sessionId: string, clientId: string): void {
    const clients = this.subscriptions.get(sessionId);
    if (clients) {
      clients.delete(clientId);
      if (clients.size === 0) {
        this.subscriptions.delete(sessionId);
      }
    }
  }

  publish(sessionId: string, event: StreamEvent): void {
    this.emit(`session:${sessionId}`, event);
  }

  getSubscriberCount(sessionId: string): number {
    return this.subscriptions.get(sessionId)?.size ?? 0;
  }
}

export const pubsub = new PubSub();

