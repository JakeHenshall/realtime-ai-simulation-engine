import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Lazy initialization to avoid database connection during build
function getPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Configure connection pool for serverless environments
  const isSupabase = connectionString.includes('supabase.co');
  const needsSSL = isSupabase || process.env.DB_SSL === 'true';
  
  const pool = new Pool({
    connectionString,
    // Connection pool settings for serverless
    max: 1, // Limit connections per serverless function instance
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    // Enable SSL for Supabase or when explicitly requested
    // For Supabase in serverless environments, we need to allow self-signed certificates
    // in the chain to avoid connection errors
    ssl: needsSSL
      ? {
          rejectUnauthorized: isSupabase
            ? false // Supabase: allow certificate chain issues in serverless
            : process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false', // Other DBs: respect env var
        }
      : undefined,
  });

  const adapter = new PrismaPg(pool);

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

export const db = globalForPrisma.prisma ?? getPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}
