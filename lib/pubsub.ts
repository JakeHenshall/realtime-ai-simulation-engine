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

  constructor() {
    super();
    // Increase max listeners to prevent warnings with multiple SSE connections
    this.setMaxListeners(100);
  }

  subscribe(sessionId: string, clientId: string): void {
    if (!this.subscriptions.has(sessionId)) {
      this.subscriptions.set(sessionId, new Set());
    }
    this.subscriptions.get(sessionId)!.add(clientId);
    console.log(`[PubSub] Client ${clientId} subscribed to session ${sessionId}. Total subscribers: ${this.subscriptions.get(sessionId)!.size}`);
  }

  unsubscribe(sessionId: string, clientId: string): void {
    const clients = this.subscriptions.get(sessionId);
    if (clients) {
      clients.delete(clientId);
      console.log(`[PubSub] Client ${clientId} unsubscribed from session ${sessionId}`);
      if (clients.size === 0) {
        this.subscriptions.delete(sessionId);
      }
    }
  }

  publish(sessionId: string, event: StreamEvent): void {
    const listenerCount = this.listenerCount(`session:${sessionId}`);
    console.log(`[PubSub] Publishing ${event.type} event to session ${sessionId}. Listeners: ${listenerCount}`);
    this.emit(`session:${sessionId}`, event);
  }

  getSubscriberCount(sessionId: string): number {
    return this.subscriptions.get(sessionId)?.size ?? 0;
  }
}

// Use global singleton pattern to ensure pubsub is shared across all API routes
// This is necessary because Next.js may create separate module instances in development
const globalForPubSub = global as typeof globalThis & { __pubsub__: PubSub | undefined };

if (!globalForPubSub.__pubsub__) {
  globalForPubSub.__pubsub__ = new PubSub();
  console.log('[PubSub] Created new global PubSub instance');
}

export const pubsub = globalForPubSub.__pubsub__;

