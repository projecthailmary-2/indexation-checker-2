// lib/sheets.js
// Google Sheets helper — authenticates as a service account and reads/writes
// the shared spreadsheet that acts as our database.
//
// Required env vars:
//   GOOGLE_SERVICE_ACCOUNT_EMAIL  — the service account's email
//   GOOGLE_PRIVATE_KEY            — the service account's private key (with \n escaped)
//   GOOGLE_SHEET_ID              — the spreadsheet ID (from its URL)

import { JWT } from 'google-auth-library';

// Tab names are kept space-free so they never need quoting in A1 ranges.
export const TRACKER_TAB = 'Tracker';
export const POSTLINKS_TAB = 'PostLinks';

export const TRACKER_HEADERS = [
  'RunID', 'Run Date', 'Domain', 'Total Post', 'Total Indexed', 'Indexation %',
  'Seq Total', 'Seq Indexed', 'Seq Indexation %',
  'VB Total', 'VB Indexed', 'VB Indexation %',
  'Combined Rate', 'Priority Score',
];

export const POSTLINKS_HEADERS = [
  'RunID', 'Run Date', 'Domain', 'Post Link', 'Pub Date',
  'External Links', 'Task Type', 'Index Status',
];

export function sheetsConfigured() {
  return Boolean(
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
    process.env.GOOGLE_PRIVATE_KEY &&
    process.env.GOOGLE_SHEET_ID
  );
}

const SHEET_ID = () => process.env.GOOGLE_SHEET_ID;
const BASE = () => `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID()}`;

function getClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  // Env vars store newlines as the literal characters "\n"; restore them.
  const key = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  return new JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
}

// One client per server instance is fine; the library refreshes tokens itself.
let _client = null;
function client() {
  if (!_client) _client = getClient();
  return _client;
}

// Google's Sheets API occasionally returns a transient 5xx ("Internal error
// encountered.") or rate-limits with 429. Those are not real failures — the
// fix Google itself recommends is to wait and retry with exponential backoff.
// Without this, a single momentary hiccup from Google crashes the whole run.
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function isTransient(err) {
  const status = err?.status ?? err?.response?.status ?? err?.code;
  if (RETRY_STATUSES.has(Number(status))) return true;
  // Network-level blips (socket hang up, reset, timeout) are also worth retrying.
  const code = err?.code;
  return code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ECONNABORTED' || code === 'EAI_AGAIN';
}

async function api(path, method = 'GET', data = undefined) {
  const MAX_ATTEMPTS = 5;
  let attempt = 0;
  while (true) {
    try {
      const res = await client().request({ url: `${BASE()}${path}`, method, data });
      return res.data;
    } catch (err) {
      attempt++;
      if (attempt >= MAX_ATTEMPTS || !isTransient(err)) throw err;
      // Exponential backoff with jitter: ~1s, 2s, 4s, 8s (+ up to 1s random).
      const wait = Math.round(1000 * 2 ** (attempt - 1) + Math.random() * 1000);
      const status = err?.status ?? err?.response?.status ?? err?.code;
      console.warn(`[sheets] transient error (${status}) on ${method} ${path} — retry ${attempt}/${MAX_ATTEMPTS - 1} in ${wait}ms`);
      await sleep(wait);
    }
  }
}

// Return the set of existing tab titles in the spreadsheet.
async function getTabTitles() {
  const meta = await api('?fields=sheets.properties.title');
  return new Set((meta.sheets || []).map(s => s.properties.title));
}

// Create a tab with a header row if it doesn't already exist.
// Tolerant of races: if another request created the tab first, we ignore the error.
async function ensureTab(title, headers) {
  const titles = await getTabTitles();
  if (titles.has(title)) return;

  try {
    await api(':batchUpdate', 'POST', {
      requests: [{ addSheet: { properties: { title } } }],
    });
  } catch (err) {
    // Another concurrent save may have just created it — re-check before giving up.
    const now = await getTabTitles();
    if (!now.has(title)) throw err;
  }

  // Write the header row (safe to run again; it just rewrites row 1).
  await api(
    `/values/${encodeURIComponent(title)}!A1?valueInputOption=RAW`,
    'PUT',
    { values: [headers] },
  );
}

// Read all rows of a tab back as an array of objects keyed by the header row.
export async function readTab(title) {
  let data;
  try {
    data = await api(`/values/${encodeURIComponent(title)}`);
  } catch (err) {
    // Tab not created yet (no runs saved) — treat as empty.
    return [];
  }
  const rows = data.values || [];
  if (rows.length < 2) return [];
  const headers = rows[0];
  return rows.slice(1).map(r => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = r[i] ?? ''; });
    return obj;
  });
}

// Return the set of RunIDs already present in the Tracker tab (for duplicate checks).
export async function existingRunIds() {
  const rows = await readTab(TRACKER_TAB);
  return new Set(rows.map(r => r['RunID']).filter(Boolean));
}

// Append rows (array of arrays) to the bottom of a tab.
// Google serializes appends, so concurrent saves stack safely instead of overwriting.
async function appendRows(title, rows) {
  if (!rows.length) return;
  await api(
    `/values/${encodeURIComponent(title)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    'POST',
    { values: rows },
  );
}

// Public: ensure both data tabs exist, then append a run's tracker + post-link rows.
export async function saveRun({ trackerRows, postLinkRows }) {
  await ensureTab(TRACKER_TAB, TRACKER_HEADERS);
  await ensureTab(POSTLINKS_TAB, POSTLINKS_HEADERS);
  await appendRows(TRACKER_TAB, trackerRows);
  await appendRows(POSTLINKS_TAB, postLinkRows);
}

// =========================================================================
// Tracker tab write-back
// Reads the master site list from the Tracker tab and writes a run's measured
// values back into each site's row — matched by domain. Never touches a cell
// that holds a formula, and never overwrites a manual note in the date column.
// =========================================================================

const TRACKING_TAB = () => process.env.GOOGLE_TRACKING_TAB || 'Tracker';

// Wrap a tab name for A1 ranges (handles spaces / slashes / quotes).
function qtab(tab) { return `'${String(tab).replace(/'/g, "''")}'`; }

// 0-based column index -> spreadsheet column letter (0=A, 26=AA).
function colLetter(n) {
  let s = ''; n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

export function normDomain(v) {
  return String(v || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
}

// A site counts toward the "auditable library" (and the dashboard totals) only
// if the web dev tagged it Live or Down-Quarantined in the Tracker's Status
// column (P). "Down - Not in Quarantine" sites — and untagged/blank rows — are
// excluded. Matching is loose on spacing/casing across the real values:
//   "Live- Pending Optimization" / "Live- Optimized…" -> in (starts with live)
//   "Down- Quarantined"                                -> in (has "quarantin",
//                                                            not "not in …")
//   "Down - Not in Quarantine"                         -> out
export function isAuditableStatus(v) {
  const s = String(v || '').trim().toLowerCase();
  if (s.includes('not in quarantine')) return false;
  return s.startsWith('live') || s.includes('quarantin');
}
function normHeader(v) { return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
function isFormula(v) { return typeof v === 'string' && v.startsWith('='); }
function isNum(v) { return v !== '' && v !== null && v !== undefined && Number.isFinite(Number(v)); }

// Read the whole tracking tab with formulas preserved (so we can detect formula cells).
async function readTrackingGrid() {
  const tab = TRACKING_TAB();
  const range = encodeURIComponent(qtab(tab));
  const data = await api(`/values/${range}?valueRenderOption=FORMULA&dateTimeRenderOption=FORMATTED_STRING&majorDimension=ROWS`);
  return { tab, rows: data.values || [] };
}

// Locate the header row and the column indexes we care about.
function mapColumns(rows) {
  let headerRow = -1;
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].map(normHeader).some(h => h.includes('total indexed'))) { headerRow = i; break; }
  }
  if (headerRow === -1) {
    throw new Error('Could not find the indexation header row (no "Total Indexed" column). Is the tab name correct?');
  }
  const hr = rows[headerRow].map(normHeader);
  const find = pred => hr.findIndex(pred);
  // Header matchers accept both the new Tracker tab's abbreviated names
  // ("Seq Total", "VB Indexed", "Last Date Checked") and the older
  // TRACKING- MAINTENANCE/REHAB names, so either sheet layout still maps.
  const cols = {
    totalPost:     find(h => h.includes('total post') || h.includes('total pages') || h.includes('post-sitemap')),
    totalIndexed:  find(h => h.includes('total indexed')),
    indexationPct: find(h => h === 'indexation %' || h === 'indexation%'),
    seqTotal:      find(h => h.includes('seq total') || h.includes('sequoias published') || h.includes('sequoia total')),
    seqIndexed:    find(h => h === 'seq indexed' || h.includes('sequoias indexed') || h.includes('sequoia indexed')),
    seqPct:        find(h => h.includes('seq indexation')),
    vbTotal:       find(h => h.includes('vb total')),
    vbIndexed:     find(h => h.includes('vb indexed')),
    vbPct:         find(h => h.includes('vb indexation')),
    vbSqPct:       find(h => h.includes('vb+sq') || h.includes('vb +sq') || (h.includes('vb') && h.includes('sq') && h.includes('indexat'))),
    prioScore:     find(h => h.includes('prio score') || h.includes('priority score')),
    lastChecked:   find(h => h.includes('last date checked') || h.includes('data retrieval') || h.includes('date of indexation') || h.includes('indexation data added')),
    dateSaved:     find(h => h.includes('date saved')),
    savedBy:       find(h => h.includes('saved by')),
    status:        find(h => h === 'status'),
  };
  // Domain column: check the header row, then the group-header row above it.
  let domainCol = hr.findIndex(h => h === 'url' || h === 'domain');
  if (domainCol === -1 && headerRow > 0) {
    domainCol = rows[headerRow - 1].map(normHeader).findIndex(h => h === 'domain' || h === 'url' || h.startsWith('domain'));
  }
  if (domainCol === -1) throw new Error('Could not find the Domain/URL column in the tab.');
  cols.domain = domainCol;
  return { headerRow, cols };
}

function colReport(cols) {
  const out = {};
  for (const k of ['domain', 'lastChecked', 'totalIndexed', 'totalPost', 'seqTotal', 'seqIndexed']) {
    out[k] = cols[k] >= 0 ? colLetter(cols[k]) : null;
  }
  return out;
}

function parseDateMs(s) {
  if (!s) return NaN;
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

// Public: list site domains from the tracking tab, ordered by least-recently
// checked first (never-checked sites lead). `limit` (>0) returns only that many,
// so you can audit a rolling batch and pick up where the last batch left off.
// `failedOnly` returns just the sites currently flagged — i.e. whose Total
// Indexed cell holds text (a status word / note) instead of a number — so you
// can re-run only the failures after manually fixing them.
// `freshDays` (>0) skips sites already checked within that many days, so a
// finished pass doesn't waste credits re-auditing fresh data — the runner just
// idles once everything is current.
export async function getTrackingSites({ limit = 0, failedOnly = false, freshDays = 0 } = {}) {
  const { tab, rows } = await readTrackingGrid();
  const { headerRow, cols } = mapColumns(rows);

  // When the Tracker has a Status column (P), only Live / Down-Quarantined sites
  // count as the "auditable library". If it's missing (older layout), fall back
  // to counting every site so nothing silently zeroes out.
  // NOTE: col P is a VLOOKUP formula (statuses live in the Main tab), and the
  // grid above is read with FORMULA rendering — so read this one column's
  // *computed* values separately, aligned by row index.
  const hasStatusCol = cols.status >= 0;
  let statusVals = [];
  if (hasStatusCol) {
    try {
      const sc = colLetter(cols.status);
      const data = await api(`/values/${encodeURIComponent(qtab(tab))}!${sc}1:${sc}?majorDimension=COLUMNS`);
      statusVals = (data.values && data.values[0]) || [];
    } catch { statusVals = []; }
  }
  const sites = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const d = String((rows[i] || [])[cols.domain] || '').trim();
    if (!d || d.startsWith('=')) continue;
    const rawDate = cols.lastChecked >= 0 ? String((rows[i] || [])[cols.lastChecked] || '').trim() : '';
    const ts = parseDateMs(rawDate);
    // Flagged = the measured count cell holds text instead of a number
    // (a status like "Timed out" / "DOWN", or a manual note).
    const indexedStr = cols.totalIndexed >= 0 ? String((rows[i] || [])[cols.totalIndexed] ?? '').trim() : '';
    const flagged = indexedStr !== '' && !isFormula(indexedStr) && !isNum(indexedStr);
    const colStatus = hasStatusCol ? String(statusVals[i] ?? '').trim() : '';
    const auditable = hasStatusCol ? isAuditableStatus(colStatus) : true;
    // Status gate for the RUNNER: never audit "Down - Not in Quarantine" sites
    // (dead & intentionally parked). Note this differs from `auditable` — blanks
    // and unknown statuses still get audited here (default-on), they just don't
    // count toward the dashboard's auditable library.
    const skipAudit = colStatus.toLowerCase().includes('not in quarantine');
    sites.push({ domain: d, normDomain: normDomain(d), lastChecked: rawDate, ts: Number.isNaN(ts) ? -Infinity : ts, flagged, status: flagged ? indexedStr : '', auditable, skipAudit });
  }
  sites.sort((a, b) => a.ts - b.ts); // oldest / never-checked first

  const total = sites.length;
  const neverChecked = sites.filter(s => s.ts === -Infinity).length;
  const flaggedCount = sites.filter(s => s.flagged).length;
  // The auditable library: Live + Down-Quarantined (see isAuditableStatus).
  // De-duplicate — a domain accidentally listed twice in the Tracker must not
  // inflate the coverage denominator.
  const auditableDomains = [...new Set(sites.filter(s => s.auditable).map(s => s.normDomain))];
  const auditableTotal = auditableDomains.length;
  let pool = failedOnly ? sites.filter(s => s.flagged) : sites;
  // Status gate: exclude "Down - Not in Quarantine" sites from auditing entirely.
  const skippedByStatus = pool.filter(s => s.skipAudit).length;
  pool = pool.filter(s => !s.skipAudit);

  // Freshness gate: drop sites already checked within the last `freshDays` days.
  // Never-checked sites (ts = -Infinity) always remain eligible.
  if (freshDays > 0) {
    const cutoff = Date.now() - freshDays * 86400000;
    pool = pool.filter(s => s.ts < cutoff);
  }

  const eligible = pool.length;
  const selected = (limit && limit > 0) ? pool.slice(0, limit) : pool;

  return {
    tab, columns: colReport(cols),
    total, auditableTotal, auditableDomains, skippedByStatus, neverChecked, flaggedCount, eligible, freshDays, failedOnly,
    count: selected.length,
    oldestChecked: selected.length ? (selected[0].lastChecked || 'never') : null,
    domains: selected.map(s => s.domain),
  };
}

// A run row is "clean" only if it didn't fail and all four measured values are
// real numbers.
function isClean(r) {
  return !r.failed && isNum(r.serpCount) && isNum(r.wpCount) && isNum(r.totalSequoia) && isNum(r.indexedSequoia);
}

// Short, standardized status for a site that didn't measure cleanly — so the
// errors can be grouped/filtered. Derived from what failed.
function statusFor(r) {
  if (r.failed) return r.failReason || 'UNREACHABLE';
  if (r.wpCount === 'Conn. Error') return 'DOWN';
  if (r.wpCount === 'Not Found') return 'NO WP API';
  if (r.serpCount === 'Invalid Key') return 'SEARCH: BAD KEY';
  if (r.serpCount === 'No Credits') return 'SEARCH: NO CREDITS';
  if (r.serpCount === 'Conn. Error') return 'SEARCH: TIMEOUT';
  if (r.serpCount === 'SerpApi Error') return 'SEARCH: API ERROR';
  if (typeof r.serpCount === 'string' && /error/i.test(r.serpCount)) return 'SEARCH ERROR';
  // Last resort: never emit a bare "ERROR" — name whichever value didn't measure.
  const bad = [];
  if (!isNum(r.serpCount)) bad.push('site count');
  if (!isNum(r.totalSequoia)) bad.push('Seq total');
  if (!isNum(r.indexedSequoia)) bad.push('Seq indexed');
  return bad.length ? `ERROR: ${bad.join(' + ')}` : 'ERROR';
}

// Public: write a run's results back into each domain's row in the Tracker tab.
// On a clean check, writes the real numbers; otherwise writes a short status
// (DOWN / NO WP API / …) into the count cells so errors group together.
// Formula cells (e.g. the % columns) are always left for the sheet to compute.
// results: [{ domain, serpCount, wpCount, totalSequoia, indexedSequoia, rate,
//             seqRate, totalVideoBridge, indexedVideoBridge, vbRate,
//             combinedRate, priorityScore, failed }]
export async function writeTrackingResults(results) {
  const { tab, rows } = await readTrackingGrid();
  const { headerRow, cols } = mapColumns(rows);

  const rowOf = {};
  for (let i = headerRow + 1; i < rows.length; i++) {
    const key = normDomain((rows[i] || [])[cols.domain]);
    if (key && !(key in rowOf)) rowOf[key] = i;
  }

  const t = new Date();
  const dateStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  const existing = (ri, ci) => (rows[ri] && rows[ri][ci] !== undefined) ? rows[ri][ci] : '';

  const data = [];
  let updated = 0, errored = 0, formulaSkips = 0;
  const notFound = [];

  for (const r of results) {
    const rowIdx = rowOf[normDomain(r.domain)];
    if (rowIdx === undefined) { notFound.push(r.domain); continue; }

    const ok = isClean(r);
    const status = ok ? null : statusFor(r);

    // Each entry: [columnIndex, value, kind]
    //   'count'   – core measured count; overwrite text notes, write a status
    //               word (DOWN / …) on failure so errors group together.
    //   'number'  – optional measured number (VideoBridge); write only when real.
    //   'derived' – computed rate / score; write only when we have a value, and
    //               only if the cell isn't already a sheet formula.
    const writes = [
      [cols.totalPost,     ok ? Number(r.wpCount)        : status, 'count'],
      [cols.totalIndexed,  ok ? Number(r.serpCount)      : status, 'count'],
      [cols.seqTotal,      ok ? Number(r.totalSequoia)   : status, 'count'],
      [cols.seqIndexed,    ok ? Number(r.indexedSequoia) : status, 'count'],
      [cols.vbTotal,       isNum(r.totalVideoBridge)   ? Number(r.totalVideoBridge)   : null, 'number'],
      [cols.vbIndexed,     isNum(r.indexedVideoBridge) ? Number(r.indexedVideoBridge) : null, 'number'],
      [cols.indexationPct, ok && isNum(r.rate)     ? Number(r.rate)         : null, 'derived'],
      [cols.seqPct,        ok && isNum(r.seqRate)  ? Number(r.seqRate)      : null, 'derived'],
      [cols.vbPct,         isNum(r.vbRate)         ? Number(r.vbRate)       : null, 'derived'],
      [cols.vbSqPct,       isNum(r.combinedRate)   ? Number(r.combinedRate) : null, 'derived'],
      [cols.prioScore,     isNum(r.priorityScore)  ? Number(r.priorityScore): null, 'derived'],
    ];

    let wroteAny = false;
    for (const [ci, val, kind] of writes) {
      if (ci === undefined || ci < 0) continue;
      if (isFormula(existing(rowIdx, ci))) { formulaSkips++; continue; } // never touch a formula
      if ((kind === 'number' || kind === 'derived') && (val === null || val === undefined)) continue;
      data.push({ range: `${qtab(tab)}!${colLetter(ci)}${rowIdx + 1}`, values: [[val]] });
      wroteAny = true;
    }

    // Date columns — stamp today. Never overwrite a formula; for the
    // "last checked" cell, also keep a manual non-date note (e.g. "possible malware").
    for (const ci of [cols.lastChecked, cols.dateSaved]) {
      if (ci === undefined || ci < 0) continue;
      const cur = existing(rowIdx, ci);
      if (isFormula(cur)) { formulaSkips++; continue; }
      const isNote = cur !== '' && Number.isNaN(parseDateMs(String(cur)));
      if (ci === cols.lastChecked && isNote) continue;
      data.push({ range: `${qtab(tab)}!${colLetter(ci)}${rowIdx + 1}`, values: [[dateStr]] });
      wroteAny = true;
    }

    // Stamp who saved it.
    if (cols.savedBy >= 0 && !isFormula(existing(rowIdx, cols.savedBy))) {
      data.push({ range: `${qtab(tab)}!${colLetter(cols.savedBy)}${rowIdx + 1}`, values: [['Indexation Checker']] });
      wroteAny = true;
    }

    if (wroteAny) { updated++; if (!ok) errored++; }
  }

  if (data.length) {
    await api('/values:batchUpdate', 'POST', { valueInputOption: 'USER_ENTERED', data });
  }

  return { tab, columns: colReport(cols), updated, errored, cellsWritten: data.length, formulaSkips, notFound };
}

// ===== Append-only history log =====
// A dated snapshot per site, mirroring the full Tracker columns (incl. VB,
// combined rate, priority) so the Dashboard can chart everything over time.
const HISTORY_TAB = () => process.env.GOOGLE_HISTORY_TAB || 'Indexation History';
const HISTORY_HEADERS = [
  'Date', 'Domain', 'Status',
  'Total Post', 'Total Indexed', 'Indexation %',
  'Seq Total', 'Seq Indexed', 'Seq Indexation %',
  'VB Total', 'VB Indexed', 'VB Indexation %',
  'VB+Sq Indexatn', 'Prio Score',
];

// Public: append one dated snapshot row per site to the History tab (never edits
// or deletes existing rows). This is the durable record for period comparisons.
export async function appendIndexationHistory(results) {
  const tab = HISTORY_TAB();
  await ensureTab(tab, HISTORY_HEADERS);
  // Keep the header row current — if the tab predates these columns, refresh it
  // so the new VB / combined / priority columns line up.
  await api(`/values/${encodeURIComponent(tab)}!A1?valueInputOption=RAW`, 'PUT', { values: [HISTORY_HEADERS] });

  const t = new Date();
  const dateStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  const pct = (v, d = 1) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? '' : `${(v * 100).toFixed(d)}%`;

  const rows = results.map(r => {
    const ok = isClean(r);
    return [
      dateStr, r.domain, ok ? 'OK' : statusFor(r),
      isNum(r.wpCount) ? Number(r.wpCount) : '',
      isNum(r.serpCount) ? Number(r.serpCount) : '',
      ok ? pct(r.rate) : '',
      isNum(r.totalSequoia) ? Number(r.totalSequoia) : '',
      isNum(r.indexedSequoia) ? Number(r.indexedSequoia) : '',
      ok ? pct(r.seqRate) : '',
      isNum(r.totalVideoBridge) ? Number(r.totalVideoBridge) : '',
      isNum(r.indexedVideoBridge) ? Number(r.indexedVideoBridge) : '',
      isNum(r.vbRate) ? pct(r.vbRate) : '',
      isNum(r.combinedRate) ? pct(r.combinedRate, 2) : '',
      isNum(r.priorityScore) ? Number(r.priorityScore) : '',
    ];
  });

  await appendRows(tab, rows);
  return { tab, logged: rows.length };
}

// ===== Salvage posts (append-only) =====
// Appends the run's salvage candidates (Sequoia + Unindexed posts) as new rows
// to the "For Salvage Check" tab. Never edits or deletes existing rows.
const SALVAGE_TAB = () => process.env.GOOGLE_SALVAGE_TAB || 'For Salvage Check';
const SALVAGE_HEADERS = [
  'Domain', 'Post Links', 'Date Published', 'Task Type', 'Status', 'Prio Score', 'Date Added',
];

// posts: [{ domain, link, pubDate, taskType, indexStatus, priorityScore }]
export async function appendSalvagePosts(posts) {
  if (!Array.isArray(posts) || posts.length === 0) {
    return { tab: SALVAGE_TAB(), appended: 0 };
  }
  const tab = SALVAGE_TAB();
  // Creates the tab with headers only if it doesn't exist; leaves an existing
  // tab (and its header row) untouched.
  await ensureTab(tab, SALVAGE_HEADERS);

  const t = new Date();
  const dateStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;

  const rows = posts.map(p => [
    p.domain ?? '', p.link ?? '', p.pubDate ?? '',
    p.taskType ?? 'Sequoia', p.indexStatus ?? 'Unindexed',
    isNum(p.priorityScore) ? Number(p.priorityScore) : '',
    dateStr,
  ]);

  await appendRows(tab, rows);
  return { tab, appended: rows.length };
}

// ===== Sequoia audit log (append-only) =====
// Every audited Sequoia post — indexed AND unindexed — so the classification
// (link count) and the indexation verdict can both be spot-checked by hand.
// Unlike the Salvage tab (unindexed only), this is the full record.
const SEQLOG_TAB = () => process.env.GOOGLE_SEQLOG_TAB || 'Sequoia Audit Log';
const SEQLOG_HEADERS = [
  'Domain', 'Post Link', 'Date Published', 'External Links', 'Index Status', 'Date Audited',
];

// posts: [{ domain, link, pubDate, externalCount, indexStatus }]
export async function appendSequoiaLog(posts) {
  if (!Array.isArray(posts) || posts.length === 0) return { tab: SEQLOG_TAB(), appended: 0 };
  const tab = SEQLOG_TAB();
  await ensureTab(tab, SEQLOG_HEADERS);
  const t = new Date();
  const dateStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  const rows = posts.map(p => [
    p.domain ?? '', p.link ?? '', p.pubDate ?? '',
    isNum(p.externalCount) ? Number(p.externalCount) : '',
    p.indexStatus ?? '', dateStr,
  ]);
  await appendRows(tab, rows);
  return { tab, appended: rows.length };
}
