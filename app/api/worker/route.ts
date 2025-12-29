import { startWorker } from '@/lib/worker';
import { NextResponse } from 'next/server';

// This endpoint can be called to ensure the worker is running
// In production, you'd typically run this as a separate process
export async function POST() {
  try {
    startWorker();
    return NextResponse.json({ message: 'Worker started' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

