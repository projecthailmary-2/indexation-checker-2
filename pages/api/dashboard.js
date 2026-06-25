// pages/api/dashboard.js
// GET ?period=week|month|quarter — reads the Indexation History tab and returns
// period-aggregated indexation data (rates, counts, coverage, averages,
// period-over-period comparison) for the Dashboard.

import { sheetsConfigured, readTab, getTrackingSites, normDomain } from '../../lib/sheets';
import { aggregateHistory } from '../../lib/dashboard';

const HISTORY_TAB = process.env.GOOGLE_HISTORY_TAB || 'Indexation History';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!sheetsConfigured()) {
    return res.status(500).json({ error: 'Google Sheet is not connected.' });
  }
  try {
    const period = ['week', 'month', 'quarter'].includes(req.query.period) ? req.query.period : 'week';
    const rows = await readTab(HISTORY_TAB);

    // Scope every number to the "auditable library" — Live + Down-Quarantined
    // sites (Tracker Status col P). "Down - Not in Quarantine" sites are dropped
    // from both the coverage denominator and the rates. libraryTotal powers the
    // coverage % (how complete each period is).
    let libraryTotal = 0;
    let scopedRows = rows;
    try {
      const t = await getTrackingSites({ limit: 0 });
      const allow = new Set(t.auditableDomains || []);
      if (allow.size) {
        scopedRows = rows.filter(r => allow.has(normDomain(r['Domain'])));
        libraryTotal = t.auditableTotal || allow.size;
      } else {
        libraryTotal = t.total || 0; // Status column missing → whole library
      }
    } catch { /* non-fatal: leave rows unscoped, coverage just won't show */ }

    const result = aggregateHistory(scopedRows, { period, libraryTotal });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: `Could not load dashboard data: ${e.message}` });
  }
}
