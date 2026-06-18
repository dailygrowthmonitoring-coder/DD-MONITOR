# DD Monitor — Autosupport Email Courier + Daily Fleet Digest

Google Apps Script that polls Gmail every 30 minutes for autosupport emails from
the three device groups (BAG, OFFSET, AVAMAR), uploads each attachment to
Supabase Storage, triggers the ingest pipeline, and (once per day) sends a
fleet-status digest email via MailApp.

## Files

| File | Purpose |
|------|---------|
| `Code.gs` | Main script — copy the entire contents into the Apps Script editor |

## Setup

### 1. Create the Apps Script project

1. Open [script.google.com](https://script.google.com) while signed in to the
   Gmail account that receives autosupport emails.
2. Click **New project**.
3. Replace the default `Code.gs` content with the contents of `Code.gs` in this
   directory.
4. Name the project **DD Monitor Courier**.

### 2. Configure Script Properties

Go to **Project Settings** (gear icon) → **Script properties** → **Add property**
for each of the following:

**Courier (required)**

| Property | Value |
|----------|-------|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_SERVICE_KEY` | Service role JWT (from Supabase → Settings → API) |
| `INGEST_URL` | `https://<your-app>.vercel.app/api/ingest` |
| `INGEST_SECRET` | Value of `INGEST_SECRET` env var set in Vercel |

**Daily digest (required)**

| Property | Value |
|----------|-------|
| `FLEET_SUMMARY_URL` | `https://<your-app>.vercel.app/api/fleet-summary` |
| `DIGEST_RECIPIENTS` | Comma-separated email addresses, e.g. `ops@example.com,mgr@example.com` |
| `DASHBOARD_URL` | Root URL of your app, e.g. `https://<your-app>.vercel.app` (no trailing slash) |

**Daily digest (optional)**

| Property | Default | Value |
|----------|---------|-------|
| `DIGEST_AFTER_HOUR` | `9` | Baghdad hour (0–23) after which the digest may send. Default: 9 (= 09:00 Baghdad = 06:00 UTC) |

**Never** paste secrets directly into `Code.gs`.

### 3. Authorize the script

Run the `installTrigger` function once from the editor
(**Run** → **Run function** → `installTrigger`).  Apps Script will ask you to
grant permissions:

- Gmail (read messages and manage labels)
- External URL fetch (for Supabase Storage, the ingest API, and the fleet-summary API)
- Email (to send the daily digest via MailApp)

Review and accept.

### 4. Verify the trigger

Go to **Triggers** (clock icon in the left sidebar).  You should see one entry:

```
processAutosupportEmails  —  Time-driven  —  Every 30 minutes
```

If you need to change the interval, edit `installTrigger` in `Code.gs` (e.g.
replace `.everyMinutes(30)` with `.everyHours(1)`) and run it again.

## How it works

```
Gmail search (every 30 min)
  ↓ threads matching subject:autosupport-{bag,offset,avamar} -label:dd-processed
  ↓ for each message with attachments:
      → gzip attachment (skip if already .gz)
      → PUT raw-reports/inbound/YYYY-MM-DD/<msgId>/<idx>.gz   (Supabase Storage)
      → POST /api/ingest  { storagePath, emailMessageId, subjectHint }
         x-ingest-key: <INGEST_SECRET>
      → on HTTP 200 or 409 (duplicate): mark thread dd-processed
      → on HTTP 5xx: leave unlabeled (retry next run)
  ↓
  maybeSendDigest_()
      → skip if DIGEST_SENT_<date> flag already set
      → skip if current Baghdad hour < DIGEST_AFTER_HOUR
      → GET /api/fleet-summary  x-ingest-key: <INGEST_SECRET>
      → build HTML email (status counts, group status, fleet table, alerts)
      → MailApp.sendEmail → DIGEST_RECIPIENTS
      → set DIGEST_SENT_<date> flag
```

## Daily digest email

The digest is sent once per calendar day (Asia/Baghdad).  It contains:

- **Status tiles** — Critical / Warning / Healthy / No Report counts
- **Report status by group** — which of BAG / OFFSET / AVAMAR reported today
- **Needs Attention** — only non-healthy devices with a reason line
- **Fleet Overview table** — every active device, group, health status, capacity %, report time
- **Device Alerts** — each active CRITICAL/WARNING alert with class, object, and message
- **Open Dashboard** button (if `DASHBOARD_URL` is set)

Status colors and thresholds come from `computeStatus()` and the live `alert_rules` table —
exactly the same logic the dashboard uses.  The email and dashboard will always agree.

**Three states the subject line signals:**

| Scenario | Subject example |
|----------|-----------------|
| Any critical issue | `DD Monitor — 2 critical · 16 Jun` |
| Reports missing (no critical) | `DD Monitor — reports missing · 16 Jun` |
| Warnings only | `DD Monitor — 3 warning · 16 Jun` |
| All healthy, all received | `DD Monitor — all healthy · 16 Jun` |

**MailApp quota:** Google's free quota is ~100 recipient-emails per day for consumer
accounts.  For a small ops team this is more than sufficient.  If you need to exceed
this quota, use Brevo (already wired in the system) via a separate digest route.

## Deduplication

Two layers keep the same report from being stored twice:

1. **Gmail label** — `dd-processed` prevents the same email from being processed
   in a subsequent run.
2. **`reports.email_message_id UNIQUE` constraint** — the ingest API returns
   HTTP 409 if a report with the same Gmail message ID already exists.  The
   Apps Script treats 409 as success and labels the email.

The daily digest is deduplicated by a PropertiesService flag (`DIGEST_SENT_<date>`).
Only one digest is sent per Baghdad calendar day regardless of how many trigger runs fire.

## Subject-vs-hostname mismatch

The `subjectHint` field (`BAG`, `OFFSET`, or `AVAMAR`) is derived from the
email subject and passed to the ingest API as an optional field.  The API's
hostname parser is authoritative — it always resolves the device by the
`HOSTNAME=` line inside the file.  If the resolved device group does not match
the hint, the API logs a `subject_group_mismatch` warning and records it in the
`report_received` notification body.  The report is **never** rejected on this
basis alone.

## Manual testing

Run these helper functions from the Apps Script editor (**Run** menu).
Check **View → Logs** (or Execution log) for detailed output after each run.

| Function | What it does |
|----------|-------------|
| `testFleetSummaryFetch()` | Fetches `/api/fleet-summary` and logs the full parsed JSON.  Run this first to verify the data before sending. |
| `testDigestNow()` | Builds and sends the digest email immediately, bypassing the time gate and dedupe flag.  Clears the flag afterwards so the production trigger can still send today. |
| `clearTodayFlags()` | Manually clears `DIGEST_SENT_<today>` so the next production trigger run will re-attempt sending. |
| `installTrigger()` | (Re-)installs the 30-minute time-based trigger. |

**Recommended verification flow:**

1. Confirm at least one report has been ingested for today.
2. Run `testFleetSummaryFetch()` → inspect the log. Verify device count, status, group reception.
3. Run `testDigestNow()` → check your inbox within seconds.
4. Confirm the email matches what the dashboard shows.

## Viewing execution logs

**Apps Script editor** → left sidebar → **Executions** (clock with lines icon).
Each run shows its log output, duration, and whether it succeeded or threw.

## Troubleshooting

| Symptom | Likely cause |
|---------|-------------|
| Script fails immediately | Missing Script Property — check all required properties are set |
| HTTP 401 from ingest API | `INGEST_SECRET` doesn't match the Vercel env var |
| HTTP 401 from fleet-summary | Same — `INGEST_SECRET` is also used for `GET /api/fleet-summary` |
| HTTP 502 from ingest API | Supabase Storage upload succeeded but file not found — check bucket name `raw-reports` |
| Emails labeled but no reports appear in dashboard | `INGEST_URL` points to wrong deployment or path |
| Digest not sending | Check: `DIGEST_AFTER_HOUR` vs current Baghdad time; check `DIGEST_SENT_<date>` flag; run `testDigestNow()` manually |
| Digest sends but shows wrong data | Verify `FLEET_SUMMARY_URL` is the correct Vercel deployment URL |
| Trigger not firing | Run `installTrigger` again; check Apps Script quota in GCP console |
