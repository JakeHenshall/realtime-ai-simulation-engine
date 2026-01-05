import { PressureLevel } from '@prisma/client';
import { LLMMessage } from '../llm-client';

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

export type ResponseClass = 'NON_ACTIONABLE' | 'WEAK' | 'STRONG' | 'BAD_OWNERSHIP';

export interface PromptContext {
  persona: AgentPersona;
  objective: AgentObjective;
  pressure: PressureLevel;
  behaviorModifier?: BehaviorModifier;
  sessionContext?: string;

  // Actual recent conversation messages to send to the LLM
  recentMessages?: LLMMessage[];

  // Optional deterministic hint from backend classifier
  responseClassHint?: ResponseClass;

  // Optional compact state blob (if tracking state machine)
  simState?: Record<string, any>;
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

