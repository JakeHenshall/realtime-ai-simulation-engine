import { LLMMessage, LLMRequest, LLMError } from './llm-client';
import { llmClient } from './llm-factory';
import OpenAI from 'openai';
import Anthropic from '@anthropic-ai/sdk';

export interface StreamChunk {
  content: string;
  done: boolean;
}

export interface StreamingLLMRequest extends LLMRequest {
  onChunk?: (chunk: StreamChunk) => void;
}

export class StreamingLLMClient {
  async *streamChat(request: StreamingLLMRequest): AsyncGenerator<StreamChunk> {
    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    try {
      // Always use OpenAI for streaming responses to ensure consistency
      // OpenAI is the primary provider; fallback to Anthropic only if OpenAI key is missing
      if (process.env.OPENAI_API_KEY) {
        yield* this.streamOpenAI(request, startTime, (time) => {
          if (!firstTokenTime) firstTokenTime = time;
        });
      } else if (process.env.ANTHROPIC_API_KEY) {
        yield* this.streamAnthropic(request, startTime, (time) => {
          if (!firstTokenTime) firstTokenTime = time;
        });
      } else {
        yield* this.streamFallback(request, startTime, (time) => {
          if (!firstTokenTime) firstTokenTime = time;
        });
      }

      if (request.onChunk) {
        request.onChunk({
          content: '',
          done: true,
        });
      }
    } catch (error) {
      throw error instanceof LLMError
        ? error
        : new LLMError(
            error instanceof Error ? error.message : 'Streaming error',
            undefined,
            false
          );
    }
  }

  private async *streamOpenAI(
    request: StreamingLLMRequest,
    startTime: number,
    onFirstToken: (time: number) => void
  ): AsyncGenerator<StreamChunk> {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      baseURL: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    });

    const stream = await client.chat.completions.create({
      model: request.model || 'gpt-4o-mini',
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: request.temperature,
      max_tokens: request.maxTokens,
      stream: true,
    });

    let hasFirstToken = false;
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content || '';
      if (content) {
        if (!hasFirstToken) {
          onFirstToken(Date.now());
          hasFirstToken = true;
        }
        const streamChunk: StreamChunk = {
          content,
          done: false,
        };
        if (request.onChunk) {
          request.onChunk(streamChunk);
        }
        yield streamChunk;
      }
    }
  }

  private async *streamAnthropic(
    request: StreamingLLMRequest,
    startTime: number,
    onFirstToken: (time: number) => void
  ): AsyncGenerator<StreamChunk> {
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    const systemMessage = request.messages.find((msg) => msg.role === 'system');
    const nonSystemMessages = request.messages.filter((msg) => msg.role !== 'system');

    const stream = await client.messages.create({
      model: request.model || 'claude-3-5-sonnet-20241022',
      max_tokens: request.maxTokens || 1024,
      temperature: request.temperature,
      messages: nonSystemMessages.map((msg) => ({
        role: msg.role === 'assistant' ? 'assistant' : 'user',
        content: msg.content,
      })),
      system: systemMessage?.content,
      stream: true,
    });

    let hasFirstToken = false;
    for await (const chunk of stream) {
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        const content = chunk.delta.text || '';
        if (content) {
          if (!hasFirstToken) {
            onFirstToken(Date.now());
            hasFirstToken = true;
          }
          const streamChunk: StreamChunk = {
            content,
            done: false,
          };
          if (request.onChunk) {
            request.onChunk(streamChunk);
          }
          yield streamChunk;
        }
      }
    }
  }

  private async *streamFallback(
    request: StreamingLLMRequest,
    startTime: number,
    onFirstToken: (time: number) => void
  ): AsyncGenerator<StreamChunk> {
    const response = await llmClient.chat({
      messages: request.messages,
      model: request.model,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      timeout: request.timeout,
    });

    const content = response.content;
    const words = content.split(/\s+/);
    
    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      const isLast = i === words.length - 1;
      const chunk: StreamChunk = {
        content: isLast ? word : `${word} `,
        done: isLast,
      };

      if (word.length > 0) {
        onFirstToken(Date.now());
      }

      if (request.onChunk) {
        request.onChunk(chunk);
      }

      yield chunk;

      if (!isLast) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }
}

export const streamingLLM = new StreamingLLMClient();

