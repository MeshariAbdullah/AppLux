// =====================================================================
// merchant-doc-cleanup — purges orphaned quarantine uploads.
//
// A merchant may upload the CR copy in Step 5 and then abandon the wizard
// before signup. Those quarantined objects have no claimed application, so
// after 24h this scheduled function deletes the storage object and marks
// the ticket expired. Claimed tickets are never touched.
//
// Runs with the SERVICE ROLE. SQL can't delete Storage bytes, so it lists
// candidates via list_orphaned_upload_tickets(), removes the objects via
// the Storage API, then finalizes each ticket.
//
// Deploy (manual) + schedule daily via Supabase scheduled functions / cron.
// Required secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
// =====================================================================

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const BUCKET = 'merchant-documents';

serve(async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !serviceKey) {
    return new Response(JSON.stringify({ error: 'not_configured' }), { status: 503 });
  }
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data, error } = await admin.rpc('list_orphaned_upload_tickets');
  if (error) {
    console.error('[merchant-doc-cleanup] list failed', error);
    return new Response(JSON.stringify({ error: 'list_failed' }), { status: 500 });
  }

  let purged = 0;
  for (const row of data ?? []) {
    if (row.storage_path) {
      const rm = await admin.storage.from(BUCKET).remove([row.storage_path]);
      if (rm.error) {
        console.error('[merchant-doc-cleanup] object remove failed', row.id, rm.error);
        continue; // leave the ticket for the next run
      }
    }
    await admin.rpc('finalize_orphaned_upload_ticket', { p_id: row.id });
    purged += 1;
  }

  return new Response(JSON.stringify({ ok: true, purged }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
