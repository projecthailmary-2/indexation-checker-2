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

async function api(path, method = 'GET', data = undefined) {
  const res = await client().request({ url: `${BASE()}${path}`, method, data });
  return res.data;
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
// TRACKING- MAINTENANCE/REHAB write-back
// Reads the master site list from that tab, and writes a monthly audit's raw
// measured values back into each site's row — touching ONLY the input columns
// and never a cell that holds a formula.
// =========================================================================

const TRACKING_TAB = () => process.env.GOOGLE_TRACKING_TAB || 'TRACKING- MAINTENANCE/REHAB';

// Wrap a tab name for A1 ranges (handles spaces / slashes / quotes).
function qtab(tab) { return `'${String(tab).replace(/'/g, "''")}'`; }

// 0-based column index -> spreadsheet column letter (0=A, 26=AA).
function colLetter(n) {
  let s = ''; n += 1;
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

function normDomain(v) {
  return String(v || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
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
  const cols = {
    totalIndexed: find(h => h.includes('total indexed')),
    totalPages: find(h => h.includes('total pages') || h.includes('post-sitemap')),
    seqPublished: find(h => h.includes('sequoias published')),
    seqIndexed: find(h => h.includes('sequoias indexed')),
    dateRetrieval: find(h => h.includes('data retrieval') || h.includes('date of indexation') || h.includes('indexation data added')),
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
  for (const k of ['domain', 'dateRetrieval', 'totalIndexed', 'totalPages', 'seqPublished', 'seqIndexed']) {
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
export async function getTrackingSites({ limit = 0 } = {}) {
  const { tab, rows } = await readTrackingGrid();
  const { headerRow, cols } = mapColumns(rows);

  const sites = [];
  for (let i = headerRow + 1; i < rows.length; i++) {
    const d = String((rows[i] || [])[cols.domain] || '').trim();
    if (!d || d.startsWith('=')) continue;
    const rawDate = cols.dateRetrieval >= 0 ? String((rows[i] || [])[cols.dateRetrieval] || '').trim() : '';
    const ts = parseDateMs(rawDate);
    sites.push({ domain: d, lastChecked: rawDate, ts: Number.isNaN(ts) ? -Infinity : ts });
  }
  sites.sort((a, b) => a.ts - b.ts); // oldest / never-checked first

  const total = sites.length;
  const neverChecked = sites.filter(s => s.ts === -Infinity).length;
  const selected = (limit && limit > 0) ? sites.slice(0, limit) : sites;

  return {
    tab, columns: colReport(cols),
    total, neverChecked, count: selected.length,
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
  if (r.failed) return 'UNREACHABLE';
  if (r.wpCount === 'Conn. Error') return 'DOWN';
  if (r.wpCount === 'Not Found') return 'NO WP API';
  if (r.serpCount === 'Invalid Key') return 'SEARCH: BAD KEY';
  if (r.serpCount === 'No Credits') return 'SEARCH: NO CREDITS';
  if (typeof r.serpCount === 'string' && /error/i.test(r.serpCount)) return 'SEARCH ERROR';
  return 'ERROR';
}

// Public: write a run's results back into each domain's row in the TRACKING tab.
// On a clean check, writes the real numbers; otherwise writes a short status
// (DOWN / NO WP API / …) into the count cells so errors group together.
// results: [{ domain, serpCount, wpCount, totalSequoia, indexedSequoia, rate, seqRate }]
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
    const countWrites = [
      [cols.totalIndexed, ok ? Number(r.serpCount) : status],
      [cols.totalPages, ok ? Number(r.wpCount) : status],
      [cols.seqPublished, ok ? Number(r.totalSequoia) : status],
      [cols.seqIndexed, ok ? Number(r.indexedSequoia) : status],
    ];

    let wroteAny = false;
    for (const [ci, val] of countWrites) {
      if (ci === undefined || ci < 0) continue;
      if (isFormula(existing(rowIdx, ci))) { formulaSkips++; continue; }
      data.push({ range: `${qtab(tab)}!${colLetter(ci)}${rowIdx + 1}`, values: [[val]] });
      wroteAny = true;
    }

    // Stamp today's check date — but never overwrite a formula, or a non-date
    // text note someone left in the date cell (e.g. "possible malware").
    if (cols.dateRetrieval >= 0) {
      const cur = existing(rowIdx, cols.dateRetrieval);
      const isNote = cur !== '' && Number.isNaN(parseDateMs(String(cur)));
      if (!isFormula(cur) && !isNote) {
        data.push({ range: `${qtab(tab)}!${colLetter(cols.dateRetrieval)}${rowIdx + 1}`, values: [[dateStr]] });
        wroteAny = true;
      }
    }

    if (wroteAny) { updated++; if (!ok) errored++; }
  }

  if (data.length) {
    await api('/values:batchUpdate', 'POST', { valueInputOption: 'USER_ENTERED', data });
  }

  return { tab, columns: colReport(cols), updated, errored, cellsWritten: data.length, formulaSkips, notFound };
}

// ===== Append-only history log =====
const HISTORY_TAB = () => process.env.GOOGLE_HISTORY_TAB || 'Indexation History';
const HISTORY_HEADERS = [
  'Date', 'Domain', 'Status', 'Total Indexed', 'Total Pages',
  'Sequoias Published', 'Sequoias Indexed', 'Site Indexation Rate', 'Sequoia Indexation Rate',
];

// Public: append one dated snapshot row per site to the History tab (never edits
// or deletes existing rows). This is the durable record for period comparisons.
export async function appendIndexationHistory(results) {
  const tab = HISTORY_TAB();
  await ensureTab(tab, HISTORY_HEADERS);

  const t = new Date();
  const dateStr = `${t.getMonth() + 1}/${t.getDate()}/${t.getFullYear()}`;
  const pct = v => (v === null || v === undefined || v === '') ? '' : `${(v * 100).toFixed(1)}%`;

  const rows = results.map(r => {
    const ok = isClean(r);
    return [
      dateStr, r.domain, ok ? 'OK' : statusFor(r),
      isNum(r.serpCount) ? Number(r.serpCount) : '',
      isNum(r.wpCount) ? Number(r.wpCount) : '',
      isNum(r.totalSequoia) ? Number(r.totalSequoia) : '',
      isNum(r.indexedSequoia) ? Number(r.indexedSequoia) : '',
      ok ? pct(r.rate) : '',
      ok ? pct(r.seqRate) : '',
    ];
  });

  await appendRows(tab, rows);
  return { tab, logged: rows.length };
}
