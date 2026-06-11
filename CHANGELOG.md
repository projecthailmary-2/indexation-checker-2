# Changelog

## 2026-06-05

Added Google Sheets integration so the app can read our site list and write
audit results directly into the **PBN Maintenance and Quarantine** workbook,
plus a new standalone URL indexation-checker tool. All work is currently being
tested against a **copy** of the workbook; the app's existing analysis logic
was not changed.

### What was built

**1. Google Sheets connection (service account)**
- The app connects to our Google Sheet via a "robot" service account.
- Reads the site list from the **TRACKING- MAINTENANCE/REHAB** tab and writes
  results back into it.

**2. "Load oldest-checked sites" (rolling batches)**
- New control to pull the site list straight from the tracking tab — no more
  pasting domains.
- A **"Sites to check"** number lets us audit any batch size (e.g. 50); blank = all.
- Sites are ordered **least-recently-checked first** (never-checked sites lead),
  using each site's last-checked date. Because writing back stamps today's date,
  each batch automatically continues where the last left off and rolls through
  the whole library.

**3. Write results back to the tracking tab**
- Writes only the raw-input columns: Total Indexed (site: search), Total Pages,
  Sequoias Published, Sequoias Indexed, and the check date.
- Finds columns by their header name (safe if columns get reordered).
- **Never overwrites formulas** (indexation rates, change-vs-previous-quarter,
  priority score, etc. stay intact).
- **Preserves manual text notes** left in the date column (e.g. "possible malware").
- Writes the real **number on success**, or a short **status on failure**
  (DOWN / NO WP API / SEARCH ERROR…) so errors can be grouped.

**4. Append-only "Indexation History" tab (historical data)**
- Each run also files one dated snapshot per site into a new **Indexation History**
  tab (auto-created), which is never edited or deleted.
- This preserves history for quarter-over-quarter comparison and will power
  reporting later, while the tracking tab stays the live "current" view.

**5. New "URL Index Checker" tab (standalone tool)**
- Paste URLs → checks each with Google's `site:` operator.
- **Retries up to 3x** on transient failures (timeouts, rate-limits, etc.).
- Clear result context (e.g. "12 results in Google", "no results — not found",
  "failed after 3 attempts — request timed out").
- **Copy results** (pastes straight into Sheets) + CSV download;
  Indexed/Unindexed/Errors counts.
- Sidebar auto-hidden on this tab to avoid input confusion.

### Decisions
- The Google Sheet remains the single source of truth; the app reads/writes it
  rather than holding its own database.
- Monthly re-audit of the same site list, **updating each site's row in place**
  + keeping append-only history (so nothing is lost on overwrite).
- A reporting **Dashboard was scoped and built but parked** for now to focus on
  getting the data writing right; it will later read from the History tab.

### Status / Next
- Verified: connection works (read 3,049 sites), and the URL Index Checker runs
  live (Indexed/Unindexed correctly).
- Pending: first small **audit write-back test** (3 sites) on the copy to confirm
  cells land correctly before scaling up.
- Still on the **copy** workbook, not the live one. Using a temporary shared
  SerpApi key.
- For production deploy (Render): add the Google + SerpApi environment variables
  there and swap in the real SerpApi key.
