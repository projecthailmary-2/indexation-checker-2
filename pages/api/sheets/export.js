// pages/api/sheets/export.js
// POST — saves one completed run's results into the Google Sheet (the database).
// Appends rows tagged with a unique RunID; refuses to save the same RunID twice.

import {
  sheetsConfigured, saveRun, existingRunIds,
} from '../../../lib/sheets';

function pct(val, digits = 1) {
  if (val === null || val === undefined || val === '') return '';
  return `${(val * 100).toFixed(digits)}%`;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  if (!sheetsConfigured()) {
    return res.status(500).json({
      error: 'Google Sheet is not connected. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID.',
    });
  }

  const { runId, runDate, trackerResults = [], postLinks = [] } = req.body || {};
  if (!runId) return res.status(400).json({ error: 'Missing runId.' });
  if (!trackerResults.length && !postLinks.length) {
    return res.status(400).json({ error: 'Nothing to save — run the automation first.' });
  }

  try {
    // Duplicate guard: if this run was already saved, don't add it again.
    const existing = await existingRunIds();
    if (existing.has(runId)) {
      return res.status(200).json({ duplicate: true });
    }

    const date = runDate || new Date().toISOString();

    const trackerRows = trackerResults.map(r => [
      runId, date, r.domain ?? '',
      r.wpCount ?? '', r.serpCount ?? '', pct(r.rate),
      r.totalSequoia ?? '', r.indexedSequoia ?? '', pct(r.seqRate),
      r.totalVideoBridge ?? '', r.indexedVideoBridge ?? '', pct(r.vbRate),
      r.combinedRate != null ? pct(r.combinedRate, 2) : 'N/A',
      r.priorityScore != null ? r.priorityScore : 'N/A',
    ]);

    const postLinkRows = postLinks.map(r => [
      runId, date, r.domain ?? '', r.link ?? '', r.pubDate ?? '',
      r.externalCount ?? '', r.taskType ?? '', r.indexStatus ?? '',
    ]);

    await saveRun({ trackerRows, postLinkRows });

    return res.status(200).json({
      ok: true,
      saved: { tracker: trackerRows.length, postLinks: postLinkRows.length },
    });
  } catch (err) {
    return res.status(500).json({ error: `Could not save to sheet: ${err.message}` });
  }
}
