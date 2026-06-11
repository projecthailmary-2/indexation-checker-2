# Roadmap

A running plan of what's shipped and what's next. Plain-language on purpose.

## Shipped (in production)
- **v1.6 — URL Index Checker tab.** Paste URLs → checks each via Google's `site:`
  operator, retries up to 3x, clear per-URL result/context, copy/CSV out.
- **v1.7 — URL Index Checker keeps its state across tab switches.**

## In testing (beta branch `v2-sheets-beta`, tag `v2.0-beta`)
- **v2 — Google Sheets integration.**
  - Reads the site list from the **TRACKING- MAINTENANCE/REHAB** tab
    (oldest-checked-first batches; pick how many to check).
  - Writes audit results back into each site's row — only the raw-input columns,
    never formulas; preserves manual notes; writes a number on success or a short
    status (DOWN / NO WP API / …) on failure.
  - Appends a dated snapshot per site to an **Indexation History** tab (never
    overwritten) for historical / quarter-over-quarter comparison.
  - Currently tested against a **copy** of the workbook.

## Planned (after v2 ships)

### 1. Automatic monthly audit — spread over the last 7 days
- A scheduled job runs **once a day during the last 7 days of the month**, each
  run auditing ~1/7 of the library (the most-overdue sites), so the whole sheet
  is **fresh by the 1st**.
- Fits Vercel **Hobby** (scheduled jobs run once/day). Because a day's chunk
  (~450 sites) is longer than a single Vercel function allows, the daily run is
  powered by a long-runner — leaning toward **GitHub Actions** (free, scheduled),
  or self-chaining via existing Upstash.
- **Auto-spends SerpApi credits**, paced evenly over the week.

### 2. Settings tab (control panel)
- In-app tab to control and monitor the auto-audit:
  - **On/Off switch** (stop/start) — the scheduled job reads this each run and
    skips when Off.
  - Run window (last N days), sites/day, **monthly credit cap** (safety),
    run time.
  - **"Run a batch now"** button (manual trigger).
  - **Status panel:** last run, this-cycle progress, next run, errors.
- Config + run-state stored in the existing **Upstash**; no new services.

### 3. Notifications — Slack or email
- Send a **Slack message or email** when the monthly audit **finishes**
  (summary: sites done, errors) and when it **fails / hits the credit cap**.
- Channel TBD: Slack (incoming webhook) or email (e.g. Resend/SMTP).

## Parked
- **In-app analytics Dashboard** (coverage, utilization by category, indexation
  rate distribution, period-over-period trends). Built but disconnected; will be
  revived to read from the History tab once the data pipeline is settled.

## Constraints to remember
- **Vercel Hobby:** scheduled jobs run once/day; short function timeouts.
- The auto-audit writes to the **live sheet** and **spends credits** — hence the
  off-switch, credit cap, and notifications.
- All automation depends on **v2 (Sheets read/write) being live** first.
