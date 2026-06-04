// pages/api/tracking/sites.js
// GET — returns the list of site domains from the TRACKING- MAINTENANCE/REHAB tab,
// so a run can audit exactly the sites already in the sheet.

import { sheetsConfigured, getTrackingSites } from '../../../lib/sheets';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  if (!sheetsConfigured()) {
    return res.status(500).json({ error: 'Google Sheet is not connected. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY and GOOGLE_SHEET_ID.' });
  }
  try {
    const limit = parseInt(req.query.limit, 10);
    const result = await getTrackingSites({ limit: Number.isFinite(limit) ? limit : 0 });
    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
