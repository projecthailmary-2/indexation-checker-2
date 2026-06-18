// pages/api/steps/step9-10.js
// Step 9: Count indexed Sequoia & VB per domain
// Step 10: Calculate indexation rates — capped at 100%
// Step 11: Combined rate (Col K) and Priority Score (Col L)
// Thin wrapper around the shared engine in lib/audit.js.

import { computeDomainStats } from '../../../lib/audit';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { postLinks, trackerDomains } = req.body;
  if (!postLinks || !trackerDomains) return res.status(400).json({ error: 'missing data' });

  const results = computeDomainStats(postLinks, trackerDomains);
  return res.status(200).json({ results });
}
