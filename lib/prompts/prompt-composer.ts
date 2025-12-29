import { LLMMessage } from '../llm-client';
import { SystemPromptBuilder } from './system-builder';
import { UserPromptBuilder } from './user-builder';
import {
  SystemPromptConfig,
  UserPromptConfig,
  PromptContext,
} from './types';

export interface ComposedPrompt {
  messages: LLMMessage[];
  systemPrompt: string;
  userPrompt: string;
}

export class PromptComposer {
  compose(context: PromptContext, userConfig: UserPromptConfig): ComposedPrompt {
    const systemConfig: SystemPromptConfig = {
      persona: context.persona,
      objective: context.objective,
      pressure: context.pressure,
      behaviorModifier: context.behaviorModifier,
      safetyEnforcement: true,
    };

    const systemBuilder = new SystemPromptBuilder(systemConfig);
    const systemPrompt = systemBuilder.build();

    const userBuilder = new UserPromptBuilder({
      ...userConfig,
      context: userConfig.context || context.sessionContext || '',
    });
    const userPrompt = userBuilder.build();

    const messages: LLMMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ];

    return {
      messages,
      systemPrompt,
      userPrompt,
    };
  }

  buildSystemPrompt(config: SystemPromptConfig): string {
    const builder = new SystemPromptBuilder(config);
    return builder.build();
  }

  buildUserPrompt(config: UserPromptConfig): string {
    const builder = new UserPromptBuilder(config);
    return builder.build();
  }
}

