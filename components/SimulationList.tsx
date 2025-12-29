'use client';

import { useState, useEffect } from 'react';

interface Simulation {
  id: string;
  name: string;
  description: string | null;
  status: string;
  createdAt: string;
  agents: Array<{ id: string }>;
  analytics: {
    totalEvents: number;
    totalActions: number;
    avgLatency: number | null;
    errorRate: number;
  } | null;
}

export default function SimulationList({
  selectedId,
  onSelect,
}: {
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    fetchSimulations();
    const interval = setInterval(fetchSimulations, 5000);
    return () => clearInterval(interval);
  }, []);

  async function fetchSimulations() {
    try {
      const res = await fetch('/api/simulations');
      if (res.ok) {
        const data = await res.json();
        setSimulations(data);
      }
    } catch (error) {
      console.error('Failed to fetch simulations:', error);
    } finally {
      setLoading(false);
    }
  }

  async function createSimulation() {
    if (!newName.trim()) return;

    setCreating(true);
    try {
      const res = await fetch('/api/simulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });

      if (res.ok) {
        const simulation = await res.json();
        setNewName('');
        onSelect(simulation.id);
        fetchSimulations();
      }
    } catch (error) {
      console.error('Failed to create simulation:', error);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ padding: '1rem', background: '#1a1a1a', borderRadius: '8px' }}>
        <input
          type="text"
          placeholder="Simulation name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && createSimulation()}
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
          onClick={createSimulation}
          disabled={creating || !newName.trim()}
          style={{
            width: '100%',
            padding: '0.5rem',
            background: creating ? '#333' : '#0066ff',
            border: 'none',
            borderRadius: '4px',
            color: '#fff',
            cursor: creating ? 'not-allowed' : 'pointer',
          }}
        >
          {creating ? 'Creating...' : 'Create Simulation'}
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {loading ? (
          <div style={{ padding: '1rem', color: '#888' }}>Loading...</div>
        ) : simulations.length === 0 ? (
          <div style={{ padding: '1rem', color: '#888' }}>No simulations yet</div>
        ) : (
          simulations.map((sim) => (
            <button
              key={sim.id}
              onClick={() => onSelect(sim.id)}
              style={{
                padding: '1rem',
                background: selectedId === sim.id ? '#1a3a5a' : '#1a1a1a',
                border: '1px solid',
                borderColor: selectedId === sim.id ? '#0066ff' : '#333',
                borderRadius: '6px',
                textAlign: 'left',
                cursor: 'pointer',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>{sim.name}</div>
              <div style={{ fontSize: '0.85rem', color: '#888' }}>
                {sim.agents.length} agents • {sim.analytics?.totalEvents || 0} events
              </div>
              <div style={{ fontSize: '0.75rem', color: '#666', marginTop: '0.25rem' }}>
                {sim.status}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

