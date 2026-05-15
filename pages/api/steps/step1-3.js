// pages/api/steps/step1-3.js
// Step 1: WordPress published post count
// Step 2: SerpApi site: search count
// Step 3: Calculate rate from Steps 1 & 2 (capped at 100%)

const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function fetchWPPostCount(domain) {
  let base = domain.toString().trim().toLowerCase();
  if (!base.startsWith('http')) base = 'https://' + base;
  base = base.replace(/\/$/, '');
  try {
    const res = await fetch(`${base}/wp-json/wp/v2/posts?per_page=1`, {
      signal: AbortSignal.timeout(10000),
    });
    const total = res.headers.get('x-wp-total') || res.headers.get('X-WP-Total');
    return total ? parseInt(total) : 'Not Found';
  } catch {
    return 'Conn. Error';
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
      results.push({ domain, wpCount: '', serpCount: '', rate: '' });
      continue;
    }

    // Step 1: WP count
    const wpCount = await fetchWPPostCount(domain);

    // Step 2: SerpApi count
    const serpCount = await fetchSerpCount(domain);

    // Step 3: Calculate rate — capped at 100%
    const wp = parseInt(wpCount);
    const serp = parseInt(serpCount);
    let rate = 0;
    if (!isNaN(wp) && wp > 0 && !isNaN(serp)) {
      rate = Math.min(serp / wp, 1.0);
    }

    results.push({ domain, wpCount, serpCount, rate });
  }

  return res.status(200).json({ results });
}
