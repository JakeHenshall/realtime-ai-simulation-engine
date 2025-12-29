import { LLMClient, LLMProvider } from './llm-client';
import { OpenAIProvider } from './providers/openai-provider';
import { AnthropicProvider } from './providers/anthropic-provider';

export type LLMProviderType = 'openai' | 'anthropic';

export function createLLMClient(): LLMClient {
  const providerType = (process.env.LLM_PROVIDER || 'openai').toLowerCase() as LLMProviderType;
  const defaultModel = process.env.LLM_MODEL;
  const defaultTimeout = process.env.LLM_TIMEOUT
    ? parseInt(process.env.LLM_TIMEOUT, 10)
    : undefined;

  let provider: LLMProvider;

  switch (providerType) {
    case 'openai':
      provider = new OpenAIProvider(
        process.env.OPENAI_API_KEY,
        process.env.OPENAI_BASE_URL
      );
      break;

    case 'anthropic':
      provider = new AnthropicProvider(process.env.ANTHROPIC_API_KEY);
      break;

    default:
      throw new Error(`Unsupported LLM provider: ${providerType}`);
  }

  return new LLMClient(provider, {
    defaultModel,
    defaultTimeout,
  });
}

let _llmClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!_llmClient) {
    _llmClient = createLLMClient();
  }
  return _llmClient;
}

// For backward compatibility
export const llmClient = new Proxy({} as LLMClient, {
  get(_target, prop) {
    return getLLMClient()[prop as keyof LLMClient];
  },
});

