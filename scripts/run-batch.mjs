// scripts/run-batch.mjs
// Background audit runner. Pulls the next N least-recently-checked sites from
// the sheet, audits them, and writes results back in small chunks (so a crash
// loses almost nothing and the next run resumes automatically). Stops cleanly
// if SerpApi credits run out.
//
// Runs outside the browser and outside Vercel (e.g. GitHub Actions), so it has
// no function-timeout limit.
//
// Env:
//   BATCH_SIZE   how many sites to audit this run        (default 300)
//   CHUNK_SIZE   how many sites per incremental save      (default 25)
//   DRY_RUN=1    audit but DO NOT write to the sheet      (for safe testing)
//   plus the usual GOOGLE_* / SERPAPI_KEY credentials.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { auditDomain } from '../lib/audit.js';
import {
  sheetsConfigured, getTrackingSites,
  writeTrackingResults, appendIndexationHistory, appendSalvagePosts,
} from '../lib/sheets.js';
import { isEnabled, setStatus, getBatchSize } from '../lib/runnerState.js';
import { recordUsage } from '../lib/usage.js';

// Load .env.local for local runs (in CI the env is already populated).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2];
      if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
}

const CHUNK_SIZE = parseInt(process.env.CHUNK_SIZE, 10) || 25;
const DRY_RUN = process.env.DRY_RUN === '1' || process.env.DRY_RUN === 'true';

// How many sites THIS run should audit.
//  - An explicit env BATCH_SIZE (e.g. a manual "Run workflow" input) wins as an
//    absolute per-run override.
//  - Otherwise: take the app's "Sites per day" (KV) and split it across the
//    number of daily runs (RUNS_PER_DAY), so e.g. 600/day over 3 runs = 200 each.
//    Because we always audit oldest-first, the 3 runs naturally cover 600
//    distinct sites with no overlap.
async function resolveBatchSize() {
  const envN = parseInt(process.env.BATCH_SIZE, 10);
  if (Number.isFinite(envN) && envN > 0) return envN;
  const daily = (await getBatchSize()) || 300;
  const runsPerDay = parseInt(process.env.RUNS_PER_DAY, 10) || 1;
  return Math.max(1, Math.ceil(daily / runsPerDay));
}

const norm = s => String(s || '').trim().toLowerCase()
  .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

// Write one chunk's worth of results to the sheet (Tracker + History + Salvage).
async function saveChunk(rows, posts) {
  if (DRY_RUN) { log(`  (dry run) would save ${rows.length} sites, ${posts.length} posts`); return; }
  await writeTrackingResults(rows);
  try { await appendIndexationHistory(rows); } catch (e) { log(`  history append failed: ${e.message}`); }
  const prio = {};
  rows.forEach(r => { prio[norm(r.domain)] = r.priorityScore; });
  const salvage = posts
    .filter(p => p.taskType === 'Sequoia' && p.indexStatus === 'Unindexed')
    .map(p => ({ ...p, priorityScore: prio[norm(p.domain)] }));
  try { await appendSalvagePosts(salvage); } catch (e) { log(`  salvage append failed: ${e.message}`); }
}

async function main() {
  if (!sheetsConfigured()) {
    log('ERROR: Google Sheet not configured (need GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_SHEET_ID).');
    process.exit(1);
  }

  // Respect the app's On/Off switch (unless this is a dry test run).
  if (!DRY_RUN && !(await isEnabled())) {
    log('Automation is OFF (toggle it on in the app) — skipping this run.');
    await setStatus({ state: 'idle', lastSkippedAt: new Date().toISOString() });
    return;
  }

  const BATCH_SIZE = await resolveBatchSize();
  const FRESHNESS_DAYS = parseInt(process.env.FRESHNESS_DAYS, 10) || 0;
  log(`Starting batch: up to ${BATCH_SIZE} sites, saving every ${CHUNK_SIZE}${FRESHNESS_DAYS ? `, skipping sites checked in the last ${FRESHNESS_DAYS}d` : ''}${DRY_RUN ? ' (DRY RUN)' : ''}.`);
  const { domains, total, eligible } = await getTrackingSites({ limit: BATCH_SIZE, freshDays: FRESHNESS_DAYS });

  // Nothing stale enough to audit → the library is current; idle without spending.
  if (domains.length === 0) {
    log(`Nothing to audit — all ${total} sites already checked within the last ${FRESHNESS_DAYS} days. Idling.`);
    await setStatus({ state: 'idle', finishedAt: new Date().toISOString(), note: `all fresh (≤${FRESHNESS_DAYS}d) — nothing to do` });
    return;
  }

  log(`Pulled ${domains.length} of ${eligible} stale sites (of ${total} total).`);
  await setStatus({ state: 'running', startedAt: new Date().toISOString(), requested: domains.length, audited: 0, failed: 0, saved: 0, creditStop: null });

  const summary = { requested: domains.length, audited: 0, failed: 0, saved: 0, creditStop: null, failReasons: {}, searchCredits: 0, checkCredits: 0 };
  let rowBuf = [];
  let postBuf = [];

  const flush = async () => {
    if (!rowBuf.length) return;
    await saveChunk(rowBuf, postBuf);
    summary.saved += rowBuf.length;
    log(`  saved ${rowBuf.length} (running total ${summary.saved}).`);
    rowBuf = [];
    postBuf = [];
    await setStatus({ audited: summary.audited, failed: summary.failed, saved: summary.saved });
  };

  for (const domain of domains) {
    let res;
    try {
      res = await auditDomain(domain);
    } catch (e) {
      log(`  ${domain}: audit error (${e.message}) — skipping.`);
      continue;
    }
    // Tally SerpApi credits actually spent (counted even on a credit-stop, since
    // the calls before the quota hit were charged).
    summary.searchCredits += res.credits?.search || 0;
    summary.checkCredits += res.credits?.checks || 0;
    if (res.creditIssue) {
      summary.creditStop = res.creditIssue;
      log(`SerpApi blocked us (${res.creditIssue}) — stopping. Progress so far is safe.`);
      break;
    }
    rowBuf.push(res.row);
    postBuf.push(...res.posts);
    if (res.row.failed) {
      summary.failed++;
      const r = res.row.failReason || 'Unreachable';
      summary.failReasons[r] = (summary.failReasons[r] || 0) + 1;
    } else {
      summary.audited++;
    }
    if (rowBuf.length >= CHUNK_SIZE) {
      await flush();
      // Let the user stop the automation mid-run from the app — checked at
      // chunk boundaries so progress is always saved first.
      if (!DRY_RUN && !(await isEnabled())) {
        summary.stoppedByUser = true;
        log('Automation switched OFF mid-run — stopping cleanly. Progress is saved.');
        break;
      }
    }
  }
  await flush();

  // Record this run's SerpApi spend so it shows up in the app's Usage tab.
  if (!DRY_RUN) {
    try {
      await recordUsage({ step2: summary.searchCredits, step8: summary.checkCredits, source: 'automation' });
      log(`Logged usage: ${summary.searchCredits} searches + ${summary.checkCredits} index checks = ${summary.searchCredits + summary.checkCredits} credits.`);
    } catch (e) {
      log(`usage log failed: ${e.message}`);
    }
  } else {
    log(`(dry run) would log usage: ${summary.searchCredits} searches + ${summary.checkCredits} index checks.`);
  }

  await setStatus({ state: 'idle', finishedAt: new Date().toISOString(), lastRun: summary });

  log('--- DONE ---');
  log(JSON.stringify(summary, null, 2));
  // Surface a one-line result for the workflow to forward to Slack later.
  console.log(`RESULT: audited ${summary.audited}, failed ${summary.failed}, saved ${summary.saved}` +
    (summary.creditStop ? `, STOPPED (${summary.creditStop})` : '') +
    (summary.stoppedByUser ? ', STOPPED (by user)' : '') + '.');
}

main().catch(async (e) => {
  console.error('Runner crashed:', e);
  // Don't leave the status stuck on "running" — mark idle so the app unlocks.
  try { await setStatus({ state: 'idle', finishedAt: new Date().toISOString(), note: `crashed: ${e.message}` }); } catch {}
  process.exit(1);
});
