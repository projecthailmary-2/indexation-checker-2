// lib/usage.js
// Records SerpApi credit usage into the same billing-cycle storage the Usage
// tab reads (cycle = 27th → 26th, Asia/Manila). Used by the background runner so
// automated audits show up in the Usage tab alongside manual runs.
// NOTE: cycleKey() here must stay identical to the one in pages/api/usage.js.

import { Redis } from '@upstash/redis';

const CYCLE_START_DAY = 27;

function phParts(date = new Date()) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', year: 'numeric', month: 'numeric', day: 'numeric' });
  const p = Object.fromEntries(f.formatToParts(date).map(x => [x.type, x.value]));
  return { year: +p.year, month: +p.month, day: +p.day };
}

export function cycleKey(date = new Date()) {
  let { year, month, day } = phParts(date);
  let m0 = month - 1; // 0-11
  if (day < CYCLE_START_DAY) { m0 -= 1; if (m0 < 0) { m0 = 11; year -= 1; } }
  return `cycle:${year}-${String(m0 + 1).padStart(2, '0')}`;
}

function client() {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return null;
  return new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN });
}

// Add a run's credits to the current cycle (same shape as pages/api/usage.js).
// step2 = site: searches, step8 = post indexation checks. No-op if KV absent.
export async function recordUsage({ step2 = 0, step8 = 0, indexCheck = 0, source = '' } = {}) {
  const r = client();
  if (!r) return;
  const total = step2 + step8 + indexCheck;
  if (total <= 0) return;
  const key = cycleKey();
  const existing = (await r.get(key)) || { total: 0, runs: [] };
  await r.set(key, {
    total: existing.total + total,
    runs: [{ ts: new Date().toISOString(), step2, step8, indexCheck, total, source }, ...existing.runs],
  });
}
