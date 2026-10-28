// Caller-authentication test for the scheduled merchant-doc-cleanup
// Edge Function (verify_jwt = false, so the function must gate callers
// itself — same service-to-service pattern as push-dispatch).
//
// No Deno runtime in CI here, so this extracts the inlined gate block
// (between the `=== caller gate` / `=== end caller gate ===` markers),
// transpiles it, and exercises authorizeScheduledCaller() in Node with
// a mocked Deno.env.
//
//   node supabase/tests/edge_cleanup_auth_test.mjs
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const FN = resolve(here, '../functions/merchant-doc-cleanup/index.ts');
const src = readFileSync(FN, 'utf8');

let failures = 0;
const check = (ok, label) => {
  console.log((ok ? 'ok    ' : 'FAIL  ') + label);
  if (!ok) failures += 1;
};

// --- structural: the gate runs before ANY privileged work -------------
const gateCall = src.indexOf('authorizeScheduledCaller(req)');
const rpcCall = src.indexOf("rpc('list_orphaned_upload_tickets')");
const clientCreate = src.indexOf('createClient(');
check(gateCall > -1, 'handler calls authorizeScheduledCaller(req)');
check(rpcCall > -1 && gateCall < rpcCall, 'gate precedes the cleanup RPC');
check(clientCreate > -1 && gateCall < clientCreate, 'gate precedes service-role client creation');

// --- functional: extract + run the gate -------------------------------
const begin = src.indexOf('// === caller gate');
const end = src.indexOf('// === end caller gate ===');
check(begin > -1 && end > begin, 'gate markers present');

const block = src
  .slice(begin, end)
  .replace('function authorizeScheduledCaller', 'export function authorizeScheduledCaller');

const dir = mkdtempSync(join(tmpdir(), 'cleanup-auth-'));
const ts = join(dir, 'gate.ts');
const out = join(dir, 'gate.mjs');
writeFileSync(ts, 'declare const Deno: { env: { get(k: string): string | undefined } };\n' + block);
execSync(`npx esbuild "${ts}" --format=esm --platform=neutral --outfile="${out}"`, { stdio: 'ignore' });

const env = new Map();
globalThis.Deno = { env: { get: (k) => env.get(k) } };
const { authorizeScheduledCaller } = await import(out);

const req = (apikey) =>
  new Request('https://x/functions/v1/merchant-doc-cleanup', {
    method: 'POST',
    headers: apikey == null ? {} : { apikey },
  });

// 1. Env absent → everyone rejected (fail closed).
env.delete('SUPABASE_SECRET_KEYS');
check(authorizeScheduledCaller(req(null))?.status === 401, 'no env + no key → 401');
check(authorizeScheduledCaller(req('sb_secret_guess'))?.status === 401, 'no env + guessed key → 401');

// 2. Malformed env → everyone rejected (fail closed).
env.set('SUPABASE_SECRET_KEYS', 'not-json');
check(authorizeScheduledCaller(req('anything'))?.status === 401, 'malformed env → 401');

// 3. Env present → only the exact default secret key passes.
env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: 'sb_secret_test_value' }));
check(authorizeScheduledCaller(req(null))?.status === 401, 'anonymous caller → 401');
check(authorizeScheduledCaller(req(''))?.status === 401, 'empty apikey → 401');
check(authorizeScheduledCaller(req('sb_secret_WRONG'))?.status === 401, 'wrong key → 401');
check(authorizeScheduledCaller(req('sb_secret_test_value')) === null, 'correct secret key → authorized');

// 4. Non-string / empty default entries never authorize.
env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: '' }));
check(authorizeScheduledCaller(req(''))?.status === 401, 'empty default key → 401 even for empty apikey');
env.set('SUPABASE_SECRET_KEYS', JSON.stringify({ default: { nested: true } }));
check(authorizeScheduledCaller(req('[object Object]'))?.status === 401, 'non-string default → 401');

// --- push-dispatch keeps its equivalent gate ---------------------------
const pd = readFileSync(resolve(here, '../functions/push-dispatch/index.ts'), 'utf8');
check(pd.includes('SUPABASE_SECRET_KEYS'), 'push-dispatch still gates on SUPABASE_SECRET_KEYS');
check(/status:\s*401/.test(pd), 'push-dispatch still returns 401');

if (failures) {
  console.error(`\n${failures} assertion(s) FAILED`);
  process.exit(1);
}
console.log('\n===== edge_cleanup_auth_test PASSED =====');
