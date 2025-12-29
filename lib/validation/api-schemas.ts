import { z } from 'zod';

// Session schemas
export const createSessionSchema = z.object({
  name: z.string().min(1).max(200),
  presetId: z.string().min(1).optional(),
});

export const appendMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(10000),
  metadata: z.record(z.string(), z.any()).optional(),
});

export const endSessionSchema = z.object({
  error: z.string().optional(),
});

// Stream schemas
export const streamChatSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1).max(5000),
});

// Analytics schemas (no body validation needed for GET)

