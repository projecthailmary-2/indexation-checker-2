// pages/api/dashboard.js
// GET ?period=week|month|quarter — reads the Indexation History tab and returns
// period-aggregated indexation data (rates, counts, coverage, averages,
// period-over-period comparison) for the Dashboard.

import { sheetsConfigured, readTab, getTrackingSites } from '../../lib/sheets';
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

    // Library size powers the coverage % (how complete each period is).
    let libraryTotal = 0;
    try { libraryTotal = (await getTrackingSites({ limit: 0 })).total || 0; } catch { /* non-fatal */ }

    const result = aggregateHistory(rows, { period, libraryTotal });
    return res.status(200).json(result);
  } catch (e) {
    return res.status(500).json({ error: `Could not load dashboard data: ${e.message}` });
  }
}
