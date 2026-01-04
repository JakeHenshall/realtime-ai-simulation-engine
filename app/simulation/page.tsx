"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: string;
  metadata?: string | null;
}

interface Session {
  id: string;
  name: string;
  status: string;
}

function SimulationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const presetId = searchParams.get("presetId");
  const sessionId = searchParams.get("sessionId");

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSession, setIsLoadingSession] = useState(true);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isAwaitingResponse, setIsAwaitingResponse] = useState(false);
  const [currentStream, setCurrentStream] = useState("");
  const [showEndSession, setShowEndSession] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const currentStreamRef = useRef("");
  const isStreamingRef = useRef(false);
  const isAwaitingResponseRef = useRef(false);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startInFlightRef = useRef(false);
  const openingRetryRef = useRef(0);
  const hasLoadedOnceRef = useRef(false);
  const isLoadingSessionRef = useRef(false);
  const completionMarker = "[[SESSION_COMPLETE]]";
  const isMessageMarkedComplete = (message: Message) => {
    if (message.role !== "assistant") return false;
    if (message.content?.includes(completionMarker)) return true;
    if (!message.metadata) return false;
    try {
      const parsed = JSON.parse(message.metadata) as {
        sessionComplete?: boolean;
      };
      return Boolean(parsed.sessionComplete);
    } catch {
      return false;
    }
  };

  useEffect(() => {
    if (sessionId) {
      loadSession();
    } else if (presetId) {
      createSession();
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [presetId, sessionId]);

  useEffect(() => {
    if (messages.length > 0 || currentStream) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    }
  }, [messages, currentStream]);

  useEffect(() => {
    currentStreamRef.current = currentStream;
  }, [currentStream]);

  useEffect(() => {
    isAwaitingResponseRef.current = isAwaitingResponse;
  }, [isAwaitingResponse]);

  useEffect(() => {
    return () => {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
    };
  }, []);

  const clearResponseFallback = () => {
    if (fallbackTimerRef.current) {
      clearTimeout(fallbackTimerRef.current);
      fallbackTimerRef.current = null;
    }
  };

  const scheduleResponseFallback = () => {
    clearResponseFallback();
    isAwaitingResponseRef.current = true;

    // First check after 2 seconds
    fallbackTimerRef.current = setTimeout(() => {
      if (!sessionId) return;
      if (isStreamingRef.current || currentStreamRef.current) {
        // If streaming started, check again in 3 more seconds
        fallbackTimerRef.current = setTimeout(() => {
          if (
            !isStreamingRef.current &&
            !currentStreamRef.current &&
            isAwaitingResponseRef.current
          ) {
            loadSession();
            isAwaitingResponseRef.current = false;
          }
        }, 3000);
        return;
      }
      if (!isAwaitingResponseRef.current) return;
      // Fallback: reload session to get any new messages
      loadSession();
      isAwaitingResponseRef.current = false;
    }, 2000);
  };

  const createSession = async () => {
    try {
      setErrorMessage(null);
      setShowEndSession(false);
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Simulation ${new Date().toLocaleString()}`,
          presetId: presetId || undefined,
        }),
      });

      if (!res.ok) throw new Error("Failed to create session");

      const newSession = await res.json();
      setSession(newSession);
      // Start session and store opening message for immediate display
      fetch(`/api/sessions/${newSession.id}/start`, { method: "POST" })
        .then(async (startRes) => {
          if (startRes.ok) {
            const startResponse = await startRes.json();
            // Store opening message in sessionStorage for instant display after navigation
            if (startResponse.openingMessage) {
              sessionStorage.setItem(
                `opening-msg-${newSession.id}`,
                JSON.stringify({
                  content: startResponse.openingMessage,
                  timestamp: new Date().toISOString(),
                })
              );
            }
          }
        })
        .catch(() => {});
      router.replace(`/simulation?sessionId=${newSession.id}`);
    } catch (error) {
      console.error("Error creating session:", error);
      setErrorMessage("Failed to create the session. Please try again.");
    }
  };

  const loadSession = async () => {
    if (!sessionId) return;
    
    // Prevent concurrent loadSession calls to avoid flickering
    if (isLoadingSessionRef.current) return;
    isLoadingSessionRef.current = true;

    try {
      // Only show loading on first load, and never if we're streaming, awaiting response, or have messages
      const isActiveConversation = isStreamingRef.current || isAwaitingResponseRef.current || messages.length > 0;
      if (!hasLoadedOnceRef.current && !isActiveConversation) {
        setIsLoadingSession(true);
      } else if (isActiveConversation) {
        // Never show loading during active conversation
        setIsLoadingSession(false);
      }
      setErrorMessage(null);
      
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error("Failed to load session");

      const sessionData = await res.json();
      setSession(sessionData);
      const loadedMessages = (sessionData.messages || []).sort(
        (a: Message, b: Message) => {
          return (
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        }
      );

      // Check for stored opening message and merge intelligently
      const storedOpening = sessionStorage.getItem(`opening-msg-${sessionId}`);
      let messagesToSet = loadedMessages;
      
      if (storedOpening && loadedMessages.length === 0) {
        try {
          const { content, timestamp } = JSON.parse(storedOpening);
          const openingMsg: Message = {
            id: `msg-opening-${Date.now()}`,
            role: "assistant",
            content,
            timestamp,
            metadata: JSON.stringify({ type: "opening-message" }),
          };
          messagesToSet = [openingMsg];
          // Clear from storage once used
          sessionStorage.removeItem(`opening-msg-${sessionId}`);
        } catch (e) {
          // Ignore parse errors
        }
      }

      // Only update messages if they've actually changed to prevent flickering
      setMessages((prevMessages) => {
        // Check if messages are the same (by content and timestamp)
        if (prevMessages.length === messagesToSet.length) {
          const isSame = prevMessages.every((prev, idx) => {
            const next = messagesToSet[idx];
            return (
              prev.id === next.id &&
              prev.content === next.content &&
              prev.timestamp === next.timestamp
            );
          });
          if (isSame) {
            return prevMessages; // No change, return previous to prevent re-render
          }
        }
        return messagesToSet;
      });
      if (loadedMessages.some((msg: Message) => msg.role === "assistant")) {
        setIsAwaitingResponse(false);
        isAwaitingResponseRef.current = false;
        openingRetryRef.current = 0;
      }

      setShowEndSession(
        loadedMessages.some((msg: Message) => isMessageMarkedComplete(msg))
      );
      hasLoadedOnceRef.current = true;

      // Only clear stream if we're not currently streaming
      if (!isStreamingRef.current) {
        setCurrentStream("");
        currentStreamRef.current = "";
      }

      if (
        sessionData.status === "ACTIVE" &&
        (!eventSourceRef.current ||
          eventSourceRef.current.readyState === EventSource.CLOSED)
      ) {
        connectSSE();
        if (loadedMessages.length === 0 && openingRetryRef.current < 3) {
          openingRetryRef.current += 1;
          setTimeout(() => loadSession(), 500 * openingRetryRef.current);
        }
      } else if (sessionData.status === "PENDING" && !startInFlightRef.current) {
        startInFlightRef.current = true;
        fetch(`/api/sessions/${sessionId}/start`, { method: "POST" })
          .then(async (res) => {
            if (res.ok) {
              const startResponse = await res.json();
              // Store opening message for instant display, don't set state here to avoid flicker
              if (startResponse.openingMessage && loadedMessages.length === 0) {
                sessionStorage.setItem(
                  `opening-msg-${sessionId}`,
                  JSON.stringify({
                    content: startResponse.openingMessage,
                    timestamp: new Date().toISOString(),
                  })
                );
                // Update state only if we don't have messages yet
                setMessages((prev) => {
                  if (prev.length === 0) {
                    const openingMsg: Message = {
                      id: `msg-opening-${Date.now()}`,
                      role: "assistant",
                      content: startResponse.openingMessage,
                      timestamp: new Date().toISOString(),
                      metadata: JSON.stringify({ type: "opening-message" }),
                    };
                    return [openingMsg];
                  }
                  return prev;
                });
                setIsAwaitingResponse(false);
                isAwaitingResponseRef.current = false;
              }
            }
          })
          .catch(() => {})
          .finally(() => {
            startInFlightRef.current = false;
            // Reload once to pick up ACTIVE status and sync messages, but only if needed
            if (loadedMessages.length === 0) {
              setTimeout(() => loadSession(), 300);
            }
          });
      }
    } catch (error) {
      console.error("Error loading session:", error);
      setErrorMessage(
        "Unable to load this session. Please refresh and try again."
      );
    } finally {
      if (!hasLoadedOnceRef.current) {
        setIsLoadingSession(false);
      }
      isLoadingSessionRef.current = false;
    }
  };

  const connectSSE = () => {
    if (!sessionId) return;

    if (
      eventSourceRef.current &&
      eventSourceRef.current.readyState !== EventSource.CLOSED
    ) {
      return;
    }

    const eventSource = new EventSource(`/api/stream/sse/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onopen = () => {};

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "token") {
          setIsAwaitingResponse(false);
          isAwaitingResponseRef.current = false;
          setIsStreaming(true);
          isStreamingRef.current = true;
          clearResponseFallback();
          setCurrentStream((prev) => {
            const next = prev + data.data;
            currentStreamRef.current = next;
            if (next.includes(completionMarker)) {
              setShowEndSession(true);
            }
            return next;
          });
        } else if (data.type === "done") {
          setIsStreaming(false);
          isStreamingRef.current = false;
          setIsAwaitingResponse(false);
          isAwaitingResponseRef.current = false;
          clearResponseFallback();
          if (currentStreamRef.current) {
            if (currentStreamRef.current.includes(completionMarker)) {
              setShowEndSession(true);
            }
            const assistantMessage = {
              id: `msg-${Date.now()}`,
              role: "assistant",
              content: currentStreamRef.current
                .replaceAll(completionMarker, "")
                .trim(),
              timestamp: new Date().toISOString(),
            };
            // Clear awaiting response state since we have the complete message
            setIsAwaitingResponse(false);
            isAwaitingResponseRef.current = false;
            setIsStreaming(false);
            isStreamingRef.current = false;
            setMessages((prev) => {
              // Check if message already exists to avoid duplicates
              const exists = prev.some(
                (msg) =>
                  msg.role === "assistant" &&
                  msg.content === assistantMessage.content &&
                  Math.abs(
                    new Date(msg.timestamp).getTime() -
                      new Date(assistantMessage.timestamp).getTime()
                  ) < 5000
              );
              if (exists) {
                return prev;
              }
              return [...prev, assistantMessage];
            });
            setCurrentStream("");
            currentStreamRef.current = "";
          }
          // Fallback: reload session after a delay to ensure message appears
          // This is a safety net in case the state update didn't trigger a re-render
          setTimeout(() => {
            loadSession();
          }, 1000);
        } else if (data.type === "error") {
          setIsStreaming(false);
          isStreamingRef.current = false;
          setIsAwaitingResponse(false);
          clearResponseFallback();
          setCurrentStream("");
          currentStreamRef.current = "";
          setErrorMessage(
            "The response stream failed. Please try sending again."
          );
          console.error("SSE error:", data.data);
        }
      } catch (error) {
        console.error("Error parsing SSE message:", error);
      }
    };

    eventSource.onerror = (error) => {
      console.error("SSE connection error:", error);
      // Don't close on first error - might be temporary
      // Only close if connection is actually closed
      if (eventSource.readyState === EventSource.CLOSED) {
        eventSource.close();
        eventSourceRef.current = null;
        setIsStreaming(false);
        isStreamingRef.current = false;
        setIsAwaitingResponse(false);
        clearResponseFallback();
        setErrorMessage(
          "Lost connection to the session stream. Please try again."
        );
      }
    };
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const userMessage = input.trim();
    setInput("");
    setIsLoading(true);
    setIsAwaitingResponse(true);
    setErrorMessage(null);

    // Ensure SSE connection is established before sending
    connectSSE();
    scheduleResponseFallback();

    // Small delay to ensure SSE connection is ready
    await new Promise((resolve) => setTimeout(resolve, 100));

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        role: "user",
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    ]);

    const thinkingTimeout = setTimeout(() => {
      if (!isStreamingRef.current) {
        setIsAwaitingResponse(false);
        isAwaitingResponseRef.current = false;
      }
    }, 10000);

    try {
      const res = await fetch("/api/stream/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
        }),
      });

      clearTimeout(thinkingTimeout);

      // SSE handles message updates; fallback handles missed streams.

      if (!res.ok) {
        const rawError = await res.text();
        let message = `Failed to send message: ${res.status} ${res.statusText}`;

        if (rawError) {
          try {
            const parsed = JSON.parse(rawError) as { error?: string };
            if (parsed.error) message = parsed.error;
          } catch {
            message = rawError;
          }
        }

        setMessages((prev) => [
          ...prev,
          {
            id: `error-${Date.now()}`,
            role: "system",
            content: `Error: ${message}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        setErrorMessage(message);
        setIsAwaitingResponse(false);
        isAwaitingResponseRef.current = false;
        return;
      }
    } catch (error) {
      clearTimeout(thinkingTimeout);
      console.error("Error sending message:", error);
      // Show error to user
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "system",
          content: `Error: ${
            error instanceof Error ? error.message : "Failed to send message"
          }`,
          timestamp: new Date().toISOString(),
        },
      ]);
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to send message"
      );
      setIsAwaitingResponse(false);
      isAwaitingResponseRef.current = false;
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async () => {
    if (!sessionId) return;

    try {
      await fetch(`/api/sessions/${sessionId}/end`, { method: "POST" });
      router.push(`/analysis/${sessionId}`);
    } catch (error) {
      console.error("Error ending session:", error);
    }
  };

  // Only show loading on initial load when we have no session, no messages, and not streaming
  const shouldShowLoading = !session && messages.length === 0 && !isStreaming && isLoadingSession;
  
  if (shouldShowLoading) {
    return (
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
        {errorMessage ? (
          <div
            style={{
              padding: "1rem",
              borderRadius: "6px",
              border: "1px solid #7f1d1d",
              backgroundColor: "#1f0f0f",
              color: "#fca5a5",
            }}
          >
            {errorMessage}
          </div>
        ) : (
          <p>Loading session...</p>
        )}
      </main>
    );
  }

  // If we have messages or are streaming, render UI even without session (it will load)
  // Otherwise, ensure session exists before rendering
  if (!session && messages.length === 0 && !isStreaming) {
    return (
      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "2rem" }}>
        <p>Loading session...</p>
      </main>
    );
  }

  return (
    <main
      style={{
        maxWidth: "900px",
        margin: "0 auto",
        padding: "2rem",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          marginBottom: "1rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div>
          <Link href="/" style={{ color: "#999", fontSize: "0.9rem" }}>
            ← Back
          </Link>
          <h1 style={{ marginTop: "0.5rem", fontSize: "1.5rem" }}>
            {session?.name || "Simulation"}
          </h1>
        </div>
      </div>

      {errorMessage && (
        <div
          style={{
            marginBottom: "1rem",
            padding: "0.75rem 1rem",
            borderRadius: "6px",
            border: "1px solid #7f1d1d",
            backgroundColor: "#1f0f0f",
            color: "#fca5a5",
          }}
        >
          {errorMessage}
        </div>
      )}

      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "1rem",
          backgroundColor: "#111",
          borderRadius: "4px",
          marginBottom: "1rem",
        }}
      >
        {messages.length === 0 && !currentStream && !isAwaitingResponse && (
          <p style={{ color: "#666", textAlign: "center", marginTop: "2rem" }}>
            No messages yet. Start the conversation.
          </p>
        )}
        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              backgroundColor: msg.role === "user" ? "#222" : "#1a1a1a",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "#666",
                marginBottom: "0.25rem",
              }}
            >
              {msg.role === "user" ? "You" : "Assistant"}
            </div>
            {msg.role === "assistant" ? (
              <div
                style={{
                  color: "#fff",
                  lineHeight: "1.6",
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => (
                      <p style={{ marginBottom: "0.75rem", marginTop: 0 }}>
                        {children}
                      </p>
                    ),
                    strong: ({ children }) => (
                      <strong style={{ fontWeight: 600, color: "#fff" }}>
                        {children}
                      </strong>
                    ),
                    em: ({ children }) => (
                      <em style={{ fontStyle: "italic" }}>{children}</em>
                    ),
                    ul: ({ children }) => (
                      <ul
                        style={{
                          marginBottom: "0.75rem",
                          paddingLeft: "1.5rem",
                        }}
                      >
                        {children}
                      </ul>
                    ),
                    ol: ({ children }) => (
                      <ol
                        style={{
                          marginBottom: "0.75rem",
                          paddingLeft: "1.5rem",
                        }}
                      >
                        {children}
                      </ol>
                    ),
                    li: ({ children }) => (
                      <li style={{ marginBottom: "0.25rem" }}>{children}</li>
                    ),
                    code: ({ children, className }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code
                          style={{
                            backgroundColor: "#333",
                            padding: "0.125rem 0.25rem",
                            borderRadius: "3px",
                            fontSize: "0.9em",
                          }}
                        >
                          {children}
                        </code>
                      ) : (
                        <code
                          style={{
                            display: "block",
                            backgroundColor: "#333",
                            padding: "0.75rem",
                            borderRadius: "4px",
                            overflowX: "auto",
                            fontSize: "0.9em",
                          }}
                        >
                          {children}
                        </code>
                      );
                    },
                    blockquote: ({ children }) => (
                      <blockquote
                        style={{
                          borderLeft: "3px solid #555",
                          paddingLeft: "1rem",
                          marginLeft: 0,
                          marginBottom: "0.75rem",
                          color: "#ccc",
                        }}
                      >
                        {children}
                      </blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: "#4a9eff",
                          textDecoration: "underline",
                        }}
                      >
                        {children}
                      </a>
                    ),
                  }}
                >
                  {msg.content.replaceAll(completionMarker, "").trim()}
                </ReactMarkdown>
              </div>
            ) : (
              <div style={{ whiteSpace: "pre-wrap", color: "#fff" }}>
                {msg.content}
              </div>
            )}
          </div>
        ))}

        {isStreaming && currentStream && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem",
              backgroundColor: "#1a1a1a",
              borderRadius: "4px",
            }}
          >
            <div
              style={{
                fontSize: "0.75rem",
                color: "#666",
                marginBottom: "0.25rem",
              }}
            >
              Assistant
            </div>
            <div
              style={{
                color: "#fff",
                lineHeight: "1.6",
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => (
                    <p style={{ marginBottom: "0.75rem", marginTop: 0 }}>
                      {children}
                    </p>
                  ),
                  strong: ({ children }) => (
                    <strong style={{ fontWeight: 600, color: "#fff" }}>
                      {children}
                    </strong>
                  ),
                  em: ({ children }) => (
                    <em style={{ fontStyle: "italic" }}>{children}</em>
                  ),
                  ul: ({ children }) => (
                    <ul
                      style={{ marginBottom: "0.75rem", paddingLeft: "1.5rem" }}
                    >
                      {children}
                    </ul>
                  ),
                  ol: ({ children }) => (
                    <ol
                      style={{ marginBottom: "0.75rem", paddingLeft: "1.5rem" }}
                    >
                      {children}
                    </ol>
                  ),
                  li: ({ children }) => (
                    <li style={{ marginBottom: "0.25rem" }}>{children}</li>
                  ),
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code
                        style={{
                          backgroundColor: "#333",
                          padding: "0.125rem 0.25rem",
                          borderRadius: "3px",
                          fontSize: "0.9em",
                        }}
                      >
                        {children}
                      </code>
                    ) : (
                      <code
                        style={{
                          display: "block",
                          backgroundColor: "#333",
                          padding: "0.75rem",
                          borderRadius: "4px",
                          overflowX: "auto",
                          fontSize: "0.9em",
                        }}
                      >
                        {children}
                      </code>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote
                      style={{
                        borderLeft: "3px solid #555",
                        paddingLeft: "1rem",
                        marginLeft: 0,
                        marginBottom: "0.75rem",
                        color: "#ccc",
                      }}
                    >
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ color: "#4a9eff", textDecoration: "underline" }}
                    >
                      {children}
                    </a>
                  ),
                }}
              >
                {currentStream.replaceAll(completionMarker, "").trim()}
              </ReactMarkdown>
              <span style={{ opacity: 0.5 }}>▊</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {showEndSession && (
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            marginBottom: "1rem",
          }}
        >
          <button
            onClick={endSession}
            style={{
              padding: "0.75rem 1.5rem",
              backgroundColor: "#333",
              border: "1px solid #555",
              borderRadius: "6px",
              color: "#fff",
              fontSize: "0.95rem",
            }}
          >
            End Session
          </button>
        </div>
      )}

      {(isAwaitingResponse || isStreaming) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "0.5rem",
            color: "#aaa",
          }}
        >
          <span className="spinner" aria-hidden="true" />
          <span>{isStreaming ? "Assistant is responding…" : "Thinking…"}</span>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem" }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type your message..."
          disabled={isLoading || isStreaming || isLoadingSession}
          style={{
            flex: 1,
            padding: "0.75rem",
            backgroundColor: "#111",
            border: "1px solid #333",
            borderRadius: "4px",
            color: "#fff",
            fontSize: "1rem",
          }}
        />
        <button
          onClick={sendMessage}
          disabled={
            isLoading || isStreaming || isLoadingSession || !input.trim()
          }
          style={{
            padding: "0.75rem 1.5rem",
            backgroundColor: isLoading || isStreaming ? "#222" : "#333",
            border: "1px solid #555",
            borderRadius: "4px",
            color: "#fff",
            cursor: isLoading || isStreaming ? "not-allowed" : "pointer",
          }}
        >
          Send
        </button>
      </div>

      <style jsx>{`
        .spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #333;
          border-top-color: #fff;
          border-radius: 50%;
          display: inline-block;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </main>
  );
}

export default function SimulationPage() {
  return (
    <Suspense
      fallback={
        <main style={{ maxWidth: "900px", margin: "0 auto", padding: "2rem" }}>
          <p>Loading...</p>
        </main>
      }
    >
      <SimulationContent />
    </Suspense>
  );
}
