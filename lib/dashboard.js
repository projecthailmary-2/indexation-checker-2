// lib/dashboard.js
// Aggregates "Indexation History" snapshots into time periods for the Dashboard:
// per-period Site / Sequoia / Video Bridge rates + counts, coverage, period
// averages, and period-over-period comparison. Only OK rows count toward rates
// (errored/failed snapshots are excluded so they don't skew the numbers).

function parseDate(s) {
  const t = Date.parse(String(s || ''));
  return Number.isNaN(t) ? null : new Date(t);
}
const num = v => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Monday of the week containing d.
function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); // 0 = Monday
  return x;
}

// { key (sortable), label, start, end } for the period a date falls in.
function periodInfo(date, period) {
  if (period === 'month') {
    const start = new Date(date.getFullYear(), date.getMonth(), 1);
    const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
    return { key: `${date.getFullYear()}-${pad(date.getMonth() + 1)}`, label: `${MONTHS[start.getMonth()]} ${start.getFullYear()}`, start, end };
  }
  if (period === 'quarter') {
    const q = Math.floor(date.getMonth() / 3); // 0..3, calendar quarters
    const start = new Date(date.getFullYear(), q * 3, 1);
    const end = new Date(date.getFullYear(), q * 3 + 3, 0);
    return { key: `${date.getFullYear()}-Q${q + 1}`, label: `${MONTHS[q * 3]}–${MONTHS[q * 3 + 2]} ${start.getFullYear()}`, start, end };
  }
  // week (default)
  const start = weekStart(date);
  const end = new Date(start); end.setDate(end.getDate() + 6);
  return { key: ymd(start), label: `Week of ${MONTHS[start.getMonth()]} ${start.getDate()}`, start, end };
}

// Bucket snapshots into one `period` (week/month/quarter), keeping the LATEST
// snapshot per site per bucket, and summarise rates + counts + coverage.
function bucketPeriods(ok, period, libraryTotal, now) {
  const buckets = new Map();
  for (const { d, domain, r } of ok) {
    const info = periodInfo(d, period);
    if (!buckets.has(info.key)) buckets.set(info.key, { info, byDomain: new Map() });
    const b = buckets.get(info.key);
    const prev = b.byDomain.get(domain);
    if (!prev || d > prev.d) b.byDomain.set(domain, { d, r });
  }
  const rate = (i, t) => (t > 0 ? i / t : null);
  return [...buckets.values()].map(({ info, byDomain }) => {
    let siteTotal = 0, siteIndexed = 0, seqTotal = 0, seqIndexed = 0, vbTotal = 0, vbIndexed = 0;
    for (const { r } of byDomain.values()) {
      // Clamp site-wide indexed at the post count. Google's `site:` estimate is
      // unreliable and occasionally returns a garbage value (billions) that would
      // otherwise blow up the pooled Site %. This matches the per-site rate,
      // which is already capped at 100% at audit time.
      const post = num(r['Total Post']);
      siteTotal += post; siteIndexed += Math.min(num(r['Total Indexed']), post);
      seqTotal += num(r['Seq Total']); seqIndexed += num(r['Seq Indexed']);
      vbTotal += num(r['VB Total']); vbIndexed += num(r['VB Indexed']);
    }
    return {
      key: info.key, label: info.label, start: ymd(info.start), end: ymd(info.end),
      coverage: byDomain.size,
      coveragePct: libraryTotal > 0 ? byDomain.size / libraryTotal : null,
      inProgress: now >= info.start && now <= info.end,
      siteTotal, siteIndexed, siteRate: rate(siteIndexed, siteTotal),
      seqTotal, seqIndexed, seqRate: rate(seqIndexed, seqTotal),
      vbTotal, vbIndexed, vbRate: rate(vbIndexed, vbTotal),
    };
  }).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
}

export function aggregateHistory(rows, { period = 'week', libraryTotal = 0, now = new Date() } = {}) {
  // Keep only successful snapshots with a parseable date.
  const ok = [];
  for (const r of rows) {
    if (String(r['Status'] || '').trim().toUpperCase() !== 'OK') continue;
    const d = parseDate(r['Date']);
    if (d) ok.push({ d, domain: String(r['Domain'] || '').toLowerCase().trim(), r });
  }

  const periods = bucketPeriods(ok, period, libraryTotal, now);

  // For the 3-month (quarter) view, also break each quarter into its 3 months,
  // so the dashboard can show the per-month detail behind the 3-month number.
  if (period === 'quarter') {
    const months = bucketPeriods(ok, 'month', libraryTotal, now);
    for (const q of periods) q.months = months.filter(m => m.start >= q.start && m.start <= q.end);
  }

  // Period average = simple mean of the per-period rates (each period weighted
  // equally) — matches the boss's "3-month average" definition.
  const avg = sel => {
    const v = periods.map(sel).filter(x => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
  };
  const averages = { siteRate: avg(p => p.siteRate), seqRate: avg(p => p.seqRate), vbRate: avg(p => p.vbRate) };

  // Period-over-period: latest vs the one before it.
  let comparison = null;
  if (periods.length >= 2) {
    const cur = periods[periods.length - 1], prev = periods[periods.length - 2];
    const delta = (a, b) => (a != null && b != null ? a - b : null);
    comparison = {
      current: cur, previous: prev,
      siteDelta: delta(cur.siteRate, prev.siteRate),
      seqDelta: delta(cur.seqRate, prev.seqRate),
      vbDelta: delta(cur.vbRate, prev.vbRate),
    };
  }

  return { period, libraryTotal, periods, averages, comparison };
}
