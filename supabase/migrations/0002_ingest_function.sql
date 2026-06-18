-- =============================================================================
-- DD Monitor — Migration 0002: ingest_report function
-- Architecture version: 2.0 (2026-06-14)
--
-- Adds the ingest_report(payload jsonb) SECURITY DEFINER function.
-- Called by /api/ingest via service role RPC. The entire function body is
-- one atomic transaction: device upsert + report + all child rows succeed
-- together or not at all. A unique_violation on the reports table is caught
-- and re-raised as 'DUPLICATE_REPORT' (ERRCODE P0001) so the API can map
-- it to a 409 without polluting logs as an unexpected error.
--
-- Do NOT edit migration 0001. Schema changes go in new numbered files.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.ingest_report(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hostname         text        := payload->>'hostname';
  v_report_date      date        := (payload->>'reportDate')::date;
  v_generated_at     timestamptz := (payload->>'generatedAt')::timestamptz;
  v_email_message_id text        := payload->>'emailMessageId';
  v_storage_path     text        := payload->>'storagePath';
  v_file_size_bytes  bigint      := (payload->>'fileSizeBytes')::bigint;
  v_parse_warnings   jsonb       := COALESCE(payload->'parseWarnings', '[]'::jsonb);

  v_device_id        uuid;
  v_device_was_new   boolean;
  v_report_id        uuid;
  v_snap             jsonb;
  v_stat             jsonb;
  v_alert            jsonb;
  v_iface            jsonb;
  v_mtree            jsonb;
  v_disks            jsonb;
BEGIN
  -- 1. Check device existence before upsert so we can flag newly registered devices.
  SELECT id INTO v_device_id FROM public.devices WHERE hostname = v_hostname;
  v_device_was_new := (v_device_id IS NULL);

  -- 2. Upsert device. device_group is intentionally not set here (NULL = unclassified);
  --    an admin assigns it in the UI after the device appears for the first time.
  INSERT INTO public.devices (
    hostname, display_name, model_no, serial_no, chassis_serial,
    os_version, time_zone, admin_email, location, last_report_at
  )
  VALUES (
    v_hostname,
    payload->>'displayName',
    payload->>'modelNo',
    payload->>'serialNo',
    payload->>'chassisSerial',
    payload->>'osVersion',
    payload->>'timeZone',
    payload->>'adminEmail',
    payload->>'location',
    v_generated_at
  )
  ON CONFLICT (hostname) DO UPDATE SET
    display_name   = EXCLUDED.display_name,
    model_no       = EXCLUDED.model_no,
    serial_no      = EXCLUDED.serial_no,
    chassis_serial = EXCLUDED.chassis_serial,
    os_version     = EXCLUDED.os_version,
    time_zone      = EXCLUDED.time_zone,
    admin_email    = EXCLUDED.admin_email,
    location       = EXCLUDED.location,
    last_report_at = EXCLUDED.last_report_at
  RETURNING id INTO v_device_id;

  -- 3. Report insert. The schema's two UNIQUE constraints enforce both dedup layers:
  --    (email_message_id) and (device_id, report_date).
  --    Catch unique_violation and re-raise with a named code the API recognises.
  BEGIN
    INSERT INTO public.reports (
      device_id, report_date, generated_at, email_message_id,
      storage_path, file_size_bytes, status, parse_warnings
    )
    VALUES (
      v_device_id, v_report_date, v_generated_at, v_email_message_id,
      v_storage_path, v_file_size_bytes, 'parsed', v_parse_warnings
    )
    RETURNING id INTO v_report_id;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'DUPLICATE_REPORT' USING ERRCODE = 'P0001';
  END;

  -- 4. capacity_snapshots
  FOR v_snap IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'capacitySnapshots', '[]'::jsonb))
  LOOP
    INSERT INTO public.capacity_snapshots (
      report_id, tier, resource, size_gib, used_gib, avail_gib, use_pct, cleanable_gib
    )
    VALUES (
      v_report_id,
      COALESCE(v_snap->>'tier', 'active'),
      v_snap->>'resource',
      (v_snap->>'sizeGib')::numeric,
      (v_snap->>'usedGib')::numeric,
      (v_snap->>'availGib')::numeric,
      (v_snap->>'usePct')::numeric,
      (v_snap->>'cleanableGib')::numeric
    );
  END LOOP;

  -- 5. compression_stats
  FOR v_stat IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'compressionStats', '[]'::jsonb))
  LOOP
    INSERT INTO public.compression_stats (
      report_id, period, precomp_gib, postcomp_gib,
      global_comp_factor, local_comp_factor, total_comp_factor, reduction_pct
    )
    VALUES (
      v_report_id,
      v_stat->>'period',
      (v_stat->>'precompGib')::numeric,
      (v_stat->>'postcompGib')::numeric,
      (v_stat->>'globalCompFactor')::numeric,
      (v_stat->>'localCompFactor')::numeric,
      (v_stat->>'totalCompFactor')::numeric,
      (v_stat->>'reductionPct')::numeric
    );
  END LOOP;

  -- 6. device_alerts
  FOR v_alert IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'deviceAlerts', '[]'::jsonb))
  LOOP
    INSERT INTO public.device_alerts (
      report_id, alert_id, severity, class, object, message, posted_at, is_active
    )
    VALUES (
      v_report_id,
      v_alert->>'alertId',
      v_alert->>'severity',
      v_alert->>'class',
      v_alert->>'object',
      v_alert->>'message',
      (v_alert->>'postedAt')::timestamptz,
      (v_alert->>'isActive')::boolean
    );
  END LOOP;

  -- 7. network_interfaces
  FOR v_iface IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'networkInterfaces', '[]'::jsonb))
  LOOP
    INSERT INTO public.network_interfaces (
      report_id, port, state, link_up, speed, duplex, hardware_address
    )
    VALUES (
      v_report_id,
      v_iface->>'port',
      v_iface->>'state',
      (v_iface->>'linkUp')::boolean,
      v_iface->>'speed',
      v_iface->>'duplex',
      v_iface->>'hardwareAddress'
    );
  END LOOP;

  -- 8. system_health (exactly 1 row per report)
  INSERT INTO public.system_health (
    report_id,
    uptime_days, load_avg_1m, load_avg_5m, load_avg_15m,
    mem_total_mib, mem_free_mib, swap_total_mib, swap_free_mib,
    system_availability_pct, fs_availability_pct, last_cleaning_at
  )
  VALUES (
    v_report_id,
    (payload->>'uptimeDays')::int,
    (payload->>'loadAvg1m')::numeric,
    (payload->>'loadAvg5m')::numeric,
    (payload->>'loadAvg15m')::numeric,
    (payload->>'memTotalMib')::int,
    (payload->>'memFreeMib')::int,
    (payload->>'swapTotalMib')::int,
    (payload->>'swapFreeMib')::int,
    (payload->>'systemAvailabilityPct')::numeric,
    (payload->>'fsAvailabilityPct')::numeric,
    (payload->>'lastCleaningAt')::timestamptz
  );

  -- 9. disk_summary (present when the disk status section was parsed; omit when null)
  v_disks := payload->'disks';
  IF v_disks IS NOT NULL AND v_disks != 'null'::jsonb THEN
    INSERT INTO public.disk_summary (
      report_id, disks_in_use, disks_spare, disks_failed, disks_absent, reliability_notes
    )
    VALUES (
      v_report_id,
      COALESCE((v_disks->>'disksInUse')::int, 0),
      COALESCE((v_disks->>'disksSpare')::int, 0),
      COALESCE((v_disks->>'disksFailed')::int, 0),
      COALESCE((v_disks->>'disksAbsent')::int, 0),
      v_disks->'reliabilityNotes'
    );
  END IF;

  -- 10. mtrees
  FOR v_mtree IN
    SELECT value FROM jsonb_array_elements(COALESCE(payload->'mtrees', '[]'::jsonb))
  LOOP
    INSERT INTO public.mtrees (report_id, mtree_path, precomp_gib, status)
    VALUES (
      v_report_id,
      v_mtree->>'mtreePath',
      (v_mtree->>'precompGib')::numeric,
      v_mtree->>'status'
    );
  END LOOP;

  RETURN jsonb_build_object(
    'report_id',      v_report_id,
    'device_id',      v_device_id,
    'device_was_new', v_device_was_new,
    'status',         'ingested'
  );
END;
$$;
