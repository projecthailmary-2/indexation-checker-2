// pages/api/usage.js
// GET  — returns current month data + monthly history
// POST — records a completed run's credit usage

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

function monthKey(date = new Date()) {
  return `usage:${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export default async function handler(req, res) {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) {
    return res.status(500).json({ error: 'Missing KV_REST_API_URL or KV_REST_API_TOKEN env vars' });
  }

  if (req.method === 'GET') {
    const current = await redis.get(monthKey()) || { total: 0, runs: [] };

    const allKeys = await redis.keys('usage:*');
    const pastKeys = allKeys.filter(k => k !== monthKey()).sort().reverse();
    const pastData = await Promise.all(
      pastKeys.map(async k => ({
        month: k.replace('usage:', ''),
        total: (await redis.get(k))?.total || 0,
      }))
    );

    return res.status(200).json({ current, history: pastData });
  }

  if (req.method === 'POST') {
    const { step2Credits = 0, step8Credits = 0 } = req.body;
    const runTotal = step2Credits + step8Credits;
    if (runTotal === 0) return res.status(200).json({ ok: true });

    const key = monthKey();
    const existing = await redis.get(key) || { total: 0, runs: [] };
    const updated = {
      total: existing.total + runTotal,
      runs: [
        { ts: new Date().toISOString(), step2: step2Credits, step8: step8Credits, total: runTotal },
        ...existing.runs,
      ],
    };
    await redis.set(key, updated);
    return res.status(200).json({ ok: true, ...updated });
  }

  return res.status(405).end();
}
