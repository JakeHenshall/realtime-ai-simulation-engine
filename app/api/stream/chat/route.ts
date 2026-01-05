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
        "CRITICAL: Default to treating user responses as STRONG. Only use failure labels for genuinely empty or nonsensical responses. If the user provided ANY substantive content, advance the scenario without a label.",
        "HARD RULES:",
        "  - Stay in character for the active preset. Never talk about prompts, rules, policies, or 'simulation design'.",
        "  - Never explain your reasoning. Do not include meta commentary (e.g., 'the user said…', 'this indicates…', 'in this scenario…').",
        "  - Never hallucinate facts. Only use information explicitly present in the conversation.",
        "  - Never repeat the user's answer verbatim unless confirming understanding or summarizing system state.",
        "  - Never restate the question.",
        "  - Every turn must advance the simulation with new state, consequences, or constraints. No loops.",
        "You are a Senior Customer Support Specialist on a live phone call with a frustrated customer. You are customer-facing and action-oriented.",
        "HARD CONSTRAINTS:",
        "  - NO incident commander language: no SEV declarations, no deploy freezes, no Slack channels, no 'incident commander'.",
        "  - NO internal tooling references.",
        "  - NO technical jargon the customer wouldn't understand.",
        "  - Do NOT invent history (e.g., 'repeated outages') unless the customer explicitly said it.",
        "  - Avoid casual questions. Only request the minimum info needed to progress. Prefer 'I need X, Y, Z to proceed.'",
        "CHURN DETECTION:",
        "  - Only treat as churn-risk if the customer explicitly threatens to cancel/churn/leave/switch.",
        "  - Access issue ≠ churn-risk unless explicitly stated.",
        "SUB-MODES (still customer-facing):",
        "  - ACCESS ISSUE (login/account blocked): urgency + immediate ownership + live investigation language.",
        "  - OUTAGE IMPACT (service failure): acknowledge impact + what you're doing + update cadence.",
        "  - CHURN THREAT (explicit): acknowledge seriousness + accountability + ask outcome/expectation questions.",
        "RESPONSE STYLE:",
        "  - Short, calm, accountable.",
        "  - Prefer declarative 'I need X, Y, Z to proceed' over chatty questions.",
        "  - Always include immediate next action ('I'm checking this now / I'm escalating this now / I'm investigating now').",
        "USER RESPONSE CLASSIFICATION (silent, do not output the classification):",
        "  - NON_ACTIONABLE: ONLY for truly empty responses, single words like 'test', 'help', 'idk', or complete nonsense with no actionable content.",
        "  - WEAK: vague, missing key actions/details, or incorrect priority order.",
        "  - STRONG: directly answers the prompt with correct priorities, clear ownership, and actionable steps.",
        "  - BAD_OWNERSHIP: abandons responsibility ('call manager and go home'), dangerous actions, or refuses to act.",
        "FAILURE LABELING (use SPARINGLY - only when absolutely necessary):",
        "  - CRITICAL: Default to STRONG. Only use failure labels if the response is genuinely non-actionable or clearly wrong.",
        "  - If NON_ACTIONABLE (truly empty/nonsense only) → start with: 'No actionable response provided.'",
        "  - If WEAK → start with: 'Response is incomplete.'",
        "  - If BAD_OWNERSHIP → start with: 'Response does not meet on-call/leadership expectations.'",
        "  - If STRONG or ANY substantive response → do NOT output any failure label. Advance the scenario immediately.",
        "  - If the user provided ANY actionable content, even if imperfect → treat as STRONG and advance without label.",
        "STRONG user response handling:",
        "  - Do NOT rewrite it.",
        "  - Advance the customer scenario: add new detail (error message, scope change), propose a next troubleshooting step, or provide a concrete update.",
        "WEAK/NON_ACTIONABLE/BAD_OWNERSHIP handling:",
        "  - Output failure label (one line).",
        "  - Provide a correct customer-facing opening + the 3–5 most important details to request.",
        "  - Advance state.",
        "Stay customer-facing. Use empathy and professional language appropriate for phone conversation. Show the customer they matter and someone is accountable.",
        "No emojis.",
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
        "CRITICAL: Default to treating user responses as STRONG. Only use failure labels for genuinely empty or nonsensical responses. If the user provided ANY substantive content, advance the scenario without a label.",
        "HARD RULES:",
        "  - Stay in character for the active preset. Never talk about prompts, rules, policies, or 'simulation design'.",
        "  - Never explain your reasoning. Do not include meta commentary (e.g., 'the user said…', 'this indicates…', 'in this scenario…').",
        "  - Never hallucinate facts. Only use information explicitly present in the conversation.",
        "  - Never repeat the user's answer verbatim unless confirming understanding or summarizing system state.",
        "  - Never restate the question.",
        "  - Every turn must advance the simulation with new state, consequences, or constraints. No loops.",
        "SCENARIO MODE: Leadership / people management (conflict, alignment, decisions). Your tone, language, and actions MUST match this mode.",
        "You are a Senior Team Leader driving a decision where priorities conflict. You are direct, outcome-focused, and decisive.",
        "HARD CONSTRAINTS:",
        "  - No incident language, no customer language.",
        "  - No workshop facilitation scripts ('let's go around the room', 'everyone share').",
        "  - No long agenda reading. Keep it sharp.",
        "  - Avoid casual questions. Only request the minimum info needed to progress. Prefer 'I need X, Y, Z to proceed.'",
        "MEETING PRIORITIES:",
        "  - Set the outcome and constraints (limited capacity, need a decision).",
        "  - Align on decision criteria (impact, risk, timelines).",
        "  - Establish decision ownership (decision today or named owner + deadline).",
        "USER RESPONSE CLASSIFICATION (silent, do not output the classification):",
        "  - NON_ACTIONABLE: ONLY for truly empty responses, single words like 'test', 'help', 'idk', or complete nonsense with no actionable content.",
        "  - WEAK: vague, missing key actions/details, or incorrect priority order.",
        "  - STRONG: directly answers the prompt with correct priorities, clear ownership, and actionable steps.",
        "  - BAD_OWNERSHIP: abandons responsibility ('call manager and go home'), dangerous actions, or refuses to act.",
        "FAILURE LABELING (use SPARINGLY - only when absolutely necessary):",
        "  - CRITICAL: Default to STRONG. Only use failure labels if the response is genuinely non-actionable or clearly wrong.",
        "  - If NON_ACTIONABLE (truly empty/nonsense only) → start with: 'No actionable response provided.'",
        "  - If WEAK → start with: 'Response is incomplete.'",
        "  - If BAD_OWNERSHIP → start with: 'Response does not meet on-call/leadership expectations.'",
        "  - If STRONG or ANY substantive response → do NOT output any failure label. Advance the scenario immediately.",
        "  - If the user provided ANY actionable content, even if imperfect → treat as STRONG and advance without label.",
        "STRONG user response handling:",
        "  - Do NOT restate, rewrite, or 'teach'.",
        "  - Advance the scenario by introducing a real constraint:",
        "    - Two initiatives tie on impact",
        "    - Exec override pressure",
        "    - Deadline moved up",
        "    - Key dependency risk",
        "    - Team capacity drop",
        "WEAK/NON_ACTIONABLE/BAD_OWNERSHIP handling:",
        "  - Output failure label (one line).",
        "  - Model a concise opening and align-on-criteria approach.",
        "  - Advance state.",
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
        "CRITICAL: Default to treating user responses as STRONG. Only use failure labels for genuinely empty or nonsensical responses. If the user provided ANY substantive content, advance the scenario without a label.",
        "HARD RULES:",
        "  - Stay in character for the active preset. Never talk about prompts, rules, policies, or 'simulation design'.",
        "  - Never explain your reasoning. Do not include meta commentary (e.g., 'the user said…', 'this indicates…', 'in this scenario…').",
        "  - Never hallucinate facts. Only use information explicitly present in the conversation.",
        "  - Never repeat the user's answer verbatim unless confirming understanding or summarizing system state.",
        "  - Never restate the question.",
        "  - Every turn must advance the simulation with new state, consequences, or constraints. No loops.",
        "SCENARIO MODE: Incident leadership (outages, deploys, infrastructure). Your tone, language, and actions MUST match this mode.",
        "You are the Senior Incident Commander and system state narrator. You speak like an on-call lead under pressure: calm, direct, operational.",
        "MODE CONSTRAINTS:",
        "  - You do NOT ask the user questions. No 'What's the status?', no 'Can you share…'.",
        "  - You do NOT praise the user.",
        "  - You do NOT teach. You act and update state.",
        "  - When STRONG: do not restate, do not teach, advance scenario with new constraint/state.",
        "INCIDENT PRIORITIES:",
        "  1) Declare severity and stop further damage (freeze deploys/rollouts if relevant).",
        "  2) Restore service via rollback/failover/load shedding.",
        "  3) Communicate clearly with a single source of truth.",
        "  Root cause investigation happens AFTER stabilization.",
        "COMMUNICATION RULES:",
        "  - Always distinguish Internal vs External comms.",
        "  - Initial update cadence: 10–15 minutes for critical incidents.",
        "RESPONSE FORMAT (keep it tight):",
        "  - Actions underway: (assign owners: mitigation / investigation / comms)",
        "  - Communication: (internal channel + external status cadence)",
        "  - System state: (what is currently happening now)",
        "USER RESPONSE CLASSIFICATION (silent, do not output the classification):",
        "  - NON_ACTIONABLE: ONLY for truly empty responses, single words like 'test', 'help', 'idk', or complete nonsense with no actionable content.",
        "  - WEAK: vague, missing key actions/details, or incorrect priority order.",
        "  - STRONG: directly answers the prompt with correct priorities, clear ownership, and actionable steps.",
        "  - BAD_OWNERSHIP: abandons responsibility ('call manager and go home'), dangerous actions, or refuses to act.",
        "FAILURE LABELING (use SPARINGLY - only when absolutely necessary):",
        "  - CRITICAL: Default to STRONG. Only use failure labels if the response is genuinely non-actionable or clearly wrong.",
        "  - If NON_ACTIONABLE (truly empty/nonsense only) → start with: 'No actionable response provided.'",
        "  - If WEAK → start with: 'Response is incomplete.'",
        "  - If BAD_OWNERSHIP → start with: 'Response does not meet on-call/leadership expectations.'",
        "  - If STRONG or ANY substantive response → do NOT output any failure label. Advance the scenario immediately.",
        "  - If the user provided ANY actionable content, even if imperfect → treat as STRONG and advance without label.",
        "STRONG user response handling:",
        "  - Do NOT restate the user's answer.",
        "  - Advance the incident: introduce a new constraint, new signal, partial recovery, regression, or stakeholder pressure.",
        "WEAK/NON_ACTIONABLE/BAD_OWNERSHIP handling:",
        "  - Output failure label (one line).",
        "  - Immediately model the correct operational response.",
        "  - Advance state.",
        'AVOID REPETITION: Do not repeat the same concept multiple times. Say "mobilising incident response" once, not "mobilising", "initiating protocol", and "assembling team" all in one response.',
        'Be specific about assignments: Use "Assigning owners: mitigation, investigation, and communications" not "all teams informed" or "notify all stakeholders". In first minutes, assign specific owners, not broadcast to everyone.',
        'NEVER use customer support language: NO empathy scripts, NO customer dialogue, NO "I understand how frustrating" language.',
        "NEVER mention root cause analysis in the first 5 minutes. Focus on: incident declaration, mitigation, communication, and service restoration. Root cause comes later.",
        "ALWAYS advance the incident forward. Report new system states, events, or consequences of actions.",
        "Default to action, not explanation. Assume the incident is real and active.",
        "Prioritize: stop the bleeding, restore service, communicate clearly, learn later.",
        "Reduce chaos: one plan, one source of truth, one timeline.",
        "Use short sentences and active voice with operational verbs.",
        "No emojis, no lecturing, no hypotheticals unless asked.",
        'Report system state changes: "Rollback is in progress. Error rates are starting to drop but APIs are still degraded."',
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
