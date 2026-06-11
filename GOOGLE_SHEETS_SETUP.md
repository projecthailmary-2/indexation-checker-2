# Connecting the app to your Google Sheet

This is a one-time setup (about 10–15 minutes). After it's done, the app can
read your site list from the **TRACKING- MAINTENANCE/REHAB** tab and write each
month's audit results back into it.

You'll end up with **three values** to paste into the app's settings:
`GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and `GOOGLE_SHEET_ID`.

> **Test on a copy first.** Because the app *writes into* this sheet, start by
> making a duplicate of your workbook (File → Make a copy) and use the copy's ID
> below. Once we've confirmed it writes to exactly the right cells, switch to the
> real one. The robot account needs **Editor** access (not just Viewer) so it can
> write.

---

## Step 1 — Create a Google Cloud project

1. Go to https://console.cloud.google.com/
2. At the top, click the project dropdown → **New Project** → give it a name
   (e.g. "Indexation Checker") → **Create**.

## Step 2 — Turn on the Google Sheets API

1. With your new project selected, go to
   https://console.cloud.google.com/apis/library/sheets.googleapis.com
2. Click **Enable**.

## Step 3 — Create the "robot account" (service account)

1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click **Create Service Account**.
3. Give it a name (e.g. "sheet-writer") → **Create and Continue** →
   skip the optional steps → **Done**.
4. You'll see it listed with an email like
   `sheet-writer@your-project.iam.gserviceaccount.com`.
   **This email is your `GOOGLE_SERVICE_ACCOUNT_EMAIL`.** Copy it somewhere.

## Step 4 — Get the robot's key

1. Click the service account you just made → **Keys** tab.
2. **Add Key → Create new key → JSON → Create.**
3. A `.json` file downloads. Open it in a text editor. Inside you'll find:
   - `"client_email"` — should match the email from Step 3.
   - `"private_key"` — a long block starting with `-----BEGIN PRIVATE KEY-----`.
     **This whole value (including the quotes) is your `GOOGLE_PRIVATE_KEY`.**

## Step 5 — Share your workbook copy with the robot

1. Open your **copy** of the workbook (the duplicate you made for testing).
2. Look at its web address:
   `https://docs.google.com/spreadsheets/d/`**`THIS_LONG_PART`**`/edit`
   **That long part is your `GOOGLE_SHEET_ID`.** Copy it.
3. Click **Share** (top right), paste the robot's email from Step 3,
   set it to **Editor**, and send. (You can untick "notify people".)

> The app reads the site list from the **TRACKING- MAINTENANCE/REHAB** tab and
> writes results back into it. It only fills the raw-input columns (counts and
> the check date) and never touches a cell that contains a formula.

## Step 6 — Put the three values into the app

**On Render (the live app):**
1. Open your service in the Render dashboard → **Environment**.
2. Add three variables:
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` = the email from Step 3
   - `GOOGLE_PRIVATE_KEY` = the private key from Step 4 (paste it exactly,
     including the `-----BEGIN/END-----` lines)
   - `GOOGLE_SHEET_ID` = the ID from Step 5 (your **copy** for now)
   - `GOOGLE_TRACKING_TAB` = `TRACKING- MAINTENANCE/REHAB` (only if your tab is
     named differently; otherwise this can be left out)
3. Save — Render will redeploy automatically.

**For local testing (optional):** copy `.env.local.example` to `.env.local`
and fill in the same three values.

---

## That's it

Run the tool as usual. When it finishes, click **Save to Sheet** — the results
get added to your sheet, and the **Dashboard** tab inside the app lets you
filter everything you've saved by date, site, category, and index status.
