// =====================================================================
// UUID-leak guards — no raw database identifier may render as text on
// a user-facing screen (customer, merchant, or admin). Friendly public
// references (CN-…, DC-…, LND-…) are the only visible ids.
// Run: npm run test:uuid
// =====================================================================
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { displayRef, isUuid } from './.display-ref-bundle.mjs';

const root = path.resolve(import.meta.dirname, '..');
const read = (p) => readFileSync(path.join(root, p), 'utf8');

// ---------------------------------------------------------------------
// The safe display helper
// ---------------------------------------------------------------------

test('displayRef passes friendly public references through', () => {
  for (const ref of ['CN-2026-100041', 'DC-2026-000123', 'LND-2026-0007',
                     'DM-2026-152', 'MA-2026-041']) {
    assert.equal(displayRef(ref), ref);
    assert.equal(displayRef(`  ${ref} `), ref, 'trimmed');
  }
});

test('displayRef refuses UUIDs in any position', () => {
  const uuid = '6bd955d9-0764-4092-82d0-1ebd71c4cb69';
  assert.equal(displayRef(uuid), null);
  assert.equal(displayRef(uuid.toUpperCase()), null);
  assert.equal(displayRef(`case ${uuid}`), null, 'embedded uuid');
  assert.equal(displayRef(''), null);
  assert.equal(displayRef('   '), null);
  assert.equal(displayRef(null), null);
  assert.equal(displayRef(undefined), null);
  assert.ok(isUuid(uuid));
  assert.ok(!isUuid('DC-2026-000123'));
});

// ---------------------------------------------------------------------
// The reported leak: merchant rental details damage alert
// ---------------------------------------------------------------------

test('damage alert renders the friendly ref through displayRef, never the UUID', () => {
  const src = read('src/pages/merchant/MerchantRentalDetails.tsx');
  // The UUID may appear ONLY inside routing expressions.
  for (const line of src.split('\n')) {
    if (!line.includes('rental.damageCaseId')) continue;
    assert.ok(
      /to=|navigate\(|&&/.test(line),
      `damageCaseId outside routing/guards: ${line.trim()}`,
    );
    assert.ok(
      !/\{rental\.damageCaseId\}\s*<\//.test(line) &&
        !/>\s*\{rental\.damageCaseId\}/.test(line) &&
        !/span[^>]*>\{rental\.damageCaseId\}/.test(line),
      `damageCaseId rendered as text: ${line.trim()}`,
    );
  }
  assert.ok(src.includes('displayRef(rental.damageCaseRef)'),
    'the alert link shows the friendly ref via displayRef');
});

test('rental adapter exposes case_number as the display ref', () => {
  const adapters = read('src/lib/supabase/adapters.ts');
  assert.ok(adapters.includes('damageCaseRef: caseNonDismissed ? damageCase.case_number : undefined'));
});

// ---------------------------------------------------------------------
// Admin screens: no unlabeled raw profile UUID
// ---------------------------------------------------------------------

test('admin user hero no longer prints the profile UUID', () => {
  const src = read('src/pages/admin/AdminUserDetails.tsx');
  assert.ok(!/>\s*\{user\.id\}\s*</.test(src) && !/\{user\.id\}\s*\n\s*<\/div>/.test(src),
    'user.id must not render as text');
});

// ---------------------------------------------------------------------
// Sweep: user-facing screens never interpolate raw id fields as text.
// Routing (`to=`, `navigate(`, `href`), keys, and API params stay free
// to carry UUIDs — only *rendered text* is forbidden.
// ---------------------------------------------------------------------

test('no user-facing screen renders a raw id field as text', () => {
  const offenders = [];
  // {x.id} / {x.case_id} / {caseId} … rendered directly as JSX text.
  const rendered =
    /(?:>|·|\s)\{\s*[a-zA-Z]+\.(id|case_id|dispute_id|rental_id|invoice_id|contract_id|merchant_id|profile_id|branch_id|user_id)\s*\}/;
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      const fp = path.join(dir, f);
      if (statSync(fp).isDirectory()) { walk(fp); continue; }
      if (!/\.tsx$/.test(f)) continue;
      for (const line of readFileSync(fp, 'utf8').split('\n')) {
        if (!rendered.test(line)) continue;
        if (/key=|to=|navigate|href|value=|id=|data-|param/.test(line)) continue;
        // Demo-mode components render friendly seed ids (DM-…, MA-…) —
        // allow only the two audited demo spots, nothing else.
        const rel = path.relative(root, fp);
        if (rel === 'src/pages/merchant/MerchantDamages.tsx') continue; // DemoCard: DM-2026-###
        if (rel === 'src/pages/merchant/MerchantHome.tsx') continue;    // demo approvals: MA-2026-###
        if (rel === 'src/pages/Diagnostics.tsx') continue;              // debug-only screen
        offenders.push(`${rel}: ${line.trim()}`);
      }
    }
  };
  walk(path.join(root, 'src/pages'));
  walk(path.join(root, 'src/components'));
  assert.deepEqual(offenders, [], 'raw id fields rendered as text');
});
