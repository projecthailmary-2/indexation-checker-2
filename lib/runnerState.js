// lib/runnerState.js
// On/Off flag + live status for the background audit runner, stored in Upstash
// (the same KV the app already uses). This is what lets the app start/stop the
// automation and show its status — the runner reads the flag and writes status;
// the app writes the flag and reads status.
//
// Degrades gracefully when KV isn't configured (local dev / dry runs): the
// runner is treated as enabled and status writes are skipped, so nothing breaks.

import { Redis } from '@upstash/redis';

let _redis;
function client() {
  if (_redis !== undefined) return _redis;
  _redis = (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    ? new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN })
    : null;
  return _redis;
}

const ENABLED_KEY = 'runner:enabled';
const STATUS_KEY = 'runner:status';
const BATCH_SIZE_KEY = 'runner:batchSize';

export function kvConfigured() { return Boolean(client()); }

// Is the automation switched on? Defaults OFF when the flag was never set, so
// it never runs until someone explicitly turns it on in the app. When KV isn't
// configured at all (local/test), returns true so dry runs aren't blocked.
export async function isEnabled() {
  const r = client();
  if (!r) return true;
  const v = await r.get(ENABLED_KEY);
  return v === true || v === 'true' || v === 1;
}

export async function setEnabled(on) {
  const r = client();
  if (!r) return false;
  await r.set(ENABLED_KEY, !!on);
  return true;
}

// How many sites to audit per daily run. Returns null when unset (caller
// falls back to a default), or when KV isn't configured.
export async function getBatchSize() {
  const r = client();
  if (!r) return null;
  const n = parseInt(await r.get(BATCH_SIZE_KEY), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function setBatchSize(n) {
  const r = client();
  if (!r) return false;
  const v = parseInt(n, 10);
  if (!Number.isFinite(v) || v <= 0) throw new Error('Sites per day must be a positive whole number.');
  await r.set(BATCH_SIZE_KEY, v);
  return true;
}

export async function getStatus() {
  const r = client();
  if (!r) return null;
  return (await r.get(STATUS_KEY)) || null;
}

// Merge a partial update into the status object (always stamps updatedAt).
export async function setStatus(patch) {
  const r = client();
  if (!r) return;
  const cur = (await r.get(STATUS_KEY)) || {};
  await r.set(STATUS_KEY, { ...cur, ...patch, updatedAt: new Date().toISOString() });
}
