import { UserPromptConfig } from './types';

export class UserPromptBuilder {
  private config: UserPromptConfig;

  constructor(config: UserPromptConfig) {
    this.config = config;
  }

  build(): string {
    // Minimal user prompt - conversation history is now passed as messages
    // Only include the latest user message or action if needed
    if (this.config.action) {
      return `Action requested: ${this.config.action}`;
    }

    if (this.config.context) {
      return this.config.context;
    }

    // Default minimal prompt
    return 'Advance the simulation based on the conversation above.';
  }
}

