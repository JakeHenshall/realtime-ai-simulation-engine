'use client';

import { useState, useEffect, useRef } from 'react';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: string;
  lastActionAt: string | null;
}

interface Event {
  id: string;
  type: string;
  data: string;
  timestamp: string;
  agent: {
    id: string;
    name: string;
    role: string;
  } | null;
}

interface Simulation {
  id: string;
  name: string;
  status: string;
  agents: Agent[];
  events: Event[];
  analytics: {
    totalEvents: number;
    totalActions: number;
    avgLatency: number | null;
    errorRate: number;
  } | null;
}

export default function SimulationView({
  simulationId,
  onClose,
}: {
  simulationId: string;
  onClose: () => void;
}) {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingAgent, setCreatingAgent] = useState(false);
  const [agentName, setAgentName] = useState('');
  const [agentRole, setAgentRole] = useState('');
  const eventsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchSimulation();
    const interval = setInterval(fetchSimulation, 2000);
    return () => clearInterval(interval);
  }, [simulationId]);

  useEffect(() => {
    // Set up SSE connection for real-time updates
    const eventSource = new EventSource(`/api/realtime?simulationId=${simulationId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'AGENT_ACTION') {
          fetchSimulation();
        }
      } catch (error) {
        console.error('Failed to parse SSE message:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
    };

    return () => {
      eventSource.close();
    };
  }, [simulationId]);

  useEffect(() => {
    eventsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simulation?.events]);

  async function fetchSimulation() {
    try {
      const res = await fetch(`/api/simulations/${simulationId}`);
      if (res.ok) {
        const data = await res.json();
        setSimulation(data);
      }
    } catch (error) {
      console.error('Failed to fetch simulation:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createAgent() {
    if (!agentName.trim() || !agentRole.trim()) return;

    setCreatingAgent(true);
    try {
      const res = await fetch('/api/agents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          simulationId,
          name: agentName,
          role: agentRole,
        }),
      });

      if (res.ok) {
        setAgentName('');
        setAgentRole('');
        fetchSimulation();
      }
    } catch (error) {
      console.error('Failed to create agent:', error);
    } finally {
      setCreatingAgent(false);
    }
  }

  async function triggerAction(agentId: string, actionType: string) {
    try {
      const res = await fetch(`/api/agents/${agentId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          actionType,
          context: {},
        }),
      });

      if (res.ok) {
        fetchSimulation();
      }
    } catch (error) {
      console.error('Failed to trigger action:', error);
    }
  }

  if (loading) {
    return <div style={{ padding: '2rem', color: '#888' }}>Loading...</div>;
  }

  if (!simulation) {
    return <div style={{ padding: '2rem', color: '#888' }}>Simulation not found</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.25rem' }}>
            {simulation.name}
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#888' }}>
            Status: {simulation.status} • {simulation.agents.length} agents
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            padding: '0.5rem 1rem',
            background: '#333',
            border: 'none',
            borderRadius: '4px',
            color: '#e0e0e0',
            cursor: 'pointer',
          }}
        >
          Close
        </button>
      </div>

      {simulation.analytics && (
        <div
          style={{
            padding: '1rem',
            background: '#1a1a1a',
            borderRadius: '8px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: '1rem',
          }}
        >
          <div>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
              Total Events
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {simulation.analytics.totalEvents}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
              Total Actions
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {simulation.analytics.totalActions}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
              Avg Latency
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {simulation.analytics.avgLatency
                ? `${Math.round(simulation.analytics.avgLatency)}ms`
                : 'N/A'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
              Error Rate
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>
              {(simulation.analytics.errorRate * 100).toFixed(1)}%
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Agents</h3>

          <div style={{ marginBottom: '1rem', padding: '1rem', background: '#1a1a1a', borderRadius: '8px' }}>
            <input
              type="text"
              placeholder="Agent name"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#e0e0e0',
                marginBottom: '0.5rem',
              }}
            />
            <input
              type="text"
              placeholder="Agent role"
              value={agentRole}
              onChange={(e) => setAgentRole(e.target.value)}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: '#0a0a0a',
                border: '1px solid #333',
                borderRadius: '4px',
                color: '#e0e0e0',
                marginBottom: '0.5rem',
              }}
            />
            <button
              onClick={createAgent}
              disabled={creatingAgent || !agentName.trim() || !agentRole.trim()}
              style={{
                width: '100%',
                padding: '0.5rem',
                background: creatingAgent ? '#333' : '#0066ff',
                border: 'none',
                borderRadius: '4px',
                color: '#fff',
                cursor: creatingAgent ? 'not-allowed' : 'pointer',
              }}
            >
              {creatingAgent ? 'Creating...' : 'Add Agent'}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {simulation.agents.map((agent) => (
              <div
                key={agent.id}
                style={{
                  padding: '1rem',
                  background: '#1a1a1a',
                  borderRadius: '6px',
                  border: '1px solid #333',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{agent.name}</div>
                    <div style={{ fontSize: '0.85rem', color: '#888' }}>{agent.role}</div>
                  </div>
                  <div
                    style={{
                      padding: '0.25rem 0.5rem',
                      background: agent.status === 'IDLE' ? '#1a3a1a' : '#3a3a1a',
                      borderRadius: '4px',
                      fontSize: '0.75rem',
                    }}
                  >
                    {agent.status}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                  {['THINK', 'COMMUNICATE', 'OBSERVE', 'DECIDE'].map((actionType) => (
                    <button
                      key={actionType}
                      onClick={() => triggerAction(agent.id, actionType)}
                      disabled={agent.status !== 'IDLE'}
                      style={{
                        padding: '0.25rem 0.5rem',
                        background: agent.status !== 'IDLE' ? '#333' : '#2a2a2a',
                        border: '1px solid #444',
                        borderRadius: '4px',
                        color: '#e0e0e0',
                        fontSize: '0.75rem',
                        cursor: agent.status !== 'IDLE' ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {actionType}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Events</h3>
          <div
            style={{
              height: '600px',
              overflowY: 'auto',
              padding: '1rem',
              background: '#1a1a1a',
              borderRadius: '8px',
              border: '1px solid #333',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            {simulation.events.map((event) => {
              let data;
              try {
                data = JSON.parse(event.data);
              } catch {
                data = { message: event.data };
              }

              return (
                <div
                  key={event.id}
                  style={{
                    padding: '0.75rem',
                    background: '#0a0a0a',
                    borderRadius: '4px',
                    border: '1px solid #222',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#888' }}>
                      {event.type}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#666' }}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                  {event.agent && (
                    <div style={{ fontSize: '0.85rem', color: '#888', marginBottom: '0.25rem' }}>
                      {event.agent.name} ({event.agent.role})
                    </div>
                  )}
                  <div style={{ fontSize: '0.9rem', color: '#ccc' }}>
                    {data.response || data.message || JSON.stringify(data)}
                  </div>
                </div>
              );
            })}
            <div ref={eventsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}

