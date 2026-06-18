# DD MONITOR — ARCHITECTURE.md

> **Status: AUTHORITATIVE.** This document is the single source of truth for system
> architecture. Any implementation (human or AI-generated) MUST conform to it.
> If a change is needed, this file is updated FIRST, then code follows.
> Read together with `STANDARDS.md` before writing any code.

- Project: **DD Monitor** — Enterprise observability for Dell Data Domain backup appliances
- Owner: Hassan (Admin)
- Deployment target: Zain Iraq backup infrastructure
- Version: **2.0** — consolidated final architecture (2026-06-12). Supersedes v1.x.

---

## 0. Production mandate — read this first

This is a **REAL, large-scale, enterprise-grade PRODUCTION system**. It is NOT a
demo, NOT a prototype, NOT a mockup, NOT a proof of concept, and NOT a learning
exercise. It will be officially adopted at the company and used daily by the team
to monitor live backup infrastructure carrying real operational responsibility.

Consequences for every piece of code written for this repo:

- **No mock data, no placeholder values, no hardcoded samples** outside test
  fixtures. If real data isn't available yet, build the empty state — never fake it.
- **No "TODO later" on error handling, validation, security, or edge cases.**
  Production-grade or it doesn't merge.
- **No demo shortcuts**: no disabled auth "for now", no skipped RLS, no
  commented-out checks, no console.log debugging left behind.
- The system must withstand real daily volume (multiple multi-MB reports/day,
  growing fleet, years of accumulated metrics) and real failure modes (malformed
  reports, duplicate emails, late arrivals, network failures).
- Treat every decision as one the company will live with for years.

## 1. Purpose & scope

Dell Data Domain appliances email a daily **autosupport report** per device
(plain text, 2.3–3.4 MB, ~46–50 sections depending on DD OS version). The fleet is
organized by the client into three logical groups — **BAG**, **OFFSET**, **AVAMAR** —
each group containing one or more devices, each device producing one report per day.
Manually reviewing these reports daily is slow and error-prone.

DD Monitor:

1. **Ingests** the daily reports automatically from a dedicated Gmail inbox.
2. **Parses** the valuable ~10 sections into structured metrics (~60–80 datapoints/report).
3. **Stores** them in ONE relational database with strict conflict prevention,
   organized along two axes: the **device axis** (groups → devices) and the
   **time axis** (one report per device per day).
4. **Visualizes** everything on a color-coded dashboard: All Fleet overview +
   per-group views (sidebar buttons) + per-device detail pages.
5. **Notifies** the team by email: ingest confirmations, missing-report warnings,
   critical findings, and new-device classification requests.

Out of scope (v1): writing back to devices, SNMP/live polling, multi-tenant use.

### 1.1 Verified fleet variance (from real sample reports)

| Group | Sample device | Model | DD OS | Sections | Time zone | Notes |
|---|---|---|---|---|---|---|
| AVAMAR | DDAvamar.iq.zain.com | DD6300 | 6.2.0.30 | 46 | Asia/Baghdad | very high comp factors (~128x) |
| OFFSET | DD9300IBDDC.iq.zain.com | DD9300 | 7.7.5.25 | 49 | **Europe/London** | new 7.x sections, different ordering |
| BAG | DD9300.iq.zain.com | DD9300 | **7.13.1.25** | 50 | Asia/Baghdad | Cloud Tier rows + separate **part B JSON** file |
| (unassigned sample) | DD6300BSR.iq.zain.com | DD6300 | 6.2.0.30 | 46 | Asia/Baghdad | original reference report |

Groups may contain additional devices; the system must handle any count dynamically.

## 2. Tech stack (all free tier)

| Layer | Technology | Notes |
|---|---|---|
| Frontend + API | Next.js 15 (App Router) + TypeScript, deployed on **Vercel** | Hobby tier |
| Database | **Supabase Postgres** — ONE project, ONE database | RLS enabled on every table |
| Object storage | **Supabase Storage** | raw report files (gzip) + part B JSON |
| Auth | Supabase Auth | 2 users: admin, viewer |
| Email intake | Dedicated **Gmail** account + **Google Apps Script** (time trigger) | system's own mailbox |
| Email outbound | **Brevo** (300 emails/day free) | notification templates |
| Scheduler | **Vercel Cron** | missing-report watchdog |
| Repo / CI | GitHub | migrations + tests on PR |

## 3. High-level architecture

```
 DD fleet — groups BAG / OFFSET / AVAMAR (any number of devices)
        │  daily autosupport email (one per device; OS 7.13 adds a part B JSON)
        ▼
 Gmail (dedicated system mailbox)
        │  Apps Script trigger, every 30 min — a dumb courier, NO sorting
        │  1. find unprocessed report emails
        │  2. upload attachment(s) → Supabase Storage (direct, gzip)
        │  3. POST /api/ingest { storagePath, emailMessageId } + INGEST_SECRET
        │  4. label email "processed"
        ▼
 Vercel — Next.js API  /api/ingest
        │  read file from Storage → Parser
        │  Parser reads HOSTNAME + GENERATED_ON + TIME_ZONE from INSIDE the file
        │  hostname → devices table → device_group   (this is where "sorting" happens)
        │  single Postgres TRANSACTION (all-or-nothing)
        │  evaluate alert_rules → queue notifications
        │  send "report received ✓" email (Brevo)
        ▼
 Supabase Postgres  ◄──────  Vercel Cron 12:00 Asia/Baghdad
        │                    (missing-report watchdog — READ ONLY,
        ▼                     never mutates report data)
 Dashboard (Next.js, RSC)
   Sidebar: All Fleet (default) · BAG · OFFSET · AVAMAR  — same component, filtered
   → Device detail (6 tabs) → Alerts → Reports log → Settings
```

**Separation model (agreed, final):** there is ONE database. Group separation is
data, not infrastructure: every report row belongs to a device, every device belongs
to a group, and each sidebar button is the same Overview component running
`WHERE device_group = X`. Apps Script never sorts or inspects content — all
intelligence is server-side in the parser.

**Key routing decision:** Apps Script uploads the file **directly to Supabase Storage**
and passes only the storage path to the API. The Vercel 4.5 MB request-body limit is
therefore never a constraint, even if reports grow.

## 4. Ingestion pipeline — contract

### 4.1 Apps Script (intake)
- Time-driven trigger: every 30 minutes.
- Search: `in:inbox has:attachment -label:dd-processed` (+ subject filter for autosupport).
- For each matching email: gzip each attachment → upload to Storage bucket `raw-reports/`
  path `{yyyy-mm-dd}/{messageId}/{attachmentIndex}.gz` → call API per attachment →
  on HTTP 200 or 409 (duplicate) apply label `dd-processed`; on 5xx leave unlabeled
  (retried next run).
- Apps Script does **zero parsing and zero group sorting**. It is a dumb courier.

### 4.2 `/api/ingest` (Next.js route handler)
1. Auth: header `x-ingest-key` must equal `INGEST_SECRET` env var. Otherwise 401.
2. Download + gunzip file from Storage.
3. **Input type detection**: content starting with `{` → part B JSON
   (`JSON.parse`, attach to the matching report by hostname + generated_on, store
   path in `reports.partb_storage_path`); content containing
   `==========  GENERAL INFO` → part A text report (the main one) → run Parser.
4. **Identification (content-based ONLY)**: device = `HOSTNAME=` line;
   `report_date` = `GENERATED_ON` interpreted in the report's own `TIME_ZONE`
   (fleet mixes Asia/Baghdad and Europe/London) — never the server's local time,
   never the email arrival time, never the filename.
5. Open one Postgres transaction:
   - upsert `devices` by hostname (**auto-registration** — unknown hostname creates
     the device with `device_group = NULL` and triggers a `new_device` notification;
     admin assigns the group once in the UI, all future reports route automatically),
   - insert `reports` row; rely on uniqueness constraints (section 5),
   - insert all child rows (capacity incl. cloud tier, compression, alerts, network,
     health, mtrees, disks),
   - insert `ingest_log` entry.
6. Commit. Then (outside the transaction): evaluate `alert_rules`,
   write `system_notifications`, send Brevo emails.
7. Responses: `200 OK` (ingested), `409 DUPLICATE` (already have it — not an error),
   `422 PARSE_FAILED` (file unreadable; logged with reason), `401`, `500`.

### 4.3 Watchdog (Vercel Cron)
- Runs daily at **12:00 Asia/Baghdad** (deadline configurable in `app_settings`).
- For every `devices.is_active = true` without a `reports` row where
  `report_date = today`: create `system_notifications` of type `report_missing`
  and send email. **It must never insert/alter report data** — detection only.

## 5. Conflict prevention (three enforced layers)

Duplicate or conflicting data is prevented by the **schema**, not by application code:

1. `reports.email_message_id UNIQUE` — same email can never be ingested twice,
   even if two triggers race.
2. `UNIQUE (device_id, report_date)` on `reports` — one report per device per day
   (the exact intersection of the device axis and the time axis).
   A re-sent report returns 409 and is recorded in `ingest_log` as `skipped_duplicate`.
3. Every ingest is **one transaction** — a report is either fully stored or not at all.
   "Half a report" is impossible by construction.

Re-processing policy: replacing an existing report requires an explicit admin action
(`reprocess` endpoint, v1.1) which deletes child rows and re-inserts atomically.
Silent overwrites are forbidden.

## 6. Parser architecture

- Location: `src/lib/parser/` — **pure TypeScript module**, zero imports from
  Next.js/Supabase. Input: `string` (raw report). Output: `ParsedReport` + `warnings[]`.
- Stage 1 — splitter: divide file on `^==========` section headers →
  `Map<sectionName, lines>`. The parser is **section-driven, never position-driven**:
  sections are located by NAME. Verified fleet variance: DD OS 6.2 = 46 sections,
  7.7 = 49, 7.13 = 50 (adds Cloud Tier rows in SERVER USAGE + cloud migration
  section). Unknown sections are ignored silently; known-but-missing optional
  sections produce warnings only.
- Stage 2 — extractors: one file per section (`generalInfo.ts`, `serverUsage.ts`,
  `filesysCompression.ts`, `alerts.ts`, `netHardware.ts`, `systemMemory.ts`,
  `diskStates.ts`, `mtreeList.ts`, `availability.ts`). Each is independently unit-tested.
- Stage 3 — assembler + validator: required fields (`hostname`, `generated_at`
  with time zone, capacity row for `/data: post-comp`) must exist or ingest fails
  with 422. Optional sections missing → warning, not failure.
  **Defensive by default**: one broken section never sinks the report.
- Part B JSON (DD OS 7.13+): a small companion file; parsed with `JSON.parse` only,
  stored raw, linked to the same report row. Part A remains the single parsing
  source for metrics in v1.
- Fixtures: real autosupport files from **every known device AND every DD OS version
  in the fleet (currently 6.2 / 7.7 / 7.13)**, including part B JSON samples, live in
  `src/lib/parser/__fixtures__/`. The validation suite must pass 100% on all fixtures
  before the parser is considered done (Phase 2 exit criterion).

## 7. Database schema (agreed v2 — matches migration 0001 exactly)

Conventions: `snake_case`, `uuid` PKs (`gen_random_uuid()`), `timestamptz` everywhere,
`numeric` for GiB values (not float), children reference `reports(id) ON DELETE CASCADE`.
Changes ONLY via migration files (see STANDARDS.md §5).

### devices
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| hostname | text | **UNIQUE**, e.g. `DD6300BSR.iq.zain.com` — the identity |
| display_name | text | e.g. `DD6300BSR` |
| device_group | text | check in (`BAG`,`OFFSET`,`AVAMAR`) **NULL** — NULL = newly auto-registered, admin assigns once in UI |
| location | text | nullable, editable in UI |
| model_no / serial_no / chassis_serial | text | from GENERAL INFO |
| os_version | text | last seen version |
| time_zone | text | from report (`Asia/Baghdad`, `Europe/London`, …) |
| admin_email | text | from report |
| is_active | boolean | default true — watchdog only checks active devices |
| first_seen_at / last_report_at | timestamptz | |

### reports
| column | type | constraints |
|---|---|---|
| id | uuid | PK |
| device_id | uuid | FK → devices |
| report_date | date | from GENERATED_ON in the report's own TIME_ZONE |
| generated_at | timestamptz | full timestamp from report |
| email_message_id | text | **UNIQUE** |
| storage_path | text | gzip part A file in Storage |
| partb_storage_path | text NULL | DD OS 7.13+ companion JSON |
| file_size_bytes | bigint | |
| status | text | check in (`parsed`,`failed`) |
| parse_warnings | jsonb | array from parser |
| created_at | timestamptz | default now() |
| | | **UNIQUE (device_id, report_date)** + index (device_id, report_date desc) |

### capacity_snapshots — one row per tier+resource per report
resource examples: `/data: pre-comp`, `/data: post-comp`, `/ddvar`, `/ddvar/core`.
Columns: `report_id FK`, `tier text` check in (`active`,`cloud`) default `active`
(DD OS 7.13 devices report a Cloud Tier block too), `resource text`, `size_gib`,
`used_gib`, `avail_gib`, `use_pct`, `cleanable_gib numeric NULL`.
**UNIQUE (report_id, tier, resource)**.

### compression_stats — one row per period per report
`period` check in (`currently_used`,`last_7_days`,`last_24_hrs`); columns
`precomp_gib`, `postcomp_gib`, `global_comp_factor`, `local_comp_factor`,
`total_comp_factor`, `reduction_pct`. **UNIQUE (report_id, period)**.

### device_alerts — alerts reported BY the appliance
`report_id FK`, `alert_id text` (e.g. `p0-273`), `severity` check in
(`CRITICAL`,`WARNING`,`INFO`,`NOTICE`), `class`, `object`, `message`,
`posted_at timestamptz`, `is_active boolean`. **UNIQUE (report_id, alert_id)**.

### network_interfaces
`report_id FK`, `port text`, `state` check in (`running`,`down`,`fault`)
(fault = up with no link), `link_up boolean`, `speed`, `duplex`,
`hardware_address`. **UNIQUE (report_id, port)**.

### system_health — 1:1 with reports (**UNIQUE (report_id)**)
`uptime_days int`, `load_1m/5m/15m numeric`, `mem_total_mib/mem_free_mib int`,
`swap_total_mib/swap_free_mib int`, `system_availability_pct`, `fs_availability_pct`,
`last_cleaning_at timestamptz NULL`.

### disk_summary — 1:1 with reports (**UNIQUE (report_id)**)
`disks_in_use int`, `disks_spare int`, `disks_failed int`, `disks_absent int`,
`reliability_notes jsonb`.

### mtrees
`report_id FK`, `mtree_path text`, `precomp_gib numeric`, `status text`.
**UNIQUE (report_id, mtree_path)**.

### system_notifications — notifications OUR system generates
`id`, `device_id FK NULL`, `report_id FK NULL`,
`type` check in (`report_received`,`report_missing`,`critical_finding`,`new_device`),
`severity` check in (`info`,`warning`,`critical`), `title`, `body`,
`email_sent_at timestamptz NULL`, `created_at` (+ index created_at desc).

### alert_rules — thresholds editable from Settings (no redeploy)
`id`, `name`, `metric text`, `operator` check in (`>`,`>=`,`<`,`<=`,`=`),
`threshold numeric NULL`, `severity` check in (`warning`,`critical`),
`enabled boolean`.
Seed rules: use_pct ≥ 80 → warning; use_pct ≥ 90 → critical; swap_used_pct ≥ 95 →
warning; runway_days < 60 → warning; device_alert_critical ≥ 1 → critical;
interface_fault ≥ 1 → critical; days_since_cleaning > 30 → warning.

### profiles — extends Supabase auth.users
`user_id uuid PK FK auth.users`, `full_name`, `role` check in (`admin`,`viewer`),
plus helper function `current_role()` used by RLS policies.

### ingest_log — audit trail (every attempt, success or failure)
`id`, `email_message_id`, `device_hostname`, `outcome` check in
(`ingested`,`skipped_duplicate`,`parse_failed`,`auth_failed`),
`detail jsonb`, `duration_ms int`, `created_at` (+ index created_at desc).

### app_settings — key/value (admin-editable)
seeded keys: `watchdog_deadline` (`"12:00"`), `watchdog_timezone`
(`"Asia/Baghdad"`), `notification_recipients` (json array),
`raw_retention_days` (`90`).

### Views
`v_bag_devices` / `v_offset_devices` / `v_avamar_devices` — per-group device views
(logical separation without separate databases); `v_device_latest` — latest parsed
report per device (drives the fleet cards).

## 8. Status & color logic (single source of truth)

Implemented ONCE in `src/lib/status.ts`, used by dashboard AND notification engine:

```
no report today           → GRAY   "NO REPORT"
any CRITICAL device alert
  or use_pct ≥ 90
  or interface fault      → RED    "CRITICAL"
any WARNING alert
  or use_pct ≥ 80
  or runway < 60d
  or swap ≥ 95%
  or cleaning overdue     → AMBER  "WARNING"
otherwise                 → GREEN  "HEALTHY"
```

Thresholds read from `alert_rules` so Settings changes apply everywhere.
`Est. runway = avail_gib / (postcomp_gib(last_7_days) / 7)` — shown on cards and
detail; red when < 60 days.

## 9. Notifications (agreed types)

| type | trigger | content |
|---|---|---|
| `report_received` | successful ingest | device, report date, parse summary, status color |
| `report_missing` | watchdog: no report by deadline | device, last seen report; **no data is modified** |
| `critical_finding` | alert_rules match during ingest | finding(s), severity, device link |
| `new_device` | first report from an unknown hostname | device auto-registered with no group; admin must classify it once in the UI |

All sent via Brevo using HTML templates in `src/lib/email/templates/`. Recipients
from `app_settings.notification_recipients`. Duplicates (409) never alert.

## 10. Dashboard (matches approved enterprise mockup v2)

Navigation (agreed): sidebar contains **All Fleet** (default landing) plus three
group buttons **BAG / OFFSET / AVAMAR**. All four render the SAME Overview
component — group routes (`/g/[group]`) simply filter devices, KPIs, trend and
alerts to that group (one component + a `group` query filter; no duplicated views,
no separate databases). Unclassified (NULL group) devices appear in a
"Needs classification" strip on All Fleet, visible to admin.

Routes: `/` All Fleet · `/g/[group]` filtered overview · `/devices/[id]` detail
(tabs: Capacity, Compression, Alerts, Network, Health, MTrees — shared by all
groups; BAG devices additionally show Cloud Tier rows in Capacity) · `/alerts` ·
`/reports` ingest log · `/settings` (admin only: alert rules, recipients,
watchdog deadline, device classification).

Overview layout: icon sidebar + topbar (search, PRODUCTION badge, clock
Asia/Baghdad, user) + KPI sparkline cards (devices online, reports today,
critical alerts, capacity) + fleet/group device cards (status badge, capacity bar
+ numbers, 7-day growth sparkline, comp factor / runway / report time) + capacity
trend chart + active alerts panel + email notifications strip.

Design tokens (dark enterprise theme — approved):
background `#09090B`, surface `#111113`/`#131316`, border `#1F1F23`/`#27272A`,
accent purple `#7C3AED` (text variant `#A78BFA`), status green `#4ADE80`,
amber `#FBBF24`, red `#F87171`, neutral `#52525B`; numerics in mono font.

## 11. Storage & retention

Raw files stored gzipped (~10:1 on this text). Even at ~10 devices ≈ 1 GB/year
compressed vs the 1 GB free tier → a weekly cleanup job deletes raw files older
than `raw_retention_days` (default 90). **Parsed metrics are kept forever** —
they are tiny and they are the product.

## 12. Security model

- RLS on every table: any authenticated user = SELECT; `admin` = SELECT + writes on
  devices classification, alert_rules, app_settings, profiles (enforced via
  `current_role()`).
- All writes of report data happen via the API with the Supabase **service role key,
  server-side only** (never shipped to the client). No client-side table writes.
- `/api/ingest` protected by `INGEST_SECRET` (header) + basic rate limiting;
  `/api/cron/watchdog` protected by `CRON_SECRET`.
- Secrets live in Vercel env vars / Apps Script Script Properties. Never in the repo.

## 13. Decision log (ADR summary)

| # | Decision | Why |
|---|---|---|
| D1 | Upload via Storage, not API body | Vercel 4.5 MB body limit; files will grow |
| D2 | Devices auto-register by hostname | fleet size is dynamic; zero code per new device |
| D3 | Dedup enforced in schema (3 layers) | correctness must not depend on app code |
| D4 | Parser is a pure standalone module | testable against fixtures; reusable in CLI |
| D5 | Watchdog is read-only | "missing report" must never mutate data |
| D6 | Thresholds in `alert_rules` table | tune behavior without redeploys |
| D7 | Raw files gzip + 90-day retention; metrics forever | free-tier storage budget |
| D8 | One transaction per ingest | no partial reports, ever |
| D9 | ONE database for all groups; `devices.device_group` (BAG/OFFSET/AVAMAR) is just data; sidebar buttons = same component filtered | verified all three groups share the same autosupport format; separate DBs would kill the unified overview, break single auth, triple migrations, and exceed free tier |
| D10 | Device identified by `HOSTNAME` inside the file, never by filename/subject; Apps Script never sorts | client filenames are inconsistent; content is authoritative; sorting logic belongs server-side |
| D11 | `report_date` computed in the report's own TIME_ZONE | fleet mixes Asia/Baghdad and Europe/London; wrong TZ would corrupt the (device, date) uniqueness |
| D12 | OS 7.13 "part B" JSON stored alongside part A on the same report row | tiny supplementary file; part A remains the single parsing source in v1 |
| D13 | Unknown hostname → auto-register with NULL group + `new_device` notification; admin classifies once | one-time 2-minute action; everything after is automatic |

## 14. Build phases (reference)

0 Prep (repo + governance files + Gmail + Supabase + Vercel) →
1 Schema migration 0001 + RLS + Auth (2 users) →
2 Parser (fixtures from every device & OS version incl. part B, 100% pass) →
3 Ingest API (+ manual upload fallback page) →
4 Dashboard (All Fleet + group views + device detail, approved design) →
5 Automation (Apps Script courier + watchdog cron) →
6 Email notifications + Settings →
7 Hardening + one-week parallel run before official adoption.
