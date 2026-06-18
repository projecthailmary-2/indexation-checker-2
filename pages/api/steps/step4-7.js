// pages/api/steps/step4-7.js
// Step 4: Fetch post links (last 6 months, exclude last 24 days) — includes Pub Date
// Step 5: Count external links — drills into <main> > <article> > <p>, ignores date links
// Step 6: Categorize task types (Video Bridge / Sequoia / Others)
// Step 7: Aggregate Sequoia & VB counts per domain
// Thin wrapper around the shared engine in lib/audit.js.
//
// Post Links columns:
// A: Domain, B: Post Link, C: Pub Date, D: External Links, E: Task Type, F: Index Status

import { fetchPostLinks, analyzePost } from '../../../lib/audit';

// Allow up to Vercel's 5-minute ceiling (raises the manual-run size).
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { domains, skipDomains = [] } = req.body;
  if (!domains?.length) return res.status(400).json({ error: 'domains required' });

  // Sites already marked unreachable in Steps 1-3 — skip them entirely.
  const skip = new Set((skipDomains || []).map(d => String(d).toLowerCase().trim()));

  const trackerResults = [];
  const postLinks = [];

  for (const domain of domains) {
    if (!domain?.trim()) {
      trackerResults.push({ domain, postCount: '' });
      continue;
    }
    if (skip.has(domain.toLowerCase().trim())) {
      trackerResults.push({ domain, postCount: '-', failed: true });
      continue;
    }

    const { count, links, reason } = await fetchPostLinks(domain);
    const row = { domain, postCount: count };
    if (reason) row.failReason = reason;
    trackerResults.push(row);

    for (const { url, pubDate } of links) {
      const { externalCount, taskType } = await analyzePost(url, domain);
      postLinks.push({ domain, link: url, pubDate, externalCount, taskType });
    }
  }

  // Step 7: aggregate per domain
  const statsMap = {};
  for (const { domain, taskType } of postLinks) {
    const key = domain.toLowerCase().trim();
    if (!statsMap[key]) statsMap[key] = { sequoia: 0, videoBridge: 0 };
    if (taskType === 'Sequoia') statsMap[key].sequoia++;
    if (taskType === 'Video Bridge') statsMap[key].videoBridge++;
  }

  const trackerWithCounts = trackerResults.map(row => {
    const key = (row.domain || '').toLowerCase().trim();
    const s = statsMap[key] || { sequoia: 0, videoBridge: 0 };
    return { ...row, sequoiaCount: s.sequoia, videoBridgeCount: s.videoBridge };
  });

  return res.status(200).json({ trackerResults: trackerWithCounts, postLinks });
}
