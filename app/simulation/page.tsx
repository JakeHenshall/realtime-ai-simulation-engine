'use client';

import { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Message {
  id: string;
  role: string;
  content: string;
  timestamp: string;
}

interface Session {
  id: string;
  name: string;
  status: string;
}

function SimulationContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const presetId = searchParams.get('presetId');
  const sessionId = searchParams.get('sessionId');

  const [session, setSession] = useState<Session | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [currentStream, setCurrentStream] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (sessionId) {
      loadSession();
      connectSSE();
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, currentStream]);

  const createSession = async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Simulation ${new Date().toLocaleString()}`,
          presetId: presetId || undefined,
        }),
      });

      if (!res.ok) throw new Error('Failed to create session');

      const newSession = await res.json();
      setSession(newSession);

      await fetch(`/api/sessions/${newSession.id}/start`, { method: 'POST' });

      router.replace(`/simulation?sessionId=${newSession.id}`);
    } catch (error) {
      console.error('Error creating session:', error);
    }
  };

  const loadSession = async () => {
    if (!sessionId) return;

    try {
      const res = await fetch(`/api/sessions/${sessionId}`);
      if (!res.ok) throw new Error('Failed to load session');

      const sessionData = await res.json();
      setSession(sessionData);
      setMessages(sessionData.messages || []);

      if (sessionData.status === 'ACTIVE') {
        connectSSE();
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  };

  const connectSSE = () => {
    if (!sessionId || eventSourceRef.current) return;

    const eventSource = new EventSource(`/api/stream/sse/${sessionId}`);
    eventSourceRef.current = eventSource;

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.type === 'token') {
        setIsStreaming(true);
        setCurrentStream((prev) => prev + data.data);
      } else if (data.type === 'done') {
        setIsStreaming(false);
        if (currentStream) {
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-${Date.now()}`,
              role: 'assistant',
              content: currentStream,
              timestamp: new Date().toISOString(),
            },
          ]);
          setCurrentStream('');
        }
        loadSession();
      } else if (data.type === 'error') {
        setIsStreaming(false);
        setCurrentStream('');
        console.error('SSE error:', data.data);
      }
    };

    eventSource.onerror = () => {
      eventSource.close();
      eventSourceRef.current = null;
    };
  };

  const sendMessage = async () => {
    if (!input.trim() || !sessionId || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setIsLoading(true);

    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString(),
      },
    ]);

    try {
      const res = await fetch('/api/stream/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          message: userMessage,
        }),
      });

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
            role: 'system',
            content: `Error: ${message}`,
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
    } catch (error) {
      console.error('Error sending message:', error);
      // Show error to user
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: 'system',
          content: `Error: ${error instanceof Error ? error.message : 'Failed to send message'}`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const endSession = async () => {
    if (!sessionId) return;

    try {
      await fetch(`/api/sessions/${sessionId}/end`, { method: 'POST' });
      router.push(`/analysis/${sessionId}`);
    } catch (error) {
      console.error('Error ending session:', error);
    }
  };

  if (!session) {
    return (
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem', height: '100vh', display: 'flex', flexDirection: 'column' }}>
      <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <Link href="/" style={{ color: '#999', fontSize: '0.9rem' }}>
            ← Back
          </Link>
          <h1 style={{ marginTop: '0.5rem', fontSize: '1.5rem' }}>{session.name}</h1>
        </div>
        <button
          onClick={endSession}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#333',
            border: '1px solid #555',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '0.9rem',
          }}
        >
          End Session
        </button>
      </div>

      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '1rem',
          backgroundColor: '#111',
          borderRadius: '4px',
          marginBottom: '1rem',
        }}
      >
        {messages.length === 0 && !currentStream && (
          <p style={{ color: '#666', textAlign: 'center', marginTop: '2rem' }}>
            Start the conversation by sending a message.
          </p>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: msg.role === 'user' ? '#222' : '#1a1a1a',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
              {msg.role === 'user' ? 'You' : 'Assistant'}
            </div>
            {msg.role === 'assistant' ? (
              <div
                style={{
                  color: '#fff',
                  lineHeight: '1.6',
                }}
              >
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ children }) => <p style={{ marginBottom: '0.75rem', marginTop: 0 }}>{children}</p>,
                    strong: ({ children }) => <strong style={{ fontWeight: 600, color: '#fff' }}>{children}</strong>,
                    em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                    ul: ({ children }) => <ul style={{ marginBottom: '0.75rem', paddingLeft: '1.5rem' }}>{children}</ul>,
                    ol: ({ children }) => <ol style={{ marginBottom: '0.75rem', paddingLeft: '1.5rem' }}>{children}</ol>,
                    li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                    code: ({ children, className }) => {
                      const isInline = !className;
                      return isInline ? (
                        <code style={{ backgroundColor: '#333', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '0.9em' }}>{children}</code>
                      ) : (
                        <code style={{ display: 'block', backgroundColor: '#333', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', fontSize: '0.9em' }}>{children}</code>
                      );
                    },
                    blockquote: ({ children }) => (
                      <blockquote style={{ borderLeft: '3px solid #555', paddingLeft: '1rem', marginLeft: 0, marginBottom: '0.75rem', color: '#ccc' }}>
                        {children}
                      </blockquote>
                    ),
                    a: ({ href, children }) => (
                      <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff', textDecoration: 'underline' }}>
                        {children}
                      </a>
                    ),
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              </div>
            ) : (
              <div style={{ whiteSpace: 'pre-wrap', color: '#fff' }}>{msg.content}</div>
            )}
          </div>
        ))}

        {isStreaming && currentStream && (
          <div
            style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#1a1a1a',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '0.75rem', color: '#666', marginBottom: '0.25rem' }}>
              Assistant
            </div>
            <div
              style={{
                color: '#fff',
                lineHeight: '1.6',
              }}
            >
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p: ({ children }) => <p style={{ marginBottom: '0.75rem', marginTop: 0 }}>{children}</p>,
                  strong: ({ children }) => <strong style={{ fontWeight: 600, color: '#fff' }}>{children}</strong>,
                  em: ({ children }) => <em style={{ fontStyle: 'italic' }}>{children}</em>,
                  ul: ({ children }) => <ul style={{ marginBottom: '0.75rem', paddingLeft: '1.5rem' }}>{children}</ul>,
                  ol: ({ children }) => <ol style={{ marginBottom: '0.75rem', paddingLeft: '1.5rem' }}>{children}</ol>,
                  li: ({ children }) => <li style={{ marginBottom: '0.25rem' }}>{children}</li>,
                  code: ({ children, className }) => {
                    const isInline = !className;
                    return isInline ? (
                      <code style={{ backgroundColor: '#333', padding: '0.125rem 0.25rem', borderRadius: '3px', fontSize: '0.9em' }}>{children}</code>
                    ) : (
                      <code style={{ display: 'block', backgroundColor: '#333', padding: '0.75rem', borderRadius: '4px', overflowX: 'auto', fontSize: '0.9em' }}>{children}</code>
                    );
                  },
                  blockquote: ({ children }) => (
                    <blockquote style={{ borderLeft: '3px solid #555', paddingLeft: '1rem', marginLeft: 0, marginBottom: '0.75rem', color: '#ccc' }}>
                      {children}
                    </blockquote>
                  ),
                  a: ({ href, children }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: '#4a9eff', textDecoration: 'underline' }}>
                      {children}
                    </a>
                  ),
                }}
              >
                {currentStream}
              </ReactMarkdown>
              <span style={{ opacity: 0.5 }}>▊</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              sendMessage();
            }
          }}
          placeholder="Type your message..."
          disabled={isLoading || isStreaming}
          style={{
            flex: 1,
            padding: '0.75rem',
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '1rem',
          }}
        />
        <button
          onClick={sendMessage}
          disabled={isLoading || isStreaming || !input.trim()}
          style={{
            padding: '0.75rem 1.5rem',
            backgroundColor: isLoading || isStreaming ? '#222' : '#333',
            border: '1px solid #555',
            borderRadius: '4px',
            color: '#fff',
            cursor: isLoading || isStreaming ? 'not-allowed' : 'pointer',
          }}
        >
          Send
        </button>
      </div>
    </main>
  );
}

export default function SimulationPage() {
  return (
    <Suspense fallback={
      <main style={{ maxWidth: '900px', margin: '0 auto', padding: '2rem' }}>
        <p>Loading...</p>
      </main>
    }>
      <SimulationContent />
    </Suspense>
  );
}
