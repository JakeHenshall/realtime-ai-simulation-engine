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
  pagination: {
    page: number;
    limit: number;
    totalCount: number;
    totalPages: number;
  };
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
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    loadData(currentPage);
  }, [currentPage]);

  const loadData = async (page: number) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/analytics?page=${page}&limit=10`);
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
          <>
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

            {/* Pagination controls */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '1.5rem',
                padding: '1rem',
                backgroundColor: '#111',
                borderRadius: '4px',
              }}
            >
              <div style={{ fontSize: '0.9rem', color: '#888' }}>
                Showing {(data.pagination.page - 1) * data.pagination.limit + 1} to{' '}
                {Math.min(data.pagination.page * data.pagination.limit, data.pagination.totalCount)} of{' '}
                {data.pagination.totalCount} sessions
              </div>
              {data.pagination.totalPages > 1 && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    onClick={() => setCurrentPage(currentPage - 1)}
                    disabled={currentPage === 1 || loading}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: currentPage === 1 || loading ? '#222' : '#333',
                      color: currentPage === 1 || loading ? '#555' : '#fff',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      cursor: currentPage === 1 || loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (currentPage !== 1 && !loading) {
                        e.currentTarget.style.backgroundColor = '#444';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== 1 && !loading) {
                        e.currentTarget.style.backgroundColor = '#333';
                      }
                    }}
                  >
                    Previous
                  </button>

                  <div style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                    {Array.from({ length: data.pagination.totalPages }, (_, i) => i + 1)
                      .filter((page) => {
                        const distance = Math.abs(page - currentPage);
                        return (
                          page === 1 ||
                          page === data.pagination.totalPages ||
                          distance <= 2
                        );
                      })
                      .map((page, index, array) => {
                        const prevPage = index > 0 ? array[index - 1] : null;
                        const showEllipsis = prevPage && page - prevPage > 1;
                        
                        return (
                          <div key={page} style={{ display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                            {showEllipsis && (
                              <span style={{ padding: '0 0.5rem', color: '#666' }}>...</span>
                            )}
                            <button
                              onClick={() => setCurrentPage(page)}
                              disabled={loading}
                              style={{
                                padding: '0.5rem 0.75rem',
                                backgroundColor: page === currentPage ? '#555' : '#333',
                                color: page === currentPage ? '#fff' : '#aaa',
                                border: '1px solid #444',
                                borderRadius: '4px',
                                cursor: loading ? 'not-allowed' : 'pointer',
                                fontSize: '0.9rem',
                                fontWeight: page === currentPage ? '600' : '400',
                                minWidth: '2.5rem',
                                transition: 'background-color 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                if (page !== currentPage && !loading) {
                                  e.currentTarget.style.backgroundColor = '#444';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (page !== currentPage && !loading) {
                                  e.currentTarget.style.backgroundColor = '#333';
                                }
                              }}
                            >
                              {page}
                            </button>
                          </div>
                        );
                      })}
                  </div>

                  <button
                    onClick={() => setCurrentPage(currentPage + 1)}
                    disabled={currentPage === data.pagination.totalPages || loading}
                    style={{
                      padding: '0.5rem 1rem',
                      backgroundColor: currentPage === data.pagination.totalPages || loading ? '#222' : '#333',
                      color: currentPage === data.pagination.totalPages || loading ? '#555' : '#fff',
                      border: '1px solid #444',
                      borderRadius: '4px',
                      cursor: currentPage === data.pagination.totalPages || loading ? 'not-allowed' : 'pointer',
                      fontSize: '0.9rem',
                      transition: 'background-color 0.2s',
                    }}
                    onMouseEnter={(e) => {
                      if (currentPage !== data.pagination.totalPages && !loading) {
                        e.currentTarget.style.backgroundColor = '#444';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (currentPage !== data.pagination.totalPages && !loading) {
                        e.currentTarget.style.backgroundColor = '#333';
                      }
                    }}
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

