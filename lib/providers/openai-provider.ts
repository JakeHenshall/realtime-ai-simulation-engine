import OpenAI from 'openai';
import { LLMProvider, LLMRequest, LLMResponse, LLMError, LLMUsage } from '../llm-client';

export class OpenAIProvider implements LLMProvider {
  private client: OpenAI;

  constructor(apiKey?: string, baseURL?: string) {
    // Don't throw during build - validate at runtime instead
    if (!apiKey) {
      // Store undefined to check later
      this.client = null as any;
      return;
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.openai.com/v1',
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.client) {
      throw new LLMError('OpenAI API key is required', 401, false);
    }

    try {
      const response = await this.client.chat.completions.create({
        model: request.model || 'gpt-4o-mini',
        messages: request.messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        temperature: request.temperature,
        max_tokens: request.maxTokens,
      });

      const content = response.choices[0]?.message?.content || '';

      if (!content) {
        throw new LLMError('Empty response from OpenAI', 500, false);
      }

      const usage: LLMUsage | undefined = response.usage
        ? {
            promptTokens: response.usage.prompt_tokens,
            completionTokens: response.usage.completion_tokens,
            totalTokens: response.usage.total_tokens,
          }
        : undefined;

      return {
        content,
        usage,
      };
    } catch (error: any) {
      if (error instanceof LLMError) {
        throw error;
      }

      const statusCode = error?.status || error?.statusCode || 500;
      const isRetryable = statusCode === 429 || (statusCode >= 500 && statusCode < 600);

      throw new LLMError(
        error?.message || 'OpenAI API error',
        statusCode,
        isRetryable
      );
    }
  }
}

