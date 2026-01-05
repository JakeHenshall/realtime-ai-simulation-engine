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
  const lastMessagesHashRef = useRef<string>("");
  const lastSSEMessageTimeRef = useRef<number>(0);
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
    // Reset hash when session changes to ensure fresh comparison
    lastMessagesHashRef.current = "";
    
    if (sessionId) {
      // Only check for stored opening message if we don't have messages yet
      // and haven't loaded once (to prevent flickering on navigation)
      if (messages.length === 0 && !hasLoadedOnceRef.current) {
        const storedOpening = sessionStorage.getItem(`opening-msg-${sessionId}`);
        if (storedOpening) {
          try {
            const { content, timestamp } = JSON.parse(storedOpening);
            const openingMsg: Message = {
              id: `msg-opening-${Date.now()}`,
              role: "assistant",
              content,
              timestamp,
              metadata: JSON.stringify({ type: "opening-message" }),
            };
            setMessages([openingMsg]);
            setIsLoadingSession(false);
            setIsAwaitingResponse(false);
            isAwaitingResponseRef.current = false;
            // Clear from storage once used
            sessionStorage.removeItem(`opening-msg-${sessionId}`);
            // Update hash to prevent duplicate
            lastMessagesHashRef.current = `assistant:${content.substring(0, 100)}`;
          } catch (e) {
            // Ignore parse errors
          }
        }
      }
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

  // Enable input once we have messages
  useEffect(() => {
    if (messages.length > 0) {
      setIsLoadingSession(false);
    }
  }, [messages.length]);

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

    // First check after 3 seconds
    fallbackTimerRef.current = setTimeout(() => {
      if (!sessionId) return;
      if (isStreamingRef.current || currentStreamRef.current) {
        // If streaming started, check again in 5 more seconds after streaming stops
        fallbackTimerRef.current = setTimeout(() => {
          if (
            !isStreamingRef.current &&
            !currentStreamRef.current &&
            isAwaitingResponseRef.current
          ) {
            // Reload to get message from DB if SSE didn't work
            // But only if we're not in the middle of another message
            loadSession();
            isAwaitingResponseRef.current = false;
          }
        }, 5000);
        return;
      }
      if (!isAwaitingResponseRef.current) return;
      // Fallback: reload session to get any new messages if SSE didn't deliver
      // But only if we're not currently streaming
      if (!isStreamingRef.current && !currentStreamRef.current) {
        loadSession();
        isAwaitingResponseRef.current = false;
      }
    }, 3000);
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
      // Start session and show opening message immediately
      fetch(`/api/sessions/${newSession.id}/start`, { method: "POST" })
        .then(async (startRes) => {
          if (startRes.ok) {
            const startResponse = await startRes.json();
            if (startResponse.openingMessage) {
              // Store in sessionStorage for persistence after navigation
              sessionStorage.setItem(
                `opening-msg-${newSession.id}`,
                JSON.stringify({
                  content: startResponse.openingMessage,
                  timestamp: new Date().toISOString(),
                })
              );
              // Show immediately before navigation
              const openingMsg: Message = {
                id: `msg-opening-${Date.now()}`,
                role: "assistant",
                content: startResponse.openingMessage,
                timestamp: new Date().toISOString(),
                metadata: JSON.stringify({ type: "opening-message" }),
              };
              setMessages([openingMsg]);
              setIsLoadingSession(false);
              setIsAwaitingResponse(false);
              isAwaitingResponseRef.current = false;
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
    
    // Don't reload if we're actively streaming - SSE is the source of truth
    if (isStreamingRef.current || currentStreamRef.current) {
      return;
    }
    
    // Don't reload if we just received a message via SSE (within last 2 seconds)
    // This prevents loadSession from overwriting messages that SSE just added
    const timeSinceLastSSE = Date.now() - lastSSEMessageTimeRef.current;
    if (timeSinceLastSSE < 2000) {
      return;
    }
    
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

      // Check if we already have an opening message in current messages
      const hasOpeningMessage = messages.some((msg) => {
        if (msg.role !== "assistant") return false;
        try {
          const metadata = msg.metadata ? JSON.parse(msg.metadata) : {};
          return metadata.type === "opening-message" || msg.content.includes("Simulated");
        } catch {
          return msg.content.includes("Simulated");
        }
      });
      
      let messagesToSet = loadedMessages;
      
      // If DB has messages, use those (they're the source of truth)
      // If DB has no messages but we have one from useEffect, keep the one from useEffect
      // This prevents duplicates when both useEffect and DB try to add opening messages
      if (loadedMessages.length === 0 && hasOpeningMessage) {
        // Keep the opening message from useEffect, don't overwrite with empty array
        messagesToSet = messages;
      }

      // Create a hash of messages content to prevent unnecessary updates
      const messagesHash = messagesToSet.map(m => `${m.role}:${m.content.substring(0, 100)}`).join('|');
      
      // Only update messages if they've actually changed to prevent flickering
      setMessages((prevMessages) => {
        // CRITICAL: Never overwrite messages if we're currently streaming or just finished streaming
        // This prevents loadSession from overwriting messages that were just added via SSE
        if (isStreamingRef.current || currentStreamRef.current) {
          return prevMessages;
        }
        
        // If we have more messages in state than DB, keep state (SSE just added a message)
        // This prevents loadSession from overwriting messages that were just added via SSE
        if (prevMessages.length > messagesToSet.length) {
          return prevMessages;
        }
        
        // If we have more messages in the new set, always update (new message arrived from DB)
        if (messagesToSet.length > prevMessages.length) {
          lastMessagesHashRef.current = messagesHash;
          return messagesToSet;
        }
        
        // If hash matches and same length, don't update (prevents flickering)
        if (messagesHash === lastMessagesHashRef.current && prevMessages.length === messagesToSet.length) {
          return prevMessages;
        }
        
        // If we have the same number of messages, check if content is the same
        if (prevMessages.length === messagesToSet.length && prevMessages.length > 0) {
          // Compare by content and role (not ID, as IDs might differ)
          const isSame = prevMessages.every((prev, idx) => {
            const next = messagesToSet[idx];
            return (
              prev.role === next.role &&
              prev.content === next.content
            );
          });
          if (isSame) {
            return prevMessages; // No change, return previous to prevent re-render
          }
        }
        
        // If prevMessages is empty but messagesToSet has content, always update
        // If messagesToSet is empty but prevMessages has content, keep prevMessages
        if (messagesToSet.length === 0 && prevMessages.length > 0) {
          return prevMessages; // Don't clear messages if DB returns empty
        }
        
        // Update hash and return new messages
        lastMessagesHashRef.current = messagesHash;
        return messagesToSet;
      });
      
      // Once we have messages, disable loading and enable input
      if (messagesToSet.length > 0) {
        setIsLoadingSession(false);
      }
      
      if (loadedMessages.some((msg: Message) => msg.role === "assistant")) {
        setIsAwaitingResponse(false);
        isAwaitingResponseRef.current = false;
        openingRetryRef.current = 0;
      }

      // Show End Session button if session is marked complete
      setShowEndSession(
        loadedMessages.some((msg: Message) => isMessageMarkedComplete(msg))
      );
      hasLoadedOnceRef.current = true;

      // Only clear stream if we're not currently streaming
      // Don't clear if we just finished streaming (give it a moment to settle)
      if (!isStreamingRef.current && !currentStreamRef.current) {
        // Stream already cleared, nothing to do
      } else if (!isStreamingRef.current && currentStreamRef.current) {
        // Stream should have been cleared by SSE "done" handler, but if not, clear it
        // But wait a bit to avoid race conditions
        setTimeout(() => {
          if (!isStreamingRef.current) {
            setCurrentStream("");
            currentStreamRef.current = "";
          }
        }, 200);
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

    eventSource.onopen = () => {
      console.log("SSE: Connection opened for session", sessionId);
    };

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
          console.log("SSE: Received done event, streamContent length:", currentStreamRef.current.length);
        } else if (data.type === "done") {
          const streamContent = currentStreamRef.current;
          
          // Clear streaming state first
          setIsStreaming(false);
          isStreamingRef.current = false;
          setIsAwaitingResponse(false);
          isAwaitingResponseRef.current = false;
          clearResponseFallback();
          
          if (streamContent && streamContent.trim()) {
            if (streamContent.includes(completionMarker)) {
              setShowEndSession(true);
            }
            const cleanContent = streamContent.replaceAll(completionMarker, "").trim();
            const assistantMessage = {
              id: `msg-sse-${Date.now()}-${Math.random()}`,
              role: "assistant" as const,
              content: cleanContent,
              timestamp: new Date().toISOString(),
            };
            
            // Force update messages - this is the source of truth from SSE
            // Use a functional update to ensure React detects the change
            setMessages((prev) => {
              // Check if this exact message already exists (by content and being the last assistant message)
              // Only prevent duplicate if it's the same as the last assistant message
              const lastAssistantMsg = [...prev].reverse().find(msg => msg.role === "assistant");
              if (lastAssistantMsg && lastAssistantMsg.content === assistantMessage.content) {
                // This exact message already exists as the last assistant message, return prev to avoid duplicate
                console.log("SSE: Message already exists, skipping duplicate");
                return prev;
              }
              
              console.log("SSE: Adding new assistant message", assistantMessage.id, cleanContent.substring(0, 50));
              
              // Create a completely new array to force React to re-render
              // Use spread operator to create new array reference
              const newMessages = [...prev, assistantMessage];
              
              // Update hash to reflect new message immediately
              const newHash = newMessages.map(m => `${m.role}:${m.content.substring(0, 100)}`).join('|');
              lastMessagesHashRef.current = newHash;
              // Track when we last added a message via SSE
              lastSSEMessageTimeRef.current = Date.now();
              
              // Return new array reference to force re-render
              return newMessages;
            });
            
            // Clear stream IMMEDIATELY after adding to messages to prevent showing in both places
            setCurrentStream("");
            currentStreamRef.current = "";
            
            // Scroll to bottom after message is added
            setTimeout(() => {
              messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
            }, 150);
            
            // Don't call loadSession here - SSE is the source of truth
            // Only reload if we need to sync state, but wait a bit to avoid race conditions
          } else {
            // If no stream content, reload from DB as fallback
            setTimeout(() => {
              // Only reload if we're not currently streaming
              if (!isStreamingRef.current && !currentStreamRef.current) {
                loadSession();
              }
            }, 500);
          }
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
      console.error("SSE connection error:", error, "readyState:", eventSource.readyState);
      // Don't close on first error - might be temporary
      // Only close if connection is actually closed
      if (eventSource.readyState === EventSource.CLOSED) {
        console.log("SSE: Connection closed, attempting to reconnect...");
        eventSource.close();
        eventSourceRef.current = null;
        setIsStreaming(false);
        isStreamingRef.current = false;
        setIsAwaitingResponse(false);
        clearResponseFallback();
        
        // Try to reconnect after a short delay
        if (sessionId) {
          setTimeout(() => {
            if (!eventSourceRef.current || eventSourceRef.current.readyState === EventSource.CLOSED) {
              console.log("SSE: Reconnecting...");
              connectSSE();
            }
          }, 1000);
        }
        
        setErrorMessage(
          "Lost connection to the session stream. Reconnecting..."
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
        {(showEndSession || messages.length > 0) && (
          <button
            onClick={endSession}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "#333",
              border: "1px solid #555",
              borderRadius: "4px",
              color: "#fff",
              fontSize: "0.9rem",
              cursor: "pointer",
            }}
          >
            End Session
          </button>
        )}
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
        {messages.map((msg, idx) => (
          <div
            key={`${msg.id}-${idx}-${msg.timestamp}`}
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

        {/* Show streaming content only if we're actively streaming and haven't added it to messages yet */}
        {isStreaming && currentStream && (
          <div
            key={`streaming-${currentStream.length}`}
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

      {(isAwaitingResponse || isStreaming) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginBottom: "1rem",
            padding: "0.75rem",
            color: "#aaa",
            fontSize: "0.9rem",
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
