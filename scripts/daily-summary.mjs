// scripts/daily-summary.mjs
// Posts a nightly indexation summary to Slack: progress + audited/failed +
// current Site/Sequoia/VB indexation rates. Scheduled for 10pm Manila via
// .github/workflows/daily-summary.yml, and runnable on demand (workflow_dispatch).
// Independent of the failure/credit alerts in audit.yml.

import { readTab, getTrackingSites, normDomain } from '../lib/sheets.js';

const HISTORY_TAB = process.env.GOOGLE_HISTORY_TAB || 'Indexation History';
const WEBHOOK = process.env.SLACK_WEBHOOK_URL;
const num = v => { const n = Number(String(v).replace(/[, ]/g, '')); return Number.isFinite(n) ? n : 0; };
const pct = (i, t) => (t > 0 ? (i / t * 100).toFixed(1) + '%' : 'n/a');

// Header label in Manila time (e.g. "Thu, July 2, 2026").
function phLabel(d = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' }).format(d);
}

async function main() {
  if (!WEBHOOK) { console.log('No SLACK_WEBHOOK_URL configured — skipping.'); return; }

  const rows = await readTab(HISTORY_TAB);
  let auditableTotal = 2734;
  try { auditableTotal = (await getTrackingSites({ limit: 0 })).auditableTotal || auditableTotal; } catch { /* fall back */ }

  // "Audited today" = rows stamped with today's date (the runner writes dates in
  // the action's UTC clock, so match that here).
  const t = new Date();
  const todayStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  const auditedToday = rows.filter(r => String(r['Date']).trim() === todayStr).length;

  // Dedupe to the latest row per domain for the standing totals/rates.
  const latest = new Map();
  for (const r of rows) {
    const dom = normDomain(r['Domain']); if (!dom) continue;
    const cur = latest.get(dom);
    if (!cur || new Date(r['Date']) >= new Date(cur['Date'])) latest.set(dom, r);
  }

  let ok = 0, failed = 0, siteT = 0, siteI = 0, seqT = 0, seqI = 0, vbT = 0, vbI = 0;
  for (const r of latest.values()) {
    if (String(r['Status'] || '').toUpperCase() === 'OK') {
      ok++;
      // Clamp site-wide indexed at the post count — the `site:` estimate can
      // return a garbage value (billions) that otherwise breaks the pooled rate.
      const post = num(r['Total Post']);
      siteT += post; siteI += Math.min(num(r['Total Indexed']), post);
      seqT += num(r['Seq Total']); seqI += num(r['Seq Indexed']);
      vbT += num(r['VB Total']); vbI += num(r['VB Indexed']);
    } else failed++;
  }
  const done = ok + failed;
  const prog = auditableTotal > 0 ? Math.round(done / auditableTotal * 100) : 0;

  const text =
`*Indexation Audit — Daily Summary*
${phLabel()} · 10:00 PM PH

*Progress:* ${done.toLocaleString()} of ${auditableTotal.toLocaleString()} sites (*${prog}%*)
• Audited today: *${auditedToday.toLocaleString()}*
• Total: *${ok.toLocaleString()}* audited · *${failed.toLocaleString()}* failed

*Current indexation rates*
• Site: *${pct(siteI, siteT)}*
• Sequoia: *${pct(seqI, seqT)}*  (${seqI.toLocaleString()} / ${seqT.toLocaleString()})
• Video Bridge: *${pct(vbI, vbT)}*  (${vbI.toLocaleString()} / ${vbT.toLocaleString()})`;

  const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ text }) });
  console.log('Posted to Slack:', res.status, res.statusText);
  if (!res.ok) process.exit(1);
}

main().catch(e => { console.error('Daily summary failed:', e); process.exit(1); });
