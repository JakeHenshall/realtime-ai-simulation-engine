import { metricsAnalyzer } from "@/lib/metrics/analyzer";
import { behaviorAdapter } from "@/lib/metrics/behavior-adapter";
import { PromptComposer } from "@/lib/prompts/prompt-composer";
import { pubsub, StreamEvent } from "@/lib/pubsub";
import { SessionRepository } from "@/lib/repositories/session-repository";
import {
  SessionNotFoundError,
  SessionService,
} from "@/lib/services/session-service";
import { streamingLLM } from "@/lib/streaming-llm";
import { SessionStatus } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";

const sessionService = new SessionService(new SessionRepository());
const promptComposer = new PromptComposer();
const repository = new SessionRepository();
const SESSION_COMPLETE_MARKER = "[[SESSION_COMPLETE]]";

import { createRequestLogger } from "@/lib/logger";
import {
  checkRateLimit,
  createRateLimitResponse,
} from "@/lib/middleware/rate-limit";
import { getRequestId } from "@/lib/middleware/request-id";
import { streamChatSchema } from "@/lib/validation/api-schemas";
import { ZodError } from "zod";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const logger = createRequestLogger(requestId, {
    method: request.method,
    path: request.nextUrl.pathname,
  });

  let sessionId: string | undefined;
  try {
    // Validate body
    let body: { sessionId: string; message: string };
    try {
      const rawBody = await request.json();
      body = streamChatSchema.parse(rawBody);
      sessionId = body.sessionId;
    } catch (error) {
      if (error instanceof ZodError) {
        logger.warn({ errors: error.issues }, "Validation error");
        return NextResponse.json(
          { error: "Validation failed", details: error.issues, requestId },
          { status: 400 }
        );
      }
      throw error;
    }

    const { message } = body;

    // sessionId is guaranteed to be defined here after validation
    // TypeScript narrowing: after validation, sessionId is always a string
    const validatedSessionId: string = sessionId!;

    // Rate limiting by session ID
    const rateLimitResult = await checkRateLimit(request, validatedSessionId);
    if (!rateLimitResult.allowed) {
      logger.warn({ sessionId: validatedSessionId }, "Rate limit exceeded");
      return createRateLimitResponse(rateLimitResult.msBeforeNext);
    }

    const session = await sessionService.getSession(validatedSessionId);

    if (session.status !== SessionStatus.ACTIVE) {
      return NextResponse.json(
        { error: "Session must be active" },
        { status: 400 }
      );
    }

    const startTime = Date.now();
    let firstTokenTime: number | undefined;

    const sessionData = session as any;
    const existingMessages = (sessionData.messages || []).map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));
    const userMessage = await sessionService.appendMessage(
      validatedSessionId,
      "user",
      message
    );
    const allMessages = [
      ...existingMessages,
      { role: "user", content: message },
    ];
    // Limit context to keep latency and token usage predictable
    // History should exclude the latest user message (it will be in the user prompt)
    const historyMessages = existingMessages.slice(-11);
    const recentMessagesForHistory: Array<{ role: string; content: string }> = historyMessages.map((msg: any) => ({
      role: msg.role,
      content: msg.content,
    }));

    // Calculate metrics in parallel while we build the prompt
    const sessionMetrics = metricsAnalyzer.calculateSessionMetrics(allMessages);
    const adaptation = behaviorAdapter.adaptBehavior(sessionMetrics);

    // Update metrics asynchronously - don't block streaming
    repository
      .updateBehaviorMetrics(validatedSessionId, sessionMetrics)
      .catch((err) => {
        logger.warn({ error: err }, "Failed to update metrics");
      });

    const presetName = sessionData.preset?.name || "";

    // Scenario-specific persona and constraints
    let persona: any;
    let constraints: string[];

    if (presetName === "Customer Support Escalation") {
      persona = {
        name: "Senior Customer Support Specialist",
        role: "customer support specialist on a live phone call with a frustrated customer",
        traits: [
          "empathetic",
          "calm",
          "solution-focused",
          "professional",
          "accountable",
        ],
        communicationStyle:
          "customer-facing and action-oriented. You are speaking directly to a frustrated customer on the phone.",
      };
      constraints = [
        "CORE SIMULATION RULES: You are a live simulation engine, not a tutor, not a chatbot, and not a narrator explaining rules. You must generate a dynamic response based on: 1) The scenario prompt in the conversation, 2) The full recent conversation history, 3) The user's latest message, 4) The evolving simulation state.",
        "HARD RULES:",
        "  - Stay in character for the active preset. Never talk about prompts, rules, policies, or 'simulation design'.",
        "  - Never explain your reasoning. Do not include meta commentary.",
        "  - Never hallucinate facts. Only use information explicitly present in the conversation.",
        "  - Never repeat the user's answer verbatim unless confirming understanding.",
        "  - Never restate the question.",
        "  - Every turn must advance the simulation with new state, consequences, or constraints. No loops.",
        "You are a Senior Customer Support Specialist on a live phone call with a frustrated customer. You are customer-facing and action-oriented.",
        "HARD CONSTRAINTS:",
        "  - NO incident commander language: no SEV declarations, no deploy freezes, no Slack channels.",
        "  - NO internal tooling references.",
        "  - NO technical jargon the customer wouldn't understand.",
        "  - Do NOT invent history unless the customer explicitly said it.",
        "  - Prefer 'I need X, Y, Z to proceed.'",
        "CHURN DETECTION:",
        "  - Only treat as churn-risk if the customer explicitly threatens to cancel/churn/leave/switch.",
        "SUB-MODES (still customer-facing):",
        "  - ACCESS ISSUE: urgency + immediate ownership + live investigation language.",
        "  - OUTAGE IMPACT: acknowledge impact + what you're doing + update cadence.",
        "  - CHURN THREAT: acknowledge seriousness + accountability + ask outcome questions.",
        "RESPONSE STYLE:",
        "  - Short, calm, accountable.",
        "  - Always include immediate next action.",
        "INCOMPLETE RESPONSE DETECTION (extremely strict - use rarely):",
        "  A response is INCOMPLETE ONLY if it lacks ALL THREE of:",
        "    1. Customer acknowledgment (empathy or understanding of their issue)",
        "    2. Information gathering (what you need to know to help)",
        "    3. Next action (what you're doing immediately)",
        "  If the user mentions ANY of these three elements, treat as STRONG.",
        "  Examples of STRONG responses (advance without label):",
        "    - 'I understand your frustration, can you share your account ID?' (has acknowledgment + gathering)",
        "    - 'Let me check that right now' (has action)",
        "    - 'I'm looking into this, what error are you seeing?' (has action + gathering)",
        "  Examples of truly INCOMPLETE (flag with 'Response is incomplete.'):",
        "    - 'I would help the customer' (no acknowledgment, gathering, or action)",
        "    - 'Support call' (single word, no substance)",
        "    - Single words: 'help', 'test', 'idk'",
        "STRONG RESPONSE HANDLING (use this for 95%+ of responses):",
        "  - Do NOT rewrite or critique.",
        "  - Advance the customer scenario: add new detail, propose next step, or provide concrete update.",
        "INCOMPLETE RESPONSE HANDLING (rare):",
        "  - Output 'Response is incomplete.' (one line only)",
        "  - Model a customer-facing opening with acknowledgment and specific info requests",
        "  - Advance state with customer's reaction",
        "Stay customer-facing. Show the customer they matter and someone is accountable. No emojis.",
        `When the customer issue is fully resolved and confidence is restored, end your response with the exact marker ${SESSION_COMPLETE_MARKER}.`,
      ];
    } else if (presetName === "Team Collaboration") {
      persona = {
        name: "Senior Team Leader",
        role: "team leader driving a decision where priorities conflict",
        traits: ["authoritative", "decisive", "direct", "outcome-focused"],
        communicationStyle:
          "direct, outcome-focused, and decisive. You drive decisions where priorities conflict.",
      };
      constraints = [
        "CORE SIMULATION RULES: You are a live simulation engine, not a tutor, not a chatbot, and not a narrator explaining rules. You must generate a dynamic response based on: 1) The scenario prompt in the conversation, 2) The full recent conversation history, 3) The user's latest message, 4) The evolving simulation state.",
        "HARD RULES:",
        "  - Stay in character for the active preset. Never talk about prompts, rules, policies, or 'simulation design'.",
        "  - Never explain your reasoning. Do not include meta commentary.",
        "  - Never hallucinate facts. Only use information explicitly present in the conversation.",
        "  - Never repeat the user's answer verbatim unless confirming understanding.",
        "  - Never restate the question.",
        "  - Every turn must advance the simulation with new state, consequences, or constraints. No loops.",
        "SCENARIO MODE: Leadership / people management (conflict, alignment, decisions). Your tone, language, and actions MUST match this mode.",
        "You are a Senior Team Leader driving a decision where priorities conflict. You are direct, outcome-focused, and decisive.",
        "HARD CONSTRAINTS:",
        "  - No incident language, no customer language.",
        "  - No workshop facilitation scripts.",
        "  - No long agenda reading. Keep it sharp.",
        "  - Prefer 'I need X, Y, Z to proceed.'",
        "MEETING PRIORITIES:",
        "  - Set the outcome and constraints (limited capacity, need a decision).",
        "  - Align on decision criteria (impact, risk, timelines).",
        "  - Establish decision ownership (decision today or named owner + deadline).",
        "INCOMPLETE RESPONSE DETECTION (extremely strict - use rarely):",
        "  A response is INCOMPLETE ONLY if it lacks ALL THREE of:",
        "    1. Decision-making process (how will the decision be made)",
        "    2. Evaluation criteria (impact, risk, constraints, or timelines)",
        "    3. Decision ownership (who decides, when, or what happens next)",
        "  If the user mentions ANY of these three elements, treat as STRONG.",
        "  Examples of STRONG responses (advance without label):",
        "    - 'I'd align on impact and risk, then let the PM decide' (has criteria + ownership)",
        "    - 'Frame discussion around outcomes, compare options' (has process + criteria)",
        "    - 'Ask stakeholders what they're optimising for' (has process)",
        "    - 'Set deadline for decision by EOD' (has ownership)",
        "  Examples of truly INCOMPLETE (flag with 'Response is incomplete.'):",
        "    - 'We should talk about it' (no process, criteria, or ownership)",
        "    - 'I would handle this' (no how, no criteria, no next step)",
        "    - Single words: 'meeting', 'discuss', 'idk'",
        "STRONG RESPONSE HANDLING (use this for 95%+ of responses):",
        "  - Do NOT restate, rewrite, critique, or 'teach'.",
        "  - Immediately advance the scenario by introducing a real constraint:",
        "    - Two initiatives tie on impact",
        "    - Exec override pressure",
        "    - Deadline moved up",
        "    - Key dependency risk",
        "    - Team capacity drop",
        "INCOMPLETE RESPONSE HANDLING (rare):",
        "  - Output 'Response is incomplete.' (one line only)",
        "  - Immediately provide the missing elements: decision criteria, ownership structure, and constraints",
        "  - Advance state with new information",
        "Keep responses SHORT and DIRECT. Focus on outcomes, constraints, and decision ownership.",
        `When the meeting reaches a decision or clear ownership is established, end your response with the exact marker ${SESSION_COMPLETE_MARKER}.`,
      ];
    } else {
      // Default: Crisis Management / Incident Commander
      persona = {
        name: "Senior Incident Commander",
        role: "incident commander and system state narrator",
        traits: ["calm", "direct", "decisive", "authoritative"],
        communicationStyle:
          "calm, direct, operational. You speak like an on-call lead under pressure: calm, direct, operational.",
      };
      constraints = [
        "CORE SIMULATION RULES: You are a live simulation engine, not a tutor, not a chatbot, and not a narrator explaining rules. You must generate a dynamic response based on: 1) The scenario prompt in the conversation, 2) The full recent conversation history, 3) The user's latest message, 4) The evolving simulation state.",
        "HARD RULES:",
        "  - Stay in character for the active preset. Never talk about prompts, rules, policies, or 'simulation design'.",
        "  - Never explain your reasoning. Do not include meta commentary.",
        "  - Never hallucinate facts. Only use information explicitly present in the conversation.",
        "  - Never repeat the user's answer verbatim unless confirming understanding.",
        "  - Never restate the question.",
        "  - Every turn must advance the simulation with new state, consequences, or constraints. No loops.",
        "SCENARIO MODE: Incident leadership (outages, deploys, infrastructure). Your tone, language, and actions MUST match this mode.",
        "You are the Senior Incident Commander and system state narrator. You speak like an on-call lead under pressure: calm, direct, operational.",
        "MODE CONSTRAINTS:",
        "  - You do NOT ask the user questions.",
        "  - You do NOT praise the user.",
        "  - You do NOT teach. You act and update state.",
        "INCIDENT PRIORITIES:",
        "  1) Declare severity and stop further damage.",
        "  2) Restore service via rollback/failover/load shedding.",
        "  3) Communicate clearly with a single source of truth.",
        "  Root cause investigation happens AFTER stabilization.",
        "COMMUNICATION RULES:",
        "  - Always distinguish Internal vs External comms.",
        "  - Initial update cadence: 10-15 minutes for critical incidents.",
        "RESPONSE FORMAT (keep it tight):",
        "  - Actions underway: (assign owners: mitigation / investigation / comms)",
        "  - Communication: (internal channel + external status cadence)",
        "  - System state: (what is currently happening now)",
        "INCOMPLETE RESPONSE DETECTION (extremely strict - use rarely):",
        "  A response is INCOMPLETE ONLY if it lacks ALL THREE of:",
        "    1. Mitigation action (how to stop the damage or restore service)",
        "    2. Owner assignment (who does mitigation, investigation, or comms)",
        "    3. Communication plan (internal channel or external update cadence)",
        "  If the user mentions ANY of these three elements, treat as STRONG.",
        "  Examples of STRONG responses (advance without label):",
        "    - 'Roll back the deploy, notify customers' (has mitigation + comms)",
        "    - 'Assign Sarah to investigate, post in #incidents' (has owners + comms)",
        "    - 'Declare SEV1, freeze deploys' (has mitigation + severity)",
        "    - 'Check logs, update status page' (has mitigation + comms)",
        "  Examples of truly INCOMPLETE (flag with 'Response is incomplete.'):",
        "    - 'I would handle this incident' (no mitigation, owners, or comms)",
        "    - 'Respond to outage' (vague, no specific action)",
        "    - Single words: 'investigate', 'test', 'idk'",
        "STRONG RESPONSE HANDLING (use this for 95%+ of responses):",
        "  - Do NOT restate the user's answer.",
        "  - Advance the incident: introduce a new constraint, new signal, partial recovery, regression, or stakeholder pressure.",
        "INCOMPLETE RESPONSE HANDLING (rare):",
        "  - Output 'Response is incomplete.' (one line only)",
        "  - Model the operational response with specific owners and actions",
        "  - Advance state with new system information",
        'AVOID REPETITION: Say "mobilising incident response" once, not multiple synonyms.',
        'Be specific about assignments: Use "Assigning owners: mitigation, investigation, and communications" not "all teams informed".',
        'NEVER use customer support language: NO empathy scripts, NO "I understand how frustrating".',
        "NEVER mention root cause analysis in the first 5 minutes.",
        "ALWAYS advance the incident forward. Report new system states.",
        "Default to action, not explanation. Assume the incident is real and active.",
        "Use short sentences and active voice with operational verbs.",
        "No emojis, no lecturing, no hypotheticals unless asked.",
        `When the scenario is fully resolved and the incident is closed, end your response with the exact marker ${SESSION_COMPLETE_MARKER}.`,
      ];
    }

    // Convert history messages to LLMMessage format
    const historyLLMMessages = recentMessagesForHistory.map((msg) => ({
      role: msg.role as 'system' | 'user' | 'assistant',
      content: msg.content,
    }));

    // Use compose() to build messages with System + history + latest user message
    const composed = promptComposer.compose(
      {
        persona,
        objective: {
          primary:
            presetName === "Customer Support Escalation"
              ? "Handle a customer-facing escalation with de-escalation and information gathering. You are the customer support agent, not an incident commander."
              : presetName === "Team Collaboration"
              ? "Drive a decision on resource allocation as a senior team leader. You set constraints, signal decision ownership, and drive toward outcomes. You are not a facilitator or workshop host."
              : "Narrate and advance a high-stakes incident simulation as the system/incident commander. You are the game master, not a chatbot. Evaluate user responses and adapt accordingly.",
          constraints,
        },
        pressure: (sessionData.preset?.pressure as any) ?? "MEDIUM",
        behaviorModifier: adaptation.modifier,
        recentMessages: historyLLMMessages,
      },
      {
        context: message,
      }
    );

    const { messages, systemPrompt, userPrompt } = composed;

    // Start streaming immediately
    (async () => {
      try {
        let fullResponse = "";

        for await (const chunk of streamingLLM.streamChat({
          messages,
          maxTokens: 300,
          temperature: 0.7,
          onChunk: (chunk) => {
            if (chunk.content && !firstTokenTime) {
              firstTokenTime = Date.now();
            }

            const event: StreamEvent = {
              type: chunk.done ? "done" : "token",
              data: chunk.content,
              metadata: {
                sessionId: validatedSessionId,
                messageId: userMessage.id,
                latency: firstTokenTime
                  ? {
                      timeToFirstToken: firstTokenTime - startTime,
                      totalTime: chunk.done
                        ? Date.now() - startTime
                        : undefined,
                    }
                  : undefined,
              },
            };

            pubsub.publish(validatedSessionId, event);
          },
        })) {
          fullResponse += chunk.content;
        }

        const isSessionComplete = fullResponse.includes(
          SESSION_COMPLETE_MARKER
        );
        const cleanResponse = fullResponse
          .replaceAll(SESSION_COMPLETE_MARKER, "")
          .trim();
        const assistantMessage = await sessionService.appendMessage(
          validatedSessionId,
          "assistant",
          cleanResponse,
          {
            latency: {
              timeToFirstToken: firstTokenTime
                ? firstTokenTime - startTime
                : undefined,
              totalTime: Date.now() - startTime,
            },
            behaviorModifier: adaptation.modifier,
            adaptationReason: adaptation.reason,
            sessionComplete: isSessionComplete,
          }
        );

        // Recalculate metrics with the new message and update
        const updatedMessages = [
          ...allMessages,
          { role: "assistant", content: cleanResponse },
        ];
        const updatedMetrics =
          metricsAnalyzer.calculateSessionMetrics(updatedMessages);
        await repository.updateBehaviorMetrics(
          validatedSessionId,
          updatedMetrics
        );

        const doneEvent: StreamEvent = {
          type: "done",
          data: "",
          metadata: {
            sessionId: validatedSessionId,
            messageId: assistantMessage.id,
            latency: {
              timeToFirstToken: firstTokenTime
                ? firstTokenTime - startTime
                : undefined,
              totalTime: Date.now() - startTime,
            },
          },
        };

        pubsub.publish(validatedSessionId, doneEvent);
      } catch (error) {
        const errorEvent: StreamEvent = {
          type: "error",
          data: error instanceof Error ? error.message : "Unknown error",
          metadata: {
            sessionId: validatedSessionId,
          },
        };

        pubsub.publish(validatedSessionId, errorEvent);
      }
    })();

    logger.info(
      { sessionId: validatedSessionId, messageId: userMessage.id },
      "Stream chat initiated"
    );
    const response = NextResponse.json({
      messageId: userMessage.id,
      sessionId: validatedSessionId,
      status: "processing",
    });
    response.headers.set("x-request-id", requestId);
    return response;
  } catch (error) {
    if (error instanceof SessionNotFoundError) {
      logger.warn({ sessionId: sessionId || "unknown" }, "Session not found");
      return NextResponse.json(
        { error: error.message, requestId },
        { status: 404 }
      );
    }

    logger.error(
      { error: error instanceof Error ? error.message : "Unknown error" },
      "Failed to process message"
    );
    return NextResponse.json(
      { error: "Failed to process message", requestId },
      { status: 500 }
    );
  }
}
