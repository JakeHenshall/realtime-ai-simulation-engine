import 'dotenv/config';
import { PrismaClient } from '../generated/prisma/client';
import { mkdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { existsSync, readFileSync } from 'fs';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';

// Check if we're using SQLite (file:) or PostgreSQL (postgresql:)
const isSQLite = databaseUrl.startsWith('file:');

let clientConfig: any = {
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
};

// Only use SQLite adapter for local development with file: URLs
if (isSQLite) {
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
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
  clientConfig.adapter = adapter;
}

// For PostgreSQL (production), Prisma will use the standard client
// No adapter needed - Prisma handles PostgreSQL natively

export const db = globalForPrisma.prisma ?? new PrismaClient(clientConfig);

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = db;
}

