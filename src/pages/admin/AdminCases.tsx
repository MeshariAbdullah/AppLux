import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
  PageSkeleton,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  AlertIcon,
  ChevronIcon,
  ClockIcon,
  GavelIcon,
  InfoIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptDamageCase,
  demoMode,
  fetchProfilesByIds,
  listAllDamageCases,
  useSupabaseAuth,
} from '@/lib/supabase';
import {
  SEED_ADMIN_ACTIVE_CASES,
  SEED_ADMIN_CASE_DETAILS,
  SEED_ADMIN_OVERDUE,
  SEED_ADMIN_OVERDUE_BUCKETS,
  type AdminActiveCase,
  type AdminCaseSeverity,
  type AdminCaseStage,
  type AdminOverdueBucket,
  type AdminOverdueCase,
} from '@/lib/data';

type TabKey = 'damage' | 'overdue';

type CaseMeta = {
  stage: AdminCaseStage;
  addedNotes: number;
  lastActivityAt: string | null;
  hasUpdates: boolean;
};

const EMPTY_META: CaseMeta = {
  stage: 'review',
  addedNotes: 0,
  lastActivityAt: null,
  hasUpdates: false,
};

function severityTone(s: AdminCaseSeverity): StatusTone {
  if (s === 'partial') return 'warn';
  return 'danger';
}

function stageTone(s: AdminCaseStage): StatusTone {
  if (s === 'review') return 'brand';
  if (s === 'settlement') return 'gold';
  if (s === 'nafith') return 'warn';
  return 'danger';
}

function bucketTone(b: AdminOverdueBucket): StatusTone {
  if (b === '1-7' || b === '8-30') return 'warn';
  return 'danger';
}

export default function AdminCases() {
  const t = useT();
  const { dir, formatCurrency, formatDate, formatNumber } = useI18n();
  const { adminCases } = useStore();
  const { configured } = useSupabaseAuth();
  const [tab, setTab] = useState<TabKey>('damage');
  const [liveDamage, setLiveDamage] = useState<AdminActiveCase[] | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(() => configured);

  useEffect(() => {
    if (!configured) {
      setLiveDamage(null);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    let cancelled = false;
    (async () => {
      const rows = await listAllDamageCases().catch(() => []);
      if (cancelled) return;
      const customerIds = rows.map((r) => r.customer_user_id);
      const profileMap = await fetchProfilesByIds(customerIds).catch(
        () => new Map<string, never>(),
      );
      if (cancelled) return;
      setLiveDamage(
        rows.map((r) => {
          const customer = profileMap.get(r.customer_user_id);
          const customerName = customer?.full_name ?? '—';
          const initials =
            customerName.trim().split(/\s+/).slice(0, 2)
              .map((p) => p[0]?.toUpperCase() ?? '')
              .join('') || '—';
          return adaptDamageCase(r, {
            customerName,
            customerInitials: initials,
            headlineItem: `Case ${r.case_number}`,
          });
        }),
      );
      if (!cancelled) setLiveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  // Phase 9: SEED_ADMIN_* arrays are demo data and must not appear in
  // live mode. Use [] when demoMode is off so the empty state renders
  // instead of fake cases. Overdue payments aren't modelled in
  // Phase 5 yet, so live mode shows an empty overdue bucket.
  const damageCases = liveDamage ?? (demoMode ? SEED_ADMIN_ACTIVE_CASES : []);
  const overdueCases = demoMode ? SEED_ADMIN_OVERDUE : [];
  const buckets = demoMode ? SEED_ADMIN_OVERDUE_BUCKETS : [];

  const claimTotal = useMemo(
    () => damageCases.reduce((s, c) => s + c.claimAmount, 0),
    [damageCases],
  );
  const overdueTotal = useMemo(
    () => buckets.reduce((s, b) => s + b.amount, 0),
    [buckets],
  );
  const overdueCount = useMemo(
    () => buckets.reduce((s, b) => s + b.count, 0),
    [buckets],
  );

  const sortedDamage = useMemo(
    () =>
      [...damageCases].sort(
        (a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime(),
      ),
    [damageCases],
  );
  const sortedOverdue = useMemo(
    () =>
      [...overdueCases].sort((a, b) => b.daysOverdue - a.daysOverdue),
    [overdueCases],
  );

  // Per-case meta merged from the reactive store: stage + admin activity
  // (added notes, last activity timestamp). Damage detail key === id;
  // overdue detail key === `${id}-OD`.
  const metaById = useMemo(() => {
    const map: Record<string, CaseMeta> = {};
    for (const c of adminCases) {
      const seed = SEED_ADMIN_CASE_DETAILS[c.id];
      const seedNotes = seed?.notes.length ?? 0;
      const seedAudit = seed?.audit.length ?? 0;
      const addedNotes = Math.max(0, c.notes.length - seedNotes);
      const addedAudit = Math.max(0, c.audit.length - seedAudit);
      const lastEntry = c.audit[c.audit.length - 1];
      map[c.id] = {
        stage: c.escalation.currentStage,
        addedNotes,
        lastActivityAt: addedAudit > 0 ? lastEntry?.at ?? null : null,
        hasUpdates: addedNotes > 0 || addedAudit > 0,
      };
    }
    return map;
  }, [adminCases]);

  if (configured && liveLoading) {
    return (
      <>
        <Header
          title={t('admin.cases.title')}
          showBack
          trailing={<LangToggle tone="dark" />}
        />
        <Screen padded={false} className="bg-canvas">
          <div className="px-5 pt-5 pb-10">
            <PageSkeleton rows={5} />
          </div>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Header
        title={t('admin.cases.title')}
        showBack
        trailing={<LangToggle tone="dark" />}
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-15%] h-56 w-56 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11.5px] font-semibold text-gold-200">
                  <ShieldIcon size={13} />
                  {t('admin.cases.eyebrow')}
                </span>
                <h1 className="mt-4 editorial-title text-[22px] leading-tight text-white">
                  {t('admin.cases.heroTitle')}
                </h1>
                <p className="mt-2 text-[12.5px] text-white/65 leading-relaxed max-w-[36ch]">
                  {t('admin.cases.heroSubtitle')}
                </p>
              </div>
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <GavelIcon size={20} />
              </span>
            </div>

            <div className="relative mt-5 grid grid-cols-3 gap-2">
              <HeroStat
                label={t('admin.cases.hero.damage')}
                value={formatNumber(damageCases.length)}
                hint={formatCurrency(claimTotal)}
              />
              <HeroStat
                label={t('admin.cases.hero.overdue')}
                value={formatNumber(overdueCount)}
                hint={formatCurrency(overdueTotal)}
              />
              <HeroStat
                label={t('admin.cases.hero.claim')}
                value={formatCurrency(claimTotal + overdueTotal)}
              />
            </div>
          </div>

          {/* Tabs */}
          <div className="-mx-1 overflow-x-auto no-scrollbar">
            <div className="px-1 inline-flex gap-1.5 rounded-full bg-white hairline p-1 shadow-soft">
              {(['damage', 'overdue'] as TabKey[]).map((k) => {
                const active = tab === k;
                const count = k === 'damage' ? damageCases.length : overdueCases.length;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[12.5px] font-medium tracking-tight transition-colors whitespace-nowrap',
                      active
                        ? 'bg-ink-900 text-white shadow-soft'
                        : 'text-ink-500 hover:bg-canvas-100',
                    )}
                  >
                    {t(`admin.cases.tabs.${k}`)}
                    <span
                      className={cn(
                        'num text-[10.5px] font-bold rounded-full h-4 min-w-4 px-1 grid place-items-center',
                        active
                          ? 'bg-white/15 text-white'
                          : 'bg-canvas-100 text-ink-600',
                      )}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {tab === 'overdue' && (
            <Card padded className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-500">
                  {t('admin.cases.overdueAging')}
                </div>
                <div className="text-[11px] text-ink-400 num">
                  {formatCurrency(overdueTotal)}
                </div>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {buckets.map((b) => (
                  <BucketTile
                    key={b.bucket}
                    bucket={b.bucket}
                    count={b.count}
                    label={t(`admin.home.overdue.buckets.${b.bucket}`)}
                  />
                ))}
              </div>
            </Card>
          )}

          {/* List */}
          {tab === 'damage' ? (
            sortedDamage.length === 0 ? (
              <EmptyState
                icon={<InfoIcon size={22} />}
                title={t('admin.cases.empty.damage.title')}
                description={t('admin.cases.empty.damage.hint')}
              />
            ) : (
              <div className="space-y-2.5">
                {sortedDamage.map((c) => (
                  <DamageCard
                    key={c.id}
                    item={c}
                    meta={metaById[c.id] ?? { ...EMPTY_META, stage: c.stage }}
                    dir={dir}
                    formatCurrency={formatCurrency}
                    formatDate={formatDate}
                    t={t}
                  />
                ))}
              </div>
            )
          ) : sortedOverdue.length === 0 ? (
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('admin.cases.empty.overdue.title')}
              description={t('admin.cases.empty.overdue.hint')}
            />
          ) : (
            <div className="space-y-2.5">
              {sortedOverdue.map((c) => (
                <OverdueCard
                  key={c.id}
                  item={c}
                  meta={metaById[`${c.id}-OD`] ?? EMPTY_META}
                  dir={dir}
                  formatCurrency={formatCurrency}
                  formatDate={formatDate}
                  t={t}
                />
              ))}
            </div>
          )}
        </div>
      </Screen>
    </>
  );
}

function HeroStat({
  label,
  value,
  hint,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-2.5 backdrop-blur">
      <div className="text-white/55 uppercase tracking-wide text-[10px]">
        {label}
      </div>
      <div className="mt-0.5 font-bold text-white num text-[14px] leading-tight truncate">
        {value}
      </div>
      {hint && (
        <div className="mt-0.5 text-white/55 text-[10.5px] num truncate">
          {hint}
        </div>
      )}
    </div>
  );
}

function BucketTile({
  bucket,
  count,
  label,
}: {
  bucket: AdminOverdueBucket;
  count: number;
  label: ReactNode;
}) {
  const tone = bucketTone(bucket);
  const bg =
    tone === 'warn'
      ? 'bg-warn-50 text-warn-700'
      : 'bg-danger-50 text-danger-700';
  return (
    <div className={cn('rounded-xl p-2.5 text-center', bg)}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="mt-0.5 text-[16px] font-bold num leading-none">
        {count}
      </div>
    </div>
  );
}

function DamageCard({
  item,
  meta,
  dir,
  formatCurrency,
  formatDate,
  t,
}: {
  item: AdminActiveCase;
  meta: CaseMeta;
  dir: 'rtl' | 'ltr';
  formatCurrency: (n: number) => string;
  formatDate: (d: string | Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const severe = item.severity !== 'partial';
  const dateToShow = meta.lastActivityAt ?? item.reportedAt;
  return (
    <Link to={`/admin/cases/damage/${item.id}`} className="block">
      <Card padded interactive className="space-y-3">
        <div className="flex items-center gap-3">
          <span
            className={cn(
              'h-11 w-11 shrink-0 rounded-xl grid place-items-center',
              severe ? 'bg-danger-50 text-danger-600' : 'bg-warn-50 text-warn-600',
            )}
          >
            {item.severity === 'non-return' ? (
              <PackageIcon size={18} />
            ) : severe ? (
              <AlertIcon size={18} />
            ) : (
              <GavelIcon size={18} />
            )}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                {item.customerName}
              </div>
              {meta.hasUpdates && <UpdatedDot />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
              <span className="truncate">{item.merchantName}</span>
              <span className="text-ink-300">·</span>
              <span className="truncate">{item.item}</span>
            </div>
          </div>
          <ChevronIcon
            size={14}
            className={cn(
              'text-ink-300 shrink-0',
              dir === 'rtl' ? '' : 'rotate-180',
            )}
          />
        </div>

        <div className="flex items-center flex-wrap gap-1.5">
          <StatusChip
            size="sm"
            tone={severityTone(item.severity)}
            dot={false}
            label={t(`merchant.damages.severity.${item.severity}`)}
          />
          <StatusChip
            size="sm"
            tone={stageTone(meta.stage)}
            dot
            label={t(`admin.home.activeCases.stage.${meta.stage}`)}
          />
          {meta.hasUpdates && (
            <StatusChip
              size="sm"
              tone="brand"
              dot={false}
              label={
                meta.addedNotes > 0
                  ? t('admin.cases.adminNotes', { count: meta.addedNotes })
                  : t('admin.cases.updated')
              }
            />
          )}
          <span className="inline-flex items-center gap-1 text-[11px] text-ink-400 num ms-auto">
            <ClockIcon size={11} />
            {formatDate(dateToShow)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-canvas-100 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-500">
            <ReceiptIcon size={12} />
            <span className="num">{item.id}</span>
          </span>
          <span className="text-[13px] font-semibold num text-ink-900">
            {formatCurrency(item.claimAmount)}
          </span>
        </div>
      </Card>
    </Link>
  );
}

function UpdatedDot() {
  return (
    <span
      className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400"
      aria-hidden
    />
  );
}

function OverdueCard({
  item,
  meta,
  dir,
  formatCurrency,
  formatDate,
  t,
}: {
  item: AdminOverdueCase;
  meta: CaseMeta;
  dir: 'rtl' | 'ltr';
  formatCurrency: (n: number) => string;
  formatDate: (d: string | Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  return (
    <Link to={`/admin/cases/overdue/${item.id}`} className="block">
      <Card padded interactive className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center font-semibold text-[12px]">
            {item.customerInitials}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                {item.customerName}
              </div>
              {meta.hasUpdates && <UpdatedDot />}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
              <span className="truncate">{item.merchantName}</span>
              <span className="text-ink-300">·</span>
              <span className="truncate">{item.item}</span>
            </div>
          </div>
          <ChevronIcon
            size={14}
            className={cn(
              'text-ink-300 shrink-0',
              dir === 'rtl' ? '' : 'rotate-180',
            )}
          />
        </div>

        <div className="flex items-center flex-wrap gap-1.5">
          <StatusChip
            size="sm"
            tone={bucketTone(item.bucket)}
            dot
            label={t('admin.home.overdue.daysOverdue', {
              count: item.daysOverdue,
            })}
          />
          <StatusChip
            size="sm"
            tone={stageTone(meta.stage)}
            dot={false}
            label={t(`admin.home.activeCases.stage.${meta.stage}`)}
          />
          {meta.hasUpdates && (
            <StatusChip
              size="sm"
              tone="brand"
              dot={false}
              label={
                meta.addedNotes > 0
                  ? t('admin.cases.adminNotes', { count: meta.addedNotes })
                  : t('admin.cases.updated')
              }
            />
          )}
          {meta.lastActivityAt && (
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-400 num ms-auto">
              <ClockIcon size={11} />
              {formatDate(meta.lastActivityAt)}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 rounded-xl bg-canvas-100 px-3 py-2">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-ink-500">
            <ReceiptIcon size={12} />
            <span className="num">{item.id}</span>
          </span>
          <span className="text-[13px] font-semibold num text-ink-900">
            {formatCurrency(item.amount)}
          </span>
        </div>
      </Card>
    </Link>
  );
}
