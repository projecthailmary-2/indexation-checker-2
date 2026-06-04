// pages/api/index-check.js
// Standalone indexation checker — given URLs, checks each with the Google
// `site:` operator via SerpApi. Retries transient failures up to 3x and
// returns clear context for every outcome.

const SERPAPI_KEY = process.env.SERPAPI_KEY;
const MAX_ATTEMPTS = 3;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// One attempt. Returns { kind, detail, status? }:
//   kind 'indexed' | 'unindexed' — definitive
//   kind 'fatal'                 — stop the whole run (bad key / no credits)
//   kind 'retry'                 — transient; try again
async function checkOnce(url) {
  const apiUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(`site:${url}`)}&engine=google&api_key=${SERPAPI_KEY}`;

  let res;
  try {
    res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  } catch (e) {
    const reason = e?.name === 'TimeoutError' ? 'request timed out' : `network error${e?.message ? ` (${e.message})` : ''}`;
    return { kind: 'retry', detail: reason };
  }

  if (res.status === 429) return { kind: 'retry', detail: 'SerpApi rate-limited (HTTP 429)' };
  if (res.status >= 500) return { kind: 'retry', detail: `SerpApi server error (HTTP ${res.status})` };

  let json;
  try { json = await res.json(); }
  catch { return { kind: 'retry', detail: 'could not read SerpApi response' }; }

  if (json.error) {
    const e = String(json.error);
    const low = e.toLowerCase();
    if (low.includes("hasn't returned") || low.includes('did not return') || low.includes('no results')) {
      return { kind: 'unindexed', detail: 'no results — not found in Google’s index' };
    }
    if (low.includes('api_key') || low.includes('invalid api key')) {
      return { kind: 'fatal', status: 'Invalid Key', detail: 'SerpApi rejected the API key' };
    }
    if (low.includes('credits') || low.includes('run out') || low.includes('exceeded')) {
      return { kind: 'fatal', status: 'No Credits', detail: 'SerpApi account is out of credits' };
    }
    return { kind: 'retry', detail: `SerpApi: ${e}` };
  }

  const total = Number(json.search_information?.total_results) || 0;
  const organic = json.organic_results?.length || 0;
  if (total > 0 || organic > 0) {
    const n = total || organic;
    return { kind: 'indexed', detail: `${n.toLocaleString()} result${n === 1 ? '' : 's'} in Google` };
  }
  return { kind: 'unindexed', detail: 'no results — not found in Google’s index' };
}

// Up to MAX_ATTEMPTS, with backoff, until success or definitive failure.
async function checkUrl(url) {
  let last = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const r = await checkOnce(url);
    if (r.kind === 'indexed') return { url, status: 'Indexed', detail: r.detail, attempts: attempt };
    if (r.kind === 'unindexed') return { url, status: 'Unindexed', detail: r.detail, attempts: attempt };
    if (r.kind === 'fatal') return { url, status: r.status, detail: r.detail, attempts: attempt, fatal: true };
    last = r.detail;
    if (attempt < MAX_ATTEMPTS) await sleep(800 * attempt); // 0.8s, 1.6s backoff
  }
  return { url, status: 'Error', detail: `failed after ${MAX_ATTEMPTS} attempts — ${last}`, attempts: MAX_ATTEMPTS };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!SERPAPI_KEY) return res.status(500).json({ error: 'SERPAPI_KEY is not set on the server.' });

  const { urls } = req.body || {};
  if (!Array.isArray(urls) || urls.length === 0) return res.status(400).json({ error: 'No URLs provided.' });

  const results = [];
  let halt = null;
  for (const url of urls) {
    const r = await checkUrl(url);
    results.push(r);
    if (r.fatal) { halt = { status: r.status, detail: r.detail }; break; }
    await sleep(400 + Math.floor(Math.random() * 400)); // gentle pacing between URLs
  }

  return res.status(200).json({ results, halt });
}
