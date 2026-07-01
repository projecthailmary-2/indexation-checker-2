// lib/audit.js
// The headless audit engine. This is the single source of truth for the audit
// logic (Steps 1–11). The step API routes (browser-driven) and the background
// runner both call these functions, so the manual run and the automated run
// always behave identically — no drift.
//
// Pure logic only: no request/response handling, no env read at import time.

export function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

const serpKey = () => process.env.SERPAPI_KEY;

// SerpApi signals an exhausted account several ways, e.g. "Your account has run
// out of searches." — match all of them so the runner stops cleanly instead of
// marking every site as an error.
function isOutOfQuota(low) {
  return low.includes('credits') || low.includes('run out') ||
         low.includes('out of searches') || low.includes('ran out') ||
         low.includes('exceeded') || low.includes('plan limit');
}

// ---------------------------------------------------------------------------
// Shared: turn a thrown fetch error into a short, human-readable reason.
// ---------------------------------------------------------------------------
export function describeNetworkError(err) {
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

// ---------------------------------------------------------------------------
// Step 1: WordPress published post count.
// Returns { value, reason }: value is the count when healthy; otherwise value
// is null and reason explains why. Retries only connection failures.
// ---------------------------------------------------------------------------
export async function fetchWPPostCount(domain) {
  let base = domain.toString().trim().toLowerCase();
  if (!base.startsWith('http')) base = 'https://' + base;
  base = base.replace(/\/$/, '');
  let reason = 'Unreachable';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`${base}/wp-json/wp/v2/posts?per_page=1`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) return { value: null, reason: `Site error (HTTP ${res.status})` };
      const total = res.headers.get('x-wp-total') || res.headers.get('X-WP-Total');
      if (total === null || total === undefined) return { value: null, reason: 'No WordPress API' };
      return { value: parseInt(total), reason: null };
    } catch (err) {
      reason = describeNetworkError(err);
      if (attempt < 3) { await sleep(800 * attempt); continue; }
      return { value: null, reason };
    }
  }
}

// ---------------------------------------------------------------------------
// A few SerpApi calls fail transiently — a one-off API error or a network
// timeout — even when the key is valid and has credits. A single blip should
// not condemn a whole site to ERROR, so we retry those outcomes. We do NOT
// retry definitive ones ('Invalid Key' / 'No Credits' / a real result), since
// those won't change and retrying would only waste time and credits.
const SERP_TRANSIENT = new Set(['SerpApi Error', 'Conn. Error', 'Error']);
async function withSerpRetry(fn, attempts = 3) {
  let last;
  for (let i = 1; i <= attempts; i++) {
    last = await fn();
    if (!SERP_TRANSIENT.has(last)) return last; // success or a definitive outcome
    if (i < attempts) await sleep(800 * i);      // brief backoff: 0.8s, then 1.6s
  }
  return last; // out of attempts — surface the last transient error
}

// Step 2: SerpApi site: search count. Returns a number, or a status string
// ('Invalid Key' / 'No Credits' / 'SerpApi Error' / 'Conn. Error').
// Transient errors are retried automatically (see withSerpRetry).
// ---------------------------------------------------------------------------
export async function fetchSerpCount(domain) {
  return withSerpRetry(() => fetchSerpCountOnce(domain));
}
async function fetchSerpCountOnce(domain) {
  if (!domain) return 0;
  const clean = domain.toString().trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  const exclusions = '-intitle:home -inurl:category -inurl:sitemap -inurl:author -inurl:tag -inurl:page -inurl:xml -inurl:wp-content';
  const query = `site:${clean} ${exclusions}`;
  const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&engine=google&api_key=${serpKey()}`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    const json = await res.json();
    if (json.error) {
      const low = String(json.error).toLowerCase();
      // SerpApi reports "Google hasn't returned any results for this query" when
      // a site has no indexed pages — that's a real 0, not an error.
      if (low.includes("hasn't returned") || low.includes('did not return') ||
          low.includes('no results') || low.includes("didn't match any")) return 0;
      if (low.includes('api_key')) return 'Invalid Key';
      if (isOutOfQuota(low)) return 'No Credits';
      return 'SerpApi Error';
    }
    // Only trust a count if we actually got a results page back. A reply with no
    // error AND no search_information is a non-answer (not a real 0) — surface it
    // as an error so it retries / isn't recorded as "0 indexed".
    if (!json.search_information) return 'SerpApi Error';
    return json.search_information.total_results || 0;
  } catch {
    return 'Conn. Error';
  }
}

// ---------------------------------------------------------------------------
// Step 4: post links published in the window (3 months ago → 24 days ago).
// Paginates through ALL pages (WordPress caps each request at 100 posts), so a
// high-volume site isn't measured on just its 100 newest posts.
// Returns { domain, count, links, reason? }.
// ---------------------------------------------------------------------------
const MAX_POST_PAGES = 15; // safety cap (~1500 posts / 3mo) — bounds runaway sites

export async function fetchPostLinks(domain) {
  let base = domain.toString().trim().replace(/\/$/, '');
  if (!base.startsWith('http')) base = 'https://' + base;

  const now = new Date();
  const before = new Date(); before.setDate(now.getDate() - 24);
  const after = new Date(); after.setMonth(now.getMonth() - 3); // window: 3 months ago → 24 days ago
  const range = `after=${after.toISOString()}&before=${before.toISOString()}`;

  // Fetch one page (1-based), retrying transient failures.
  const getPage = async (page) => {
    let reason = 'Unreachable';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(`${base}/wp-json/wp/v2/posts?${range}&per_page=100&page=${page}`, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) {
          // WP returns 400 when asked for a page past the last one — that's the
          // end of the list, not a failure.
          if (res.status === 400 && page > 1) return { end: true };
          return { error: `Site error (HTTP ${res.status})` };
        }
        const posts = await res.json();
        if (!Array.isArray(posts)) return { error: 'Unexpected WP response' };
        const totalPages = parseInt(res.headers.get('x-wp-totalpages') || res.headers.get('X-WP-TotalPages')) || 1;
        const total = parseInt(res.headers.get('x-wp-total') || res.headers.get('X-WP-Total'));
        return { posts, totalPages, total };
      } catch (err) {
        reason = describeNetworkError(err);
        if (attempt < 3) { await sleep(800 * attempt); continue; }
        return { fail: reason };
      }
    }
  };

  const first = await getPage(1);
  if (first.error || first.fail) return { domain, count: 'Conn. Error', links: [], reason: first.error || first.fail };

  const links = [];
  const collect = posts => { for (const p of posts) links.push({ url: p.link, pubDate: p.date ? p.date.split('T')[0] : '' }); };
  collect(first.posts);

  const pages = Math.min(first.totalPages || 1, MAX_POST_PAGES);
  for (let page = 2; page <= pages; page++) {
    const r = await getPage(page);
    if (r.end) break;
    if (r.error || r.fail) break; // a later-page hiccup → keep what we have rather than fail the whole site
    collect(r.posts);
  }

  const count = Number.isFinite(first.total) ? first.total : links.length;
  return { domain, count, links };
}

// ---------------------------------------------------------------------------
// Steps 5–6: analyze a post — count external links and categorize task type.
// Returns { externalCount, taskType }.
// ---------------------------------------------------------------------------
export async function analyzePost(postUrl, sourceDomain) {
  try {
    const res = await fetch(postUrl, { signal: AbortSignal.timeout(15000) });
    const html = await res.text();

    // Isolate the post's actual content (most specific first). Scoping to the
    // article — not the whole page — is what keeps a YouTube link or external
    // link that lives in the site's header/footer/sidebar from being counted.
    // Non-greedy so we grab the first article/main, not everything up to the
    // last closing tag (which would swallow related-post blocks).
    const grab = re => { const m = html.match(re); return m ? m[1] : null; };
    const content =
      grab(/<article[^>]*>([\s\S]*?)<\/article>/i) ||
      grab(/<main[^>]*>([\s\S]*?)<\/main>/i) ||
      html; // last resort: whole page (rare — theme has neither tag)

    const rootDomain = sourceDomain.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
    // Count external links anywhere in the article body (not just <p> tags, so
    // links inside lists/divs still count).
    const hrefRegex = /href=["'](https?:\/\/[^"']+)["']/gi;
    let match;
    let externalCount = 0;
    while ((match = hrefRegex.exec(content)) !== null) {
      const link = match[1];
      const isExternal = !link.includes(rootDomain);
      const isDateLink = /\/\d{4}\/\d{2}\//.test(link);
      if (isExternal && !isDateLink) externalCount++;
    }

    // Video Bridge = the post embeds/links a YouTube video IN ITS CONTENT. Check
    // the isolated article, NOT the whole page — otherwise a footer/social
    // YouTube link turns every post on the site into a Video Bridge.
    const lc = content.toLowerCase();
    const hasYouTube = lc.includes('youtube.com') || lc.includes('youtu.be');

    let taskType = 'Others';
    if (hasYouTube) taskType = 'Video Bridge';
    else if (externalCount >= 10) taskType = 'Sequoia';

    return { externalCount, taskType };
  } catch {
    return { externalCount: 0, taskType: 'Error' };
  }
}

// ---------------------------------------------------------------------------
// Step 8: SerpApi indexation check for one post URL.
// Returns 'Indexed' / 'Unindexed' / 'Invalid Key' / 'No Credits' / 'Error' /
// 'Conn. Error'. Transient errors are retried automatically (see withSerpRetry).
// ---------------------------------------------------------------------------
export async function checkIndexed(url) {
  return withSerpRetry(() => checkIndexedOnce(url));
}
async function checkIndexedOnce(url) {
  // Drop the scheme — Google's site: operator is more reliable without it, and
  // it matches how the site-wide search builds its query.
  const q = `site:${url.replace(/^https?:\/\//i, '')}`;
  const apiUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&engine=google&api_key=${serpKey()}`;
  try {
    const res = await fetch(apiUrl, { signal: AbortSignal.timeout(12000) });
    const json = await res.json();
    if (json.error) {
      const low = String(json.error).toLowerCase();
      if (low.includes("hasn't returned")) return 'Unindexed';
      if (low.includes('api_key')) return 'Invalid Key';
      if (isOutOfQuota(low)) return 'No Credits';
      return 'Error';
    }
    // Only trust a blank as "Unindexed" if we actually got a results page back.
    // A reply with neither a results section nor a "no results" signal is a
    // non-answer — return 'Error' (retried, and excluded from the rate) rather
    // than fabricating a confident "Unindexed".
    if (!json.search_information && !json.organic_results) return 'Error';
    const total = json.search_information?.total_results || 0;
    const hasOrganic = json.organic_results?.length > 0;
    return (total > 0 || hasOrganic) ? 'Indexed' : 'Unindexed';
  } catch {
    return 'Conn. Error';
  }
}

// ---------------------------------------------------------------------------
// Steps 9–11: aggregate indexed Sequoia/VB counts per domain, then compute
// rates, the combined rate, and the priority score. Mirrors the sheet formula:
//   Priority = IF((Seq+VB)=0,"N/A", ROUNDUP(((unindexedSeq*10)+unindexedVB) * mult))
// Returns one result object per trackerDomain.
// ---------------------------------------------------------------------------
export function computeDomainStats(postLinks, trackerDomains) {
  const statsMap = {};
  for (const item of postLinks) {
    const key = (item.domain || '').toLowerCase().trim();
    if (!statsMap[key]) statsMap[key] = { sequoia: 0, videoBridge: 0, indexedSequoia: 0, indexedVideoBridge: 0 };
    // Only count posts whose index check was conclusive (Indexed / Unindexed).
    // A check that errored is "unknown" — excluded from both the total and the
    // rate, so a transient failure can't quietly count as "not indexed".
    const conclusive = item.indexStatus === 'Indexed' || item.indexStatus === 'Unindexed';
    if (item.taskType === 'Sequoia' && conclusive) {
      statsMap[key].sequoia++;
      if (item.indexStatus === 'Indexed') statsMap[key].indexedSequoia++;
    }
    if (item.taskType === 'Video Bridge' && conclusive) {
      statsMap[key].videoBridge++;
      if (item.indexStatus === 'Indexed') statsMap[key].indexedVideoBridge++;
    }
  }

  return trackerDomains.map(domain => {
    const key = (domain || '').toLowerCase().trim();
    const s = statsMap[key] || { sequoia: 0, videoBridge: 0, indexedSequoia: 0, indexedVideoBridge: 0 };

    const seqRate = s.sequoia > 0 ? Math.min(s.indexedSequoia / s.sequoia, 1.0) : 0;
    const vbRate = s.videoBridge > 0 ? Math.min(s.indexedVideoBridge / s.videoBridge, 1.0) : 0;

    const totalCombined = s.sequoia + s.videoBridge;
    const indexedCombined = s.indexedSequoia + s.indexedVideoBridge;
    const combinedRate = totalCombined > 0 ? Math.min(indexedCombined / totalCombined, 1.0) : null;

    let priorityScore = null;
    if (totalCombined > 0) {
      const unindexedSeqWeighted = (s.sequoia - s.indexedSequoia) * 10;
      const unindexedVB = s.videoBridge - s.indexedVideoBridge;
      const baseScore = unindexedSeqWeighted + unindexedVB;
      const multiplier = (combinedRate !== null && combinedRate > seqRate) ? combinedRate : seqRate;
      priorityScore = Math.ceil(baseScore * multiplier);
    }

    return {
      domain,
      totalSequoia: s.sequoia,
      indexedSequoia: s.indexedSequoia,
      seqRate,
      totalVideoBridge: s.videoBridge,
      indexedVideoBridge: s.indexedVideoBridge,
      vbRate,
      combinedRate,
      priorityScore,
    };
  });
}

// ---------------------------------------------------------------------------
// Full pipeline for ONE domain (Steps 1–11), end to end. Used by the
// background runner so each site is either fully done or cleanly skipped.
//
// Returns { row, posts, creditIssue, credits }:
//   row         – a tracker row with the same shape the sheet writer expects
//                 (or a failed row with failReason).
//   posts       – this site's analyzed posts, each with an indexStatus.
//   creditIssue – 'No Credits' / 'Invalid Key' if SerpApi blocked us, else null.
//                 When set, the row/posts are incomplete and must NOT be saved;
//                 the runner should stop.
//   credits     – { search, checks } SerpApi credits actually spent (for the
//                 Usage tracker). Quota-blocked calls aren't counted.
// ---------------------------------------------------------------------------
export async function auditDomain(domain) {
  const d = String(domain || '').trim();
  let search = 0, checks = 0; // SerpApi credits spent

  // Step 1: WordPress post count (no SerpApi credit).
  const { value: wp, reason } = await fetchWPPostCount(d);
  if (!Number.isFinite(wp)) {
    return { row: { domain: d, wpCount: '-', serpCount: '-', rate: '-', failed: true, failReason: reason || 'Unreachable' }, posts: [], creditIssue: null, credits: { search, checks } };
  }

  // Step 2: SerpApi site: count.
  const serpCount = await fetchSerpCount(d);
  if (serpCount === 'No Credits' || serpCount === 'Invalid Key') {
    return { row: { domain: d }, posts: [], creditIssue: serpCount, credits: { search, checks } };
  }
  const serp = parseInt(serpCount);
  const serpOk = Number.isFinite(serp);
  if (serpOk) search = 1; // only charge a search credit when a real number came back
  const rate = (wp > 0 && serpOk) ? Math.min(serp / wp, 1.0) : 0;

  // Steps 4–7: post links + analysis. A site that becomes unreachable here is
  // marked failed (mirrors the manual run).
  const { count, links, reason: pReason } = await fetchPostLinks(d);
  if (!Number.isFinite(parseInt(count))) {
    return { row: { domain: d, wpCount: '-', serpCount: '-', rate: '-', failed: true, failReason: pReason || 'Unreachable' }, posts: [], creditIssue: null, credits: { search, checks } };
  }
  const posts = [];
  for (const { url, pubDate } of links) {
    const { externalCount, taskType } = await analyzePost(url, d);
    posts.push({ domain: d, link: url, pubDate, externalCount, taskType });
  }

  // Step 8: indexation check for Sequoia/VB posts.
  for (const p of posts) {
    if (p.taskType === 'Others' || p.taskType === 'Error') { p.indexStatus = 'Skip'; continue; }
    let status = await checkIndexed(p.link);
    if (status === 'No Credits' || status === 'Invalid Key') {
      return { row: { domain: d }, posts: [], creditIssue: status, credits: { search, checks } };
    }
    checks += 1; // a real index check → charged
    // Guard against a transient false-negative: `site:` occasionally returns
    // nothing for a page that IS indexed. Re-verify an "Unindexed" once and
    // trust an "Indexed" on the second look.
    if (status === 'Unindexed') {
      const recheck = await checkIndexed(p.link);
      if (recheck === 'No Credits' || recheck === 'Invalid Key') {
        return { row: { domain: d }, posts: [], creditIssue: recheck, credits: { search, checks } };
      }
      checks += 1;
      if (recheck === 'Indexed') status = 'Indexed';
    }
    p.indexStatus = status;
    await sleep(1000 + Math.floor(Math.random() * 1000));
  }

  // Steps 9–11: rates, combined rate, priority.
  const stats = computeDomainStats(posts, [d])[0];
  // Keep the original error string (e.g. 'Conn. Error') when the search didn't
  // return a number, so the status label downstream can be specific instead of
  // a bare "ERROR".
  const row = { domain: d, wpCount: wp, serpCount: serpOk ? serp : serpCount, rate, failed: false, ...stats };
  return { row, posts, creditIssue: null, credits: { search, checks } };
}
