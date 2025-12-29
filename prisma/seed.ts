import 'dotenv/config';
import { PrismaClient, PressureLevel } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is required');
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
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

