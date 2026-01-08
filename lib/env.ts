const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_SECRET',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
] as const;

const optionalEnvVars = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'REDIS_URL',
  'LLM_PROVIDER',
  'LLM_MODEL',
  'LLM_TIMEOUT',
  'OPENAI_BASE_URL',
  'ALLOWED_ORIGIN',
] as const;

export function validateEnvironmentVariables(): void {
  const missing: string[] = [];
  
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      missing.push(envVar);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables:\n${missing.map(v => `  - ${v}`).join('\n')}\n\nPlease set these in your .env.local file or environment.`
    );
  }

  // Validate at least one LLM provider key is set
  const hasOpenAI = !!process.env.OPENAI_API_KEY;
  const hasAnthropic = !!process.env.ANTHROPIC_API_KEY;
  
  if (!hasOpenAI && !hasAnthropic) {
    throw new Error(
      'At least one LLM provider API key is required:\n  - OPENAI_API_KEY\n  - ANTHROPIC_API_KEY'
    );
  }
}

export function getEnvironmentInfo(): Record<string, boolean> {
  const info: Record<string, boolean> = {};
  
  for (const envVar of [...requiredEnvVars, ...optionalEnvVars]) {
    info[envVar] = !!process.env[envVar];
  }
  
  return info;
}

