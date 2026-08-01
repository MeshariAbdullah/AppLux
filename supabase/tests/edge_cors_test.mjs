// CORS contract test for browser-invoked Edge Functions
// (supabase/functions/_shared/cors.ts, used by merchant-doc-upload).
//
// There is no Deno runtime in CI here, so this transpiles the shared
// module (web-standard APIs only) with esbuild and exercises
// preflight() + jsonResponse() functionally in Node.
//
//   node supabase/tests/edge_cors_test.mjs
//
// Regression guard for: "Request header field authorization is not
// allowed by Access-Control-Allow-Headers in preflight response."
import { execSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '../functions/_shared/cors.ts');
const dir = mkdtempSync(join(tmpdir(), 'cors-'));
const out = join(dir, 'cors.mjs');
execSync(`npx esbuild "${SRC}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: 'ignore' });
const { corsHeaders, preflight, jsonResponse } = await import(out);

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

const ok = jsonResponse({ receipt: 'r' });
check('success response has Allow-Origin', ok.headers.get('access-control-allow-origin') === '*');
check('success response Allow-Headers includes x-client-info', (ok.headers.get('access-control-allow-headers') ?? '').includes('x-client-info'));
check('success response is application/json', ok.headers.get('content-type') === 'application/json');
const err = jsonResponse({ error: 'rate_limited' }, { status: 429 });
check('error (429) response has Allow-Origin', err.headers.get('access-control-allow-origin') === '*');
check('error (429) response keeps status', err.status === 429);
check('error response Allow-Headers includes authorization + apikey', (() => {
  const h = (err.headers.get('access-control-allow-headers') ?? '').toLowerCase();
  return h.includes('authorization') && h.includes('apikey');
})());

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
