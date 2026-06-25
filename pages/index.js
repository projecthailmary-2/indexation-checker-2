import { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';

// Colors live as CSS variables (see styles/globals.css) so the whole app can
// switch between the light and dark palettes from one place.
const ACCENT = 'var(--accent)';
const ACCENT_HOVER = 'var(--accent-hover)';
const ACCENT_LIGHT = 'var(--accent-light)';
const BORDER = 'var(--border)';
const BG_PAGE = 'var(--bg-page)';
const BG_CARD = 'var(--bg-card)';
const BG_HEADER = 'var(--bg-header)';
const TEXT = 'var(--text)';
const MUTED = 'var(--muted)';

const STEPS = [
  { id: 1, label: 'Published Post Counts' },
  { id: 2, label: 'Site Search Count' },
  { id: 3, label: 'Post Indexation Rate' },
  { id: 4, label: '6-Month Post Links' },
  { id: 5, label: 'External Links Count' },
  { id: 6, label: 'Categorize Task Types' },
  { id: 7, label: 'Sequoia & VB Counts' },
  { id: 8, label: 'Post Link Indexation', note: 'batched' },
  { id: 9, label: 'Indexed Seq & VB' },
  { id: 10, label: 'Indexation Rates' },
  { id: 11, label: 'Priority Score' },
];

// Top-level sections and the sub-tabs each one shows.
const SECTIONS = [
  { id: 'site', label: 'Site Indexation Checker' },
  { id: 'url', label: 'URL Index Checker' },
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'usage', label: 'Usage' },
  { id: 'automation', label: 'Automation' },
];
const SECTION_TABS = {
  site: ['tracker', 'postlinks', 'salvage', 'log'],
  url: ['indexcheck'],
  dashboard: ['dashboard'],
  usage: ['usage'],
  automation: ['automation'],
};

const S = {
  app: { display: 'flex', flexDirection: 'column', minHeight: '100vh', background: BG_PAGE },
  header: { background: BG_CARD, borderBottom: `2.5px solid ${ACCENT}`, padding: '0 28px', height: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 100, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' },
  body: { display: 'grid', gridTemplateColumns: '268px 1fr', flex: 1, minHeight: 'calc(100vh - 56px)' },
  sidebar: { background: BG_CARD, borderRight: `1px solid ${BORDER}`, padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 12 },
  mainContent: { padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14, background: BG_PAGE },
  card: { background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, overflow: 'hidden' },
  cardHeader: { padding: '9px 14px', borderBottom: `1px solid ${BORDER}`, background: BG_HEADER, display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
  cardHeaderLabel: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED },
  btnPrimary: { background: ACCENT, color: '#fff', fontWeight: 600, padding: '11px 18px', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnPrimaryDisabled: { background: 'var(--accent-disabled)', color: '#fff', fontWeight: 600, padding: '11px 18px', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontSize: 14, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOutline: { background: BG_CARD, color: ACCENT, fontWeight: 500, padding: '7px 14px', border: `1.5px solid ${ACCENT}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
  btnGhost: { background: 'transparent', color: MUTED, fontWeight: 500, padding: '5px 10px', border: `1px solid ${BORDER}`, borderRadius: 5, cursor: 'pointer', fontSize: 11 },
  badge: { fontSize: 11, fontWeight: 600, background: ACCENT_LIGHT, color: 'var(--accent-strong)', padding: '2px 8px', borderRadius: 99 },
  textarea: { width: '100%', height: 170, background: BG_HEADER, border: `1px solid ${BORDER}`, borderRadius: 6, color: TEXT, fontFamily: "'Courier New', monospace", fontSize: 12, padding: '10px 12px', resize: 'vertical', outline: 'none', lineHeight: 1.8 },
  progressWrap: { height: 5, background: BORDER, borderRadius: 99, overflow: 'hidden' },
  progressFill: { height: '100%', background: ACCENT, borderRadius: 99, transition: 'width 0.4s ease' },
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 },
  statCard: { background: BG_CARD, border: `1px solid ${BORDER}`, borderTop: `3px solid ${ACCENT}`, borderRadius: 8, padding: '14px 16px' },
  statVal: { fontSize: 26, fontWeight: 700, color: TEXT, lineHeight: 1 },
  statLabel: { fontSize: 11, color: MUTED, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' },
  logWrap: { background: '#1a1a1a', borderRadius: 6, fontFamily: "'Courier New', monospace", fontSize: 12, padding: '12px 14px', height: 200, overflowY: 'auto', lineHeight: 1.9 },
  tableWrap: { overflowX: 'auto', maxHeight: 400, overflowY: 'auto' },
  th: { fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, padding: '9px 12px', textAlign: 'left', borderBottom: `1px solid ${BORDER}`, whiteSpace: 'nowrap', position: 'sticky', top: 0, background: BG_HEADER, zIndex: 10 },
  td: { padding: '9px 12px', borderBottom: `1px solid var(--border-subtle)`, verticalAlign: 'middle', color: TEXT, fontSize: 13 },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Retries a couple of times on a brief network blip / 5xx so a momentary drop in
// the user's internet doesn't kill the whole run. Real app errors aren't retried.
// On a persistent network failure, throws an error flagged `.offline`.
async function apiFetch(path, body, retries = 2) {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.status >= 500) throw new Error(`Server ${res.status}`);
      if (!res.ok) throw new Error(`Server error at ${path}: ${res.status} ${res.statusText}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      return json;
    } catch (e) {
      const isNetwork = e.name === 'TypeError';
      const isServer5xx = /^Server 5\d\d$/.test(e.message);
      if (attempt < retries && (isNetwork || isServer5xx)) { await sleep(1500); continue; }
      if (isNetwork) { const err = new Error('You appear to be offline.'); err.offline = true; throw err; }
      throw e;
    }
  }
}

function fmt(val, isRate = false) {
  if (val === null || val === undefined || val === '') return '—';
  if (isRate) return `${(val * 100).toFixed(1)}%`;
  return val;
}

function Tag({ value }) {
  if (!value) return <span style={{ color: 'var(--muted-2)' }}>—</span>;
  const styles = {
    'Indexed': { background: 'var(--ok-chip-bg)', color: 'var(--ok-chip-text)' },
    'Unindexed': { background: 'var(--bad-chip-bg)', color: 'var(--bad-chip-text)' },
    'Skip': { background: 'var(--neutral-chip-bg)', color: 'var(--neutral-chip-text)' },
    'Sequoia': { background: 'var(--seq-chip-bg)', color: 'var(--seq-chip-text)' },
    'Video Bridge': { background: 'var(--vb-chip-bg)', color: 'var(--vb-chip-text)' },
    'Others': { background: 'var(--neutral-chip-bg)', color: 'var(--neutral-chip-text)' },
    'Invalid Key': { background: 'var(--bad-chip-bg)', color: 'var(--bad-chip-text)' },
    'No Credits': { background: 'var(--bad-chip-bg)', color: 'var(--bad-chip-text)' },
    'Conn. Error': { background: 'var(--warn-bg)', color: 'var(--warn-text)' },
    'Error': { background: 'var(--warn-bg)', color: 'var(--warn-text)' },
  };
  const s = styles[value] || styles['Skip'];
  return <span style={{ ...s, fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4, display: 'inline-block' }}>{value}</span>;
}

function toCSV(rows, headers) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  return [headers.map(esc).join(','), ...rows.map(r => r.map(esc).join(','))].join('\n');
}

function downloadCSV(filename, csv) {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// Unique ID for each completed run: timestamp + random tag so two people
// saving at the same moment can never collide.
function makeRunId() {
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const rand = Math.random().toString(36).slice(2, 7);
  return `r-${stamp}-${rand}`;
}

const selStyle = { background: 'var(--input-bg)', border: `1px solid ${BORDER}`, borderRadius: 6, padding: '7px 10px', fontSize: 12, color: TEXT, outline: 'none', minWidth: 130 };
const filterLabel = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: 4, display: 'block' };

// --- Dashboard helpers ---------------------------------------------------
// Turn a stored "84.0%" string into the number 84 (or null if blank/N-A).
function parsePct(v) {
  if (v == null || v === '' || v === 'N/A') return null;
  const n = parseFloat(String(v).replace('%', ''));
  return Number.isFinite(n) ? n : null;
}
function fmtRate(n) { return n == null ? '—' : `${n.toFixed(1)}%`; }
function isoDate(d) { return d.toISOString().slice(0, 10); }
function shiftMonths(date, n) { const d = new Date(date); d.setMonth(d.getMonth() + n); return d; }
function shiftDays(date, n) { const d = new Date(date); d.setDate(d.getDate() + n); return d; }

// For each site, keep only its MOST RECENT check within [start, end] (inclusive
// YYYY-MM-DD strings; blank = unbounded). Returns { domain: trackerRow }.
function latestPerSite(rows, start, end) {
  const out = {};
  for (const r of rows) {
    const d = (r['Run Date'] || '').slice(0, 10);
    const dom = r['Domain'];
    if (!d || !dom) continue;
    if (start && d < start) continue;
    if (end && d > end) continue;
    if (!out[dom] || d > out[dom]._d) out[dom] = { ...r, _d: d };
  }
  return out;
}
// Library rate = simple average of each site's indexation rate (equal weight).
function libraryRate(perSite) {
  const vals = Object.values(perSite).map(r => parsePct(r['Indexation %'])).filter(v => v != null);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
// Build the two comparison windows for a preset. "Recent" = B, "previous" = A.
function presetRanges(preset, today, custom) {
  if (preset === 'custom') return custom;
  const bEnd = isoDate(today);
  let bStart;
  if (preset === '30d') bStart = shiftDays(today, -30);
  else bStart = shiftMonths(today, preset === '3m' ? -3 : -6);
  const aEnd = shiftDays(bStart, -1);
  let aStart;
  if (preset === '30d') aStart = shiftDays(aEnd, -30);
  else aStart = shiftMonths(aEnd, preset === '3m' ? -3 : -6);
  return { aStart: isoDate(aStart), aEnd: isoDate(aEnd), bStart: isoDate(bStart), bEnd };
}

// DASHBOARD — reads every saved run back from the Google Sheet (our database)
// and lets you filter the history by date range, site, category and index status.
// New period-based dashboard: reads /api/dashboard (the Indexation History
// aggregation) and shows a GSC-style trend chart + average cards + per-period
// rate/count tables + period-over-period comparison, with a week/month/3-month
// toggle. Supersedes the legacy Dashboard component below.
function DashboardV2({ active }) {
  const [period, setPeriod] = useState('week');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [show, setShow] = useState({ site: true, seq: true, vb: true });
  const [hover, setHover] = useState(null);
  const [range, setRange] = useState({ from: '', to: '' }); // period keys; '' = full span

  const load = useCallback((p) => {
    setLoading(true); setError(null);
    fetch(`/api/dashboard?period=${p}`).then(r => r.json())
      .then(d => { if (d.error) throw new Error(d.error); setData(d); })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { if (active) load(period); }, [active, period, load]);
  useEffect(() => { setRange({ from: '', to: '' }); }, [period]); // reset range when granularity changes

  const METRICS = [
    { id: 'site', label: 'Site', color: '#9cc049', rate: 'siteRate', tot: 'siteTotal', idx: 'siteIndexed' },
    { id: 'seq', label: 'Sequoia', color: '#5aa9e6', rate: 'seqRate', tot: 'seqTotal', idx: 'seqIndexed' },
    { id: 'vb', label: 'Video Bridge', color: '#e0a05a', rate: 'vbRate', tot: 'vbTotal', idx: 'vbIndexed' },
  ];
  const pct = v => (v == null ? '—' : `${(v * 100).toFixed(1)}%`);
  const allPeriods = data?.periods || [];
  const fromKey = range.from || allPeriods[0]?.key || '';
  const toKey = range.to || allPeriods[allPeriods.length - 1]?.key || '';
  const periods = allPeriods.filter(p => p.key >= fromKey && p.key <= toKey);
  const periodLabels = { week: 'Week', month: 'Month', quarter: '3-Month' };
  const selStyle = { padding: '5px 8px', borderRadius: 6, border: '1px solid var(--accent-light-border)', background: 'transparent', color: 'inherit', fontSize: 12 };

  function Delta({ d }) {
    if (d == null) return <span style={{ color: MUTED }}>—</span>;
    const up = d >= 0;
    return <span style={{ color: up ? 'var(--accent-strong)' : 'var(--err-text)', fontWeight: 600 }}>{up ? '▲' : '▼'} {(Math.abs(d) * 100).toFixed(1)} pts</span>;
  }

  // ---- chart geometry ----
  const W = 760, H = 280, pL = 44, pR = 16, pT = 14, pB = 38;
  const plotW = W - pL - pR, plotH = H - pT - pB;
  const n = periods.length;
  const xAt = i => (n <= 1 ? pL + plotW / 2 : pL + plotW * (i / (n - 1)));
  const yAt = r => pT + plotH * (1 - Math.max(0, Math.min(1, r)));
  const labelStep = n > 8 ? Math.ceil(n / 8) : 1;

  return (
    <div style={{ padding: '16px 14px' }}>
      {/* header: title + period toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>Indexation over time</div>
          <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>From the Indexation History — only successfully-audited sites count toward the rates.</div>
        </div>
        <div style={{ display: 'flex', gap: 4, background: 'var(--bg-page, #1c1c1c)', padding: 3, borderRadius: 8 }}>
          {['week', 'month', 'quarter'].map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              style={{ ...S.btnGhost, padding: '6px 12px', fontSize: 12, fontWeight: period === p ? 700 : 500,
                background: period === p ? ACCENT_LIGHT : 'transparent', color: period === p ? 'var(--accent-strong)' : MUTED, border: 'none' }}>
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {allPeriods.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 14, fontSize: 12, color: MUTED }}>
          <span>From</span>
          <select value={fromKey} onChange={e => setRange(r => ({ ...r, from: e.target.value }))} style={selStyle}>
            {allPeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <span>To</span>
          <select value={toKey} onChange={e => setRange(r => ({ ...r, to: e.target.value }))} style={selStyle}>
            {allPeriods.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
          <button onClick={() => setRange({ from: '', to: '' })} style={{ ...S.btnGhost, fontSize: 11, padding: '4px 8px' }}>All</button>
        </div>
      )}

      {loading && <div style={{ color: MUTED, fontSize: 13, padding: 12 }}>Loading…</div>}
      {error && <div style={{ fontSize: 12, color: 'var(--err-text)', background: 'var(--err-bg)', border: '1px solid var(--err-border)', borderRadius: 4, padding: '8px 10px' }}>{error}</div>}

      {!loading && !error && periods.length === 0 && (
        <div style={{ color: MUTED, fontSize: 13, padding: 12 }}>No audited data yet for this view — it’ll fill in as runs complete.</div>
      )}

      {!loading && !error && periods.length > 0 && (() => {
        const avg = sel => { const v = periods.map(sel).filter(x => x != null); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
        const a = { siteRate: avg(p => p.siteRate), seqRate: avg(p => p.seqRate), vbRate: avg(p => p.vbRate) };
        let cmp = null;
        if (periods.length >= 2) {
          const cur = periods[periods.length - 1], prev = periods[periods.length - 2];
          const dl = (x, y) => (x != null && y != null ? x - y : null);
          cmp = { current: cur, previous: prev, siteDelta: dl(cur.siteRate, prev.siteRate), seqDelta: dl(cur.seqRate, prev.seqRate), vbDelta: dl(cur.vbRate, prev.vbRate) };
        }
        return (
          <>
            {/* latest-period metric cards (big rate + counts + bar; period avg as footnote) */}
            {(() => { const latest = periods[periods.length - 1]; return (
              <>
                <div style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                  Latest: <strong style={{ color: TEXT }}>{latest.label}</strong>
                  {latest.inProgress && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--warn-text)', background: 'var(--warn-bg)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>in progress</span>}
                  {latest.coveragePct != null && <span style={{ marginLeft: 8 }}>· {latest.coverage.toLocaleString()}{data.libraryTotal ? ` of ${data.libraryTotal.toLocaleString()}` : ''} sites audited ({(latest.coveragePct * 100).toFixed(0)}%)</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                  {METRICS.map(m => {
                    const r = latest[m.rate];
                    return (
                      <div key={m.id} style={{ ...S.statCard, borderTop: `3px solid ${m.color}`, padding: 14 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: MUTED }}>{m.label}</div>
                        <div style={{ fontSize: 30, fontWeight: 700, color: m.color, marginTop: 4, lineHeight: 1.1 }}>{pct(r)}</div>
                        <div style={{ fontSize: 12, color: MUTED, marginTop: 3 }}>{latest[m.idx].toLocaleString()} of {latest[m.tot].toLocaleString()} indexed</div>
                        <div style={{ height: 7, borderRadius: 4, background: 'var(--accent-light-border)', marginTop: 10, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${Math.max(0, Math.min(1, r || 0)) * 100}%`, background: m.color, borderRadius: 4 }} />
                        </div>
                        <div style={{ fontSize: 11, color: MUTED, marginTop: 8 }}>{periodLabels[period]} avg: <strong style={{ color: TEXT }}>{pct(a[m.rate])}</strong>{periods.length > 1 ? ` (${periods.length} ${periodLabels[period].toLowerCase()}s)` : ''}</div>
                      </div>
                    );
                  })}
                </div>
              </>
            ); })()}

            {/* comparison */}
            {cmp && (
              <div style={{ fontSize: 13, color: TEXT, marginBottom: 14, padding: '8px 10px', background: BG_CARD, borderRadius: 6, border: '1px solid var(--accent-light-border)' }}>
                <strong>{cmp.current.label}</strong> vs <strong>{cmp.previous.label}</strong>:{' '}
                Site <Delta d={cmp.siteDelta} /> · Sequoia <Delta d={cmp.seqDelta} /> · Video Bridge <Delta d={cmp.vbDelta} />
              </div>
            )}

            {/* legend toggles */}
            <div style={{ display: 'flex', gap: 14, marginBottom: 6 }}>
              {METRICS.map(m => (
                <button key={m.id} onClick={() => setShow(s => ({ ...s, [m.id]: !s[m.id] }))}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', opacity: show[m.id] ? 1 : 0.4, fontSize: 12, color: TEXT }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: m.color, display: 'inline-block' }} />
                  {m.label}
                </button>
              ))}
            </div>

            {/* GSC-style trend chart */}
            <div style={{ ...S.statCard, padding: 8, marginBottom: 14 }}>
              <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto' }} onMouseLeave={() => setHover(null)}>
                {[0, 0.25, 0.5, 0.75, 1].map(g => (
                  <g key={g}>
                    <line x1={pL} y1={yAt(g)} x2={W - pR} y2={yAt(g)} stroke="var(--accent-light-border)" strokeWidth="1" />
                    <text x={pL - 6} y={yAt(g) + 3} textAnchor="end" fontSize="10" fill={MUTED}>{(g * 100).toFixed(0)}%</text>
                  </g>
                ))}
                {METRICS.filter(m => show[m.id]).map(m => {
                  const pts = periods.map((p, i) => ({ i, x: xAt(i), y: p[m.rate] != null ? yAt(p[m.rate]) : null })).filter(p => p.y != null);
                  const path = pts.map((p, k) => `${k === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
                  return (
                    <g key={m.id}>
                      {pts.length > 1 && <path d={path} fill="none" stroke={m.color} strokeWidth="2" />}
                      {pts.map(p => (
                        <circle key={p.i} cx={p.x} cy={p.y} r={periods[p.i].inProgress ? 4 : 3}
                          fill={periods[p.i].inProgress ? 'none' : m.color} stroke={m.color} strokeWidth={periods[p.i].inProgress ? 2 : 0} />
                      ))}
                    </g>
                  );
                })}
                {periods.map((p, i) => (i % labelStep === 0 || i === n - 1) && (
                  <text key={i} x={xAt(i)} y={H - pB + 16} textAnchor="middle" fontSize="9" fill={MUTED}>{p.label.replace('Week of ', '')}</text>
                ))}
                {/* hover bands + tooltip */}
                {periods.map((p, i) => {
                  const bw = n <= 1 ? plotW : plotW / (n - 1 || 1);
                  return <rect key={i} x={xAt(i) - bw / 2} y={pT} width={bw} height={plotH} fill="transparent" onMouseEnter={() => setHover(i)} />;
                })}
                {hover != null && periods[hover] && (() => {
                  const p = periods[hover]; const tx = Math.min(Math.max(xAt(hover) + 8, pL), W - 150); const ty = pT + 6;
                  return (
                    <g>
                      <line x1={xAt(hover)} y1={pT} x2={xAt(hover)} y2={pT + plotH} stroke={MUTED} strokeWidth="1" strokeDasharray="3 3" />
                      <rect x={tx} y={ty} width={140} height={74} rx="5" fill="var(--bg-card, #232323)" stroke="var(--accent-light-border)" />
                      <text x={tx + 8} y={ty + 16} fontSize="10" fontWeight="700" fill={TEXT}>{p.label}{p.inProgress ? ' (in progress)' : ''}</text>
                      {METRICS.map((m, k) => (
                        <text key={m.id} x={tx + 8} y={ty + 32 + k * 13} fontSize="10" fill={m.color}>{m.label}: {pct(p[m.rate])}</text>
                      ))}
                    </g>
                  );
                })()}
              </svg>
            </div>

            {/* per-period rate table */}
            <div style={S.tableWrap}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Period', 'Coverage', 'Site', 'Sequoia', 'Video Bridge'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {[...periods].reverse().map(p => (
                    <tr key={p.key}>
                      <td style={{ ...S.td, fontWeight: 500 }}>{p.label}{p.inProgress && <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--warn-text)', background: 'var(--warn-bg)', padding: '1px 5px', borderRadius: 3, fontWeight: 600 }}>in progress</span>}</td>
                      <td style={{ ...S.td, color: MUTED }}>{p.coverage.toLocaleString()}{data.libraryTotal ? ` / ${data.libraryTotal.toLocaleString()}` : ''}{p.coveragePct != null ? ` (${(p.coveragePct * 100).toFixed(0)}%)` : ''}</td>
                      <td style={{ ...S.td, fontWeight: 600, color: '#9cc049' }}>{pct(p.siteRate)}</td>
                      <td style={{ ...S.td, fontWeight: 600, color: '#5aa9e6' }}>{pct(p.seqRate)}</td>
                      <td style={{ ...S.td, fontWeight: 600, color: '#e0a05a' }}>{pct(p.vbRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

          </>
        );
      })()}
    </div>
  );
}

function Dashboard({ active }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState({ tracker: [], postLinks: [] });

  const [mode, setMode] = useState('sites'); // 'sites' | 'compare' | 'posts'
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedSites, setSelectedSites] = useState([]); // empty = all
  const [siteMenuOpen, setSiteMenuOpen] = useState(false);
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');

  const [preset, setPreset] = useState('6m'); // '6m' | '3m' | '30d' | 'custom'
  const [custom, setCustom] = useState({ aStart: '', aEnd: '', bStart: '', bEnd: '' });

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/sheets/data');
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Load failed (${res.status})`);
      setData({ tracker: json.tracker || [], postLinks: json.postLinks || [] });
      setLoaded(true);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (active && !loaded && !loading) load(); }, [active, loaded, loading, load]);

  const allSites = [...new Set([...data.tracker, ...data.postLinks].map(r => r['Domain']).filter(Boolean))].sort();
  const siteOk = dom => selectedSites.length === 0 || selectedSites.includes(dom);
  const toggleSite = s => setSelectedSites(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  // ---- SITES mode: one row per site = its most recent check in the date range
  const sitesPerSite = latestPerSite(data.tracker.filter(r => siteOk(r['Domain'])), dateFrom, dateTo);
  const siteRows = Object.values(sitesPerSite).sort((a, b) => (parsePct(b['Indexation %']) ?? -1) - (parsePct(a['Indexation %']) ?? -1));
  const libRate = libraryRate(sitesPerSite);
  const siteRateVals = siteRows.map(r => parsePct(r['Indexation %'])).filter(v => v != null);

  // ---- COMPARE mode
  const ranges = presetRanges(preset, new Date(), custom);
  const compFilter = data.tracker.filter(r => siteOk(r['Domain']));
  const perA = latestPerSite(compFilter, ranges.aStart, ranges.aEnd);
  const perB = latestPerSite(compFilter, ranges.bStart, ranges.bEnd);
  const compDomains = [...new Set([...Object.keys(perA), ...Object.keys(perB)])];
  const compRows = compDomains.map(dom => {
    const a = parsePct(perA[dom]?.['Indexation %']);
    const b = parsePct(perB[dom]?.['Indexation %']);
    const change = (a != null && b != null) ? b - a : null;
    return { dom, a, b, change };
  }).sort((x, y) => {
    if (x.change == null && y.change == null) return (y.b ?? -1) - (x.b ?? -1);
    if (x.change == null) return 1;
    if (y.change == null) return -1;
    return y.change - x.change;
  });
  const libA = libraryRate(perA);
  const libB = libraryRate(perB);
  const improved = compRows.filter(r => r.change != null && r.change > 0.05).length;
  const declined = compRows.filter(r => r.change != null && r.change < -0.05).length;

  // ---- POSTS mode
  const postRows = data.postLinks.filter(r => {
    if (!siteOk(r['Domain'])) return false;
    const d = (r['Run Date'] || '').slice(0, 10);
    if (dateFrom && d < dateFrom) return false;
    if (dateTo && d > dateTo) return false;
    if (category && r['Task Type'] !== category) return false;
    if (status && r['Index Status'] !== status) return false;
    return true;
  });

  const resetFilters = () => { setSelectedSites([]); setCategory(''); setStatus(''); setDateFrom(''); setDateTo(''); };

  function changeCell(v) {
    if (v == null) return <span style={{ color: 'var(--muted-2)' }}>—</span>;
    const flat = Math.abs(v) < 0.05;
    const color = flat ? MUTED : v > 0 ? 'var(--ok-strong)' : 'var(--err-strong)';
    const arrow = flat ? '→' : v > 0 ? '▲' : '▼';
    return <span style={{ color, fontWeight: 600 }}>{arrow} {v > 0 ? '+' : ''}{v.toFixed(1)} pts</span>;
  }

  const siteFilterControl = (
    <div style={{ position: 'relative' }}>
      <span style={filterLabel}>Sites</span>
      <button style={{ ...selStyle, cursor: 'pointer', textAlign: 'left' }} onClick={() => setSiteMenuOpen(o => !o)}>
        {selectedSites.length === 0 ? 'All sites' : `${selectedSites.length} selected`} ▾
      </button>
      {siteMenuOpen && (
        <div style={{ position: 'absolute', zIndex: 50, top: '100%', left: 0, marginTop: 4, background: BG_CARD, border: `1px solid ${BORDER}`, borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', minWidth: 240, maxHeight: 280, overflowY: 'auto', padding: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <button style={S.btnGhost} onClick={() => setSelectedSites([])}>Clear (all)</button>
            <button style={S.btnGhost} onClick={() => setSiteMenuOpen(false)}>Done</button>
          </div>
          {allSites.length === 0 && <div style={{ fontSize: 12, color: MUTED, padding: 6 }}>No sites yet.</div>}
          {allSites.map(s => (
            <label key={s} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 2px', fontSize: 12, cursor: 'pointer' }}>
              <input type="checkbox" checked={selectedSites.includes(s)} onChange={() => toggleSite(s)} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );

  const card = (label, value, accent) => (
    <div style={{ ...S.statCard, flex: '1 1 130px', minWidth: 130 }}>
      <div style={{ ...S.statVal, color: accent || TEXT }}>{value}</div>
      <div style={S.statLabel}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding: 14 }}>
      {/* Mode switch + refresh */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
        <div style={{ display: 'flex', border: `1px solid ${BORDER}`, borderRadius: 6, overflow: 'hidden' }}>
          {[['sites', 'Sites'], ['compare', 'Compare periods'], ['posts', 'Posts']].map(([m, lbl]) => (
            <button key={m} onClick={() => setMode(m)} style={{
              background: mode === m ? ACCENT : BG_CARD, color: mode === m ? '#fff' : MUTED,
              border: 'none', padding: '8px 16px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>{lbl}</button>
          ))}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {(mode === 'sites' || mode === 'posts') && <button style={S.btnGhost} onClick={resetFilters}>Reset filters</button>}
          <button style={S.btnOutline} onClick={load} disabled={loading}>{loading ? 'Loading…' : '↻ Refresh'}</button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'var(--err-bg)', border: '1px solid var(--err-border)', borderRadius: 8, padding: '10px 14px', color: 'var(--err-text)', fontSize: 12, marginBottom: 12 }}>{error}</div>
      )}

      {/* ============ SITES MODE ============ */}
      {mode === 'sites' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 14 }}>
            {siteFilterControl}
            <div><span style={filterLabel}>From</span><input type="date" style={selStyle} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><span style={filterLabel}>To</span><input type="date" style={selStyle} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            {card('Sites', siteRows.length)}
            {card('Library indexation rate', fmtRate(libRate), ACCENT)}
            {card('Highest', siteRateVals.length ? fmtRate(Math.max(...siteRateVals)) : '—', 'var(--ok-strong)')}
            {card('Lowest', siteRateVals.length ? fmtRate(Math.min(...siteRateVals)) : '—', 'var(--err-strong)')}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>
            Each site shown once, using its most recent check{(dateFrom || dateTo) ? ' in the selected dates' : ''}. Library rate = average across sites.
          </div>
          {loading && !loaded ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading saved data…</div>
          ) : siteRows.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {loaded ? 'No saved data matches these filters.' : 'No data yet — run the automation and click “Save to Sheet”.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Domain', 'Latest check', 'Total Post', 'Total Indexed', 'Indexation %', 'Seq %', 'VB %', 'Priority'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {siteRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight: 500, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Domain']}</td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap', color: MUTED }}>{r._d}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{r['Total Post'] || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{r['Total Indexed'] || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700, color: ACCENT }}>{r['Indexation %'] || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: 'var(--link)' }}>{r['Seq Indexation %'] || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: 'var(--vb)' }}>{r['VB Indexation %'] || '—'}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{r['Priority Score'] || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ============ COMPARE MODE ============ */}
      {mode === 'compare' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 14 }}>
            <div>
              <span style={filterLabel}>Compare</span>
              <select style={selStyle} value={preset} onChange={e => setPreset(e.target.value)}>
                <option value="6m">Last 6 months vs previous 6 months</option>
                <option value="3m">Last 3 months vs previous 3 months</option>
                <option value="30d">Last 30 days vs previous 30 days</option>
                <option value="custom">Custom date ranges</option>
              </select>
            </div>
            {siteFilterControl}
            {preset === 'custom' && (
              <>
                <div><span style={filterLabel}>Earlier from</span><input type="date" style={selStyle} value={custom.aStart} onChange={e => setCustom(c => ({ ...c, aStart: e.target.value }))} /></div>
                <div><span style={filterLabel}>Earlier to</span><input type="date" style={selStyle} value={custom.aEnd} onChange={e => setCustom(c => ({ ...c, aEnd: e.target.value }))} /></div>
                <div><span style={filterLabel}>Recent from</span><input type="date" style={selStyle} value={custom.bStart} onChange={e => setCustom(c => ({ ...c, bStart: e.target.value }))} /></div>
                <div><span style={filterLabel}>Recent to</span><input type="date" style={selStyle} value={custom.bEnd} onChange={e => setCustom(c => ({ ...c, bEnd: e.target.value }))} /></div>
              </>
            )}
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 6, flexWrap: 'wrap' }}>
            {card(`Earlier (${ranges.aStart || '…'} → ${ranges.aEnd || '…'})`, fmtRate(libA))}
            {card(`Recent (${ranges.bStart || '…'} → ${ranges.bEnd || '…'})`, fmtRate(libB), ACCENT)}
            {card('Library change', (libA != null && libB != null) ? changeCell(libB - libA) : '—')}
            {card('Improved', improved, 'var(--ok-strong)')}
            {card('Declined', declined, 'var(--err-strong)')}
          </div>
          <div style={{ fontSize: 11, color: MUTED, marginBottom: 12 }}>
            “pts” = change in percentage points. Each site uses its most recent check within each period; sorted by biggest improvement.
          </div>
          {loading && !loaded ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading saved data…</div>
          ) : compRows.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {loaded ? 'No saved checks fall in these periods yet.' : 'No data yet — run the automation and click “Save to Sheet”.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Domain', 'Earlier', 'Recent', 'Change'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {compRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, fontWeight: 500, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.dom}</td>
                      <td style={{ ...S.td, textAlign: 'right', color: MUTED }}>{fmtRate(r.a)}</td>
                      <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: ACCENT }}>{fmtRate(r.b)}</td>
                      <td style={{ ...S.td, textAlign: 'right' }}>{changeCell(r.change)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ============ POSTS MODE ============ */}
      {mode === 'posts' && (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginBottom: 14 }}>
            {siteFilterControl}
            <div><span style={filterLabel}>From</span><input type="date" style={selStyle} value={dateFrom} onChange={e => setDateFrom(e.target.value)} /></div>
            <div><span style={filterLabel}>To</span><input type="date" style={selStyle} value={dateTo} onChange={e => setDateTo(e.target.value)} /></div>
            <div>
              <span style={filterLabel}>Category</span>
              <select style={selStyle} value={category} onChange={e => setCategory(e.target.value)}>
                <option value="">All categories</option>
                {['Sequoia', 'Video Bridge', 'Others'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <span style={filterLabel}>Index Status</span>
              <select style={selStyle} value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">All statuses</option>
                {['Indexed', 'Unindexed', 'Skip'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 12, flexWrap: 'wrap' }}>
            {card('Posts', postRows.length.toLocaleString())}
            {card('Indexed', postRows.filter(r => r['Index Status'] === 'Indexed').length.toLocaleString(), 'var(--ok-strong)')}
            {card('Unindexed', postRows.filter(r => r['Index Status'] === 'Unindexed').length.toLocaleString(), 'var(--err-strong)')}
          </div>
          {loading && !loaded ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>Loading saved data…</div>
          ) : postRows.length === 0 ? (
            <div style={{ padding: '40px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {loaded ? 'No saved posts match these filters.' : 'No data yet — run the automation and click “Save to Sheet”.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['Run Date', 'Domain', 'Post Link', 'Pub Date', 'Task Type', 'Index Status'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {postRows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{(r['Run Date'] || '').slice(0, 10)}</td>
                      <td style={{ ...S.td, fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r['Domain']}</td>
                      <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={r['Post Link']} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)', fontSize: 12 }}>{r['Post Link']}</a>
                      </td>
                      <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{r['Pub Date'] || '—'}</td>
                      <td style={S.td}><Tag value={r['Task Type']} /></td>
                      <td style={S.td}><Tag value={r['Index Status']} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// Standalone URL indexation checker — paste URLs, check each via the Google
// site: operator (3 attempts each), copy/paste the results out.
function IndexChecker({ onCreditsLogged }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const urls = input.split('\n').map(u => u.trim()).filter(Boolean);

  async function run() {
    if (!urls.length || running) return;
    setRunning(true); setError(null); setResults([]); setCopied(false);
    setProgress({ done: 0, total: urls.length });
    const all = [];
    try {
      const chunk = 10;
      for (let i = 0; i < urls.length; i += chunk) {
        const batch = urls.slice(i, i + chunk);
        const res = await fetch('/api/index-check', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ urls: batch }),
        });
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error || `Check failed (${res.status})`);
        all.push(...json.results);
        setResults([...all]);
        setProgress({ done: Math.min(i + batch.length, urls.length), total: urls.length });
        if (json.halt) { setError(`Stopped — ${json.halt.detail}. Fix it and run again.`); break; }
      }
    } catch (e) { setError(e.message); }
    finally {
      setRunning(false);
      // Log SerpApi credits used (one per attempt) to the monthly tracker.
      const used = all.reduce((a, r) => a + (r.attempts || 0), 0);
      if (used > 0) {
        fetch('/api/usage', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ indexCheckCredits: used }),
        }).then(() => onCreditsLogged && onCreditsLogged()).catch(() => {});
      }
    }
  }

  function copyResults() {
    const header = ['URL', 'Status', 'Details'].join('\t');
    const lines = results.map(r => [r.url, r.status, r.detail].join('\t'));
    navigator.clipboard.writeText([header, ...lines].join('\n'))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); })
      .catch(() => setError('Could not copy to clipboard.'));
  }

  function downloadResults() {
    const headers = ['URL', 'Status', 'Details', 'Attempts'];
    const rows = results.map(r => [r.url, r.status, r.detail, r.attempts]);
    downloadCSV('indexation-check.csv', toCSV(rows, headers));
  }

  const counts = {
    indexed: results.filter(r => r.status === 'Indexed').length,
    unindexed: results.filter(r => r.status === 'Unindexed').length,
    errors: results.filter(r => r.status !== 'Indexed' && r.status !== 'Unindexed').length,
  };

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 16, alignItems: 'start' }}>
        {/* Input */}
        <div>
          <span style={filterLabel}>URLs to check (one per line)</span>
          <textarea
            style={{ ...S.textarea, height: 260 }}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={running}
            placeholder={'https://example.com/post-1\nexample.com/post-2'}
          />
          <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 6 }}>
            {urls.length} URL{urls.length === 1 ? '' : 's'} · checked with Google’s site: operator · up to 3 tries each.
          </div>
          <button
            style={{ ...(running || !urls.length ? S.btnPrimaryDisabled : S.btnPrimary), marginTop: 10 }}
            onClick={run} disabled={running || !urls.length}
          >
            {running ? `Checking ${progress.done}/${progress.total}…` : '▶ Check Indexation'}
          </button>
          {error && (
            <div style={{ marginTop: 8, fontSize: 12, background: 'var(--err-bg)', border: '1px solid var(--err-border)', color: 'var(--err-text)', borderRadius: 6, padding: '8px 10px' }}>{error}</div>
          )}
        </div>

        {/* Results */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ ...S.badge, background: 'var(--ok-chip-bg)', color: 'var(--ok-chip-text)' }}>Indexed {counts.indexed}</span>
              <span style={{ ...S.badge, background: 'var(--bad-chip-bg)', color: 'var(--bad-chip-text)' }}>Unindexed {counts.unindexed}</span>
              {counts.errors > 0 && <span style={{ ...S.badge, background: 'var(--warn-bg)', color: 'var(--warn-text)' }}>Errors {counts.errors}</span>}
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
              <button style={{ ...S.btnOutline, opacity: results.length ? 1 : 0.5 }} onClick={copyResults} disabled={!results.length}>{copied ? '✓ Copied' : '⧉ Copy results'}</button>
              <button style={{ ...S.btnGhost, opacity: results.length ? 1 : 0.5 }} onClick={downloadResults} disabled={!results.length}>↓ CSV</button>
            </div>
          </div>

          {results.length === 0 ? (
            <div style={{ padding: '48px 0', textAlign: 'center', color: MUTED, fontSize: 13 }}>
              {running ? 'Checking…' : 'Paste URLs and click Check Indexation.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto', border: `1px solid ${BORDER}`, borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead><tr>{['#', 'URL', 'Status', 'Details'].map(h => <th key={h} style={S.th}>{h}</th>)}</tr></thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={i}>
                      <td style={{ ...S.td, color: 'var(--muted-3)', fontSize: 11, width: 36 }}>{i + 1}</td>
                      <td style={{ ...S.td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={r.url.startsWith('http') ? r.url : `https://${r.url}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)', fontSize: 12 }}>{r.url}</a>
                      </td>
                      <td style={S.td}><Tag value={r.status} /></td>
                      <td style={{ ...S.td, color: MUTED, fontSize: 12 }}>{r.detail}{r.attempts > 1 ? ` (${r.attempts} tries)` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Control panel for the background audit runner: On/Off, "Run a batch now",
// and live status. Talks to /api/runner; never touches GitHub directly.
function AutomationPanel({ active }) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [sizeInput, setSizeInput] = useState('');

  const load = useCallback(() => {
    fetch('/api/runner').then(r => r.json())
      .then(d => { setState(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Seed the "sites per day" field from the saved value (once), without
  // clobbering what the user is typing on later auto-refreshes.
  useEffect(() => {
    if (state?.batchSize != null) setSizeInput(prev => (prev === '' ? String(state.batchSize) : prev));
  }, [state]);

  useEffect(() => {
    if (!active) return;
    load();
    const id = setInterval(load, 20000); // keep status fresh while open
    return () => clearInterval(id);
  }, [active, load]);

  async function act(action) {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/runner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Action failed.');
      if (action === 'run') setMsg({ type: 'success', text: 'Batch started — it runs in the background and will Slack you when done.' });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setBusy(false); }
  }

  async function saveSize() {
    const n = parseInt(sizeInput, 10);
    if (!Number.isFinite(n) || n <= 0) { setMsg({ type: 'error', text: 'Enter a positive number of sites per day.' }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/runner', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setBatchSize', value: n }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || 'Could not save.');
      setMsg({ type: 'success', text: `Sites per day set to ${n}.` });
      load();
    } catch (e) {
      setMsg({ type: 'error', text: e.message });
    } finally { setBusy(false); }
  }

  if (loading) return <div style={{ padding: 16, color: MUTED, fontSize: 13 }}>Loading…</div>;
  if (!state?.configured) {
    return <div style={{ padding: 16, fontSize: 13, color: MUTED }}>Automation isn’t set up yet — the runner’s storage keys haven’t been added. Once setup is done, the On/Off control appears here.</div>;
  }

  const enabled = state.enabled;
  const st = state.status || {};
  const lr = st.lastRun || null;
  const running = st.state === 'running';

  return (
    <div style={{ padding: '16px 14px', maxWidth: 560 }}>
      <div style={{ ...S.statCard, padding: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Automatic daily audit</div>
            <div style={{ fontSize: 12, color: MUTED, marginTop: 2 }}>
              Status: <strong style={{ color: enabled ? 'var(--accent-strong)' : MUTED }}>{enabled ? 'ON' : 'OFF'}</strong>
              {running ? ' · running now' : ''}
            </div>
          </div>
          <button onClick={() => act(enabled ? 'disable' : 'enable')} disabled={busy}
            style={{ ...(enabled ? S.btnOutline : S.btnPrimary), minWidth: 110, opacity: busy ? 0.6 : 1 }}>
            {enabled ? 'Turn Off' : 'Turn On'}
          </button>
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => act('run')} disabled={busy || !enabled || running}
            title={!enabled ? 'Turn automation on first' : running ? 'A run is already in progress' : 'Start a batch now'}
            style={{ ...S.btnOutline, opacity: (busy || !enabled || running) ? 0.5 : 1 }}>
            ▶ Run a batch now
          </button>
          <button onClick={load} disabled={busy} style={{ ...S.btnGhost, opacity: busy ? 0.6 : 1 }}>↻ Refresh</button>
        </div>

        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <label style={{ fontSize: 12, color: MUTED }}>Sites per day</label>
          <input type="number" min="1" value={sizeInput} onChange={e => setSizeInput(e.target.value)} disabled={busy}
            style={{ width: 84, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--accent-light-border)', background: 'transparent', color: 'inherit', fontSize: 13 }} />
          <button onClick={saveSize} disabled={busy} style={{ ...S.btnGhost, opacity: busy ? 0.6 : 1 }}>Save</button>
          <span style={{ fontSize: 11, color: MUTED }}>
            ≈ {Math.max(1, Math.ceil(3049 / (parseInt(sizeInput, 10) || 300)))} days for the full library
          </span>
        </div>

        {msg && (
          <div style={{ marginTop: 12, fontSize: 12, padding: '6px 8px', borderRadius: 4,
            background: msg.type === 'error' ? 'var(--err-bg)' : 'var(--accent-light)',
            color: msg.type === 'error' ? 'var(--err-text)' : 'var(--accent-strong)',
            border: `1px solid ${msg.type === 'error' ? 'var(--err-border)' : 'var(--accent-light-border)'}` }}>
            {msg.text}
          </div>
        )}
      </div>

      <div style={{ ...S.statCard, padding: 16, marginTop: 12 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8 }}>Last run</div>
        {lr ? (
          <div style={{ fontSize: 13, color: TEXT, lineHeight: 1.7 }}>
            Audited <strong>{lr.audited ?? 0}</strong> · failed <strong>{lr.failed ?? 0}</strong> · saved <strong>{lr.saved ?? 0}</strong>
            {lr.creditStop ? <span style={{ color: 'var(--err-text)' }}> · stopped (no credits)</span> : null}
            {lr.stoppedByUser ? <span style={{ color: MUTED }}> · stopped by you</span> : null}
            <div style={{ fontSize: 11, color: MUTED, marginTop: 4 }}>
              {st.finishedAt ? `Finished ${new Date(st.finishedAt).toLocaleString()}` : (st.updatedAt ? `Updated ${new Date(st.updatedAt).toLocaleString()}` : '')}
            </div>
          </div>
        ) : running ? (
          <div style={{ fontSize: 13, color: TEXT }}>Running now — audited {st.audited ?? 0}, saved {st.saved ?? 0} so far…</div>
        ) : (
          <div style={{ fontSize: 13, color: MUTED }}>No runs yet.</div>
        )}
      </div>

      <div style={{ fontSize: 11, color: MUTED, marginTop: 10, lineHeight: 1.6 }}>
        When ON, ~300 sites are audited automatically once a day (least-recently-checked first) until the whole library is refreshed, then it idles. Turn OFF any time — a run in progress stops cleanly after saving its current chunk.
      </div>
    </div>
  );
}

export default function Home() {
  const [domains, setDomains] = useState('');
  const [running, setRunning] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [stepStatuses, setStepStatuses] = useState({});
  const [logs, setLogs] = useState([]);
  const [activeTab, setActiveTab] = useState('tracker');
  const [section, setSection] = useState('site');
  const [trackerResults, setTrackerResults] = useState([]);
  const [postLinks, setPostLinks] = useState([]);
  const [runError, setRunError] = useState(null);
  const [usageData, setUsageData] = useState(null);
  const [runId, setRunId] = useState(null);
  const [savingSheet, setSavingSheet] = useState(false);
  const [sheetSaved, setSheetSaved] = useState(false);
  const [sheetMsg, setSheetMsg] = useState(null); // { type, text }
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadSitesMsg, setLoadSitesMsg] = useState(null); // { type, text }
  const [siteLimit, setSiteLimit] = useState(50);
  const [theme, setTheme] = useState('light');
  const logRef = useRef(null);

  // Pick up the theme that _document already applied (saved choice or system),
  // then let the toggle flip it and remember the choice for next time.
  useEffect(() => {
    setTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  }, []);

  // Remember which section/tab you were on so a page refresh returns you there
  // instead of snapping back to the default (URL Index Checker / Tracker).
  useEffect(() => {
    try {
      const sv = localStorage.getItem('ic2.section');
      const tb = localStorage.getItem('ic2.tab');
      if (sv && SECTION_TABS[sv]) {
        setSection(sv);
        setActiveTab(tb && SECTION_TABS[sv].includes(tb) ? tb : SECTION_TABS[sv][0]);
      }
    } catch (e) { /* private mode */ }
  }, []);
  useEffect(() => {
    try { localStorage.setItem('ic2.section', section); localStorage.setItem('ic2.tab', activeTab); } catch (e) { /* private mode */ }
  }, [section, activeTab]);
  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* private mode */ }
      return next;
    });
  }, []);

  const refreshUsage = useCallback(() => {
    fetch('/api/usage').then(r => r.json()).then(setUsageData).catch(() => {});
  }, []);

  useEffect(() => { refreshUsage(); }, [refreshUsage]);

  // While the Usage tab is open, refresh every 60s so the live total reflects
  // runs by anyone, without a manual reload.
  useEffect(() => {
    if (section !== 'usage') return;
    refreshUsage();
    const id = setInterval(refreshUsage, 60000);
    return () => clearInterval(id);
  }, [section, refreshUsage]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  const addLog = useCallback((msg, type = 'info') => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    setLogs(prev => [...prev, { msg, type, time }]);
  }, []);

  const setStepStatus = useCallback((step, status) => {
    setStepStatuses(prev => ({ ...prev, [step]: status }));
  }, []);

  const parsedDomains = domains.split('\n').map(d => d.trim()).filter(Boolean);
  const invalidDomains = parsedDomains.filter(d => {
    const clean = d.replace(/^https?:\/\//, '').replace(/\/$/, '');
    return !clean || clean.includes(' ') || !clean.includes('.');
  });
  const isDone = currentStep === 12;
  const progress = currentStep > 0 ? Math.min((currentStep / 11) * 100, 100) : 0;

  function stepDotStyle(status) {
    if (status === 'done') return { width: 8, height: 8, borderRadius: '50%', background: ACCENT, border: `1.5px solid ${ACCENT}`, flexShrink: 0 };
    if (status === 'active') return { width: 8, height: 8, borderRadius: '50%', background: 'var(--warn-strong)', border: '1.5px solid var(--warn-strong)', flexShrink: 0 };
    return { width: 8, height: 8, borderRadius: '50%', background: BORDER, border: `1.5px solid var(--border)`, flexShrink: 0 };
  }

  function stepLabelStyle(status) {
    if (status === 'done') return { fontSize: 12, color: 'var(--accent-strong)' };
    if (status === 'active') return { fontSize: 12, color: 'var(--warn-text)', fontWeight: 500 };
    return { fontSize: 12, color: MUTED };
  }

  function logColor(type) {
    if (type === 'success') return 'var(--accent)';
    if (type === 'error') return '#f87171';
    if (type === 'step') return '#7dd3fc';
    return 'var(--muted-2)';
  }

  // Download Tracker CSV
  function handleDownloadTracker() {
    const headers = ['Domain','Total Post','Total Indexed','Indexation %','Seq Total','Seq Indexed','Seq Indexation %','VB Total','VB Indexed','VB Indexation %','Combined Rate','Priority Score'];
    const rows = trackerResults.map(r => r.failed
      ? [r.domain, '-', '-', '-', '-', '-', '-', '-', '-', '-', '-', '-']
      : [
        r.domain, r.wpCount ?? '', r.serpCount ?? '',
        r.rate != null ? `${(r.rate * 100).toFixed(1)}%` : '',
        r.totalSequoia ?? '', r.indexedSequoia ?? '',
        r.seqRate != null ? `${(r.seqRate * 100).toFixed(1)}%` : '',
        r.totalVideoBridge ?? '', r.indexedVideoBridge ?? '',
        r.vbRate != null ? `${(r.vbRate * 100).toFixed(1)}%` : '',
        r.combinedRate != null ? `${(r.combinedRate * 100).toFixed(2)}%` : 'N/A',
        r.priorityScore != null ? r.priorityScore : 'N/A',
      ]);
    downloadCSV('tracker.csv', toCSV(rows, headers));
  }

  // Download All Post Links CSV
  function handleDownloadPostLinks() {
    const headers = ['Domain','Post Link','Pub Date','External Links','Task Type','Index Status'];
    const rows = postLinks.map(r => [
      r.domain, r.link, r.pubDate ?? '',
      r.externalCount ?? '', r.taskType || '', r.indexStatus || '',
    ]);
    downloadCSV('post-links.csv', toCSV(rows, headers));
  }

  // Download Salvage Sequoias — only Sequoia + Unindexed
  function handleDownloadSalvage() {
    const salvage = postLinks.filter(r => r.taskType === 'Sequoia' && r.indexStatus === 'Unindexed');
    if (!salvage.length) { alert('No Sequoia Unindexed posts found.'); return; }

    // Get priority score per domain
    const prioMap = {};
    trackerResults.forEach(r => { prioMap[r.domain?.toLowerCase().trim()] = r.priorityScore; });

    const headers = ['Domain','Post Link','Pub Date','Task Type','Index Status','Domain Priority Score'];
    const rows = salvage.map(r => {
      const key = (r.domain || '').toLowerCase().trim();
      return [
        r.domain, r.link, r.pubDate ?? '',
        r.taskType, r.indexStatus,
        prioMap[key] != null ? prioMap[key] : 'N/A',
      ];
    });
    downloadCSV('salvage-sequoias.csv', toCSV(rows, headers));
  }

  // Load the site list straight from the tracking tab. `failedOnly` pulls just
  // the sites currently flagged in the sheet (their count cell shows a status
  // word / note instead of a number), so you can re-run only the failures.
  async function handleLoadSites(failedOnly = false) {
    if (loadingSites || running) return;
    setLoadingSites(true);
    setLoadSitesMsg(null);
    try {
      const n = parseInt(siteLimit, 10);
      const params = new URLSearchParams();
      if (Number.isFinite(n) && n > 0) params.set('limit', n);
      if (failedOnly) params.set('failed', '1');
      const qs = params.toString() ? `?${params}` : '';
      const res = await fetch(`/api/tracking/sites${qs}`);
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Load failed (${res.status})`);
      setDomains((json.domains || []).join('\n'));
      if (failedOnly) {
        setLoadSitesMsg(
          json.count === 0
            ? { type: 'success', text: `No flagged sites to re-run — all ${json.total} sites have a clean count.` }
            : { type: 'success', text: `Loaded ${json.count} flagged site${json.count === 1 ? '' : 's'} to re-run (of ${json.flaggedCount} total flagged).` }
        );
      } else {
        const checkedNote = json.oldestChecked ? `oldest last-checked: ${json.oldestChecked}` : '';
        setLoadSitesMsg({
          type: 'success',
          text: `Loaded ${json.count} of ${json.total} sites (least-recently-checked first; ${json.neverChecked} never checked)${checkedNote ? ` · ${checkedNote}` : ''}.`,
        });
      }
    } catch (err) {
      setLoadSitesMsg({ type: 'error', text: err.message });
    } finally {
      setLoadingSites(false);
    }
  }

  // Write the finished run's measured values back into the TRACKING tab.
  async function handleSaveToSheet() {
    if (savingSheet || sheetSaved || !trackerResults.length) return;
    // Guard: a run that didn't finish (e.g. timed out) has no Sequoia/VB data,
    // so saving it would write "ERROR" over good numbers. runId is only set when
    // the run completes all steps — block the save until then.
    if (!runId) {
      setSheetMsg({ type: 'error', text: 'This run didn’t finish (it stopped partway), so it can’t be saved — the Sequoia/VideoBridge data is missing and saving would overwrite good numbers with errors. Re-run these sites in a smaller batch until it completes, then Save.' });
      return;
    }
    setSavingSheet(true);
    setSheetMsg(null);
    try {
      const results = trackerResults.map(r => ({
        domain: r.domain,
        serpCount: r.serpCount,
        wpCount: r.wpCount,
        totalSequoia: r.totalSequoia,
        indexedSequoia: r.indexedSequoia,
        rate: r.rate,
        seqRate: r.seqRate,
        totalVideoBridge: r.totalVideoBridge,
        indexedVideoBridge: r.indexedVideoBridge,
        vbRate: r.vbRate,
        combinedRate: r.combinedRate,
        priorityScore: r.priorityScore,
        failed: r.failed || false,
        failReason: r.failReason,
      }));
      // Salvage candidates (Sequoia + Unindexed) get appended to the salvage tab,
      // tagged with their domain's priority score.
      const prioMap = {};
      trackerResults.forEach(r => { prioMap[(r.domain || '').toLowerCase().trim()] = r.priorityScore; });
      const salvagePosts = postLinks
        .filter(l => l.taskType === 'Sequoia' && l.indexStatus === 'Unindexed')
        .map(r => ({
          domain: r.domain,
          link: r.link,
          pubDate: r.pubDate,
          taskType: r.taskType,
          indexStatus: r.indexStatus,
          priorityScore: prioMap[(r.domain || '').toLowerCase().trim()],
        }));
      const res = await fetch('/api/tracking/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ results, salvagePosts }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error || `Write failed (${res.status})`);
      setSheetSaved(true);
      const parts = [`Updated ${json.updated} site${json.updated === 1 ? '' : 's'}`];
      if (json.errored) parts.push(`${json.errored} marked down/error`);
      if (json.formulaSkips) parts.push(`skipped ${json.formulaSkips} formula cell${json.formulaSkips === 1 ? '' : 's'}`);
      if (json.notFound?.length) parts.push(`${json.notFound.length} not found in sheet`);
      if (json.history?.logged) parts.push(`logged ${json.history.logged} to history`);
      if (json.history?.error) parts.push(`history log failed (${json.history.error})`);
      if (json.salvage?.appended) parts.push(`appended ${json.salvage.appended} salvage post${json.salvage.appended === 1 ? '' : 's'}`);
      if (json.salvage?.error) parts.push(`salvage append failed (${json.salvage.error})`);
      setSheetMsg({ type: 'success', text: parts.join(' · ') + '.' });
    } catch (err) {
      setSheetMsg({ type: 'error', text: err.message });
    } finally {
      setSavingSheet(false);
    }
  }

  async function runAutomation() {
    if (!parsedDomains.length || invalidDomains.length > 0) return;
    setRunning(true);
    setRunError(null);
    setLogs([]);
    setTrackerResults([]);
    setPostLinks([]);
    setStepStatuses({});
    setCurrentStep(0);
    setRunId(null);
    setSheetSaved(false);
    setSheetMsg(null);

    let tracker = parsedDomains.map(d => ({ domain: d }));
    let links = [];
    let serpApiErrorSet = false;
    let step2Credits = 0;
    let step8Credits = 0;
    const failedSet = new Set(); // domains unreachable after retries — skipped, no score

    try {
      // Steps 1–3
      addLog('Starting Steps 1–3: WordPress counts & indexation rates…', 'step');
      [1,2,3].forEach(s => setStepStatus(s, 'active'));
      setCurrentStep(1);

      const r13 = await apiFetch('/api/steps/step1-3', { domains: parsedDomains });

      if (r13.results) {
        if (r13.results.some(r => r.serpCount === 'Invalid Key')) {
          setRunError({ message: 'Invalid SerpAPI key. Check your SERPAPI_KEY environment variable.', step: 2 });
          serpApiErrorSet = true;
          throw new Error('Invalid SerpAPI key');
        }
        if (r13.results.some(r => r.serpCount === 'No Credits')) {
          setRunError({ message: 'SerpAPI credits exhausted. Add credits at serpapi.com to continue.', step: 2 });
          serpApiErrorSet = true;
          throw new Error('No SerpAPI credits');
        }
        r13.results.forEach(r => { if (r.failed) failedSet.add((r.domain || '').toLowerCase().trim()); });
        step2Credits = r13.results.filter(r => !r.failed).length; // failed sites skip the search
        tracker = tracker.map((row, i) => ({ ...row, ...r13.results[i] }));
        setTrackerResults([...tracker]);
        addLog(`Steps 1–3 complete — ${r13.results.length} domains${failedSet.size ? ` (${failedSet.size} unreachable, skipped)` : ''}.`, 'success');
        [1,2,3].forEach(s => setStepStatus(s, 'done'));
      }

      // Steps 4–7
      addLog('Starting Steps 4–7: Post links, pub dates, external links, task types…', 'step');
      [4,5,6,7].forEach(s => setStepStatus(s, 'active'));
      setCurrentStep(4);

      const r47 = await apiFetch('/api/steps/step4-7', { domains: parsedDomains, skipDomains: [...failedSet] });

      if (r47.trackerResults && r47.postLinks) {
        // A site that became unreachable during post-fetch counts as failed too.
        r47.trackerResults.forEach(r => {
          const pc = r.postCount;
          if (r.failed || (pc !== undefined && pc !== '' && !Number.isFinite(parseInt(pc)))) {
            failedSet.add((r.domain || '').toLowerCase().trim());
          }
        });
        tracker = tracker.map((row, i) => ({ ...row, ...r47.trackerResults[i] }));
        links = r47.postLinks;
        setTrackerResults([...tracker]);
        setPostLinks([...links]);
        const seq = links.filter(l => l.taskType === 'Sequoia').length;
        const vb = links.filter(l => l.taskType === 'Video Bridge').length;
        const others = links.filter(l => l.taskType === 'Others').length;
        addLog(`Steps 4–7 complete — ${links.length} posts. Sequoia: ${seq} | VB: ${vb} | Others: ${others}`, 'success');
        [4,5,6,7].forEach(s => setStepStatus(s, 'done'));
      }

      // Step 8 — batched
      const toCheck = links.filter(l => l.taskType !== 'Others' && l.taskType !== 'Error');
      addLog(`Starting Step 8: Checking indexation for ${toCheck.length} posts (15 per batch)…`, 'step');
      setStepStatus(8, 'active');
      setCurrentStep(8);

      let batchStart = 0;
      let allLinks = [...links];

      while (batchStart < links.length) {
        const r8 = await apiFetch('/api/steps/step8', { postLinks: links, batchStart, batchSize: 15 });

        if (r8.results) {
          if (r8.results.some(r => r.indexStatus === 'Invalid Key')) {
            setRunError({ message: 'Invalid SerpAPI key detected during indexation check.', step: 8 });
            serpApiErrorSet = true;
            throw new Error('Invalid SerpAPI key');
          }
          if (r8.results.some(r => r.indexStatus === 'No Credits')) {
            setRunError({ message: 'SerpAPI credits exhausted during Step 8. Partial results saved below.', step: 8 });
            serpApiErrorSet = true;
            // Save partial results before stopping
            r8.results.forEach((item, i) => {
              const idx = batchStart + i;
              if (idx < allLinks.length) allLinks[idx] = { ...allLinks[idx], indexStatus: item.indexStatus };
            });
            links = allLinks;
            setPostLinks([...allLinks]);
            throw new Error('No SerpAPI credits');
          }
          r8.results.forEach((item, i) => {
            const idx = batchStart + i;
            if (idx < allLinks.length) allLinks[idx] = { ...allLinks[idx], indexStatus: item.indexStatus };
          });
          setPostLinks([...allLinks]);
        }

        addLog(`  Batch: ${r8.progress.processed}/${r8.progress.total} posts checked`, 'info');
        if (r8.progress.isDone || r8.nextBatchStart === null) break;
        batchStart = r8.nextBatchStart;
      }

      links = allLinks;
      step8Credits = links.filter(l => l.indexStatus && l.indexStatus !== 'Skip').length;
      addLog(`Step 8 complete — Indexed: ${links.filter(l=>l.indexStatus==='Indexed').length} | Unindexed: ${links.filter(l=>l.indexStatus==='Unindexed').length}`, 'success');
      setStepStatus(8, 'done');

      // Steps 9–11
      addLog('Starting Steps 9–11: Final counts, rates & priority scores…', 'step');
      [9,10,11].forEach(s => setStepStatus(s, 'active'));
      setCurrentStep(9);

      const r910 = await apiFetch('/api/steps/step9-10', { postLinks: links, trackerDomains: parsedDomains });

      if (r910.results) {
        tracker = tracker.map((row, i) => ({ ...row, ...r910.results[i] }));
        setTrackerResults([...tracker]);
        addLog('Steps 9–11 complete.', 'success');
        [9,10,11].forEach(s => setStepStatus(s, 'done'));
      }

      // Mark unreachable sites as failed so nothing is computed or shown for them.
      if (failedSet.size) {
        tracker = tracker.map(row =>
          failedSet.has((row.domain || '').toLowerCase().trim()) ? { ...row, failed: true } : row
        );
        setTrackerResults([...tracker]);
        tracker.filter(r => r.failed).forEach(r =>
          addLog(`  ⚠ ${r.domain}: ${r.failReason || 'Unreachable'}`, 'error')
        );
        addLog(`${failedSet.size} site(s) failed — see reasons above (left blank, no score).`, 'info');
      }

      addLog('All steps complete! Download your results below.', 'success');
      setRunId(makeRunId());
      setCurrentStep(12);

    } catch (err) {
      if (err.offline) {
        addLog('Connection lost — run paused. Reconnect and run it again.', 'error');
        if (!serpApiErrorSet) setRunError({ message: 'You appear to be offline — the run was paused. Reconnect and run it again (it picks up from the least-recently-checked sites).' });
      } else {
        addLog(`Error: ${err.message}`, 'error');
        if (!serpApiErrorSet) setRunError({ message: err.message });
      }
    } finally {
      if (step2Credits + step8Credits > 0) {
        fetch('/api/usage', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ step2Credits, step8Credits }),
        }).then(() => fetch('/api/usage').then(r => r.json()).then(setUsageData)).catch(() => {});
      }
      setRunning(false);
    }
  }

  return (
    <>
      <Head>
        <title>Semify Indexation Checker</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div style={S.app}>

        {/* HEADER */}
        <header style={S.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 4, height: 28, background: ACCENT, borderRadius: 2 }} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: TEXT, letterSpacing: '-0.02em', lineHeight: 1.2 }}>Semify Indexation Checker</div>
              <div style={{ fontSize: 11, color: MUTED, marginTop: 2 }}>Automation Dashboard</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {section === 'site' && isDone && (
              <>
                <button
                  style={savingSheet || sheetSaved ? { ...S.btnOutline, opacity: 0.6, cursor: 'default', background: sheetSaved ? ACCENT_LIGHT : BG_CARD } : { ...S.btnPrimary, width: 'auto', padding: '7px 14px', fontSize: 12 }}
                  onClick={handleSaveToSheet}
                  disabled={savingSheet || sheetSaved}
                >
                  {savingSheet ? 'Writing…' : sheetSaved ? '✓ Written to Sheet' : '↑ Write to Sheet'}
                </button>
                <button style={S.btnOutline} onClick={handleDownloadTracker}>↓ Tracker CSV</button>
                <button style={S.btnOutline} onClick={handleDownloadPostLinks}>↓ Post Links CSV</button>
                <button style={{ ...S.btnOutline, borderColor: 'var(--err-strong)', color: 'var(--err-strong)' }} onClick={handleDownloadSalvage}>↓ Salvage Sequoias</button>
              </>
            )}
            <button
              onClick={toggleTheme}
              title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              style={{ ...S.btnGhost, fontSize: 14, lineHeight: 1, padding: '5px 9px' }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>
            <button
              onClick={async () => { await fetch('/api/auth', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logout: true }) }); window.location.href = '/login'; }}
              style={{ ...S.btnGhost, fontSize: 11 }}
            >
              Log out
            </button>
          </div>
        </header>

        {/* PRIMARY NAV — top-level tools */}
        <nav style={{ display: 'flex', gap: 2, padding: '0 22px', background: BG_CARD, borderBottom: `1px solid ${BORDER}`, position: 'sticky', top: 56, zIndex: 90 }}>
          {SECTIONS.map(s => (
            <button key={s.id} onClick={() => { setSection(s.id); setActiveTab(SECTION_TABS[s.id][0]); }} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              borderBottom: section === s.id ? `2.5px solid ${ACCENT}` : '2.5px solid transparent',
              color: section === s.id ? TEXT : MUTED, fontWeight: section === s.id ? 700 : 500,
              fontSize: 13, padding: '12px 16px', marginBottom: -1, transition: 'all 0.15s',
            }}>{s.label}</button>
          ))}
        </nav>

        {/* BODY */}
        <div style={{ ...S.body, gridTemplateColumns: section === 'site' ? '268px 1fr' : '1fr' }}>

          {/* SIDEBAR — only for the Site Indexation Checker */}
          {section === 'site' && (
          <aside style={S.sidebar}>

            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardHeaderLabel}>Domains</span>
                <span style={S.badge}>{parsedDomains.length}</span>
              </div>
              <div style={{ padding: 12 }}>
                <textarea
                  style={S.textarea}
                  value={domains}
                  onChange={e => setDomains(e.target.value)}
                  disabled={running}
                  placeholder={'example.com\nhttps://site2.com\nwww.site3.com'}
                />
                <div style={{ fontSize: 11, color: 'var(--muted-2)', marginTop: 6 }}>One domain per line. http:// optional.</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
                  <label style={{ fontSize: 11, color: MUTED, whiteSpace: 'nowrap' }}>Sites to check</label>
                  <input
                    type="number" min="1" value={siteLimit}
                    onChange={e => setSiteLimit(e.target.value)}
                    disabled={loadingSites || running}
                    style={{ width: 70, ...selStyle, minWidth: 0, padding: '6px 8px' }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--muted-2)' }}>blank = all</span>
                </div>
                <button
                  style={{ ...S.btnOutline, width: '100%', textAlign: 'center', marginTop: 8, opacity: loadingSites || running ? 0.6 : 1 }}
                  onClick={() => handleLoadSites(false)}
                  disabled={loadingSites || running}
                >
                  {loadingSites ? 'Loading…' : '↓ Load oldest-checked sites'}
                </button>
                <button
                  style={{ ...S.btnOutline, width: '100%', textAlign: 'center', marginTop: 6, opacity: loadingSites || running ? 0.6 : 1, borderColor: 'var(--warn-text)', color: 'var(--warn-text)' }}
                  onClick={() => handleLoadSites(true)}
                  disabled={loadingSites || running}
                  title="Pull only the sites currently flagged in the sheet (count shows an error/note instead of a number), e.g. to re-run after manually fixing them."
                >
                  {loadingSites ? 'Loading…' : '⚠ Load failed sites'}
                </button>
                {loadSitesMsg && (
                  <div style={{
                    fontSize: 11, padding: '6px 8px', borderRadius: 4, marginTop: 8,
                    background: loadSitesMsg.type === 'error' ? 'var(--err-bg)' : ACCENT_LIGHT,
                    color: loadSitesMsg.type === 'error' ? 'var(--err-text)' : 'var(--accent-strong)',
                    border: `1px solid ${loadSitesMsg.type === 'error' ? 'var(--err-border)' : 'var(--accent-light-border)'}`,
                  }}>{loadSitesMsg.text}</div>
                )}
                {invalidDomains.length > 0 && (
                  <div style={{ fontSize: 11, color: 'var(--warn-text)', marginTop: 6, background: 'var(--warn-bg)', padding: '6px 8px', borderRadius: 4, border: '1px solid var(--warn-border)' }}>
                    Invalid: {invalidDomains.join(', ')}
                  </div>
                )}
              </div>
            </div>

            <div style={S.card}>
              <div style={S.cardHeader}>
                <span style={S.cardHeaderLabel}>Credits This Month</span>
                {usageData && <span style={S.badge}>{usageData.current?.total ?? 0}</span>}
              </div>
              <div style={{ padding: '10px 14px' }}>
                {!usageData ? (
                  <div style={{ fontSize: 12, color: 'var(--muted-2)' }}>Loading…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 26, fontWeight: 700, color: TEXT, lineHeight: 1 }}>{usageData.current?.total ?? 0}</div>
                    <div style={{ fontSize: 11, color: MUTED, marginTop: 3 }}>credits used in {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}</div>
                    {usageData.current?.runs?.length > 0 && (
                      <div style={{ marginTop: 8, fontSize: 11, color: MUTED }}>
                        Last run: {new Date(usageData.current.runs[0].ts).toLocaleDateString()} — {usageData.current.runs[0].total} credits
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>

            <button
              style={running || parsedDomains.length === 0 || invalidDomains.length > 0 ? S.btnPrimaryDisabled : S.btnPrimary}
              onClick={runAutomation}
              disabled={running || parsedDomains.length === 0 || invalidDomains.length > 0}
            >
              {running ? (
                <>
                  <span className="spin" style={{ width: 13, height: 13, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff' }} />
                  Step {currentStep}/11 running…
                </>
              ) : isDone ? '▶ Run Again' : '▶ Run Full Automation'}
            </button>

            {(running || isDone) && (
              <div style={S.card}>
                <div style={S.cardHeader}>
                  <span style={S.cardHeaderLabel}>Progress</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: ACCENT }}>{isDone ? '100' : Math.round(progress)}%</span>
                </div>
                <div style={{ padding: '12px 14px' }}>
                  <div style={{ ...S.progressWrap, marginBottom: 12 }}>
                    <div style={{ ...S.progressFill, width: `${isDone ? 100 : progress}%` }} />
                  </div>
                  {STEPS.map(step => (
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', borderBottom: `1px solid var(--border-subtle)` }}>
                      <div style={stepDotStyle(stepStatuses[step.id])} />
                      <span style={stepLabelStyle(stepStatuses[step.id])}>
                        {step.id}. {step.label}
                        {step.note && <span style={{ color: 'var(--muted-3)', marginLeft: 4, fontSize: 10 }}>({step.note})</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {isDone && (
              <div style={S.card}>
                <div style={S.cardHeader}><span style={S.cardHeaderLabel}>Export Results</span></div>
                <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button
                    style={savingSheet || sheetSaved ? { ...S.btnPrimaryDisabled } : { ...S.btnPrimary }}
                    onClick={handleSaveToSheet}
                    disabled={savingSheet || sheetSaved}
                  >
                    {savingSheet ? 'Writing…' : sheetSaved ? '✓ Written to Sheet' : '↑ Write to Sheet'}
                  </button>
                  {sheetMsg && (
                    <div style={{
                      fontSize: 11, padding: '6px 8px', borderRadius: 4,
                      background: sheetMsg.type === 'error' ? 'var(--err-bg)' : sheetMsg.type === 'success' ? ACCENT_LIGHT : 'var(--neutral-chip-bg)',
                      color: sheetMsg.type === 'error' ? 'var(--err-text)' : sheetMsg.type === 'success' ? 'var(--accent-strong)' : MUTED,
                      border: `1px solid ${sheetMsg.type === 'error' ? 'var(--err-border)' : sheetMsg.type === 'success' ? 'var(--accent-light-border)' : BORDER}`,
                    }}>{sheetMsg.text}</div>
                  )}
                  <button style={{ ...S.btnOutline, width: '100%', textAlign: 'center' }} onClick={handleDownloadTracker}>↓ Tracker CSV</button>
                  <button style={{ ...S.btnGhost, width: '100%', textAlign: 'center' }} onClick={handleDownloadPostLinks}>↓ Post Links CSV</button>
                  <button style={{ ...S.btnGhost, width: '100%', textAlign: 'center', borderColor: 'var(--err-strong)', color: 'var(--err-strong)' }} onClick={handleDownloadSalvage}>↓ Salvage Sequoias CSV</button>
                </div>
              </div>
            )}
          </aside>
          )}

          {/* MAIN */}
          <main style={S.mainContent}>

            {section === 'site' && trackerResults.length > 0 && (
              <div style={S.statsGrid}>
                {[
                  { label: 'Domains', value: trackerResults.length },
                  { label: 'Total WP Posts', value: trackerResults.reduce((a, r) => a + (parseInt(r.wpCount) || 0), 0).toLocaleString() },
                  { label: 'Sequoia Posts', value: postLinks.filter(l => l.taskType === 'Sequoia').length },
                  { label: 'Indexed Posts', value: postLinks.filter(l => l.indexStatus === 'Indexed').length },
                ].map((s, i) => (
                  <div key={i} style={S.statCard}>
                    <div style={S.statVal}>{s.value}</div>
                    <div style={S.statLabel}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {section === 'site' && runError && (
              <div style={{ background: 'var(--err-bg)', border: '1px solid var(--err-border)', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ color: 'var(--err-strong)', fontSize: 18, flexShrink: 0, lineHeight: 1 }}>&#9888;</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--err-strong)', fontSize: 13 }}>
                    Run stopped{runError.step ? ` — Step ${runError.step} failed` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--err-text)', marginTop: 2 }}>{runError.message}</div>
                </div>
                <button onClick={() => setRunError(null)} style={{ background: 'none', border: 'none', color: 'var(--err-strong)', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>&times;</button>
              </div>
            )}

            <div style={S.card}>
                {section === 'site' && (
                <div style={{ display: 'flex', borderBottom: `1px solid ${BORDER}`, background: BG_HEADER, padding: '0 14px' }}>
                  {[
                    { id: 'tracker', label: 'Results', count: trackerResults.length },
                    { id: 'postlinks', label: 'Post Links', count: postLinks.length },
                    { id: 'salvage', label: 'Salvage Sequoias', count: postLinks.filter(l => l.taskType === 'Sequoia' && l.indexStatus === 'Unindexed').length },
                    { id: 'log', label: 'Log', count: logs.filter(l => l.type === 'error').length || null },
                  ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      borderBottom: activeTab === tab.id ? `2px solid ${tab.id === 'salvage' ? 'var(--err-strong)' : ACCENT}` : '2px solid transparent',
                      color: activeTab === tab.id ? (tab.id === 'salvage' ? 'var(--err-strong)' : ACCENT) : MUTED,
                      fontWeight: 600, fontSize: 11,
                      letterSpacing: '0.06em', textTransform: 'uppercase',
                      padding: '10px 16px', marginBottom: -1, transition: 'all 0.15s',
                    }}>
                      {tab.label}{tab.count != null && <span style={{ opacity: 0.6 }}> ({tab.count})</span>}
                    </button>
                  ))}
                </div>
                )}

                <div style={section === 'site' ? S.tableWrap : {}}>

                  {/* TRACKER TABLE */}
                  {activeTab === 'tracker' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['#','Domain','Total Post','Total Indexed','Indexation %','Seq Total','Seq Indexed','Seq Indexation %','VB Total','VB Indexed','VB Indexation %','Combined Rate','Priority Score'].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {trackerResults.map((row, i) => {
                          const failed = row.failed;
                          // Failed sites: show the specific reason across the row
                          // instead of a clipped badge + a wall of dashes.
                          if (failed) {
                            return (
                            <tr key={i} style={{ opacity: 0.9 }}>
                              <td style={{ ...S.td, color: 'var(--muted-3)', fontSize: 11, width: 36 }}>{i+1}</td>
                              <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={row.domain}>
                                {row.domain}
                              </td>
                              <td colSpan={11} style={{ ...S.td, color: 'var(--err-strong)' }}>
                                <span style={{ fontSize: 10, color: 'var(--warn-text)', background: 'var(--warn-bg)', padding: '1px 6px', borderRadius: 3, fontWeight: 700, marginRight: 8 }}>FAILED</span>
                                {row.failReason || 'Unreachable'}
                              </td>
                            </tr>
                            );
                          }
                          return (
                          <tr key={i}>
                            <td style={{ ...S.td, color: 'var(--muted-3)', fontSize: 11, width: 36 }}>{i+1}</td>
                            <td style={{ ...S.td, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }} title={row.domain}>
                              {row.domain}
                            </td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.wpCount)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.serpCount)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: ACCENT }}>{fmt(row.rate, true)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.totalSequoia)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.indexedSequoia)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: 'var(--link)' }}>{fmt(row.seqRate, true)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.totalVideoBridge)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.indexedVideoBridge)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: 'var(--vb)' }}>{fmt(row.vbRate, true)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: 'var(--combined)' }}>{row.combinedRate != null ? `${(row.combinedRate * 100).toFixed(2)}%` : 'N/A'}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{row.priorityScore != null ? row.priorityScore : 'N/A'}</td>
                          </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* POST LINKS TABLE — A, B, C(PubDate), D(ExtLinks), E(TaskType), F(Status) */}
                  {activeTab === 'postlinks' && (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr>
                          {['#','Domain','Post Link','Pub Date','Ext. Links','Task Type','Index Status'].map(h => (
                            <th key={h} style={S.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {postLinks.map((row, i) => (
                          <tr key={i}>
                            <td style={{ ...S.td, color: 'var(--muted-3)', fontSize: 11, width: 36 }}>{i+1}</td>
                            <td style={{ ...S.td, fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.domain}</td>
                            <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <a href={row.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)', fontSize: 12 }}>{row.link}</a>
                            </td>
                            <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{row.pubDate || '—'}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.externalCount)}</td>
                            <td style={S.td}><Tag value={row.taskType} /></td>
                            <td style={S.td}><Tag value={row.indexStatus} /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* SALVAGE SEQUOIAS TABLE */}
                  {activeTab === 'salvage' && (() => {
                    const prioMap = {};
                    trackerResults.forEach(r => { prioMap[(r.domain || '').toLowerCase().trim()] = r.priorityScore; });
                    const salvage = postLinks.filter(l => l.taskType === 'Sequoia' && l.indexStatus === 'Unindexed');
                    return salvage.length === 0 ? (
                      <div style={{ padding: '48px 24px', textAlign: 'center', color: MUTED }}>
                        No Sequoia Unindexed posts found.
                      </div>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                        <thead>
                          <tr>
                            {['#','Domain','Post Link','Pub Date','Task Type','Index Status','Priority Score'].map(h => (
                              <th key={h} style={S.th}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {salvage.map((row, i) => {
                            const key = (row.domain || '').toLowerCase().trim();
                            return (
                              <tr key={i}>
                                <td style={{ ...S.td, color: 'var(--muted-3)', fontSize: 11, width: 36 }}>{i+1}</td>
                                <td style={{ ...S.td, fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.domain}</td>
                                <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <a href={row.link} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--link)', fontSize: 12 }}>{row.link}</a>
                                </td>
                                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>{row.pubDate || '—'}</td>
                                <td style={S.td}><Tag value={row.taskType} /></td>
                                <td style={S.td}><Tag value={row.indexStatus} /></td>
                                <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{prioMap[key] != null ? prioMap[key] : 'N/A'}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}

                  {/* DASHBOARD TAB */}
                  {activeTab === 'dashboard' && <DashboardV2 active={activeTab === 'dashboard'} />}

                  {/* AUTOMATION TAB — background runner control panel */}
                  {activeTab === 'automation' && <AutomationPanel active={activeTab === 'automation'} />}

                  {/* URL INDEX CHECKER TAB — kept mounted (hidden) so input/results persist across tab switches */}
                  <div style={{ display: activeTab === 'indexcheck' ? 'block' : 'none' }}>
                    <IndexChecker onCreditsLogged={refreshUsage} />
                  </div>

                  {/* USAGE TAB */}
                  {activeTab === 'usage' && (
                    <div style={{ padding: '16px 14px' }}>
                      {!usageData ? (
                        <div style={{ color: MUTED, fontSize: 13 }}>Loading…</div>
                      ) : (
                        <>
                          {(() => {
                            const last3 = (usageData.history || []).slice(0, 3);
                            const avg3 = last3.length ? Math.round(last3.reduce((a, m) => a + (m.total || 0), 0) / last3.length) : null;
                            const cur = usageData.current?.total ?? 0;
                            return (
                              <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                                <div style={{ ...S.statCard, minWidth: 210 }}>
                                  <div style={S.statVal}>{cur.toLocaleString()}</div>
                                  <div style={S.statLabel}>This Cycle So Far</div>
                                  <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>Live — updates as credits are used (auto-refreshes).</div>
                                </div>
                                <div style={{ ...S.statCard, minWidth: 210 }}>
                                  <div style={S.statVal}>{avg3 != null ? avg3.toLocaleString() : '—'}</div>
                                  <div style={S.statLabel}>Avg Credits / Cycle</div>
                                  <div style={{ fontSize: 11, color: MUTED, marginTop: 6 }}>
                                    {last3.length === 0
                                      ? 'Your typical spend — shows once your first cycle completes.'
                                      : last3.length < 3
                                        ? `Based on your last ${last3.length} completed cycle${last3.length === 1 ? '' : 's'} so far — builds to a rolling 3-cycle average.`
                                        : 'Rolling average of your last 3 completed cycles.'}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}

                          <div style={{ marginBottom: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 2 }}>
                              {usageData.current?.periodLabel || 'Current cycle'} — {usageData.current?.total ?? 0} credits used
                            </div>
                            <div style={{ fontSize: 11, color: MUTED, marginBottom: 8 }}>Billing cycle: 26th → 25th (PH time)</div>
                            {usageData.current?.runs?.length > 0 ? (
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr>
                                    {['Date', 'Time', 'Step 2 (domains)', 'Step 8 (posts)', 'URL checks', 'Total'].map((h, i) => (
                                      <th key={h} style={{ ...S.th, textAlign: i >= 2 ? 'center' : 'left' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {usageData.current.runs.map((run, i) => {
                                    const d = new Date(run.ts);
                                    return (
                                      <tr key={i}>
                                        <td style={S.td}>{d.toLocaleDateString()}</td>
                                        <td style={S.td}>{d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                                        <td style={{ ...S.td, textAlign: 'center' }}>{run.step2}</td>
                                        <td style={{ ...S.td, textAlign: 'center' }}>{run.step8}</td>
                                        <td style={{ ...S.td, textAlign: 'center' }}>{run.indexCheck ?? 0}</td>
                                        <td style={{ ...S.td, textAlign: 'center', fontWeight: 600 }}>{run.total}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            ) : (
                              <div style={{ color: MUTED, fontSize: 13 }}>No runs this cycle yet.</div>
                            )}
                          </div>

                          {usageData.history?.length > 0 && (
                            <>
                              <div style={{ fontSize: 13, fontWeight: 600, color: TEXT, marginBottom: 8, borderTop: `1px solid ${BORDER}`, paddingTop: 14 }}>Past Cycles</div>
                              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                                <thead>
                                  <tr>
                                    {['Cycle', 'Total Credits'].map((h, i) => (
                                      <th key={h} style={{ ...S.th, textAlign: i === 1 ? 'center' : 'left' }}>{h}</th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {usageData.history.map((row, i) => (
                                    <tr key={i}>
                                      <td style={S.td}>{row.label || row.month}</td>
                                      <td style={{ ...S.td, textAlign: 'center', fontWeight: 600 }}>{row.total}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}

                  {/* LOG TAB */}
                  {activeTab === 'log' && (
                    <div style={{ padding: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        {logs.length > 0 && <button style={S.btnGhost} onClick={() => setLogs([])}>Clear</button>}
                      </div>
                      <div style={{ ...S.logWrap, height: 340 }} ref={logRef}>
                        {logs.length === 0 && <div style={{ color: '#555' }}>Waiting to start…</div>}
                        {logs.map((log, i) => (
                          <div key={i} style={{ display: 'flex', gap: 14 }}>
                            <span style={{ color: '#555', flexShrink: 0, fontSize: 11 }}>{log.time}</span>
                            <span style={{ color: logColor(log.type) }}>{log.msg}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
            </div>

          </main>
        </div>
      </div>
    </>
  );
}
