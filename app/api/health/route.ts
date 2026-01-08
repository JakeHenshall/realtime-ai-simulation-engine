import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getEnvironmentInfo } from '@/lib/env';

export const runtime = 'nodejs';

export async function GET() {
  try {
    // Check database connection
    await db.$queryRaw`SELECT 1`;

    const envInfo = getEnvironmentInfo();
    
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: 'connected',
        environment: {
          hasRequiredVars: envInfo.DATABASE_URL && envInfo.JWT_SECRET && 
                          envInfo.NEXT_PUBLIC_SUPABASE_URL && envInfo.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          hasLLMProvider: envInfo.OPENAI_API_KEY || envInfo.ANTHROPIC_API_KEY,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 503 }
    );
  }
}
