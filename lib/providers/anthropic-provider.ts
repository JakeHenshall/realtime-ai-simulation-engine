import Anthropic from '@anthropic-ai/sdk';
import { LLMProvider, LLMRequest, LLMResponse, LLMError, LLMUsage } from '../llm-client';

export class AnthropicProvider implements LLMProvider {
  private client: Anthropic;

  constructor(apiKey?: string) {
    // Don't throw during build - validate at runtime instead
    if (!apiKey) {
      // Store undefined to check later
      this.client = null as any;
      return;
    }

    this.client = new Anthropic({
      apiKey,
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    if (!this.client) {
      throw new LLMError('Anthropic API key is required', 401, false);
    }

    try {
      const response = await this.client.messages.create({
        model: request.model || 'claude-3-5-sonnet-20241022',
        max_tokens: request.maxTokens || 1024,
        temperature: request.temperature,
        messages: request.messages
          .filter((msg) => msg.role !== 'system')
          .map((msg) => ({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content,
          })),
        system: request.messages.find((msg) => msg.role === 'system')?.content,
      });

      const content = response.content[0]?.type === 'text' ? response.content[0].text : '';

      if (!content) {
        throw new LLMError('Empty response from Anthropic', 500, false);
      }

      const usage: LLMUsage | undefined = response.usage
        ? {
            promptTokens: response.usage.input_tokens,
            completionTokens: response.usage.output_tokens,
            totalTokens: response.usage.input_tokens + response.usage.output_tokens,
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
        error?.message || 'Anthropic API error',
        statusCode,
        isRetryable
      );
    }
  }
}

