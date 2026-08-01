// CORS contract test for the browser-invoked merchant-doc-upload
// Edge Function.
//
// The function is a SELF-CONTAINED single file (CORS inlined between the
// `=== CORS (inlined ...) ===` / `=== end CORS ===` markers) so it can be
// pasted into the Supabase Dashboard editor. There is no Deno runtime in
// CI here, so this extracts that inlined block, transpiles it (it uses
// only web-standard Request/Response), and exercises preflight() +
// json() functionally in Node.
//
//   node supabase/tests/edge_cors_test.mjs
//
// Regression guard for: "Request header field authorization is not
// allowed by Access-Control-Allow-Headers in preflight response."
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FN = resolve(here, '../functions/merchant-doc-upload/index.ts');
const src = readFileSync(FN, 'utf8');

// Slice the inlined CORS block out of the deployed function.
const begin = src.indexOf('// === CORS');
const end = src.indexOf('// === end CORS ===');
if (begin < 0 || end < 0) { console.error('FAIL: CORS markers not found in index.ts'); process.exit(1); }
const block = src.slice(begin, end)
  // export the symbols so the test can import them
  .replace('const corsHeaders', 'export const corsHeaders')
  .replace('function preflight', 'export function preflight')
  .replace('function json', 'export function json');

const dir = mkdtempSync(join(tmpdir(), 'cors-'));
const ts = join(dir, 'cors.ts');
const out = join(dir, 'cors.mjs');
writeFileSync(ts, block);
execSync(`npx esbuild "${ts}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: 'ignore' });
const { corsHeaders, preflight, json } = await import(out);

let failures = 0;
const check = (n, ok, d = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${n}${d ? ` — ${d}` : ''}`); if (!ok) failures++; };

const allowHeaders = corsHeaders['Access-Control-Allow-Headers'].toLowerCase().split(',').map((s) => s.trim());
const allowMethods = corsHeaders['Access-Control-Allow-Methods'].toUpperCase();

for (const h of ['authorization', 'x-client-info', 'apikey', 'content-type']) {
  check(`allowed headers include ${h}`, allowHeaders.includes(h));
}
check('methods include POST', allowMethods.includes('POST'));
check('methods include OPTIONS', allowMethods.includes('OPTIONS'));
check('Allow-Origin is *', corsHeaders['Access-Control-Allow-Origin'] === '*');

const opt = preflight(new Request('https://x/fn', { method: 'OPTIONS' }));
check('preflight returns a Response for OPTIONS', opt instanceof Response);
check('OPTIONS preflight status is 200', opt?.status === 200);
check('preflight has Access-Control-Allow-Origin', opt?.headers.get('access-control-allow-origin') === '*');
check('preflight Allow-Headers includes authorization', (opt?.headers.get('access-control-allow-headers') ?? '').toLowerCase().includes('authorization'));
check('preflight returns null for POST', preflight(new Request('https://x/fn', { method: 'POST' })) === null);

const ok = json({ receipt: 'r' });
check('success response has Allow-Origin', ok.headers.get('access-control-allow-origin') === '*');
check('success response Allow-Headers includes x-client-info', (ok.headers.get('access-control-allow-headers') ?? '').includes('x-client-info'));
check('success response is application/json', ok.headers.get('content-type') === 'application/json');
const err = json({ error: 'rate_limited' }, { status: 429 });
check('error (429) response has Allow-Origin', err.headers.get('access-control-allow-origin') === '*');
check('error (429) response keeps status', err.status === 429);
check('error response Allow-Headers includes authorization + apikey', (() => {
  const h = (err.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  return h.includes('authorization') && h.includes('apikey');
})());

// The deployed file must NOT re-introduce a shared import.
check('index.ts has no ../_shared import', !src.includes("from '../_shared/"));

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
