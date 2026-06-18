# DD MONITOR — STANDARDS.md

> **Status: AUTHORITATIVE.** These rules are binding for ALL code written for this
> project, whether by a human or by an AI assistant (Claude Code). Every working
> session starts by reading `ARCHITECTURE.md` + this file. If code and these files
> disagree, the files win and the code is wrong.

Version: **2.0** — consolidated (2026-06-12). Supersedes v1.x.

---

## 0. Governance rules

1. **This is a real enterprise PRODUCTION system** (see ARCHITECTURE §0) — not a
   demo, prototype, or mockup. Mock data, placeholder logic, disabled security,
   and "TODO later" on correctness are all rejected in review.
2. `ARCHITECTURE.md` and `STANDARDS.md` are the only authoritative references.
3. Architectural changes: update `ARCHITECTURE.md` (including the Decision log) in the
   same PR as the code, or the PR is rejected.
4. No feature, table, route, or dependency that is not described in `ARCHITECTURE.md`
   may be introduced without explicit owner approval. In particular: **never create
   additional databases or Supabase projects** — group separation is the
   `device_group` column (Decision D9), full stop.
5. AI prompts for this repo MUST include: "Read ARCHITECTURE.md and STANDARDS.md
   first and conform to them."
6. Never alter the visual structure/layout of an approved screen while adding
   functionality, unless the change request explicitly says so.

## 1. Repository structure

```
/
├─ ARCHITECTURE.md            ← authoritative
├─ STANDARDS.md               ← authoritative
├─ supabase/
│  └─ migrations/             ← *.sql, timestamped, append-only
├─ src/
│  ├─ app/                    ← Next.js App Router
│  │  ├─ (dashboard)/         ← /, /g/[group], /devices/[id], /alerts, /reports, /settings
│  │  └─ api/
│  │     ├─ ingest/route.ts
│  │     └─ cron/watchdog/route.ts
│  ├─ lib/
│  │  ├─ parser/              ← pure module (see §6)
│  │  │  ├─ index.ts  sections/  __fixtures__/  __tests__/
│  │  ├─ db/                  ← typed query helpers (server-only)
│  │  ├─ email/templates/
│  │  ├─ status.ts            ← THE status/color logic (single source)
│  │  └─ logger.ts
│  └─ components/             ← ui/ (primitives), dashboard/ (feature)
├─ apps-script/ingest.gs      ← versioned copy of the Apps Script
└─ .env.example               ← every env var, documented, no real values
```

## 2. TypeScript

- `strict: true`. `any` is forbidden (`unknown` + narrowing when unavoidable).
- All GiB/percent values: `number` in TS, `numeric` in SQL. Round only at display time.
- Naming: `camelCase` variables/functions, `PascalCase` types/components,
  `snake_case` DB identifiers, `SCREAMING_SNAKE` env vars.
- Public functions in `lib/` get explicit return types + a one-line JSDoc.
- No silent `catch {}` — every catch logs via `logger` with context.

## 3. Next.js conventions

- App Router only. Data reads in **React Server Components**; client components only
  for interactivity (`"use client"` as low in the tree as possible).
- The Overview is ONE component. All Fleet and the three group routes
  (`/g/bag`, `/g/offset`, `/g/avamar`) render it with a `group` filter parameter —
  duplicating the Overview per group is a defect (Decision D9).
- No data fetching from the browser directly to Supabase tables for report data —
  reads go through RSC/route handlers (RLS still on as defense in depth).
- API route handlers: validate input with `zod` at the boundary, return the envelope
  `{ ok: boolean, data?: T, error?: { code: string, message: string } }`.
- Error codes are stable strings: `UNAUTHORIZED`, `DUPLICATE`, `PARSE_FAILED`,
  `STORAGE_READ_FAILED`, `DB_TX_FAILED`, `RULE_EVAL_FAILED`.

## 4. Environment & secrets

- Required env vars (mirror in `.env.example`): `SUPABASE_URL`,
  `SUPABASE_SERVICE_ROLE_KEY` (server only), `SUPABASE_ANON_KEY`, `INGEST_SECRET`,
  `CRON_SECRET`, `BREVO_API_KEY`, `NOTIFY_FALLBACK_RECIPIENT`.
- Service role key must never appear in client bundles — enforce via `server-only`
  import in `lib/db`.
- Rotating `INGEST_SECRET` = update Vercel env + Apps Script property in one sitting.

## 5. Database rules

- ONE Supabase project, ONE database (Decision D9). Proposing a second is an
  architecture change and requires owner approval via §0.
- Schema changes ONLY via files in `supabase/migrations/`, named
  `NNNN_description.sql` in sequence. Applied migrations are **never edited** —
  write a new migration to amend. Migration `0001_initial_schema.sql` is the
  baseline and matches ARCHITECTURE §7 exactly.
- Every table: RLS **enabled** in the same migration that creates it, with explicit
  policies (any authenticated user SELECT; admin writes per ARCHITECTURE §12 via
  `current_role()`). A table without RLS fails review.
- Every child table FK: `ON DELETE CASCADE` to `reports`.
- All uniqueness guarantees from ARCHITECTURE §5/§7 are constraints, not app checks.
- Inserts for one report happen in **one transaction** via a single Postgres function
  `ingest_report(payload jsonb)` (SECURITY DEFINER, added in the Phase 3 migration)
  so atomicity lives in the DB.
- No raw SQL string concatenation anywhere. Parameterized only.

## 6. Parser standards (the heart of the system)

- `src/lib/parser/` imports NOTHING from Next.js, Supabase, or Node fs — pure
  functions on strings. (The API layer reads the file and passes a string in.)
- **Section-driven, never position-driven**: locate sections by NAME from the
  `==========` headers. Unknown sections are skipped silently; the fleet spans
  DD OS 6.2 / 7.7 / 7.13 with different section counts and ordering.
- **Identity comes from content**: `HOSTNAME=` line identifies the device;
  `GENERATED_ON` + `TIME_ZONE` (both from the file) produce `report_date`.
  Email subject, arrival time, and filename are never used for identity or dating.
- **Input type detection**: leading `{` → part B JSON (`JSON.parse` only, no regex);
  `==========  GENERAL INFO` → part A text report.
- One extractor per report section; each exports
  `extract(lines: string[]): { data: X | null; warnings: string[] }`.
- Extractors NEVER throw on malformed content — they return `null` + warning.
  Only the assembler decides hard-fail (missing hostname / dated timestamp /
  post-comp capacity).
- Handle `\r\n`, variable column spacing, Cloud Tier blocks (7.13), and missing
  optional sections explicitly.
- Tests: vitest. Every extractor has unit tests; the suite runs against fixtures from
  **every known device AND every DD OS version in the fleet (currently 6.2 / 7.7 /
  7.13)** and must pass 100% (Phase 2 exit gate). Adding a device or OS version =
  adding a fixture. Part B JSON fixtures are included; input-type detection is
  unit-tested too.
- Performance budget: parse a 3.5 MB report in < 2 s on Vercel.

## 7. Ingest & watchdog rules

- `/api/ingest`: verify `x-ingest-key` before touching Storage. Log every attempt to
  `ingest_log` (including failures) with `duration_ms`.
- Duplicate (`409`) is a NORMAL outcome — never alert on it, just log `skipped_duplicate`.
- Unknown hostname is NOT an error: auto-register the device with
  `device_group = NULL`, emit a `new_device` notification, continue the ingest.
- Watchdog (`/api/cron/watchdog`): protected by `CRON_SECRET`; SELECT-only on report
  data; writes only `system_notifications`. Timezone math uses the configured
  watchdog timezone explicitly — never server-local time.
- Notification sending is **after** the DB commit; an email failure must not roll back
  or fail an ingest (log + retry queue instead).

## 8. Logging & observability

- Structured JSON logs via `lib/logger.ts`: `{ ts, level, traceId, scope, msg, ...ctx }`.
- Every ingest gets a `traceId` (the email message id) carried through parser → DB → email.
- No `console.log` in committed code outside `logger.ts`.

## 9. UI standards

- Design tokens from ARCHITECTURE §10 live in `src/app/globals.css` as CSS variables
  (`--bg`, `--surface`, `--border`, `--accent`, `--ok`, `--warn`, `--crit`, `--muted`).
  Components must use tokens — no hardcoded hex in component files.
- Status color/label come ONLY from `lib/status.ts`. Re-implementing the logic in a
  component is a defect.
- Numbers: mono font; `toLocaleString()` for GiB; 1 decimal for comp factors; integers
  for percentages and runway days.
- Every async view has loading + empty + error states. Empty states say what will
  fill them ("Waiting for the first report from this device").
- The "Needs classification" strip (devices with NULL group) is admin-only and lives
  on All Fleet; classifying a device is a single action and must not require a page
  reload to reflect.
- RTL note: the product UI is English LTR (v1); do not mix per-element directions.

## 10. Testing & CI

- vitest for parser, status logic, and rule evaluation (these three are mandatory
  coverage); fixtures are real reports.
- GitHub Actions on every PR: typecheck, lint, test. Red CI = no merge.
- Before Phase 5 sign-off: an end-to-end dry run — send a real report email to the
  system inbox and watch it appear on the dashboard untouched by hand.
- Dedup acceptance test: ingest the same fixture twice; the second attempt must
  return 409 and leave the database unchanged.

## 11. Git conventions

- Branches: `phase-N/short-description` or `fix/short-description`.
- Conventional commits: `feat(parser): add mtree extractor`, `fix(ingest): ...`,
  `db(migration): ...`, `docs(architecture): ...`.
- `main` is always deployable. Vercel production tracks `main` only.

## 12. Definition of Done (per phase)

A phase is done when: code conforms to both governance files; tests green in CI;
the phase's exit criterion from ARCHITECTURE §14 is demonstrated live; and any
deviation has been written back into the governance files.
