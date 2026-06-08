import { useState, useRef, useEffect, useCallback } from 'react';
import Head from 'next/head';

const ACCENT = '#95A940';
const ACCENT_HOVER = '#7d8f35';
const ACCENT_LIGHT = '#f0f4e4';
const BORDER = '#e2e4da';
const BG_PAGE = '#f0f0ec';
const BG_CARD = '#ffffff';
const BG_HEADER = '#f7f7f4';
const TEXT = '#1a1a1a';
const MUTED = '#6b7068';

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
  { id: 'usage', label: 'Usage' },
];
const SECTION_TABS = {
  site: ['tracker', 'postlinks', 'salvage', 'log'],
  url: ['indexcheck'],
  usage: ['usage'],
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
  btnPrimaryDisabled: { background: '#c8d9a0', color: '#fff', fontWeight: 600, padding: '11px 18px', border: 'none', borderRadius: 6, cursor: 'not-allowed', fontSize: 14, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 },
  btnOutline: { background: '#fff', color: ACCENT, fontWeight: 500, padding: '7px 14px', border: `1.5px solid ${ACCENT}`, borderRadius: 6, cursor: 'pointer', fontSize: 12, whiteSpace: 'nowrap' },
  btnGhost: { background: 'transparent', color: MUTED, fontWeight: 500, padding: '5px 10px', border: `1px solid ${BORDER}`, borderRadius: 5, cursor: 'pointer', fontSize: 11 },
  badge: { fontSize: 11, fontWeight: 600, background: ACCENT_LIGHT, color: '#4a5520', padding: '2px 8px', borderRadius: 99 },
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
  td: { padding: '9px 12px', borderBottom: `1px solid #f0f0ee`, verticalAlign: 'middle', color: TEXT, fontSize: 13 },
};

async function apiFetch(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Server error at ${path}: ${res.status} ${res.statusText}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error);
  return json;
}

function fmt(val, isRate = false) {
  if (val === null || val === undefined || val === '') return '—';
  if (isRate) return `${(val * 100).toFixed(1)}%`;
  return val;
}

function Tag({ value }) {
  if (!value) return <span style={{ color: '#aaa' }}>—</span>;
  const styles = {
    'Indexed': { background: '#eaf3de', color: '#27500a' },
    'Unindexed': { background: '#fcebeb', color: '#791f1f' },
    'Skip': { background: '#f5f5f4', color: '#888' },
    'Sequoia': { background: '#eff6ff', color: '#1d4ed8' },
    'Video Bridge': { background: '#faeeda', color: '#633806' },
    'Others': { background: '#f5f5f4', color: '#888' },
    'Invalid Key': { background: '#fcebeb', color: '#791f1f' },
    'No Credits': { background: '#fcebeb', color: '#791f1f' },
    'Conn. Error': { background: '#fef9c3', color: '#854d0e' },
    'Error': { background: '#fef9c3', color: '#854d0e' },
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

// Standalone URL indexation checker — paste URLs, check each via the Google
// site: operator (3 attempts each), copy/paste the results out.
function IndexChecker({ onCreditsLogged }) {
  const [input, setInput] = useState('');
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const labelStyle = { fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: MUTED, marginBottom: 4, display: 'block' };
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
          <span style={labelStyle}>URLs to check (one per line)</span>
          <textarea
            style={{ ...S.textarea, height: 260 }}
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={running}
            placeholder={'https://example.com/post-1\nexample.com/post-2'}
          />
          <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>
            {urls.length} URL{urls.length === 1 ? '' : 's'} · checked with Google’s site: operator · up to 3 tries each.
          </div>
          <button
            style={{ ...(running || !urls.length ? S.btnPrimaryDisabled : S.btnPrimary), marginTop: 10 }}
            onClick={run} disabled={running || !urls.length}
          >
            {running ? `Checking ${progress.done}/${progress.total}…` : '▶ Check Indexation'}
          </button>
          {error && (
            <div style={{ marginTop: 8, fontSize: 12, background: '#fef2f2', border: '1px solid #fca5a5', color: '#7f1d1d', borderRadius: 6, padding: '8px 10px' }}>{error}</div>
          )}
        </div>

        {/* Results */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <span style={{ ...S.badge, background: '#eaf3de', color: '#27500a' }}>Indexed {counts.indexed}</span>
              <span style={{ ...S.badge, background: '#fcebeb', color: '#791f1f' }}>Unindexed {counts.unindexed}</span>
              {counts.errors > 0 && <span style={{ ...S.badge, background: '#fef9c3', color: '#854d0e' }}>Errors {counts.errors}</span>}
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
                      <td style={{ ...S.td, color: '#bbb', fontSize: 11, width: 36 }}>{i + 1}</td>
                      <td style={{ ...S.td, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <a href={r.url.startsWith('http') ? r.url : `https://${r.url}`} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 12 }}>{r.url}</a>
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
  const logRef = useRef(null);

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
    if (status === 'active') return { width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', border: '1.5px solid #f59e0b', flexShrink: 0 };
    return { width: 8, height: 8, borderRadius: '50%', background: BORDER, border: `1.5px solid #ccc`, flexShrink: 0 };
  }

  function stepLabelStyle(status) {
    if (status === 'done') return { fontSize: 12, color: '#4a5520' };
    if (status === 'active') return { fontSize: 12, color: '#b45309', fontWeight: 500 };
    return { fontSize: 12, color: MUTED };
  }

  function logColor(type) {
    if (type === 'success') return '#95A940';
    if (type === 'error') return '#f87171';
    if (type === 'step') return '#7dd3fc';
    return '#aaa';
  }

  // Download Tracker CSV
  function handleDownloadTracker() {
    const headers = ['Domain','Total Post','Total Indexed','Indexation %','Seq Total','Seq Indexed','Seq Indexation %','VB Total','VB Indexed','VB Indexation %','Combined Rate','Priority Score'];
    const rows = trackerResults.map(r => [
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

  async function runAutomation() {
    if (!parsedDomains.length || invalidDomains.length > 0) return;
    setRunning(true);
    setRunError(null);
    setLogs([]);
    setTrackerResults([]);
    setPostLinks([]);
    setStepStatuses({});
    setCurrentStep(0);

    let tracker = parsedDomains.map(d => ({ domain: d }));
    let links = [];
    let serpApiErrorSet = false;
    let step2Credits = 0;
    let step8Credits = 0;

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
        step2Credits = r13.results.length;
        tracker = tracker.map((row, i) => ({ ...row, ...r13.results[i] }));
        setTrackerResults([...tracker]);
        addLog(`Steps 1–3 complete — ${r13.results.length} domains processed.`, 'success');
        [1,2,3].forEach(s => setStepStatus(s, 'done'));
      }

      // Steps 4–7
      addLog('Starting Steps 4–7: Post links, pub dates, external links, task types…', 'step');
      [4,5,6,7].forEach(s => setStepStatus(s, 'active'));
      setCurrentStep(4);

      const r47 = await apiFetch('/api/steps/step4-7', { domains: parsedDomains });

      if (r47.trackerResults && r47.postLinks) {
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

      addLog('All steps complete! Download your results below.', 'success');
      setCurrentStep(12);

    } catch (err) {
      addLog(`Error: ${err.message}`, 'error');
      if (!serpApiErrorSet) setRunError({ message: err.message });
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
                <button style={S.btnOutline} onClick={handleDownloadTracker}>↓ Tracker CSV</button>
                <button style={S.btnOutline} onClick={handleDownloadPostLinks}>↓ Post Links CSV</button>
                <button style={{ ...S.btnOutline, borderColor: '#dc2626', color: '#dc2626' }} onClick={handleDownloadSalvage}>↓ Salvage Sequoias</button>
              </>
            )}
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

          {/* SIDEBAR — only for the Site Indexation Checker (others have their own / no input) */}
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
                <div style={{ fontSize: 11, color: '#aaa', marginTop: 6 }}>One domain per line. http:// optional.</div>
                {invalidDomains.length > 0 && (
                  <div style={{ fontSize: 11, color: '#b45309', marginTop: 6, background: '#fef9c3', padding: '6px 8px', borderRadius: 4, border: '1px solid #fde68a' }}>
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
                  <div style={{ fontSize: 12, color: '#aaa' }}>Loading…</div>
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
                    <div key={step.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', borderBottom: `1px solid #f0f0ee` }}>
                      <div style={stepDotStyle(stepStatuses[step.id])} />
                      <span style={stepLabelStyle(stepStatuses[step.id])}>
                        {step.id}. {step.label}
                        {step.note && <span style={{ color: '#bbb', marginLeft: 4, fontSize: 10 }}>({step.note})</span>}
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
                  <button style={{ ...S.btnOutline, width: '100%', textAlign: 'center' }} onClick={handleDownloadTracker}>↓ Tracker CSV</button>
                  <button style={{ ...S.btnGhost, width: '100%', textAlign: 'center' }} onClick={handleDownloadPostLinks}>↓ Post Links CSV</button>
                  <button style={{ ...S.btnGhost, width: '100%', textAlign: 'center', borderColor: '#dc2626', color: '#dc2626' }} onClick={handleDownloadSalvage}>↓ Salvage Sequoias CSV</button>
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
              <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 8, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 12 }}>
                <span style={{ color: '#dc2626', fontSize: 18, flexShrink: 0, lineHeight: 1 }}>&#9888;</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#dc2626', fontSize: 13 }}>
                    Run stopped{runError.step ? ` — Step ${runError.step} failed` : ''}
                  </div>
                  <div style={{ fontSize: 12, color: '#7f1d1d', marginTop: 2 }}>{runError.message}</div>
                </div>
                <button onClick={() => setRunError(null)} style={{ background: 'none', border: 'none', color: '#b91c1c', cursor: 'pointer', fontSize: 20, padding: 0, lineHeight: 1 }}>&times;</button>
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
                      borderBottom: activeTab === tab.id ? `2px solid ${tab.id === 'salvage' ? '#dc2626' : ACCENT}` : '2px solid transparent',
                      color: activeTab === tab.id ? (tab.id === 'salvage' ? '#dc2626' : ACCENT) : MUTED,
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
                        {trackerResults.map((row, i) => (
                          <tr key={i}>
                            <td style={{ ...S.td, color: '#bbb', fontSize: 11, width: 36 }}>{i+1}</td>
                            <td style={{ ...S.td, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>{row.domain}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.wpCount)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.serpCount)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: ACCENT }}>{fmt(row.rate, true)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.totalSequoia)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.indexedSequoia)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#2563eb' }}>{fmt(row.seqRate, true)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.totalVideoBridge)}</td>
                            <td style={{ ...S.td, textAlign: 'right' }}>{fmt(row.indexedVideoBridge)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#c2410c' }}>{fmt(row.vbRate, true)}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 600, color: '#7c3aed' }}>{row.combinedRate != null ? `${(row.combinedRate * 100).toFixed(2)}%` : 'N/A'}</td>
                            <td style={{ ...S.td, textAlign: 'right', fontWeight: 700 }}>{row.priorityScore != null ? row.priorityScore : 'N/A'}</td>
                          </tr>
                        ))}
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
                            <td style={{ ...S.td, color: '#bbb', fontSize: 11, width: 36 }}>{i+1}</td>
                            <td style={{ ...S.td, fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.domain}</td>
                            <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              <a href={row.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 12 }}>{row.link}</a>
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
                                <td style={{ ...S.td, color: '#bbb', fontSize: 11, width: 36 }}>{i+1}</td>
                                <td style={{ ...S.td, fontSize: 12, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.domain}</td>
                                <td style={{ ...S.td, maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <a href={row.link} target="_blank" rel="noopener noreferrer" style={{ color: '#2563eb', fontSize: 12 }}>{row.link}</a>
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
