// pages/api/sheets/data.js
// GET — reads all saved runs back from the Google Sheet to power the Dashboard tab.

import {
  sheetsConfigured, readTab, TRACKER_TAB, POSTLINKS_TAB,
} from '../../../lib/sheets';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();

  if (!sheetsConfigured()) {
    return res.status(500).json({
      error: 'Google Sheet is not connected. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID.',
    });
  }

  try {
    const [tracker, postLinks] = await Promise.all([
      readTab(TRACKER_TAB),
      readTab(POSTLINKS_TAB),
    ]);
    return res.status(200).json({ tracker, postLinks });
  } catch (err) {
    return res.status(500).json({ error: `Could not read sheet: ${err.message}` });
  }
}
