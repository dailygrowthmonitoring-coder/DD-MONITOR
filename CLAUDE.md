# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Governance — read first

**ARCHITECTURE.md and STANDARDS.md are the only authoritative references for this project.** Read both before writing any code. Every session must start there. If code disagrees with those files, the files win.

This is a real enterprise production system (ARCHITECTURE §0). No mock data, no placeholder logic, no disabled security, no "TODO later" on correctness.

## Commands

```bash
pnpm dev          # Next.js dev server
pnpm build        # production build
pnpm typecheck    # tsc --noEmit
pnpm lint         # next lint (ESLint)
pnpm test         # vitest run (all tests, single pass)
pnpm vitest       # vitest watch mode
```

Run a single test file:
```bash
pnpm vitest run src/lib/parser/__tests__/generalInfo.test.ts
```

Run tests matching a name pattern:
```bash
pnpm vitest run -t "Currently Used"
```

**pnpm quirk:** pnpm v11 requires `pnpm-workspace.yaml` with an `allowBuilds` entry for native packages (esbuild, sharp, unrs-resolver) before `pnpm install` will succeed. The file is already committed; do not remove it.

## Path alias

`@/` maps to `src/`. Works in both Next.js (via `tsconfig.json` paths) and vitest (via `vite-tsconfig-paths` plugin in `vitest.config.ts`).

## Architecture

### Data flow (high level)

```
Gmail → Apps Script → Supabase Storage
                    → POST /api/ingest
                         ↓
                    Parser (pure TS, no I/O)
                         ↓
                    Postgres transaction (service role)
                         ↓
                    Brevo email + system_notifications
```

### Key architectural constraints

- **One Supabase project, one database.** Group separation (BAG/OFFSET/AVAMAR) is the `devices.device_group` column — never separate databases or schemas.
- **Device identity comes from file content.** `HOSTNAME=` line inside the report, never the filename or email subject.
- **`report_date` uses the file's own `TIME_ZONE`** (IANA name, e.g. `Asia/Baghdad`). The fleet mixes timezones; wrong TZ would corrupt the `(device_id, report_date)` unique constraint.
- **One transaction per ingest.** A report is fully stored or not at all — no partial inserts.

### `src/lib/` modules

| Module | Role |
|--------|------|
| `parser/` | **Pure TS** — input: raw report string → output: `ParsedReport` + `warnings[]`. Zero imports from Next.js / Supabase / Node fs. The heart of the system. |
| `db/client.ts` | Two Supabase client factories: `createServiceRoleClient()` (bypasses RLS — ingest only, server-side) and `createAnonClient()` (respects RLS — RSC reads). Both are `server-only`. |
| `db/types.ts` | `Database` interface mirroring `0001_initial_schema.sql` 1:1. Always kept in sync with the migration. |
| `status.ts` | **Single source of truth** for device status color/label. Used by dashboard AND notification engine. Never re-implement this logic elsewhere. |
| `logger.ts` | Structured JSON logs: `{ ts, level, scope, msg, traceId, ...ctx }`. `traceId` = `email_message_id`, carried end-to-end. No `console.log` in committed code. |

### Parser module structure (`src/lib/parser/`)

```
index.ts       — public entry: parseReport(raw) → ParseResult; dispatches part A vs part B
types.ts       — ParsedReport, ParseResult, per-section types
split.ts       — splits part A on ========== headers → Map<sectionName, string[]>
assemble.ts    — builds ParsedReport; enforces hard-fail (hostname, generated_at, post-comp row)
sections/      — one extractor per section; each: extract(lines) → { data, warnings }
__fixtures__/  — real report files (committed; CI runs against these)
__tests__/     — vitest unit tests per extractor + full-parse integration tests
```

Extractor contract: **never throw** on malformed content — return `null` + a warning string. Only the assembler hard-fails.

### Database

Schema is in `supabase/migrations/0001_initial_schema.sql`. **Applied migrations are never edited** — add a new numbered file to amend.

Every table has RLS enabled. Policy model:
- Any authenticated user → SELECT everywhere
- `admin` role (via `get_current_user_role()`) → writes on `devices`, `alert_rules`, `app_settings`, `profiles`
- Report data tables → no authenticated write policies; ingest uses the service role key

All four views include `WITH (security_invoker = on)` so RLS is evaluated as the querying user, not the view owner.

### Deduplication (enforced in schema, not app code)

1. `reports.email_message_id UNIQUE` — same email never ingested twice
2. `UNIQUE (device_id, report_date)` — one report per device per day
3. Single transaction per ingest — no partial reports

A `409` response from `/api/ingest` is a normal outcome (duplicate), never an error.

### Status / color logic

`computeStatus(metrics, thresholds?)` in `src/lib/status.ts`. Priority: GRAY → RED → AMBER → GREEN. Thresholds default to seeded `alert_rules` values and can be overridden without redeployment.

Runway formula: `avail_gib / (postcomp_gib(last_7_days) / 7)`.

### Build phases (current state: Phase 1 complete)

0. Repo + governance + Gmail + Supabase + Vercel
1. ✅ Schema migration + RLS + Auth
2. Parser (fixtures + 100% pass = exit gate)
3. Ingest API (`/api/ingest`, Postgres function `ingest_report`)
4. Dashboard (RSC, approved design tokens from ARCHITECTURE §10)
5. Apps Script courier + watchdog cron
6. Email notifications + Settings
7. Hardening + one-week parallel run
