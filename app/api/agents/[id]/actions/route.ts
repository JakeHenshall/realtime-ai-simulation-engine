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
import { ActionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = getOrCreateUserId(request);
    const clientIp =
      request.headers.get("x-forwarded-for") || request.ip || "unknown";

    await checkRateLimit(apiRateLimiter, clientIp);
    await checkRateLimit(aiRateLimiter, userId);

    const body = await request.json();
    const data = triggerActionSchema.parse(body);

    if (data.agentId !== id) {
      return NextResponse.json({ error: "Agent ID mismatch" }, { status: 400 });
    }

    // Verify agent exists and get simulation
    const agent = await db.agent.findUnique({
      where: { id },
      include: { simulation: true },
    });

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    if (agent.simulation.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "Simulation is not active" },
        { status: 400 }
      );
    }

    // Update agent status
    await db.agent.update({
      where: { id },
      data: { status: "THINKING" },
    });

    // Create pending action
    const action = await db.agentAction.create({
      data: {
        agentId: id,
        type: data.actionType,
        content: JSON.stringify(data.context || {}),
        status: ActionStatus.PENDING,
      },
    });

    // Queue the job
    const job = await createAgentActionJob(
      {
        agentId: id,
        simulationId: agent.simulationId,
        actionType: data.actionType,
        context: data.context || {},
      },
      0
    );

    logger.info(
      { agentId: id, actionId: action.id, jobId: job.id, userId },
      "Agent action queued"
    );

    return NextResponse.json({
      actionId: action.id,
      jobId: job.id,
      status: "queued",
    });
  } catch (error: any) {
    logger.error({ error: error.message }, "Failed to trigger agent action");

    if (error.message.includes("Rate limit")) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }

    if (error.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid input", details: error.errors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: "Failed to trigger agent action" },
      { status: 500 }
    );
  }
}
