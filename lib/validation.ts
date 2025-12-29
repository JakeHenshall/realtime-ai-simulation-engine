import { z } from 'zod';

export const createSimulationSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

export const createAgentSchema = z.object({
  simulationId: z.string().cuid(),
  name: z.string().min(1).max(50),
  role: z.string().min(1).max(100),
  personality: z.string().max(500).optional(),
});

export const triggerActionSchema = z.object({
  agentId: z.string().cuid(),
  actionType: z.enum(['THINK', 'COMMUNICATE', 'OBSERVE', 'DECIDE']),
  context: z.record(z.any()).optional(),
});

export const updateSimulationSchema = z.object({
  status: z.enum(['ACTIVE', 'PAUSED', 'COMPLETED', 'ERROR']).optional(),
});

