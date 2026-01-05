import { UserPromptConfig } from './types';

export class UserPromptBuilder {
  private config: UserPromptConfig;

  constructor(config: UserPromptConfig) {
    this.config = config;
  }

  build(): string {
    const parts: string[] = [];

    if (this.config.action) {
      parts.push(`Action requested: ${this.config.action}`);
      parts.push('');
    }

    parts.push(`Current context:\n${this.config.context}`);

    if (this.config.recentMessages && this.config.recentMessages.length > 0) {
      parts.push('');
      parts.push(this.buildRecentMessagesSection());
    }

    return parts.join('\n').trim();
  }

  private buildRecentMessagesSection(): string {
    if (!this.config.recentMessages || this.config.recentMessages.length === 0) {
      return '';
    }

    // Use all recent messages (already limited to 12 in the route)
    // This ensures the opening message and full conversation context is included
    const messages = this.config.recentMessages
      .map((msg, idx) => {
        const role = msg.role === 'assistant' ? 'Assistant' : msg.role === 'user' ? 'User' : msg.role;
        return `${role}: ${msg.content}`;
      })
      .join('\n');

    return `Recent conversation:\n${messages}`;
  }
}

