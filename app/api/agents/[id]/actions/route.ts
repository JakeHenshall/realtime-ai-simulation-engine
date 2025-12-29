import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    {
      error:
        "Agent actions feature not implemented - database models not available",
    },
    { status: 501 }
  );
}
