'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { Radar } from 'react-chartjs-2';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

interface Analysis {
  id: string;
  sessionId: string;
  summary: string | null;
  insights: string | null;
  createdAt: string;
}

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

          {session.messages && session.messages.length > 0 && (
            <div style={{ marginBottom: '2rem', padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h2 style={{ fontSize: '1.25rem', margin: 0 }}>Conversation</h2>
                <Link
                  href={`/analysis/${sessionId}/conversation`}
                  style={{
                    padding: '0.5rem 1rem',
                    backgroundColor: '#222',
                    border: '1px solid #333',
                    borderRadius: '4px',
                    color: '#fff',
                    textDecoration: 'none',
                    fontSize: '0.9rem',
                    display: 'inline-block',
                  }}
                >
                  View Conversation
                </Link>
              </div>
            </div>
          )}

          {insights?.scores && (
            <div style={{ marginBottom: '2rem' }}>
              <h2 style={{ marginBottom: '1rem', fontSize: '1.25rem' }}>Scores</h2>
              <div style={{ padding: '2rem', backgroundColor: '#0a1629', borderRadius: '4px', display: 'flex', justifyContent: 'center' }}>
                <div style={{ maxWidth: '500px', width: '100%' }}>
                  <Radar
                    data={{
                      labels: ['Clarity', 'Accuracy', 'Empathy'],
                      datasets: [
                        {
                          label: 'Performance Scores',
                          data: [
                            insights.scores.clarity,
                            insights.scores.accuracy,
                            insights.scores.empathy,
                          ],
                          backgroundColor: 'rgba(138, 43, 226, 0.3)',
                          borderColor: 'rgba(138, 43, 226, 1)',
                          borderWidth: 3,
                          pointBackgroundColor: '#fff',
                          pointBorderColor: 'rgba(138, 43, 226, 1)',
                          pointBorderWidth: 2,
                          pointRadius: 5,
                          pointHoverBackgroundColor: '#fff',
                          pointHoverBorderColor: 'rgba(138, 43, 226, 1)',
                          pointHoverRadius: 7,
                        },
                      ],
                    }}
                    options={{
                      responsive: true,
                      maintainAspectRatio: true,
                      scales: {
                        r: {
                          beginAtZero: true,
                          max: 120,
                          min: 0,
                          ticks: {
                            display: false,
                          },
                          grid: {
                            color: 'rgba(255, 255, 255, 0.2)',
                            lineWidth: 1,
                            circular: true,
                          },
                          angleLines: {
                            color: 'rgba(255, 255, 255, 0.2)',
                            lineWidth: 1,
                          },
                          pointLabels: {
                            color: '#fff',
                            font: {
                              size: 14,
                              weight: '600' as const,
                            },
                            padding: 20,
                          },
                        },
                      },
                      plugins: {
                        legend: {
                          display: false,
                        },
                        tooltip: {
                          backgroundColor: 'rgba(0, 0, 0, 0.9)',
                          titleColor: '#fff',
                          bodyColor: '#fff',
                          borderColor: 'rgba(138, 43, 226, 1)',
                          borderWidth: 2,
                          padding: 12,
                          titleFont: {
                            size: 14,
                            weight: '600' as const,
                          },
                          bodyFont: {
                            size: 13,
                          },
                          callbacks: {
                            label: (context) => {
                              return `${context.label}: ${context.parsed.r}%`;
                            },
                          },
                        },
                      },
                    }}
                  />
                </div>
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
