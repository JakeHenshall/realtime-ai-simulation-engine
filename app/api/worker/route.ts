import { NextResponse } from 'next/server';

// This endpoint can be called to ensure the worker is running
// In production, you'd typically run this as a separate process
export async function POST() {
  return NextResponse.json(
    { error: "Worker feature not implemented - queue dependencies not available" },
    { status: 501 }
  );
}

