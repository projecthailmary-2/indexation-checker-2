// pages/api/usage.js
// Tracks SerpApi credit usage by BILLING CYCLE, not calendar month.
// A cycle runs from the 26th of one month through the 25th of the next,
// in Philippines time (Asia/Manila) — matching when the SerpApi plan renews.
// GET  — returns the current cycle + past cycles (most recent first)
// POST — records a completed run's credit usage into the current cycle

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

const CYCLE_START_DAY = 26;

// Year / month (1-12) / day as seen in Philippines time.
function phParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric',
  });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day };
}

// Storage key for the billing cycle a date falls into, named by its START month.
function cycleKey(date = new Date()) {
  let { year, month, day } = phParts(date);
  let m0 = month - 1; // 0-11
  if (day < CYCLE_START_DAY) { m0 -= 1; if (m0 < 0) { m0 = 11; year -= 1; } }
  return `cycle:${year}-${String(m0 + 1).padStart(2, '0')}`;
}

// Human label for a cycle key, e.g. "May 26 – Jun 25, 2026".
function cycleLabel(key) {
  const [y, m] = key.replace('cycle:', '').split('-').map(Number); // m = 1-12
  const start = new Date(Date.UTC(y, m - 1, CYCLE_START_DAY));
  const end = new Date(Date.UTC(y, m, CYCLE_START_DAY - 1));
  const fmt = d => `${d.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${d.getUTCDate()}`;
  return `${fmt(start)} – ${fmt(end)}, ${end.getUTCFullYear()}`;
}

// One-time, idempotent migration: take every run recorded under the old
// calendar-month keys (usage:*) and re-file it into the correct billing-cycle
// key (cycle:*) by its own timestamp, so no recorded usage is ever lost.
// Safe to run more than once (runs are de-duplicated by timestamp).
async function migrateLegacy() {
  const legacyKeys = await redis.keys('usage:*');
  if (!legacyKeys.length) return;

  const buckets = {}; // cycleKey -> runs[]
  for (const lk of legacyKeys) {
    const rec = await redis.get(lk);
    for (const run of (rec?.runs || [])) {
      if (!run?.ts) continue;
      const total = run.total ?? ((run.step2 || 0) + (run.step8 || 0) + (run.indexCheck || 0));
      const ck = cycleKey(new Date(run.ts));
      (buckets[ck] ||= []).push({ ...run, total });
    }
  }

  for (const [ck, runs] of Object.entries(buckets)) {
    const existing = await redis.get(ck) || { total: 0, runs: [] };
    const seen = new Set(existing.runs.map(r => r.ts));
    const newRuns = runs.filter(r => !seen.has(r.ts));
    if (!newRuns.length) continue;
    const allRuns = [...existing.runs, ...newRuns].sort((a, b) => new Date(b.ts) - new Date(a.ts));
    const total = allRuns.reduce((a, r) => a + (r.total || 0), 0);
    await redis.set(ck, { total, runs: allRuns });
  }
}

export default async function handler(req, res) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Missing KV_REST_API_URL or KV_REST_API_TOKEN env vars' });
  }

  if (req.method === 'GET') {
    // Auto-migrate legacy calendar-month data into cycles, once.
    if (!(await redis.get('cycle:migrated'))) {
      await migrateLegacy();
      await redis.set('cycle:migrated', true);
    }

    const key = cycleKey();
    const cur = await redis.get(key) || { total: 0, runs: [] };
    const current = { ...cur, periodLabel: cycleLabel(key) };

    const allKeys = await redis.keys('cycle:*');
    const pastKeys = allKeys.filter(k => k !== key).sort().reverse();
    const history = await Promise.all(
      pastKeys.map(async k => ({
        key: k.replace('cycle:', ''),
        label: cycleLabel(k),
        total: (await redis.get(k))?.total || 0,
      }))
    );

    return res.status(200).json({ current, history });
  }

  if (req.method === 'POST') {
    const { step2Credits = 0, step8Credits = 0, indexCheckCredits = 0 } = req.body;
    const runTotal = step2Credits + step8Credits + indexCheckCredits;
    if (runTotal === 0) return res.status(200).json({ ok: true });

    const key = cycleKey();
    const existing = await redis.get(key) || { total: 0, runs: [] };
    const updated = {
      total: existing.total + runTotal,
      runs: [
        { ts: new Date().toISOString(), step2: step2Credits, step8: step8Credits, indexCheck: indexCheckCredits, total: runTotal },
        ...existing.runs,
      ],
    };
    await redis.set(key, updated);
    return res.status(200).json({ ok: true, ...updated });
  }

  return res.status(405).end();
}
