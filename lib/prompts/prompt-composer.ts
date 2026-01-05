import { LLMMessage } from "../llm-client";
import { SystemPromptBuilder } from "./system-builder";
import { PromptContext, SystemPromptConfig, UserPromptConfig } from "./types";
import { UserPromptBuilder } from "./user-builder";

export interface ComposedPrompt {
  messages: LLMMessage[];
  systemPrompt: string;
  userPrompt: string;
}

export class PromptComposer {
  compose(
    context: PromptContext,
    userConfig: UserPromptConfig
  ): ComposedPrompt {
    const systemConfig: SystemPromptConfig = {
      persona: context.persona,
      objective: context.objective,
      pressure: context.pressure,
      behaviorModifier: context.behaviorModifier,
      safetyEnforcement: true,
    };

    const systemPrompt = new SystemPromptBuilder(systemConfig).build();

    // Keep user prompt minimal to reduce injection and contradictions
    const userBuilder = new UserPromptBuilder({
      ...userConfig,
      context: userConfig.context || context.sessionContext || "",
    });

    // Optional: pass deterministic hints as a *single line* in user prompt
    // (Better: include these in the system prompt builder if you can.)
    let userPrompt = userBuilder.build();
    const hintLines: string[] = [];

    if (context.responseClassHint) {
      hintLines.push(`Classification hint: ${context.responseClassHint}`);
    }
    if (context.simState) {
      hintLines.push(`Simulation state: ${JSON.stringify(context.simState)}`);
    }
    if (hintLines.length) {
      userPrompt = `${hintLines.join("\n")}\n\n${userPrompt}`;
    }

    const history = context.recentMessages ?? [];

    // IMPORTANT: Do not duplicate the latest user message in both history and user prompt.
    // Your backend should build `recentMessages` that already includes the latest user turn,
    // OR keep history without it. Pick one and be consistent.
    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: userPrompt },
    ];

    return { messages, systemPrompt, userPrompt };
  }

  buildSystemPrompt(config: SystemPromptConfig): string {
    return new SystemPromptBuilder(config).build();
  }

  buildUserPrompt(config: UserPromptConfig): string {
    return new UserPromptBuilder(config).build();
  }
}
