// pages/api/steps/step4-7.js
// Step 4: Fetch post links (last 6 months, exclude last 24 days) — includes Pub Date
// Step 5: Count external links — drills into <main> > <article> > <p>, ignores date links
// Step 6: Categorize task types (Video Bridge / Sequoia / Others)
// Step 7: Aggregate Sequoia & VB counts per domain

// Post Links columns:
// A: Domain, B: Post Link, C: Pub Date, D: External Links, E: Task Type, F: Index Status

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// Short, human-readable reason for a thrown fetch error (timeout / DNS / …).
function describeNetworkError(err) {
  const name = err?.name || '';
  const code = err?.cause?.code || err?.code || '';
  if (name === 'TimeoutError' || name === 'AbortError') return 'Timed out';
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return 'Domain not found (DNS)';
  if (code === 'ECONNREFUSED') return 'Connection refused';
  if (code === 'ECONNRESET') return 'Connection reset';
  const c = String(code);
  if (c.includes('CERT') || c.includes('SSL') || c.startsWith('ERR_TLS')) return 'SSL/certificate error';
  return 'Unreachable';
}

async function fetchPostLinks(domain) {
  let base = domain.toString().trim().replace(/\/$/, '');
  if (!base.startsWith('http')) base = 'https://' + base;

  const now = new Date();
  const before = new Date(); before.setDate(now.getDate() - 24);
  const after = new Date(); after.setMonth(now.getMonth() - 6);

  let reason = 'Unreachable';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(
        `${base}/wp-json/wp/v2/posts?after=${after.toISOString()}&before=${before.toISOString()}&per_page=100`,
        { signal: AbortSignal.timeout(15000) }
      );
      if (!res.ok) return { domain, count: 'Conn. Error', links: [], reason: `Site error (HTTP ${res.status})` };
      const total = res.headers.get('x-wp-total') || res.headers.get('X-WP-Total');
      const posts = await res.json();
      if (!Array.isArray(posts)) return { domain, count: 'Error', links: [], reason: 'Unexpected WP response' };

      const links = posts.map(p => ({
        url: p.link,
        pubDate: p.date ? p.date.split('T')[0] : '', // Format: YYYY-MM-DD
      }));

      return { domain, count: parseInt(total) || links.length, links };
    } catch (err) {
      reason = describeNetworkError(err);
      if (attempt < 3) { await sleep(800 * attempt); continue; }
      return { domain, count: 'Conn. Error', links: [], reason };
    }
  }
}

async function analyzePost(postUrl, sourceDomain) {
  try {
    const res = await fetch(postUrl, { signal: AbortSignal.timeout(15000) });
    const html = await res.text();

    // Step 5: Drill down — <main> > <article> > <p> tags only
    const mainMatch = html.match(/<main[^>]*>([\s\S]*)<\/main>/i);
    let searchArea = mainMatch ? mainMatch[1] : html;

    const articleMatch = searchArea.match(/<article[^>]*>([\s\S]*)<\/article>/i);
    if (articleMatch) searchArea = articleMatch[1];

    const pMatches = searchArea.match(/<p[\s\S]*?<\/p>/gi);
    const cleanContent = pMatches ? pMatches.join(' ') : '';

    // Count external links — ignore date-based links like /2024/05/
    const rootDomain = sourceDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/g;
    let match;
    let externalCount = 0;

    while ((match = hrefRegex.exec(cleanContent)) !== null) {
      const link = match[1];
      const isExternal = !link.includes(rootDomain) && link.startsWith('http');
      const isDateLink = /\/\d{4}\/\d{2}\//.test(link);
      if (isExternal && !isDateLink) externalCount++;
    }

    // Step 6: Check YouTube in full body for Video Bridge
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
    const body = bodyMatch ? bodyMatch[1].toLowerCase() : html.toLowerCase();
    const hasYouTube = body.includes('youtube.com') || body.includes('youtu.be');

    let taskType = 'Others';
    if (hasYouTube) taskType = 'Video Bridge';
    else if (externalCount >= 10) taskType = 'Sequoia';

    return { externalCount, taskType };
  } catch {
    return { externalCount: 0, taskType: 'Error' };
  }
}

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
