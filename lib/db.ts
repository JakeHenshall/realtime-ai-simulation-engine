import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
let dbPath = databaseUrl.replace(/^file:/, '');

// Resolve to absolute path from project root to avoid issues with different working directories
if (!dbPath.startsWith('/')) {
  // Get project root (where package.json is)
  const projectRoot = process.cwd();
  dbPath = join(projectRoot, dbPath);
}

const dbDir = dirname(dbPath);
mkdirSync(dbDir, { recursive: true });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = `file:${dbPath}`;
}

const adapter = new PrismaBetterSqlite3({ url: dbPath });

export const db = globalForPrisma.prisma ?? new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

