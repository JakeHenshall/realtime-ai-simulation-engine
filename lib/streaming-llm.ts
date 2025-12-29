import { LLMMessage, LLMRequest, LLMError } from './llm-client';
import { llmClient } from './llm-factory';

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

        if (!firstTokenTime && word.length > 0) {
          firstTokenTime = Date.now();
        }

        if (request.onChunk) {
          request.onChunk(chunk);
        }

        yield chunk;

        if (!isLast) {
          await new Promise((resolve) => setTimeout(resolve, 20));
        }
      }

      const totalTime = Date.now() - startTime;

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
}

export const streamingLLM = new StreamingLLMClient();

