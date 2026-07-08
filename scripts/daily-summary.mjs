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
  let auditableTotal = 2734, allow = null;
  try { const t = await getTrackingSites({ limit: 0 }); auditableTotal = t.auditableTotal || auditableTotal; allow = new Set(t.auditableDomains || []); } catch { /* fall back */ }
  const inScope = dom => !allow || !allow.size || allow.has(dom); // only auditable sites (matches the dashboard)

  // "Audited today" = rows stamped with today's date (runner uses the action's
  // UTC clock, so match that here).
  const t = new Date();
  const todayStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  const auditedToday = rows.filter(r => String(r['Date']).trim() === todayStr && inScope(normDomain(r['Domain']))).length;

  // Progress = THIS WEEK's re-audit, not "ever audited" (which stays 100% once a
  // full pass has run). The Monday pass kicks off at the Sunday-22:00-UTC cron,
  // so "this week" = audits from the most recent Sunday onward.
  const weekStart = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate() - t.getUTCDay()));
  const weekLatest = new Map(); // auditable domain -> its latest row THIS WEEK
  for (const r of rows) {
    const dom = normDomain(r['Domain']); if (!dom || !inScope(dom)) continue;
    const d = new Date(r['Date']); if (isNaN(d.getTime()) || d < weekStart) continue;
    const cur = weekLatest.get(dom);
    if (!cur || new Date(r['Date']) >= new Date(cur['Date'])) weekLatest.set(dom, r);
  }
  let wkOk = 0, wkFailed = 0;
  for (const r of weekLatest.values()) { if (String(r['Status'] || '').toUpperCase() === 'OK') wkOk++; else wkFailed++; }
  const doneThisWeek = wkOk + wkFailed;
  const prog = auditableTotal > 0 ? Math.round(doneThisWeek / auditableTotal * 100) : 0;

  // Rates are library-wide: the latest row per domain across ALL history (the
  // current state of every site), not just this week's slice — which would be a
  // tiny, noisy sample early in a pass.
  const latest = new Map();
  for (const r of rows) {
    const dom = normDomain(r['Domain']); if (!dom || !inScope(dom)) continue;
    const cur = latest.get(dom);
    if (!cur || new Date(r['Date']) >= new Date(cur['Date'])) latest.set(dom, r);
  }
  let siteT = 0, siteI = 0, seqT = 0, seqI = 0, vbT = 0, vbI = 0;
  for (const r of latest.values()) {
    if (String(r['Status'] || '').toUpperCase() === 'OK') {
      // Clamp site-wide indexed at the post count — the `site:` estimate can
      // return a garbage value (billions) that otherwise breaks the pooled rate.
      const post = num(r['Total Post']);
      siteT += post; siteI += Math.min(num(r['Total Indexed']), post);
      seqT += num(r['Seq Total']); seqI += num(r['Seq Indexed']);
      vbT += num(r['VB Total']); vbI += num(r['VB Indexed']);
    }
  }

  const text =
`*Indexation Audit — Daily Summary*
${phLabel()} · 10:00 PM PH

*Re-audited this week:* ${doneThisWeek.toLocaleString()} of ${auditableTotal.toLocaleString()} sites (*${prog}%*)
• Audited today: *${auditedToday.toLocaleString()}*
• This week: *${wkOk.toLocaleString()}* ok · *${wkFailed.toLocaleString()}* failed

*Current indexation rates (library-wide)*
• Site: *${pct(siteI, siteT)}*
• Sequoia: *${pct(seqI, seqT)}*  (${seqI.toLocaleString()} / ${seqT.toLocaleString()})
• Video Bridge: *${pct(vbI, vbT)}*  (${vbI.toLocaleString()} / ${vbT.toLocaleString()})`;

  const res = await fetch(WEBHOOK, { method: 'POST', headers: { 'Content-type': 'application/json' }, body: JSON.stringify({ text }) });
  console.log('Posted to Slack:', res.status, res.statusText);
  if (!res.ok) process.exit(1);
}

main().catch(e => { console.error('Daily summary failed:', e); process.exit(1); });
