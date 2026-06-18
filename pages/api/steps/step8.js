// pages/api/steps/step8.js
// Batched SerpApi indexation check — 15 posts per call to stay under the
// per-request time limit. Thin wrapper around the shared engine in lib/audit.js.

import { checkIndexed, sleep } from '../../../lib/audit';

// Allow up to Vercel's 5-minute ceiling (raises the manual-run size).
export const config = { maxDuration: 300 };

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { postLinks, batchStart = 0, batchSize = 15 } = req.body;
  if (!postLinks?.length) return res.status(400).json({ error: 'postLinks required' });

  const batch = postLinks.slice(batchStart, batchStart + batchSize);
  const results = [];

  for (const item of batch) {
    if (item.taskType === 'Others' || item.taskType === 'Error') {
      results.push({ ...item, indexStatus: 'Skip' });
      continue;
    }
    const indexStatus = await checkIndexed(item.link);
    results.push({ ...item, indexStatus });
    await sleep(1000 + Math.floor(Math.random() * 1000));
  }

  const nextBatchStart = batchStart + batchSize;
  const isDone = nextBatchStart >= postLinks.length;

  return res.status(200).json({
    results,
    nextBatchStart: isDone ? null : nextBatchStart,
    progress: {
      processed: Math.min(nextBatchStart, postLinks.length),
      total: postLinks.length,
      isDone,
    },
  });
}
