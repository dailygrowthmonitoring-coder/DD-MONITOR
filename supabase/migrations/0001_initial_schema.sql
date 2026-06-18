-- =============================================================================
-- DD Monitor — Migration 0001: Initial Schema
-- Architecture version: 2.0 (2026-06-12)
-- Postgres 15 / Supabase
--
-- NOT idempotent by design. Re-running this migration WILL fail loudly — that
-- is intentional. Schema changes go in a new numbered migration file.
--
-- Tables (14): profiles, devices, reports, capacity_snapshots,
--   compression_stats, device_alerts, network_interfaces, system_health,
--   disk_summary, mtrees, system_notifications, alert_rules, ingest_log,
--   app_settings
-- =============================================================================


-- ─── 1. profiles ─────────────────────────────────────────────────────────────
-- Extends auth.users with the application role. The first admin row is inserted
-- via the Supabase dashboard / service role during initial setup.

CREATE TABLE public.profiles (
  user_id    uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name  text,
  role       text        NOT NULL CHECK (role IN ('admin', 'viewer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ─── 2. Helper function: get_current_user_role() ─────────────────────────────
-- SECURITY DEFINER so it bypasses RLS on profiles when invoked inside a policy.
-- Used by all admin-write policies across the schema.

CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE user_id = auth.uid();
$$;


-- ─── 3. devices ──────────────────────────────────────────────────────────────
-- One row per physical appliance. Auto-registered on first ingest; admin
-- assigns device_group once in the UI (NULL = newly seen, awaiting classification).

CREATE TABLE public.devices (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname       text        NOT NULL UNIQUE,          -- identity; from HOSTNAME= inside the file
  display_name   text,                                 -- short label, e.g. "DD6300BSR"
  device_group   text        CHECK (device_group IN ('BAG', 'OFFSET', 'AVAMAR')),  -- NULL = unclassified
  location       text,
  model_no       text,
  serial_no      text,
  chassis_serial text,
  os_version     text,
  time_zone      text,                                 -- e.g. "Asia/Baghdad", "Europe/London"
  admin_email    text,
  is_active      boolean     NOT NULL DEFAULT true,    -- watchdog skips inactive devices
  first_seen_at  timestamptz NOT NULL DEFAULT now(),
  last_report_at timestamptz
);


-- ─── 4. reports ──────────────────────────────────────────────────────────────
-- One row per device per day. The two UNIQUE constraints are the dedup backbone:
--   • email_message_id UNIQUE  — same email never ingested twice (dedup layer 1)
--   • (device_id, report_date) UNIQUE — one report per device per calendar day (layer 2)

CREATE TABLE public.reports (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id           uuid        NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  report_date         date        NOT NULL,             -- derived from GENERATED_ON in file's own TIME_ZONE
  generated_at        timestamptz NOT NULL,             -- full GENERATED_ON timestamp
  email_message_id    text        NOT NULL UNIQUE,      -- dedup layer 1
  storage_path        text        NOT NULL,             -- gzipped part A in Supabase Storage
  partb_storage_path  text,                             -- DD OS 7.13 companion JSON (nullable)
  file_size_bytes     bigint      NOT NULL,
  status              text        NOT NULL CHECK (status IN ('parsed', 'failed')),
  parse_warnings      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),

  UNIQUE (device_id, report_date)                       -- dedup layer 2
);

CREATE INDEX idx_reports_device_date ON public.reports (device_id, report_date DESC);


-- ─── 5. capacity_snapshots ───────────────────────────────────────────────────
-- One row per tier × resource per report.
-- tier 'cloud' appears only for DD OS 7.13 devices (Cloud Tier block).
-- resource examples: '/data: pre-comp', '/data: post-comp', '/ddvar', '/ddvar/core'

CREATE TABLE public.capacity_snapshots (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id     uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  tier          text        NOT NULL DEFAULT 'active' CHECK (tier IN ('active', 'cloud')),
  resource      text        NOT NULL,
  size_gib      numeric,
  used_gib      numeric     NOT NULL,
  avail_gib     numeric,
  use_pct       numeric,
  cleanable_gib numeric,

  UNIQUE (report_id, tier, resource)
);

CREATE INDEX idx_capacity_snapshots_report ON public.capacity_snapshots (report_id);


-- ─── 6. compression_stats ────────────────────────────────────────────────────
-- One row per compression period per report.
-- Periods: Currently Used / Last 7 days / Last 24 hrs (all three always present).

CREATE TABLE public.compression_stats (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id          uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  period             text        NOT NULL CHECK (period IN ('currently_used', 'last_7_days', 'last_24_hrs')),
  precomp_gib        numeric     NOT NULL,
  postcomp_gib       numeric     NOT NULL,
  global_comp_factor numeric,
  local_comp_factor  numeric,
  total_comp_factor  numeric     NOT NULL,
  reduction_pct      numeric     NOT NULL,

  UNIQUE (report_id, period)
);

CREATE INDEX idx_compression_stats_report ON public.compression_stats (report_id);


-- ─── 7. device_alerts ────────────────────────────────────────────────────────
-- Alerts reported BY the appliance (Current Alerts + Alerts History sections).
-- alert_id is the appliance-assigned ID, e.g. 'p0-273'.
-- is_active = true → Current Alerts; false → Alerts History (cleared).

CREATE TABLE public.device_alerts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid        NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  alert_id   text        NOT NULL,
  severity   text        NOT NULL CHECK (severity IN ('CRITICAL', 'WARNING', 'INFO', 'NOTICE')),
  class      text        NOT NULL,
  object     text        NOT NULL,
  message    text        NOT NULL,
  posted_at  timestamptz NOT NULL,
  is_active  boolean     NOT NULL,

  UNIQUE (report_id, alert_id)
);

CREATE INDEX idx_device_alerts_report ON public.device_alerts (report_id);
CREATE INDEX idx_device_alerts_severity ON public.device_alerts (report_id, severity) WHERE is_active = true;


-- ─── 8. network_interfaces ───────────────────────────────────────────────────
-- One row per port per report, from the "Net Show Hardware" section.
-- state = 'fault' means the port is physically up but has no link.

CREATE TABLE public.network_interfaces (
  id               uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id        uuid    NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  port             text    NOT NULL,
  state            text    NOT NULL CHECK (state IN ('running', 'down', 'fault')),
  link_up          boolean,
  speed            text,
  duplex           text,
  hardware_address text,

  UNIQUE (report_id, port)
);

CREATE INDEX idx_network_interfaces_report ON public.network_interfaces (report_id);


-- ─── 9. system_health ────────────────────────────────────────────────────────
-- 1:1 with reports. Uptime, load, memory, swap, and availability metrics.

CREATE TABLE public.system_health (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id               uuid        NOT NULL UNIQUE REFERENCES public.reports(id) ON DELETE CASCADE,
  uptime_days             int,
  load_avg_1m             numeric,
  load_avg_5m             numeric,
  load_avg_15m            numeric,
  mem_total_mib           int,
  mem_free_mib            int,
  swap_total_mib          int,
  swap_free_mib           int,
  system_availability_pct numeric,
  fs_availability_pct     numeric,
  last_cleaning_at        timestamptz
);


-- ─── 10. disk_summary ────────────────────────────────────────────────────────
-- 1:1 with reports. Aggregated disk state counts from the disk status section.

CREATE TABLE public.disk_summary (
  id                uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id         uuid    NOT NULL UNIQUE REFERENCES public.reports(id) ON DELETE CASCADE,
  disks_in_use      int     NOT NULL DEFAULT 0,
  disks_spare       int     NOT NULL DEFAULT 0,
  disks_failed      int     NOT NULL DEFAULT 0,
  disks_absent      int     NOT NULL DEFAULT 0,
  reliability_notes jsonb
);


-- ─── 11. mtrees ──────────────────────────────────────────────────────────────
-- One row per MTree per report (Mtree List section).
-- mtree_path example: /data/col1/HQ_DD900

CREATE TABLE public.mtrees (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id   uuid    NOT NULL REFERENCES public.reports(id) ON DELETE CASCADE,
  mtree_path  text    NOT NULL,
  precomp_gib numeric NOT NULL,
  status      text,

  UNIQUE (report_id, mtree_path)
);

CREATE INDEX idx_mtrees_report ON public.mtrees (report_id);


-- ─── 12. system_notifications ────────────────────────────────────────────────
-- Notifications generated BY DD Monitor (not appliance alerts).
-- device_id and report_id are nullable; SET NULL on delete so the notification
-- record survives even if the referenced row is removed.

CREATE TABLE public.system_notifications (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id     uuid        REFERENCES public.devices(id) ON DELETE SET NULL,
  report_id     uuid        REFERENCES public.reports(id) ON DELETE SET NULL,
  type          text        NOT NULL CHECK (type IN ('report_received', 'report_missing', 'critical_finding', 'new_device')),
  severity      text        NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title         text        NOT NULL,
  body          text        NOT NULL,
  email_sent_at timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_system_notifications_created_at ON public.system_notifications (created_at DESC);
CREATE INDEX idx_system_notifications_device ON public.system_notifications (device_id);


-- ─── 13. alert_rules ─────────────────────────────────────────────────────────
-- Editable thresholds; changes apply immediately without redeployment (ADR D6).

CREATE TABLE public.alert_rules (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  metric     text        NOT NULL,
  operator   text        NOT NULL CHECK (operator IN ('>', '>=', '<', '<=', '=')),
  threshold  numeric,
  severity   text        NOT NULL CHECK (severity IN ('warning', 'critical')),
  enabled    boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- ─── 14. ingest_log ──────────────────────────────────────────────────────────
-- Audit trail for every ingest attempt: successes, duplicates, parse failures,
-- and auth failures. Written by the API regardless of outcome.

CREATE TABLE public.ingest_log (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id text,
  device_hostname  text,
  outcome          text        NOT NULL CHECK (outcome IN ('ingested', 'skipped_duplicate', 'parse_failed', 'auth_failed')),
  detail           jsonb,
  duration_ms      int,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ingest_log_created_at ON public.ingest_log (created_at DESC);
CREATE INDEX idx_ingest_log_message_id ON public.ingest_log (email_message_id);


-- ─── 15. app_settings ────────────────────────────────────────────────────────
-- Key/value table for admin-editable runtime configuration. Values are jsonb so
-- they can hold strings, numbers, and arrays without type gymnastics.

CREATE TABLE public.app_settings (
  key        text        PRIMARY KEY,
  value      jsonb       NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);


-- =============================================================================
-- ROW LEVEL SECURITY
-- Every table has RLS enabled in this migration (STANDARDS §5: a table without
-- RLS is a review failure).
--
-- Policy model (ARCHITECTURE §12):
--   • Any authenticated user → SELECT on every table
--   • Admin only (via get_current_user_role()) → writes on devices (UPDATE),
--     alert_rules, app_settings, profiles
--   • Report-data tables → NO authenticated write policies; service role key
--     bypasses RLS entirely for ingest writes
-- =============================================================================

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.capacity_snapshots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compression_stats     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.device_alerts         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.network_interfaces    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.disk_summary          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mtrees                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_notifications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rules           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_log            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings          ENABLE ROW LEVEL SECURITY;

-- ── SELECT policies (all tables, any authenticated user) ─────────────────────

CREATE POLICY "auth_users_select_profiles"
  ON public.profiles FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_devices"
  ON public.devices FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_reports"
  ON public.reports FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_capacity_snapshots"
  ON public.capacity_snapshots FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_compression_stats"
  ON public.compression_stats FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_device_alerts"
  ON public.device_alerts FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_network_interfaces"
  ON public.network_interfaces FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_system_health"
  ON public.system_health FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_disk_summary"
  ON public.disk_summary FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_mtrees"
  ON public.mtrees FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_system_notifications"
  ON public.system_notifications FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_alert_rules"
  ON public.alert_rules FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_ingest_log"
  ON public.ingest_log FOR SELECT TO authenticated USING (true);

CREATE POLICY "auth_users_select_app_settings"
  ON public.app_settings FOR SELECT TO authenticated USING (true);

-- ── WRITE policies (admin-only via get_current_user_role()) ──────────────────

-- profiles: admin manages user profiles (first admin inserted via service role)
CREATE POLICY "admin_insert_profiles"
  ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin');

CREATE POLICY "admin_update_profiles"
  ON public.profiles FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin');

CREATE POLICY "admin_delete_profiles"
  ON public.profiles FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin');

-- devices: admin updates device_group (classification), location, is_active.
-- INSERT is service-role only (auto-registration on ingest).
CREATE POLICY "admin_update_devices"
  ON public.devices FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin');

-- alert_rules: admin can manage thresholds without redeployment
CREATE POLICY "admin_insert_alert_rules"
  ON public.alert_rules FOR INSERT TO authenticated
  WITH CHECK (public.get_current_user_role() = 'admin');

CREATE POLICY "admin_update_alert_rules"
  ON public.alert_rules FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin');

CREATE POLICY "admin_delete_alert_rules"
  ON public.alert_rules FOR DELETE TO authenticated
  USING (public.get_current_user_role() = 'admin');

-- app_settings: admin updates runtime configuration values
CREATE POLICY "admin_update_app_settings"
  ON public.app_settings FOR UPDATE TO authenticated
  USING (public.get_current_user_role() = 'admin');


-- =============================================================================
-- VIEWS
-- =============================================================================

-- Per-group device views — logical separation without separate databases (ADR D9)
CREATE VIEW public.v_bag_devices    WITH (security_invoker = on) AS SELECT * FROM public.devices WHERE device_group = 'BAG';
CREATE VIEW public.v_offset_devices WITH (security_invoker = on) AS SELECT * FROM public.devices WHERE device_group = 'OFFSET';
CREATE VIEW public.v_avamar_devices WITH (security_invoker = on) AS SELECT * FROM public.devices WHERE device_group = 'AVAMAR';

-- Latest parsed report per device, drives fleet overview cards
CREATE VIEW public.v_device_latest WITH (security_invoker = on) AS
SELECT
  d.id,
  d.hostname,
  d.display_name,
  d.device_group,
  d.location,
  d.model_no,
  d.serial_no,
  d.chassis_serial,
  d.os_version,
  d.time_zone,
  d.admin_email,
  d.is_active,
  d.first_seen_at,
  d.last_report_at,
  r.id          AS latest_report_id,
  r.report_date AS latest_report_date,
  r.generated_at AS latest_generated_at,
  r.status      AS latest_report_status,
  r.parse_warnings AS latest_parse_warnings
FROM public.devices d
LEFT JOIN LATERAL (
  SELECT id, report_date, generated_at, status, parse_warnings
  FROM public.reports
  WHERE device_id = d.id
    AND status = 'parsed'
  ORDER BY report_date DESC
  LIMIT 1
) r ON true;


-- =============================================================================
-- SEED DATA
-- =============================================================================

-- ── alert_rules (7 default rules matching ARCHITECTURE §7 + status.ts defaults)

INSERT INTO public.alert_rules (name, metric, operator, threshold, severity, enabled) VALUES
  ('Capacity warning',      'use_pct',              '>=', 80,  'warning',  true),
  ('Capacity critical',     'use_pct',              '>=', 90,  'critical', true),
  ('Swap warning',          'swap_used_pct',         '>=', 95,  'warning',  true),
  ('Runway warning',        'runway_days',           '<',  60,  'warning',  true),
  ('Critical device alert', 'device_alert_critical', '>=', 1,   'critical', true),
  ('Interface fault',       'interface_fault',       '>=', 1,   'critical', true),
  ('Cleaning overdue',      'days_since_cleaning',   '>',  30,  'warning',  true);

-- ── app_settings (4 seeded keys)

INSERT INTO public.app_settings (key, value) VALUES
  ('watchdog_deadline',        '"12:00"'::jsonb),
  ('watchdog_timezone',        '"Asia/Baghdad"'::jsonb),
  ('notification_recipients',  '[]'::jsonb),
  ('raw_retention_days',       '90'::jsonb);
