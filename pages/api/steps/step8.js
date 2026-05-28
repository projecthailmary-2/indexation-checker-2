// pages/api/steps/step8.js
// Batched SerpApi indexation check — 15 posts per call to stay under Vercel 60s limit

const SERPAPI_KEY = process.env.SERPAPI_KEY;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function checkIndexed(url) {
  const apiUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(`site:${url}`)}&engine=google&api_key=${SERPAPI_KEY}`;
  try {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
    const json = await res.json();
    if (json.error) {
      if (json.error.toLowerCase().includes("hasn't returned")) return 'Unindexed';
      if (json.error.includes('api_key')) return 'Invalid Key';
      if (json.error.includes('credits')) return 'No Credits';
      return 'Error';
    }
    const total = json.search_information?.total_results || 0;
    const hasOrganic = json.organic_results?.length > 0;
    return (total > 0 || hasOrganic) ? 'Indexed' : 'Unindexed';
  } catch {
    return 'Conn. Error';
  }
}

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
