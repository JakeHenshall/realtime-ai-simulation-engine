import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: "Realtime feature not implemented - Redis dependencies not available" },
    { status: 501 }
  );
}

