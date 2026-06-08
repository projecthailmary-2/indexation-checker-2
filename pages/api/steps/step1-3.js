// pages/api/steps/step1-3.js
// Step 1: WordPress published post count
// Step 2: SerpApi site: search count
// Step 3: Calculate rate from Steps 1 & 2 (capped at 100%)

const SERPAPI_KEY = process.env.SERPAPI_KEY;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Returns a post count (number), 'Not Found' (reachable but no WordPress data),
// or 'Conn. Error' (unreachable after 3 attempts). Retries only connection
// failures — a brief blip shouldn't wrongly flag a healthy site.
async function fetchWPPostCount(domain) {
  let base = domain.toString().trim().toLowerCase();
  if (!base.startsWith('http')) base = 'https://' + base;
  base = base.replace(/\/$/, '');
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/posts?per_page=1`, {
        signal: AbortSignal.timeout(10000),
      });
      const total = res.headers.get('x-wp-total') || res.headers.get('X-WP-Total');
      return (total !== null && total !== undefined) ? parseInt(total) : 'Not Found';
    } catch {
      if (attempt < 3) { await sleep(800 * attempt); continue; }
      return 'Conn. Error';
    }
  }
}

async function fetchSerpCount(domain) {
  if (!domain) return 0;
  const clean = domain.toString().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const exclusions = '-intitle:home -inurl:category -inurl:sitemap -inurl:author -inurl:tag -inurl:page -inurl:xml -inurl:wp-content';
  const query = `site:${clean} ${exclusions}`;
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${SERPAPI_KEY}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json = await res.json();
    if (json.error) {
      if (json.error.includes('api_key')) return 'Invalid Key';
      if (json.error.includes('credits')) return 'No Credits';
      return 'SerpApi Error';
    }
    return json.search_information?.total_results || 0;
  } catch {
    return 'Conn. Error';
  }
}

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
    const wpCount = await fetchWPPostCount(domain);
    const wp = parseInt(wpCount);

    // Site unreachable / no WP data after 3 tries → mark FAILED. Don't guess any
    // numbers, and skip the Google search entirely (it would just waste a credit).
    if (!Number.isFinite(wp)) {
      results.push({ domain, wpCount: '-', serpCount: '-', rate: '-', failed: true });
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
