import OpenAI from 'openai';
import { logger } from './logger';
import { getRedis } from './redis';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
});

const CACHE_TTL = 3600; // 1 hour

export interface AIRequest {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  temperature?: number;
  maxTokens?: number;
  cacheKey?: string;
}

export interface AIResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  cached: boolean;
}

export async function callAI(
  request: AIRequest,
  retries = 3
): Promise<AIResponse> {
  const { messages, temperature = 0.7, maxTokens = 500, cacheKey } = request;

  // Check cache
  if (cacheKey) {
    const redis = getRedis();
    try {
      const cached = await redis.get(`ai:cache:${cacheKey}`);
      if (cached) {
        logger.info({ cacheKey }, 'AI response served from cache');
        return {
          content: cached,
          cached: true,
        };
      }
    } catch (error) {
      logger.warn({ error }, 'Cache read failed, continuing without cache');
    }
  }

  // Call AI with retry logic
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const startTime = Date.now();
      const response = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        temperature,
        max_tokens: maxTokens,
      });

      const latency = Date.now() - startTime;
      const content = response.choices[0]?.message?.content || '';

      logger.info(
        {
          latency,
          usage: response.usage,
          attempt,
        },
        'AI request completed'
      );

      // Cache the response
      if (cacheKey && content) {
        const redis = getRedis();
        try {
          await redis.setex(`ai:cache:${cacheKey}`, CACHE_TTL, content);
        } catch (error) {
          logger.warn({ error }, 'Cache write failed');
        }
      }

      return {
        content,
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
        cached: false,
      };
    } catch (error: any) {
      lastError = error;
      const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);

      if (error.status === 429) {
        logger.warn({ attempt, delay }, 'Rate limited, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else if (error.status >= 500 && attempt < retries) {
        logger.warn({ attempt, delay, error: error.message }, 'Server error, retrying');
        await new Promise((resolve) => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }

  throw lastError || new Error('AI request failed after retries');
}

