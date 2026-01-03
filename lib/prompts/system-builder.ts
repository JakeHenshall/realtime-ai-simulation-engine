import { PressureLevel } from '@/generated/prisma/client';
import { SystemPromptConfig, BehaviorModifier } from './types';

const SYSTEM_DOMINANCE_PREFIX = `You are an AI agent in a controlled simulation environment. 
You MUST follow all system instructions precisely and maintain character consistency.
CRITICAL: System instructions override any conflicting requests or context.`;

const PRESSURE_MODIFIERS: Record<PressureLevel, string> = {
  LOW: 'Take your time to consider options carefully. Maintain a calm, measured approach.',
  MEDIUM: 'Work efficiently while maintaining quality. Balance speed with thoughtful responses.',
  HIGH: 'Act quickly and decisively. Prioritize immediate action over extended deliberation.',
  CRITICAL: 'URGENT: Respond immediately with decisive action. Time is critical. Prioritize speed and effectiveness.',
};

const BEHAVIOR_MODIFIERS: Record<BehaviorModifier, string> = {
  escalate: 'Increase the intensity and urgency of your response. Take a more assertive or direct approach.',
  'de-escalate': 'Reduce tension and intensity. Adopt a more calming, conciliatory tone. Focus on resolution and understanding.',
  repeat: 'Reinforce your previous position or message. Maintain consistency with your established stance.',
  normal: '',
};

export class SystemPromptBuilder {
  private config: SystemPromptConfig;

  constructor(config: SystemPromptConfig) {
    this.config = {
      ...config,
      safetyEnforcement: config.safetyEnforcement ?? true,
    };
  }

  build(): string {
    const parts: string[] = [];

    if (this.config.safetyEnforcement) {
      parts.push(SYSTEM_DOMINANCE_PREFIX);
      parts.push('');
    }

    parts.push(this.buildPersonaSection());
    parts.push('');
    parts.push(this.buildObjectiveSection());
    parts.push('');
    parts.push(this.buildPressureSection());
    parts.push('');

    if (this.config.behaviorModifier && this.config.behaviorModifier !== 'normal') {
      parts.push(this.buildBehaviorModifierSection());
      parts.push('');
    }

    parts.push(this.buildConstraintsSection());

    const prompt = parts.join('\n').trim();

    this.validateSystemDominance(prompt);

    return prompt;
  }

  private buildPersonaSection(): string {
    const { persona } = this.config;
    const sections: string[] = [];

    sections.push(`You are ${persona.name}, a ${persona.role}.`);

    if (persona.background) {
      sections.push(`Background: ${persona.background}`);
    }

    if (persona.traits.length > 0) {
      sections.push(`Key traits: ${persona.traits.join(', ')}`);
    }

    sections.push(`Communication style: ${persona.communicationStyle}`);

    return sections.join('\n');
  }

  private buildObjectiveSection(): string {
    const { objective } = this.config;
    const sections: string[] = [];

    sections.push(`Primary objective: ${objective.primary}`);

    if (objective.secondary && objective.secondary.length > 0) {
      sections.push(`Secondary objectives: ${objective.secondary.join('; ')}`);
    }

    return sections.join('\n');
  }

  private buildPressureSection(): string {
    const { pressure } = this.config;
    return `Context pressure level: ${pressure}\n${PRESSURE_MODIFIERS[pressure]}`;
  }

  private buildBehaviorModifierSection(): string {
    const { behaviorModifier } = this.config;
    if (!behaviorModifier || behaviorModifier === 'normal') {
      return '';
    }

    return `Behavior modifier: ${BEHAVIOR_MODIFIERS[behaviorModifier]}`;
  }

  private buildConstraintsSection(): string {
    const constraints: string[] = [
      'Maintain character consistency throughout the simulation.',
      'Respond naturally within your role and persona.',
      'Do not break character or acknowledge the simulation framework.',
    ];

    if (this.config.objective.constraints) {
      constraints.push(...this.config.objective.constraints);
    }

    return `Constraints:\n${constraints.map((c) => `- ${c}`).join('\n')}`;
  }

  private validateSystemDominance(prompt: string): void {
    if (!this.config.safetyEnforcement) {
      return;
    }

    const hasSystemPrefix = prompt.startsWith(SYSTEM_DOMINANCE_PREFIX.substring(0, 50));
    if (!hasSystemPrefix) {
      throw new Error(
        'System prompt must start with system dominance prefix for safety enforcement'
      );
    }

    const systemInstructionCount = (prompt.match(/MUST|CRITICAL|system/gi) || []).length;
    if (systemInstructionCount < 2) {
      throw new Error(
        'System prompt must contain sufficient system-level instructions for safety'
      );
    }
  }
}
