import 'dotenv/config';
import { PrismaClient, PressureLevel } from '../generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import Database from 'better-sqlite3';

import { mkdirSync } from 'fs';
import { dirname } from 'path';

const databaseUrl = process.env.DATABASE_URL || 'file:./prisma/dev.db';
const dbPath = databaseUrl.replace(/^file:/, '');
const dbDir = dirname(dbPath);
mkdirSync(dbDir, { recursive: true });

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = databaseUrl;
}

const adapter = new PrismaBetterSqlite3({ url: dbPath });
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('Seeding scenario presets...');

  const presets = [
    {
      name: 'Customer Support Escalation',
      description: 'Handle a frustrated customer with a complex technical issue',
      pressure: PressureLevel.HIGH,
      config: JSON.stringify({
        customerTone: 'frustrated',
        issueComplexity: 'high',
        timeLimit: 15,
        escalationRisk: true,
      }),
    },
    {
      name: 'Team Collaboration',
      description: 'Facilitate a team meeting with conflicting opinions',
      pressure: PressureLevel.MEDIUM,
      config: JSON.stringify({
        participants: 5,
        topic: 'project_priorities',
        conflictLevel: 'moderate',
        timeLimit: 30,
      }),
    },
    {
      name: 'Crisis Management',
      description: 'Respond to a critical system outage under time pressure',
      pressure: PressureLevel.CRITICAL,
      config: JSON.stringify({
        severity: 'critical',
        affectedUsers: 10000,
        timeLimit: 5,
        communicationChannels: ['slack', 'email', 'phone'],
      }),
    },
  ];

  for (const preset of presets) {
    const existing = await prisma.scenarioPreset.findFirst({
      where: { name: preset.name },
    });

    if (existing) {
      await prisma.scenarioPreset.update({
        where: { id: existing.id },
        data: preset,
      });
    } else {
      await prisma.scenarioPreset.create({
        data: preset,
      });
    }
  }

  console.log('Seeding completed.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

