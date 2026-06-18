/**
 * DD Monitor — Gmail Intake Courier (Apps Script)
 * Phase 5 implementation scope.
 *
 * Contract (ARCHITECTURE §4.1):
 *   - Time-driven trigger: every 30 minutes
 *   - Search: in:inbox has:attachment -label:dd-processed
 *   - For each matching email:
 *       1. gzip each attachment
 *       2. upload to Supabase Storage raw-reports/{yyyy-mm-dd}/{messageId}/{index}.gz
 *       3. POST /api/ingest { storagePath, emailMessageId } + x-ingest-key header
 *       4. on HTTP 200 or 409 → apply label "dd-processed"
 *          on 5xx → leave unlabeled (retried next run)
 *   - Zero parsing, zero group sorting — pure courier role
 *
 * Secrets stored in Script Properties (never in source):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, INGEST_API_URL, INGEST_SECRET
 */
