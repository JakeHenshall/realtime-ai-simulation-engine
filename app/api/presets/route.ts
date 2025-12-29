import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const presets = await db.scenarioPreset.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(presets);
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch presets' },
      { status: 500 }
    );
  }
}

