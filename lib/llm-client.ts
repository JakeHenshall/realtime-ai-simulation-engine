export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMRequest {
  messages: LLMMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  timeout?: number;
}

export interface LLMUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LLMResponse {
  content: string;
  usage?: LLMUsage;
}

export class LLMError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
    public readonly retryable: boolean = false
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export class LLMTimeoutError extends LLMError {
  constructor(message: string = 'Request timeout') {
    super(message, 408, false);
    this.name = 'LLMTimeoutError';
  }
}

export interface LLMProvider {
  chat(request: LLMRequest): Promise<LLMResponse>;
}

export class LLMClient {
  private provider: LLMProvider;
  private defaultTimeout: number;
  private defaultModel: string;

  constructor(provider: LLMProvider, config?: { defaultTimeout?: number; defaultModel?: string }) {
    this.provider = provider;
    this.defaultTimeout = config?.defaultTimeout ?? 30000; // 30 seconds
    this.defaultModel = config?.defaultModel ?? 'gpt-4o-mini';
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const timeout = request.timeout ?? this.defaultTimeout;
    const model = request.model ?? this.defaultModel;

    const requestWithDefaults: LLMRequest = {
      ...request,
      model,
      timeout,
    };

    try {
      const response = await Promise.race([
        this.provider.chat(requestWithDefaults),
        this.createTimeoutPromise(timeout),
      ]);

      return response;
    } catch (error) {
      if (error instanceof LLMTimeoutError) {
        throw error;
      }

      if (error instanceof LLMError) {
        throw error;
      }

      throw new LLMError(
        error instanceof Error ? error.message : 'Unknown LLM error',
        undefined,
        false
      );
    }
  }

  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new LLMTimeoutError(`Request exceeded timeout of ${timeout}ms`));
      }, timeout);
    });
  }
}

