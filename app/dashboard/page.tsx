'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Session {
  id: string;
  name: string;
  preset: string | null;
  duration: number | null;
  scores: {
    clarity: number;
    accuracy: number;
    empathy: number;
  } | null;
  completedAt: string | null;
}

interface Stats {
  totalCount: number;
  avgDuration: number;
  avgClarity: number;
  avgAccuracy: number;
  avgEmpathy: number;
}

interface AnalyticsData {
  sessions: Session[];
  stats: Stats;
}

function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatDate(dateString: string | null): string {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function DashboardPage() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const res = await fetch('/api/analytics');
      if (res.ok) {
        const analyticsData = await res.json();
        setData(analyticsData);
      }
    } catch (error) {
      console.error('Error loading analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <p>Loading...</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <p>Failed to load analytics data.</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ marginBottom: '2rem' }}>
        <Link href="/" style={{ color: '#999', fontSize: '0.9rem' }}>
          ← Back to home
        </Link>
        <h1 style={{ marginTop: '0.5rem', fontSize: '2rem', marginBottom: '1rem' }}>
          Analytics Dashboard
        </h1>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '1rem',
          marginBottom: '2rem',
        }}
      >
        <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '0.5rem' }}>
            Total Sessions
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {data.stats.totalCount}
          </div>
        </div>

        <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '0.5rem' }}>
            Avg Duration
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {formatDuration(data.stats.avgDuration)}
          </div>
        </div>

        <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '0.5rem' }}>
            Avg Clarity
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {data.stats.avgClarity}
          </div>
        </div>

        <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '0.5rem' }}>
            Avg Accuracy
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {data.stats.avgAccuracy}
          </div>
        </div>

        <div style={{ padding: '1.5rem', backgroundColor: '#111', borderRadius: '4px' }}>
          <div style={{ fontSize: '0.9rem', color: '#999', marginBottom: '0.5rem' }}>
            Avg Empathy
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '600' }}>
            {data.stats.avgEmpathy}
          </div>
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: '1rem', fontSize: '1.5rem' }}>Recent Sessions</h2>

        {data.sessions.length === 0 ? (
          <p style={{ color: '#666', padding: '2rem', textAlign: 'center', backgroundColor: '#111', borderRadius: '4px' }}>
            No completed sessions yet.
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: '0.5rem',
            }}
          >
            {/* Header row */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                gap: '1rem',
                padding: '0.75rem 1rem',
                color: '#888',
                fontSize: '0.8rem',
                fontWeight: '500',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                borderBottom: '1px solid #333',
              }}
            >
              <div>Session</div>
              <div>Duration</div>
              <div>Clarity</div>
              <div>Accuracy</div>
              <div>Empathy</div>
              <div>Completed</div>
            </div>
            {data.sessions.map((session) => (
              <Link
                key={session.id}
                href={`/analysis/${session.id}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 1fr',
                  gap: '1rem',
                  padding: '1rem',
                  backgroundColor: '#111',
                  border: '1px solid #333',
                  borderRadius: '4px',
                  textDecoration: 'none',
                  color: 'inherit',
                  alignItems: 'center',
                  transition: 'border-color 0.2s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#555';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#333';
                }}
              >
                <div>
                  <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                    {session.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#666' }}>
                    {session.preset || 'No preset'}
                  </div>
                </div>

                <div style={{ fontSize: '0.9rem', color: '#999' }}>
                  {session.duration !== null ? formatDuration(session.duration) : 'N/A'}
                </div>

                <div style={{ fontSize: '0.9rem' }}>
                  {session.scores ? (
                    <span style={{ color: session.scores.clarity >= 70 ? '#4a9' : session.scores.clarity >= 40 ? '#fa4' : '#f44' }}>
                      {session.scores.clarity}
                    </span>
                  ) : (
                    <span style={{ color: '#666' }}>—</span>
                  )}
                </div>

                <div style={{ fontSize: '0.9rem' }}>
                  {session.scores ? (
                    <span style={{ color: session.scores.accuracy >= 70 ? '#4a9' : session.scores.accuracy >= 40 ? '#fa4' : '#f44' }}>
                      {session.scores.accuracy}
                    </span>
                  ) : (
                    <span style={{ color: '#666' }}>—</span>
                  )}
                </div>

                <div style={{ fontSize: '0.9rem' }}>
                  {session.scores ? (
                    <span style={{ color: session.scores.empathy >= 70 ? '#4a9' : session.scores.empathy >= 40 ? '#fa4' : '#f44' }}>
                      {session.scores.empathy}
                    </span>
                  ) : (
                    <span style={{ color: '#666' }}>—</span>
                  )}
                </div>

                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  {formatDate(session.completedAt)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

