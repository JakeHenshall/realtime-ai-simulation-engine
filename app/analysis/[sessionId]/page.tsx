'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Analysis {
  id: string;
  sessionId: string;
  summary: string | null;
  insights: string | null;
  createdAt: string;
}

interface Session {
  id: string;
  name: string;
  status: string;
}

export default function AnalysisPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [insights, setInsights] = useState<{
    scores?: { clarity: number; accuracy: number; empathy: number };
    insights?: { strengths: string[]; weaknesses: string[]; recommendations: string[] };
  } | null>(null);

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (!analysis) {
        loadData();
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const loadData = async () => {
    try {
      const sessionRes = await fetch(`/api/sessions/${sessionId}`);
      
      if (sessionRes.ok) {
        const sessionData = await sessionRes.json();
        setSession(sessionData);

        if (sessionData.analysis) {
          setAnalysis(sessionData.analysis);
          if (sessionData.analysis.insights) {
            try {
              const parsed = JSON.parse(sessionData.analysis.insights);
              setInsights(parsed);
            } catch (e) {
              console.error('Failed to parse insights:', e);
            }
          }
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const retryAnalysis = async () => {
    if (isRetrying) return;
    setIsRetrying(true);
    try {
      await fetch(`/api/analysis/${sessionId}/retry`, { method: 'POST' });
    } catch (error) {
      console.error('Error retrying analysis:', error);
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
        <p>Loading analysis...</p>
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
        <Link href="/" style={{ color: '#999', fontSize: '0.9rem' }}>
          ← Back to home
        </Link>
        <h1 style={{ marginTop: '0.5rem', fontSize: '2rem', marginBottom: '0.5rem' }}>
          Session Analysis
        </h1>
        <p style={{ color: '#999' }}>{session.name}</p>
      </div>

      {!analysis ? (
        <div style={{ padding: '2rem', textAlign: 'center', backgroundColor: '#111', borderRadius: '4px' }}>
          <p style={{ color: '#666', marginBottom: '1rem' }}>
            Analysis is being generated. Please wait...
          </p>
          <p style={{ color: '#555', fontSize: '0.9rem' }}>
            This page will automatically refresh when the analysis is ready.
          </p>
          <button
            onClick={retryAnalysis}
            disabled={isRetrying}
            style={{
              marginTop: '1.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#222',
              border: '1px solid #333',
              borderRadius: '4px',
              color: '#ccc',
              cursor: isRetrying ? 'not-allowed' : 'pointer',
            }}
          >
            {isRetrying ? 'Retrying...' : 'Retry analysis'}
          </button>
          <p style={{ marginTop: '0.75rem', color: '#555', fontSize: '0.85rem' }}>
            If this keeps spinning, verify your AI provider API key and retry.
          </p>
        </div>
      ) : (
        <div>
          {analysis.summary && (
            <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Summary</h2>
              <p style={{ lineHeight: '1.6', color: '#ccc' }}>{analysis.summary}</p>
            </div>
          )}

          {insights?.scores && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Scores</h2>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                {(['clarity', 'accuracy', 'empathy'] as const).map((key) => {
                  const score = insights.scores![key];
                  return (
                    <div
                      key={key}
                      style={{
                        padding: '1.5rem',
                        backgroundColor: '#111',
                        borderRadius: '4px',
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
                        {key}
                      </div>
                      <div style={{ fontSize: '2rem', fontWeight: '600' }}>{score}</div>
                      <div style={{ marginTop: '0.5rem', height: '4px', backgroundColor: '#222', borderRadius: '2px', overflow: 'hidden' }}>
                        <div
                          style={{
                            width: `${score}%`,
                            height: '100%',
                            backgroundColor: score >= 70 ? '#4a9' : score >= 40 ? '#fa4' : '#f44',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {insights?.insights && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              {insights.insights.strengths && insights.insights.strengths.length > 0 && (
                <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#4a9' }}>Strengths</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {insights.insights.strengths.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: '0.5rem', color: '#ccc', fontSize: '0.9rem' }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.insights.weaknesses && insights.insights.weaknesses.length > 0 && (
                <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#fa4' }}>Weaknesses</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {insights.insights.weaknesses.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: '0.5rem', color: '#ccc', fontSize: '0.9rem' }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {insights.insights.recommendations && insights.insights.recommendations.length > 0 && (
                <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
                  <h3 style={{ marginBottom: '1rem', fontSize: '1rem', color: '#4af' }}>Recommendations</h3>
                  <ul style={{ listStyle: 'none', padding: 0 }}>
                    {insights.insights.recommendations.map((item, idx) => (
                      <li key={idx} style={{ marginBottom: '0.5rem', color: '#ccc', fontSize: '0.9rem' }}>
                        • {item}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </main>
  );
}
