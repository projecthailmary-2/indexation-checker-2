import { useState } from 'react';
import Head from 'next/head';

// Colors read from the CSS variables in styles/globals.css (light + dark).
const ACCENT = 'var(--accent)';
const BORDER = 'var(--border)';
const BG_PAGE = 'var(--bg-page)';
const TEXT = 'var(--text)';
const MUTED = 'var(--muted)';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = '/';
      } else {
        setError('Incorrect passcode. Try again.');
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Head>
        <title>Semify Indexation Checker — Login</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>
      <div style={{ minHeight: '100vh', background: BG_PAGE, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ background: 'var(--bg-card)', border: `1px solid ${BORDER}`, borderRadius: 12, padding: '40px 36px', width: '100%', maxWidth: 360, boxShadow: '0 2px 16px rgba(0,0,0,0.07)' }}>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <div style={{ width: 4, height: 32, background: ACCENT, borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 17, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Semify Indexation Checker</div>
              <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>Enter your team passcode to continue</div>
            </div>
          </div>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Passcode"
              autoFocus
              style={{
                width: '100%', padding: '11px 14px', fontSize: 14,
                border: `1.5px solid ${error ? 'var(--err-border)' : BORDER}`, borderRadius: 6,
                outline: 'none', color: TEXT, background: 'var(--input-bg)',
                boxSizing: 'border-box', marginBottom: error ? 8 : 16,
              }}
            />
            {error && (
              <div style={{ fontSize: 12, color: 'var(--err-strong)', marginBottom: 14 }}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading || !password}
              style={{
                width: '100%', padding: '11px 18px', fontSize: 14, fontWeight: 600,
                background: loading || !password ? 'var(--accent-disabled)' : ACCENT,
                color: '#fff', border: 'none', borderRadius: 6,
                cursor: loading || !password ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? 'Checking…' : 'Enter'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
