// pages/api/steps/step1-3.js
// Step 1: WordPress published post count
// Step 2: SerpApi site: search count
// Step 3: Calculate rate from Steps 1 & 2 (capped at 100%)
// Thin wrapper around the shared engine in lib/audit.js.

import { fetchWPPostCount, fetchSerpCount } from '../../../lib/audit';

// Allow up to Vercel's 5-minute ceiling (raises the manual-run size).
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { domains } = req.body;
  if (!domains?.length) return res.status(400).json({ error: 'domains required' });

  const results = [];
  for (const domain of domains) {
    if (!domain?.trim()) {
      results.push({ domain, wpCount: '', serpCount: '', rate: '', failed: false });
      continue;
    }

    // Step 1: WP count (with retries)
    const { value: wp, reason } = await fetchWPPostCount(domain);

    // Site unreachable / no WP data after 3 tries → mark FAILED, recording the
    // specific reason. Don't guess any numbers, and skip the Google search
    // entirely (it would just waste a credit).
    if (!Number.isFinite(wp)) {
      results.push({ domain, wpCount: '-', serpCount: '-', rate: '-', failed: true, failReason: reason || 'Unreachable' });
      continue;
    }

    // Step 2: SerpApi count
    const serpCount = await fetchSerpCount(domain);

    // Step 3: Calculate rate — capped at 100%
    const serp = parseInt(serpCount);
    let rate = 0;
    if (wp > 0 && Number.isFinite(serp)) {
      rate = Math.min(serp / wp, 1.0);
    }

    results.push({ domain, wpCount: wp, serpCount, rate, failed: false });
  }

  return res.status(200).json({ results });
}
