import { getOrCreateUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { createAgentActionJob } from "@/lib/queue";
import {
  aiRateLimiter,
  apiRateLimiter,
  checkRateLimit,
} from "@/lib/rate-limit";
import { triggerActionSchema } from "@/lib/validation";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: "Agent actions feature not implemented - database models not available" },
    { status: 501 }
  );
}
