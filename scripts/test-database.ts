import 'dotenv/config';
import { db } from '../lib/db';

async function testDatabase() {
  console.log('🔍 Testing Prisma Postgres connection...\n');

  try {
    // Test 1: Check connection
    await db.$queryRaw`SELECT 1`;
    console.log('✅ Connected to database!');

    // Test 2: Check if we have any sessions
    console.log('\n📋 Fetching simulation sessions...');
    const sessions = await db.simulationSession.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        preset: true,
        metrics: true,
      },
    });
    console.log(`✅ Found ${sessions.length} session(s)`);
    sessions.forEach((session) => {
      console.log(`   - ${session.name} (${session.status})`);
    });

    // Test 3: Check scenario presets
    console.log('\n📋 Fetching scenario presets...');
    const presets = await db.scenarioPreset.findMany({
      take: 5,
    });
    console.log(`✅ Found ${presets.length} preset(s)`);
    presets.forEach((preset) => {
      console.log(`   - ${preset.name} (${preset.pressure})`);
    });

    console.log('\n🎉 All tests passed! Your database is working perfectly.\n');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  } finally {
    await db.$disconnect();
  }
}

testDatabase();

