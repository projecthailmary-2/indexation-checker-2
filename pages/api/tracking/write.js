// pages/api/tracking/write.js
// POST — writes a completed run's measured values back into the
// TRACKING- MAINTENANCE/REHAB tab, one row per domain.
// Only fills the raw-input columns; never overwrites a formula cell.

import { sheetsConfigured, writeTrackingResults, appendIndexationHistory } from '../../../lib/sheets';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  if (!sheetsConfigured()) {
    return res.status(500).json({ error: 'Google Sheet is not connected. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID.' });
  }

  const { results } = req.body || {};
  if (!Array.isArray(results) || results.length === 0) {
    return res.status(400).json({ error: 'No results to write — run the audit first.' });
  }

  try {
    const summary = await writeTrackingResults(results);
    // History is logged separately so a history hiccup never blocks the main write.
    let history;
    try { history = await appendIndexationHistory(results); }
    catch (e) { history = { error: e.message }; }
    return res.status(200).json({ ok: true, ...summary, history });
  } catch (err) {
    return res.status(500).json({ error: `Could not write to sheet: ${err.message}` });
  }
}
