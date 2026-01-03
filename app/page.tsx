import Link from 'next/link';
import { headers } from 'next/headers';

interface ScenarioPreset {
  id: string;
  name: string;
  description: string | null;
  pressure: string;
}

async function getPresets(): Promise<ScenarioPreset[]> {
  try {
    const headersList = await headers();
    const host = headersList.get('host');
    const protocol = headersList.get('x-forwarded-proto') ?? 'http';
    const baseUrl = host
      ? `${protocol}://${host}`
      : process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
    const res = await fetch(`${baseUrl}/api/presets`, { 
      cache: 'no-store',
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    if (!res.ok) {
      console.error(`Failed to fetch presets: ${res.status} ${res.statusText}`);
      const errorText = await res.text().catch(() => 'Unknown error');
      console.error('Error response:', errorText);
      return [];
    }
    return res.json();
  } catch (error) {
    console.error('Error fetching presets:', error);
    return [];
  }
}

export default async function Home() {
  const presets = await getPresets();

  return (
    <main style={{ maxWidth: '800px', margin: '0 auto', padding: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: '600' }}>
          Real-time AI Simulation Engine
        </h1>
        <Link
          href="/dashboard"
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: '#111',
            border: '1px solid #333',
            borderRadius: '4px',
            color: '#fff',
            fontSize: '0.9rem',
            textDecoration: 'none',
          }}
        >
          Dashboard
        </Link>
      </div>

      <p style={{ marginBottom: '2rem', color: '#999' }}>
        Select a scenario to begin a simulation session.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {presets.length === 0 ? (
          <p style={{ color: '#666' }}>No scenario presets available.</p>
        ) : (
          presets.map((preset) => (
            <Link
              key={preset.id}
              href={`/simulation?presetId=${preset.id}`}
              style={{
                display: 'block',
                padding: '1.5rem',
                border: '1px solid #333',
                borderRadius: '4px',
                textDecoration: 'none',
                color: 'inherit',
                transition: 'border-color 0.2s',
              }}
            >
              <h2 style={{ marginBottom: '0.5rem', fontSize: '1.25rem' }}>
                {preset.name}
              </h2>
              {preset.description && (
                <p style={{ marginBottom: '0.5rem', color: '#999', fontSize: '0.9rem' }}>
                  {preset.description}
                </p>
              )}
              <span
                style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  backgroundColor: '#222',
                  borderRadius: '2px',
                  color: '#aaa',
                }}
              >
                {preset.pressure} pressure
              </span>
            </Link>
          ))
        )}
      </div>
    </main>
  );
}
