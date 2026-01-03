'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
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
  messages?: Message[];
}

export default function ConversationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, [sessionId]);

  const loadData = async () => {
    try {
      const sessionRes = await fetch(`/api/sessions/${sessionId}`);
      
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setSession(sessionData);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <p>Loading conversation...</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <p>Session not found.</p>
        <Link href="/" style={{ color: '#999', marginTop: '1rem', display: 'inline-block' }}>
          ← Back to home
        </Link>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href={`/analysis/${sessionId}`} style={{ color: '#999', fontSize: '0.9rem' }}>
          ← Back to analysis
        </Link>
        <h1 style={{ marginTop: '0.5rem', fontSize: '2rem', marginBottom: '0.5rem' }}>
          Conversation
        </h1>
        <p style={{ color: '#999' }}>{session.name}</p>
      </div>

      {session.messages && session.messages.length > 0 ? (
        <div
          style={{
            padding: '1.5rem',
            backgroundColor: '#111',
            borderRadius: '4px',
          }}
        >
          <div
            style={{
              maxHeight: '70vh',
              overflowY: 'auto',
              padding: '1rem',
              backgroundColor: '#0a0a0a',
              borderRadius: '4px',
            }}
          >
            {session.messages.map((msg) => (
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
                  {msg.role === 'user' ? 'You' : 'Assistant'} • {new Date(msg.timestamp).toLocaleString()}
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
          </div>
        </div>
      ) : (
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#111', borderRadius: '4px' }}>
          <p style={{ color: '#666' }}>No messages found in this session.</p>
        </div>
      )}
    </main>
  );
}

