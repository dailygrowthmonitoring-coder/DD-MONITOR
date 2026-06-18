/**
 * DD Monitor — Autosupport Email Courier + Daily Fleet Digest
 *
 * Part 1 — Courier (unchanged from Phase 5):
 *   Finds unprocessed autosupport emails, uploads each attachment to Supabase Storage
 *   (bucket: raw-reports), calls POST /api/ingest for each file, and labels processed emails.
 *
 * Part 2 — Daily Fleet Digest (Phase 6):
 *   After processing emails, fetches GET /api/fleet-summary and sends one HTML digest
 *   email per day via MailApp (Google's free mail — NOT Brevo, preserving its quota).
 *   Deduplicated with a PropertiesService flag (DIGEST_SENT_<date>).
 *
 * All secrets are stored in Script Properties.  Never hard-code keys here.
 *
 * Required Script Properties:
 *   SUPABASE_URL          — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  — service_role JWT (bypasses RLS for storage uploads)
 *   INGEST_URL            — e.g. https://your-app.vercel.app/api/ingest
 *   INGEST_SECRET         — must match INGEST_SECRET env var on Vercel
 *   FLEET_SUMMARY_URL     — e.g. https://your-app.vercel.app/api/fleet-summary
 *   DIGEST_RECIPIENTS     — comma-separated email addresses
 *   DASHBOARD_URL         — e.g. https://your-app.vercel.app (no trailing slash)
 *   DIGEST_AFTER_HOUR     — (optional) Baghdad hour (0–23) after which digest may send; default 9
 */

var PROCESSED_LABEL    = 'dd-processed';
var DIGEST_FLAG_PREFIX = 'DIGEST_SENT_';

// ═══════════════════════════════════════════════════════════════════════════════
// PART 1 — COURIER (entry point — attach to time-based trigger)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PRODUCTION entry point.
 * Processes unread autosupport emails, then attempts to send today's digest
 * if the time gate passes (see maybeSendDigest_()).
 * All gates (time, date, dedupe) are active.
 */
function processAutosupportEmails() {
  var props = PropertiesService.getScriptProperties();
  var cfg = {
    supabaseUrl:  props.getProperty('SUPABASE_URL'),
    serviceKey:   props.getProperty('SUPABASE_SERVICE_KEY'),
    ingestUrl:    props.getProperty('INGEST_URL'),
    ingestSecret: props.getProperty('INGEST_SECRET'),
  };

  if (!cfg.supabaseUrl || !cfg.serviceKey || !cfg.ingestUrl || !cfg.ingestSecret) {
    throw new Error('[COURIER] Missing one or more required Script Properties. See README.');
  }

  // Get or create the processed label
  var label = GmailApp.getUserLabelByName(PROCESSED_LABEL)
           || GmailApp.createLabel(PROCESSED_LABEL);

  var searches = [
    { query: 'subject:autosupport-bag has:attachment -label:dd-processed',    hint: 'BAG'    },
    { query: 'subject:autosupport-offset has:attachment -label:dd-processed',  hint: 'OFFSET' },
    { query: 'subject:autosupport-avamar has:attachment -label:dd-processed',  hint: 'AVAMAR' },
  ];

  for (var s = 0; s < searches.length; s++) {
    var search  = searches[s];
    Logger.log('[COURIER] Searching: ' + search.query);
    var threads = GmailApp.search(search.query, 0, 50);
    Logger.log('[COURIER] Found ' + threads.length + ' threads for group=' + search.hint);

    for (var t = 0; t < threads.length; t++) {
      var messages = threads[t].getMessages();

      for (var m = 0; m < messages.length; m++) {
        var msg = messages[m];

        if (messageHasLabel_(msg, PROCESSED_LABEL)) {
          Logger.log('[COURIER] Skipping already-labeled message ' + msg.getId());
          continue;
        }

        var success = processMessage_(msg, search.hint, cfg);
        if (success) {
          threads[t].addLabel(label);
          Logger.log('[COURIER] Labeled thread ' + threads[t].getId() + ' as ' + PROCESSED_LABEL);
        }
      }
    }
  }

  Logger.log('[COURIER] Email processing complete. Checking digest gate...');
  maybeSendDigest_();
}

// ─── Process one message ──────────────────────────────────────────────────────

function processMessage_(message, subjectHint, cfg) {
  var attachments = message.getAttachments({ includeInlineImages: false });
  if (!attachments || attachments.length === 0) {
    Logger.log('[COURIER] No attachments in message ' + message.getId() + ' — labeling as done.');
    return true;
  }

  var messageId = message.getId();
  var dateStr   = Utilities.formatDate(message.getDate(), 'UTC', 'yyyy-MM-dd');
  Logger.log('[COURIER] Processing message ' + messageId + ' (' + attachments.length + ' attachment(s)) date=' + dateStr + ' hint=' + subjectHint);

  var anyTransientError = false;

  for (var i = 0; i < attachments.length; i++) {
    var att  = attachments[i];
    var name = att.getName() || ('attachment-' + i);
    Logger.log('[COURIER]   Attachment ' + i + ': ' + name);

    // Gzip unless already compressed
    var payload;
    if (name.toLowerCase().slice(-3) === '.gz') {
      payload = att.copyBlob().getBytes();
      Logger.log('[COURIER]   Already gzipped — uploading as-is.');
    } else {
      payload = Utilities.gzip(att.copyBlob()).getBytes();
      Logger.log('[COURIER]   Gzipped (' + payload.length + ' bytes).');
    }

    var storagePath = 'inbound/' + dateStr + '/' + messageId + '/' + i + '.gz';

    // ── Step 1: upload to Supabase Storage ────────────────────────────────────
    var uploadUrl = cfg.supabaseUrl + '/storage/v1/object/raw-reports/' + storagePath;
    Logger.log('[COURIER]   Uploading to ' + uploadUrl);
    var uploadResp = UrlFetchApp.fetch(uploadUrl, {
      method:             'PUT',
      headers: {
        'Authorization':  'Bearer ' + cfg.serviceKey,
        'Content-Type':   'application/octet-stream',
        'x-upsert':       'true',
      },
      payload:             payload,
      muteHttpExceptions:  true,
    });

    var uploadStatus = uploadResp.getResponseCode();
    Logger.log('[COURIER]   Upload HTTP ' + uploadStatus);
    if (uploadStatus !== 200 && uploadStatus !== 201) {
      Logger.log('[COURIER]   ERROR: upload failed. Response: ' + uploadResp.getContentText());
      anyTransientError = true;
      continue;
    }

    // ── Step 2: call ingest API ───────────────────────────────────────────────
    var ingestBody = JSON.stringify({
      storagePath:    storagePath,
      emailMessageId: messageId,
      subjectHint:    subjectHint,
    });

    Logger.log('[COURIER]   Calling ingest: ' + cfg.ingestUrl);
    var ingestResp = UrlFetchApp.fetch(cfg.ingestUrl, {
      method:             'POST',
      headers: {
        'Content-Type':   'application/json',
        'x-ingest-key':   cfg.ingestSecret,
      },
      payload:             ingestBody,
      muteHttpExceptions:  true,
    });

    var ingestStatus = ingestResp.getResponseCode();
    Logger.log('[COURIER]   Ingest HTTP ' + ingestStatus);

    if (ingestStatus === 200) {
      Logger.log('[COURIER]   Ingested: ' + storagePath);
    } else if (ingestStatus === 409) {
      Logger.log('[COURIER]   Duplicate (already ingested): ' + storagePath);
    } else if (ingestStatus >= 400 && ingestStatus < 500) {
      Logger.log('[COURIER]   WARNING: client error ' + ingestStatus + ' for ' + storagePath + ': ' + ingestResp.getContentText());
      // Permanent failure — label anyway so we don't retry indefinitely
    } else {
      Logger.log('[COURIER]   ERROR: server error ' + ingestStatus + ' for ' + storagePath + ': ' + ingestResp.getContentText());
      anyTransientError = true;
    }
  }

  return !anyTransientError;
}

// ─── Helper: check whether a message's thread already carries a label ─────────

function messageHasLabel_(message, labelName) {
  var labels = message.getThread().getLabels();
  for (var i = 0; i < labels.length; i++) {
    if (labels[i].getName() === labelName) return true;
  }
  return false;
}

// ─── Manual install helper — run once in the Apps Script editor ───────────────

/**
 * Run this once to install the 30-minute trigger.
 * It removes any existing processAutosupportEmails triggers first to prevent duplicates.
 */
function installTrigger() {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    if (existing[i].getHandlerFunction() === 'processAutosupportEmails') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }

  ScriptApp.newTrigger('processAutosupportEmails')
    .timeBased()
    .everyMinutes(30)
    .create();

  Logger.log('[SETUP] Trigger installed: processAutosupportEmails every 30 minutes.');
}


// ═══════════════════════════════════════════════════════════════════════════════
// PART 2 — DAILY FLEET DIGEST (Phase 6)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * PRODUCTION digest function — called automatically by processAutosupportEmails().
 * Enforces all three gates before sending:
 *   1. Dedupe: DIGEST_SENT_<date> flag in PropertiesService
 *   2. Time gate: current Baghdad hour must be >= DIGEST_AFTER_HOUR (default 9)
 * Only sends if both gates pass.
 */
function maybeSendDigest_() {
  var props    = PropertiesService.getScriptProperties();
  var todayBdg = todayBaghdad_();
  var flagKey  = DIGEST_FLAG_PREFIX + todayBdg;

  // Gate 1: dedupe
  if (props.getProperty(flagKey)) {
    Logger.log('[DIGEST] Already sent today (' + todayBdg + '). Skipping.');
    return;
  }

  // Gate 2: time window
  var afterHour = parseInt(props.getProperty('DIGEST_AFTER_HOUR') || '9', 10);
  var curHour   = getCurrentBaghdadHour_();
  if (curHour < afterHour) {
    Logger.log('[DIGEST] Too early (Baghdad hour=' + curHour + ', gate=' + afterHour + '). Skipping.');
    return;
  }

  Logger.log('[DIGEST] Gates passed. Fetching fleet summary...');
  sendDigest_(false);
}

/**
 * Fetches /api/fleet-summary, builds the HTML email, and sends it via MailApp.
 * @param {boolean} force — when true, skips the dedupe flag check (test helpers only).
 */
function sendDigest_(force) {
  var props       = PropertiesService.getScriptProperties();
  var summaryUrl  = props.getProperty('FLEET_SUMMARY_URL');
  var ingestSecret = props.getProperty('INGEST_SECRET');
  var recipients  = props.getProperty('DIGEST_RECIPIENTS');
  var dashUrl     = props.getProperty('DASHBOARD_URL') || '';

  if (!summaryUrl || !ingestSecret || !recipients) {
    throw new Error('[DIGEST] Missing FLEET_SUMMARY_URL, INGEST_SECRET, or DIGEST_RECIPIENTS. See README.');
  }

  var todayBdg = todayBaghdad_();
  var flagKey  = DIGEST_FLAG_PREFIX + todayBdg;

  if (!force && props.getProperty(flagKey)) {
    Logger.log('[DIGEST] Already sent today. Skipping (force=false).');
    return;
  }

  // ── Fetch fleet summary ────────────────────────────────────────────────────
  Logger.log('[DIGEST] Fetching: ' + summaryUrl);
  var resp = UrlFetchApp.fetch(summaryUrl, {
    method:             'GET',
    headers: {
      'x-ingest-key':   ingestSecret,
    },
    muteHttpExceptions: true,
  });

  var httpStatus = resp.getResponseCode();
  Logger.log('[DIGEST] Fleet summary HTTP ' + httpStatus);

  if (httpStatus !== 200) {
    Logger.log('[DIGEST] ERROR: fleet summary fetch failed. Body: ' + resp.getContentText());
    throw new Error('[DIGEST] Fleet summary returned HTTP ' + httpStatus);
  }

  var envelope = JSON.parse(resp.getContentText());
  if (!envelope.ok) {
    throw new Error('[DIGEST] Fleet summary error: ' + JSON.stringify(envelope.error));
  }

  var summary = envelope.data;
  Logger.log('[DIGEST] Summary: date=' + summary.date
    + ' received=' + summary.reportsReceived + '/' + summary.reportsExpected
    + ' critical=' + summary.counts.critical
    + ' warning='  + summary.counts.warning
    + ' healthy='  + summary.counts.healthy
    + ' missing='  + summary.counts.missing
    + ' issues='   + summary.issues.length);

  // ── Build and send the email ────────────────────────────────────────────────
  var subject  = buildSubjectLine_(summary);
  var htmlBody = buildDigestHtml_(summary, dashUrl);
  var toList   = recipients.split(',').map(function(r) { return r.trim(); }).filter(Boolean).join(',');

  Logger.log('[DIGEST] Sending to: ' + toList);
  Logger.log('[DIGEST] Subject: ' + subject);

  MailApp.sendEmail({
    to:       toList,
    subject:  subject,
    htmlBody: htmlBody,
  });

  // ── Mark as sent ───────────────────────────────────────────────────────────
  props.setProperty(flagKey, new Date().toISOString());
  Logger.log('[DIGEST] Email sent. Dedupe flag set: ' + flagKey);
}

// ─── Subject line ────────────────────────────────────────────────────────────

function buildSubjectLine_(summary) {
  var date = formatShortDate_(summary.date);
  if (summary.counts.critical > 0) {
    return 'DD Monitor — ' + summary.counts.critical + ' critical \xb7 ' + date;
  }
  if (summary.reportsReceived < summary.reportsExpected) {
    return 'DD Monitor — reports missing \xb7 ' + date;
  }
  if (summary.counts.warning > 0) {
    return 'DD Monitor — ' + summary.counts.warning + ' warning \xb7 ' + date;
  }
  return 'DD Monitor — all healthy \xb7 ' + date;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildDigestHtml_(summary, dashUrl) {
  var date      = summary.date;       // 'YYYY-MM-DD'
  var groups    = summary.groups;     // [{name, reportReceived, reportTime}]
  var counts    = summary.counts;     // {critical, warning, healthy, missing}
  var devices   = summary.devices;    // [{...}]
  var issues    = summary.issues;     // [{...}]

  var received  = summary.reportsReceived;
  var expected  = summary.reportsExpected;
  var longDate  = formatLongDate_(date);

  // Header bar color: red if critical, amber if missing/warning, green otherwise
  var headerBg = counts.critical > 0 ? '#DC2626'
    : received < expected           ? '#D97706'
    : counts.warning > 0            ? '#D97706'
    : '#16A34A';

  // ── Group report status row ────────────────────────────────────────────────
  var groupCells = '';
  for (var g = 0; g < groups.length; g++) {
    var grp  = groups[g];
    var time = grp.reportTime
      ? formatBaghdadTime_(grp.reportTime)
      : null;
    var bgColor  = grp.reportReceived ? '#F0FDF4' : '#FEF2F2';
    var dotColor = grp.reportReceived ? '#16A34A'  : '#DC2626';
    var dotChar  = grp.reportReceived ? '✓ RECEIVED' : '✗ MISSING';
    var timeStr  = time ? '<div style="font-size:11px;color:#71717A;margin-top:2px;">' + time + '</div>' : '';

    groupCells +=
      '<td style="background:' + bgColor + ';border-radius:6px;padding:10px 12px;text-align:center;vertical-align:top;">' +
        '<div style="font-size:10px;font-weight:700;color:' + dotColor + ';letter-spacing:0.5px;">' + dotChar + '</div>' +
        '<div style="font-size:14px;font-weight:700;color:#18181B;margin-top:4px;">' + grp.name + '</div>' +
        timeStr +
      '</td>';
    if (g < groups.length - 1) groupCells += '<td style="width:8px;"></td>';
  }

  // ── "Needs attention" section ─────────────────────────────────────────────
  var attentionRows = '';
  var nonHealthy = devices.filter(function(d) { return d.status === 'CRITICAL' || d.status === 'WARNING'; });
  if (nonHealthy.length > 0) {
    for (var d = 0; d < nonHealthy.length; d++) {
      var dev     = nonHealthy[d];
      var bgC     = dev.status === 'CRITICAL' ? '#FEF2F2' : '#FFFBEB';
      var txtC    = dev.status === 'CRITICAL' ? '#DC2626'  : '#D97706';
      var reason  = dev.statusReason || dev.status;
      attentionRows +=
        '<tr>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #E4E4E7;">' +
            '<span style="font-size:10px;font-weight:700;background:' + bgC + ';color:' + txtC + ';padding:2px 6px;border-radius:3px;">' + dev.status + '</span>' +
            '<span style="margin-left:8px;font-size:13px;color:#18181B;font-weight:600;">' + (dev.displayName || dev.hostname) + '</span>' +
            '<span style="margin-left:6px;font-size:11px;color:#71717A;">' + (dev.group || '') + '</span>' +
          '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #E4E4E7;font-size:12px;color:#52525B;">' + reason + '</td>' +
        '</tr>';
    }
  }

  var attentionSection = '';
  if (nonHealthy.length > 0) {
    attentionSection =
      '<tr><td style="padding:0 24px 16px;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#71717A;margin-bottom:8px;">NEEDS ATTENTION</div>' +
        '<table width="100%" style="border-collapse:collapse;border:1px solid #E4E4E7;border-radius:6px;overflow:hidden;">' +
          attentionRows +
        '</table>' +
      '</td></tr>';
  }

  // ── Fleet overview table ──────────────────────────────────────────────────
  var fleetRows = '';
  for (var i = 0; i < devices.length; i++) {
    var dv        = devices[i];
    var statusBg  = dv.status === 'CRITICAL'  ? '#FEF2F2'
      : dv.status === 'WARNING'               ? '#FFFBEB'
      : dv.status === 'HEALTHY'               ? '#F0FDF4'
      : '#F4F4F5';
    var statusTxt = dv.status === 'CRITICAL'  ? '#DC2626'
      : dv.status === 'WARNING'               ? '#D97706'
      : dv.status === 'HEALTHY'               ? '#16A34A'
      : '#71717A';
    var capPct   = dv.usePct !== null ? Math.round(dv.usePct) + '%' : '—';
    var capColor = dv.usePct !== null && dv.usePct >= 90 ? '#DC2626'
      : dv.usePct !== null && dv.usePct >= 80           ? '#D97706'
      : '#16A34A';
    var rptTime  = dv.reportTime ? formatBaghdadTime_(dv.reportTime) : '—';
    var healthLabel = dv.status === 'HEALTHY' ? 'HEALTHY'
      : dv.status === 'NO REPORT'             ? 'NO REPORT'
      : dv.status + (dv.statusReason ? ' — ' + dv.statusReason : '');

    fleetRows +=
      '<tr style="border-bottom:1px solid #E4E4E7;">' +
        '<td style="padding:9px 12px;font-size:13px;font-weight:600;color:#18181B;">' + (dv.displayName || dv.hostname) + '</td>' +
        '<td style="padding:9px 12px;text-align:center;font-size:11px;font-weight:700;color:#71717A;">' + (dv.group || '—') + '</td>' +
        '<td style="padding:9px 12px;font-size:12px;color:' + statusTxt + ';font-weight:600;">' + healthLabel + '</td>' +
        '<td style="padding:9px 12px;text-align:center;font-size:13px;font-weight:700;color:' + capColor + ';font-family:monospace;">' + capPct + '</td>' +
        '<td style="padding:9px 12px;text-align:center;font-size:12px;color:#71717A;font-family:monospace;">' + rptTime + '</td>' +
      '</tr>';
  }

  // ── Issue details section ─────────────────────────────────────────────────
  var issueRows = '';
  if (issues && issues.length > 0) {
    for (var j = 0; j < issues.length; j++) {
      var iss   = issues[j];
      var issBg = iss.severity === 'CRITICAL' ? '#FEF2F2' : '#FFFBEB';
      var issTx = iss.severity === 'CRITICAL' ? '#DC2626'  : '#D97706';
      issueRows +=
        '<tr>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #E4E4E7;">' +
            '<span style="font-size:10px;font-weight:700;background:' + issBg + ';color:' + issTx + ';padding:2px 5px;border-radius:3px;">' + iss.severity + '</span>' +
            '<span style="margin-left:8px;font-size:13px;color:#18181B;font-weight:600;">' + (iss.displayName || iss.hostname) + '</span>' +
          '</td>' +
          '<td style="padding:8px 12px;border-bottom:1px solid #E4E4E7;font-size:12px;color:#52525B;">' +
            '<strong>' + iss.alertClass + ' / ' + iss.alertObject + '</strong><br>' + iss.message +
          '</td>' +
        '</tr>';
    }
  }

  var issueSection = '';
  if (issueRows) {
    issueSection =
      '<tr><td style="padding:0 24px 16px;">' +
        '<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#71717A;margin-bottom:8px;">DEVICE ALERTS</div>' +
        '<table width="100%" style="border-collapse:collapse;border:1px solid #E4E4E7;border-radius:6px;overflow:hidden;">' +
          issueRows +
        '</table>' +
      '</td></tr>';
  }

  // ── Dashboard button ──────────────────────────────────────────────────────
  var btnSection = dashUrl
    ? '<tr><td align="center" style="padding:8px 24px 20px;">' +
        '<a href="' + dashUrl + '" style="display:inline-block;background:#7C3AED;color:#ffffff;padding:10px 28px;border-radius:6px;text-decoration:none;font-weight:700;font-size:14px;letter-spacing:0.2px;">Open Dashboard</a>' +
      '</td></tr>'
    : '';

  // ── Assemble ──────────────────────────────────────────────────────────────
  return (
    '<table width="100%" bgcolor="#F8F8FA" cellpadding="0" cellspacing="0" style="font-family:Arial,sans-serif;">' +
      '<tr><td align="center" style="padding:24px 16px;">' +
        '<table width="600" bgcolor="#FFFFFF" cellpadding="0" cellspacing="0" style="border-radius:8px;border:1px solid #E4E4E7;">' +

          // Header
          '<tr><td bgcolor="' + headerBg + '" style="padding:20px 24px;border-radius:8px 8px 0 0;">' +
            '<div style="display:flex;align-items:baseline;">' +
              '<span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">DD Monitor</span>' +
              '<span style="color:rgba(255,255,255,0.8);font-size:13px;margin-left:10px;">Zain Iraq \xb7 Daily Fleet Digest</span>' +
            '</div>' +
            '<div style="color:rgba(255,255,255,0.75);font-size:13px;margin-top:4px;">' + longDate + ' \xb7 Asia/Baghdad</div>' +
          '</td></tr>' +

          // Summary bar
          '<tr><td style="padding:14px 24px;background:#F8F8FA;border-bottom:1px solid #E4E4E7;">' +
            '<span style="font-size:13px;color:#52525B;">Reports: <strong style="color:#18181B;">' + received + '&nbsp;/&nbsp;' + expected + ' received</strong></span>' +
            '<span style="font-size:13px;color:#52525B;margin-left:20px;">Issues: <strong style="color:#18181B;">' + counts.critical + ' critical</strong> &middot; ' + counts.warning + ' warning</span>' +
          '</td></tr>' +

          // Status count tiles
          '<tr><td style="padding:16px 24px 0;">' +
            '<table width="100%" cellpadding="0" cellspacing="0"><tr>' +
              '<td align="center" style="background:#FEF2F2;border-radius:6px;padding:12px 8px;">' +
                '<div style="font-size:28px;font-weight:700;color:#DC2626;">' + counts.critical + '</div>' +
                '<div style="font-size:10px;font-weight:700;color:#DC2626;letter-spacing:0.5px;">CRITICAL</div>' +
              '</td>' +
              '<td style="width:10px;"></td>' +
              '<td align="center" style="background:#FFFBEB;border-radius:6px;padding:12px 8px;">' +
                '<div style="font-size:28px;font-weight:700;color:#D97706;">' + counts.warning + '</div>' +
                '<div style="font-size:10px;font-weight:700;color:#D97706;letter-spacing:0.5px;">WARNING</div>' +
              '</td>' +
              '<td style="width:10px;"></td>' +
              '<td align="center" style="background:#F0FDF4;border-radius:6px;padding:12px 8px;">' +
                '<div style="font-size:28px;font-weight:700;color:#16A34A;">' + counts.healthy + '</div>' +
                '<div style="font-size:10px;font-weight:700;color:#16A34A;letter-spacing:0.5px;">HEALTHY</div>' +
              '</td>' +
              '<td style="width:10px;"></td>' +
              '<td align="center" style="background:#F4F4F5;border-radius:6px;padding:12px 8px;">' +
                '<div style="font-size:28px;font-weight:700;color:#71717A;">' + counts.missing + '</div>' +
                '<div style="font-size:10px;font-weight:700;color:#71717A;letter-spacing:0.5px;">NO REPORT</div>' +
              '</td>' +
            '</tr></table>' +
          '</td></tr>' +

          // Group report status
          '<tr><td style="padding:16px 24px 0;">' +
            '<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#71717A;margin-bottom:8px;">REPORT STATUS BY GROUP</div>' +
            '<table width="100%" cellpadding="0" cellspacing="0"><tr>' + groupCells + '</tr></table>' +
          '</td></tr>' +

          // Spacing
          '<tr><td style="height:16px;"></td></tr>' +

          // Needs Attention
          attentionSection +

          // Fleet Overview table
          '<tr><td style="padding:0 24px 16px;">' +
            '<div style="font-size:11px;font-weight:700;letter-spacing:0.5px;color:#71717A;margin-bottom:8px;">FLEET OVERVIEW</div>' +
            '<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #E4E4E7;border-radius:6px;overflow:hidden;">' +
              '<tr style="background:#F8F8FA;">' +
                '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#71717A;letter-spacing:0.5px;border-bottom:1px solid #E4E4E7;">DEVICE</th>' +
                '<th style="text-align:center;padding:8px 12px;font-size:10px;font-weight:700;color:#71717A;letter-spacing:0.5px;border-bottom:1px solid #E4E4E7;">GROUP</th>' +
                '<th style="text-align:left;padding:8px 12px;font-size:10px;font-weight:700;color:#71717A;letter-spacing:0.5px;border-bottom:1px solid #E4E4E7;">HEALTH</th>' +
                '<th style="text-align:center;padding:8px 12px;font-size:10px;font-weight:700;color:#71717A;letter-spacing:0.5px;border-bottom:1px solid #E4E4E7;">CAPACITY</th>' +
                '<th style="text-align:center;padding:8px 12px;font-size:10px;font-weight:700;color:#71717A;letter-spacing:0.5px;border-bottom:1px solid #E4E4E7;">REPORTED</th>' +
              '</tr>' +
              fleetRows +
            '</table>' +
          '</td></tr>' +

          // Issue details (device alerts)
          issueSection +

          // Capacity legend
          '<tr><td style="padding:0 24px 16px;">' +
            '<span style="font-size:11px;color:#71717A;">' +
              'Capacity: ' +
              '<span style="color:#16A34A;">&#9632;</span> healthy &lt;80%&nbsp;&nbsp;' +
              '<span style="color:#D97706;">&#9632;</span> warning 80–89%&nbsp;&nbsp;' +
              '<span style="color:#DC2626;">&#9632;</span> critical ≥90%' +
            '</span>' +
          '</td></tr>' +

          // Dashboard button
          btnSection +

          // Footer
          '<tr><td style="padding:12px 24px;border-top:1px solid #E4E4E7;border-radius:0 0 8px 8px;text-align:center;">' +
            '<span style="font-size:11px;color:#71717A;">DD Monitor \xb7 Zain Iraq Backup Infrastructure \xb7 Sent via Google Apps Script</span>' +
          '</td></tr>' +

        '</table>' +
      '</td></tr>' +
    '</table>'
  );
}

// ─── Date/time helpers ────────────────────────────────────────────────────────

/** Returns today's date string in Asia/Baghdad as 'YYYY-MM-DD'. */
function todayBaghdad_() {
  return Utilities.formatDate(new Date(), 'Asia/Baghdad', 'yyyy-MM-dd');
}

/** Returns the current hour (0–23) in Asia/Baghdad. */
function getCurrentBaghdadHour_() {
  return parseInt(Utilities.formatDate(new Date(), 'Asia/Baghdad', 'HH'), 10);
}

/** Formats a Baghdad-date string (YYYY-MM-DD) as 'Monday, 16 June 2026'. */
function formatLongDate_(dateStr) {
  var d    = new Date(dateStr + 'T12:00:00+03:00');
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  var mons = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  return days[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + mons[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/** Formats a Baghdad-date string (YYYY-MM-DD) as '16 Jun'. */
function formatShortDate_(dateStr) {
  var d    = new Date(dateStr + 'T12:00:00+03:00');
  var mons = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return d.getUTCDate() + ' ' + mons[d.getUTCMonth()];
}

/** Formats a UTC ISO timestamp as 'HH:MM BDT' (Baghdad local time). */
function formatBaghdadTime_(isoStr) {
  try {
    return Utilities.formatDate(new Date(isoStr), 'Asia/Baghdad', 'HH:mm') + ' BDT';
  } catch (e) {
    return isoStr;
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// TEST HELPERS — Run manually from the Apps Script editor to verify behavior.
// These bypass time-gate and dedupe flags. Never called by the production trigger.
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TEST ONLY — Fetches /api/fleet-summary and logs the parsed JSON without sending any email.
 * Use this first to verify the data before running testDigestNow().
 */
function testFleetSummaryFetch() {
  var props        = PropertiesService.getScriptProperties();
  var summaryUrl   = props.getProperty('FLEET_SUMMARY_URL');
  var ingestSecret = props.getProperty('INGEST_SECRET');

  if (!summaryUrl || !ingestSecret) {
    throw new Error('[TEST] FLEET_SUMMARY_URL or INGEST_SECRET not set.');
  }

  Logger.log('[TEST] Fetching fleet summary from: ' + summaryUrl);
  var resp = UrlFetchApp.fetch(summaryUrl, {
    method:             'GET',
    headers:            { 'x-ingest-key': ingestSecret },
    muteHttpExceptions: true,
  });

  Logger.log('[TEST] HTTP ' + resp.getResponseCode());
  Logger.log('[TEST] Response: ' + resp.getContentText());

  var envelope = JSON.parse(resp.getContentText());
  if (!envelope.ok) {
    Logger.log('[TEST] ERROR: ' + JSON.stringify(envelope.error));
    return;
  }

  var s = envelope.data;
  Logger.log('[TEST] Date: ' + s.date);
  Logger.log('[TEST] Reports: ' + s.reportsReceived + '/' + s.reportsExpected);
  Logger.log('[TEST] Counts: critical=' + s.counts.critical + ' warning=' + s.counts.warning + ' healthy=' + s.counts.healthy + ' missing=' + s.counts.missing);
  Logger.log('[TEST] Devices (' + s.devices.length + '):');
  for (var d = 0; d < s.devices.length; d++) {
    var dv = s.devices[d];
    Logger.log('[TEST]   ' + dv.hostname + ' [' + (dv.group||'?') + '] ' + dv.status + (dv.statusReason ? ' — ' + dv.statusReason : '') + ' cap=' + (dv.usePct !== null ? dv.usePct + '%' : '—'));
  }
  Logger.log('[TEST] Groups:');
  for (var g = 0; g < s.groups.length; g++) {
    var grp = s.groups[g];
    Logger.log('[TEST]   ' + grp.name + ': ' + (grp.reportReceived ? 'RECEIVED at ' + grp.reportTime : 'MISSING'));
  }
  Logger.log('[TEST] Issues (' + s.issues.length + '):');
  for (var i = 0; i < s.issues.length; i++) {
    var iss = s.issues[i];
    Logger.log('[TEST]   [' + iss.severity + '] ' + iss.hostname + ' — ' + iss.alertClass + '/' + iss.alertObject + ': ' + iss.message);
  }
  Logger.log('[TEST] Done. To send the digest, run testDigestNow().');
}

/**
 * TEST ONLY — Builds and sends the digest email IMMEDIATELY, bypassing the
 * time gate and the dedupe flag.  Resets the dedupe flag after sending so
 * subsequent production runs are not blocked.
 */
function testDigestNow() {
  Logger.log('[TEST] testDigestNow() — bypassing all gates and sending immediately.');
  sendDigest_(true);  // force=true skips dedupe check inside sendDigest_

  // Clear the flag so the production trigger can still send today's digest
  // (remove this line if you want to prevent a second send)
  var props   = PropertiesService.getScriptProperties();
  var flagKey = DIGEST_FLAG_PREFIX + todayBaghdad_();
  props.deleteProperty(flagKey);
  Logger.log('[TEST] Dedupe flag cleared (' + flagKey + '). Production run will still send today.');
}

/**
 * TEST ONLY — Clears today's DIGEST_SENT_<date> flag so the next production
 * trigger run will attempt to send the digest again.
 */
function clearTodayFlags() {
  var props   = PropertiesService.getScriptProperties();
  var today   = todayBaghdad_();
  var flagKey = DIGEST_FLAG_PREFIX + today;
  var existing = props.getProperty(flagKey);
  if (existing) {
    props.deleteProperty(flagKey);
    Logger.log('[TEST] Cleared flag: ' + flagKey + ' (was set at ' + existing + ')');
  } else {
    Logger.log('[TEST] Flag not set for today (' + today + ') — nothing to clear.');
  }
}
