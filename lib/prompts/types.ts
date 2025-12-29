import { PressureLevel } from '@/generated/prisma/client';

export interface AgentPersona {
  name: string;
  role: string;
  traits: string[];
  communicationStyle: 'formal' | 'casual' | 'professional' | 'friendly' | 'assertive';
  background?: string;
}

export interface AgentObjective {
  primary: string;
  secondary?: string[];
  constraints?: string[];
}

export interface PromptContext {
  persona: AgentPersona;
  objective: AgentObjective;
  pressure: PressureLevel;
  behaviorModifier?: BehaviorModifier;
  sessionContext?: string;
}

export type BehaviorModifier = 'escalate' | 'de-escalate' | 'repeat' | 'normal';

export interface SystemPromptConfig {
  persona: AgentPersona;
  objective: AgentObjective;
  pressure: PressureLevel;
  behaviorModifier?: BehaviorModifier;
  safetyEnforcement?: boolean;
}

export interface UserPromptConfig {
  context: string;
  action?: string;
  recentMessages?: Array<{ role: string; content: string }>;
}

