import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
let dbPath = databaseUrl.replace(/^file:/, '');

// Resolve to absolute path from project root to avoid issues with different working directories
if (!dbPath.startsWith('/')) {
  // Find the actual project root by looking for package.json with our project name
  // This handles cases where Next.js infers the wrong workspace root
  let projectRoot = process.cwd();
  
  // Walk up the directory tree to find the correct project root
  const pathParts = projectRoot.split('/');
  for (let i = pathParts.length; i > 0; i--) {
    const testPath = pathParts.slice(0, i).join('/');
    try {
      const pkgPath = join(testPath, 'package.json');
      if (existsSync(pkgPath)) {
        const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        if (pkg.name === 'realtime-ai-simulation-engine') {
          projectRoot = testPath;
          break;
        }
      }
    } catch {
      // Continue searching
    }
  }
  
  dbPath = resolve(projectRoot, dbPath);
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

