import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Header, Screen } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { cacheStats } from '@/lib/cache/memoryCache';
import { useT } from '@/lib/i18n';
import { getEventBuffer } from '@/lib/observability/log';
import { releaseInfo } from '@/lib/releaseInfo';
import { resolveSessionPolicy } from '@/lib/session/policy';
import { useSupabaseAuth } from '@/lib/supabase';

// =====================================================================
// Diagnostics — Phase 6C. Hidden support surface: reachable by direct
// URL or seven taps on the version row (customer Profile / merchant
// dashboard). NOT linked from any navigation.
//
// Privacy contract (same rules as the Phase 6A logger):
//   * Anonymous visitors see ONLY release + connectivity.
//   * Signed-in users additionally see their ROLE — never id, name,
//     email, mobile, or national ID.
//   * Cache summary is aggregate counts only — no keys, no values.
//   * Event list re-renders the already-sanitized ring buffer fields
//     (id / name / severity / time / route pattern / code / status) —
//     no messages, stacks, or context objects.
//   * The copy report contains exactly what is on screen.
//   * The reachability probe sends NO headers — no Authorization, no
//     apikey — a plain GET whose only purpose is "did ANY HTTP response
//     come back, and how fast".
// Nothing here writes to the DB, storage, or the network beyond that
// probe. Every section fails soft: a throwing getter renders '—'.
// =====================================================================

type ProbeState =
  | { phase: 'idle' | 'running' }
  | { phase: 'done'; ok: boolean; status: number | null; ms: number };

const PROBE_TIMEOUT_MS = 5_000;

function supabaseBaseUrl(): string | null {
  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  return url ? url.replace(/\/+$/, '') : null;
}

/** Header-free reachability probe. Any HTTP status (even 401/404)
 *  proves the backend edge is reachable; only a network-level failure
 *  or timeout counts as unreachable. */
async function probeSupabase(): Promise<{ ok: boolean; status: number | null; ms: number }> {
  const base = supabaseBaseUrl();
  if (!base) return { ok: false, status: null, ms: 0 };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  const started = performance.now();
  try {
    const res = await fetch(`${base}/auth/v1/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
      // Deliberately NO headers: no Authorization, no apikey.
    });
    return { ok: true, status: res.status, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, status: null, ms: Math.round(performance.now() - started) };
  } finally {
    window.clearTimeout(timer);
  }
}

const minutes = (ms: number) => Math.round(ms / 60_000);
const hours = (ms: number) => Math.round(ms / 3_600_000);

export default function Diagnostics() {
  const t = useT();
  const { configured, status, role } = useSupabaseAuth();
  const signedIn = configured && status === 'authenticated';

  const [online, setOnline] = useState(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [probe, setProbe] = useState<ProbeState>({ phase: 'idle' });
  const [copied, setCopied] = useState(false);
  // Cheap re-render tick so the (memory-only) event buffer and cache
  // counters stay current while the page is open.
  const [, tick] = useReducer((n: number) => n + 1, 0);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    const interval = window.setInterval(tick, 3_000);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      window.clearInterval(interval);
    };
  }, []);

  const runProbe = useCallback(() => {
    if (!configured) return;
    setProbe({ phase: 'running' });
    void probeSupabase().then((r) => setProbe({ phase: 'done', ...r }));
  }, [configured]);

  // One automatic probe per mount — the ref guard keeps StrictMode's
  // dev double-effect from firing a duplicate network request. The
  // "re-check" action covers every later need.
  const probedRef = useRef(false);
  useEffect(() => {
    if (probedRef.current) return;
    probedRef.current = true;
    runProbe();
  }, [runProbe]);

  // ---- safe snapshots (every getter fails soft) ----
  const stats = (() => {
    try {
      return cacheStats();
    } catch {
      return null;
    }
  })();
  const events = (() => {
    try {
      return [...getEventBuffer()].reverse().slice(0, 20);
    } catch {
      return [];
    }
  })();
  const policy = resolveSessionPolicy(role);

  const probeLabel =
    !configured
      ? t('diagnostics.connection.notConfigured')
      : probe.phase === 'done'
        ? probe.ok
          ? `${t('diagnostics.connection.reachable')} · HTTP ${probe.status} · ${probe.ms}ms`
          : t('diagnostics.connection.unreachable')
        : t('diagnostics.connection.checking');

  const buildReport = (): string => {
    const lines: string[] = [
      `Lend diagnostics report`,
      `release: ${releaseInfo.version} · ${releaseInfo.commit} · ${releaseInfo.env}`,
      `builtAt: ${releaseInfo.builtAt || '—'}`,
      `network: ${online ? 'online' : 'offline'}`,
      `supabase: ${probeLabel}`,
    ];
    if (signedIn) {
      lines.push(
        `auth: authenticated`,
        `role: ${role ?? '—'}`,
        `session: active · idle ${minutes(policy.idleMs)}m · absolute ${hours(policy.absoluteMs)}h · warning ${Math.round(policy.warningMs / 1000)}s`,
        `cache: entries ${stats?.entries ?? '—'} · in-flight ${stats?.inflight ?? '—'} · hits ${stats?.hits ?? '—'} · misses ${stats?.misses ?? '—'}`,
        `events (${events.length}):`,
        ...events.map(
          (e) =>
            `  ${e.id} ${e.severity} ${e.name} ${e.at} route=${e.route}${e.error?.code ? ` code=${e.error.code}` : ''}${typeof e.error?.status === 'number' ? ` status=${e.error.status}` : ''}`,
        ),
      );
    } else {
      lines.push(`auth: ${configured ? 'anonymous' : 'demo'}`);
    }
    return lines.join('\n');
  };

  const copyReport = () => {
    const text = buildReport();
    const done = () => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2_000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(done, () => fallbackCopy(text, done));
    } else {
      fallbackCopy(text, done);
    }
  };

  return (
    <>
      <Header title={t('diagnostics.title')} subtitle={t('diagnostics.subtitle')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-3.5" data-testid="diagnostics">
          {/* 1 — Release */}
          <Section title={t('diagnostics.release.title')}>
            <InfoRow label={t('diagnostics.release.version')} value={releaseInfo.version} />
            <InfoRow label={t('diagnostics.release.commit')} value={releaseInfo.commit} />
            <InfoRow label={t('diagnostics.release.env')} value={releaseInfo.env} />
            <InfoRow label={t('diagnostics.release.builtAt')} value={releaseInfo.builtAt || '—'} />
          </Section>

          {/* 2 — Connection */}
          <Section
            title={t('diagnostics.connection.title')}
            action={
              configured ? (
                <button
                  type="button"
                  onClick={runProbe}
                  className="text-[11.5px] font-semibold text-lavender-700 underline underline-offset-4 decoration-canvas-300"
                >
                  {t('diagnostics.connection.retry')}
                </button>
              ) : undefined
            }
          >
            <InfoRow
              label={t('diagnostics.connection.network')}
              value={online ? t('diagnostics.connection.online') : t('diagnostics.connection.offline')}
            />
            <InfoRow label={t('diagnostics.connection.backend')} value={probeLabel} />
          </Section>

          {/* 3–6 — signed-in only */}
          {signedIn && (
            <>
              <Section title={t('diagnostics.auth.title')}>
                <InfoRow
                  label={t('diagnostics.auth.state')}
                  value={t('diagnostics.auth.authenticated')}
                />
                <InfoRow label={t('diagnostics.auth.role')} value={role ?? '—'} />
              </Section>

              <Section title={t('diagnostics.session.title')}>
                <InfoRow
                  label={t('diagnostics.session.state')}
                  value={t('diagnostics.session.active')}
                />
                <InfoRow
                  label={t('diagnostics.session.policy')}
                  value={`${role ?? 'customer'} · ${t('diagnostics.session.idle')} ${minutes(policy.idleMs)}${t('diagnostics.session.minutesShort')} · ${t('diagnostics.session.absolute')} ${hours(policy.absoluteMs)}${t('diagnostics.session.hoursShort')}`}
                />
              </Section>

              <Section title={t('diagnostics.cache.title')}>
                <InfoRow label={t('diagnostics.cache.entries')} value={String(stats?.entries ?? '—')} />
                <InfoRow label={t('diagnostics.cache.inflight')} value={String(stats?.inflight ?? '—')} />
                <InfoRow
                  label={t('diagnostics.cache.hitsMisses')}
                  value={`${stats?.hits ?? '—'} / ${stats?.misses ?? '—'}`}
                />
              </Section>

              <Section title={t('diagnostics.events.title')}>
                {events.length === 0 ? (
                  <div className="px-4 py-3 text-[12px] text-ink-400">
                    {t('diagnostics.events.empty')}
                  </div>
                ) : (
                  <div className="divide-y divide-canvas-100">
                    {events.map((e) => (
                      <div key={e.id} className="px-4 py-2.5" dir="ltr">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11.5px] font-semibold text-ink-900 num truncate">
                            {e.name}
                          </span>
                          <span
                            className={
                              e.severity === 'fatal' || e.severity === 'error'
                                ? 'text-[10px] font-bold uppercase tracking-[0.1em] text-danger-600'
                                : e.severity === 'warn'
                                  ? 'text-[10px] font-bold uppercase tracking-[0.1em] text-warn-600'
                                  : 'text-[10px] font-bold uppercase tracking-[0.1em] text-ink-400'
                            }
                          >
                            {e.severity}
                          </span>
                        </div>
                        <div className="mt-0.5 text-[10.5px] text-ink-500 num truncate">
                          {e.id} · {e.at.slice(11, 19)} · {e.route}
                          {e.error?.code ? ` · code ${e.error.code}` : ''}
                          {typeof e.error?.status === 'number' ? ` · ${e.error.status}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Section>
            </>
          )}

          {/* 7 — Copy report */}
          <Button variant="secondary" block onClick={copyReport}>
            {copied ? t('diagnostics.copy.copied') : t('diagnostics.copy.cta')}
          </Button>

          <p className="text-center text-[11px] text-ink-400 leading-relaxed">
            {t('diagnostics.footnote')}
          </p>
        </div>
      </Screen>
    </>
  );
}

function fallbackCopy(text: string, done: () => void): void {
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    document.execCommand('copy');
    document.body.removeChild(el);
    done();
  } catch {
    /* copy is best-effort */
  }
}

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-4 pt-3 pb-1.5 flex items-center justify-between gap-3">
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          {title}
        </div>
        {action}
      </div>
      <div className="pb-2">{children}</div>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-4 py-1.5 flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-ink-500">{label}</span>
      <span className="text-[12.5px] font-semibold text-ink-900 num text-end break-all" dir="ltr">
        {value}
      </span>
    </div>
  );
}
