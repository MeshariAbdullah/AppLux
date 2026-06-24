import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Card,
  EmptyState,
  Input,
  PageSkeleton,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  BadgeCheckIcon,
  ChevronIcon,
  InfoIcon,
  MapPinIcon,
  SearchIcon,
  ShieldIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptUserRecord,
  fetchEligibilityByUserIds,
  listProfiles,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { AdminUserRecord, AdminUserStatus } from '@/lib/data';

type TabKey = 'all' | AdminUserStatus;
const TABS: TabKey[] = ['all', 'active', 'pending', 'suspended'];

function statusTone(s: AdminUserStatus): StatusTone {
  if (s === 'active') return 'success';
  if (s === 'pending') return 'warn';
  return 'danger';
}

export default function AdminUsers() {
  const t = useT();
  const { dir, formatCurrency, formatNumber } = useI18n();
  const { adminUsers: demoUsers } = useStore();
  const { configured } = useSupabaseAuth();
  const [liveUsers, setLiveUsers] = useState<AdminUserRecord[] | null>(null);
  const [liveLoading, setLiveLoading] = useState<boolean>(() => configured);
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!configured) {
      setLiveUsers(null);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    let cancelled = false;
    (async () => {
      // List customer profiles only — admin/merchant users live in their
      // own areas. The eligibility join is one extra round-trip.
      const profiles = await listProfiles({ role: 'customer' }).catch(() => []);
      if (cancelled) return;
      const eligibility = await fetchEligibilityByUserIds(
        profiles.map((p) => p.id),
      ).catch(() => new Map());
      if (cancelled) return;
      setLiveUsers(profiles.map((p) => adaptUserRecord(p, eligibility.get(p.id))));
      setLiveLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [configured]);

  const adminUsers = liveUsers ?? demoUsers;

  const counts = useMemo(() => {
    const acc: Record<TabKey, number> = {
      all: adminUsers.length,
      active: 0,
      pending: 0,
      suspended: 0,
    };
    for (const u of adminUsers) acc[u.status] += 1;
    return acc;
  }, [adminUsers]);

  const visible = useMemo(() => {
    const base = tab === 'all' ? adminUsers : adminUsers.filter((u) => u.status === tab);
    const q = query.trim().toLowerCase();
    const filtered = q
      ? base.filter(
          (u) =>
            u.fullName.toLowerCase().includes(q) ||
            u.nationalId.includes(q) ||
            u.mobile.includes(q) ||
            u.email.toLowerCase().includes(q) ||
            u.id.toLowerCase().includes(q),
        )
      : base;
    return [...filtered].sort(
      (a, b) => new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    );
  }, [adminUsers, tab, query]);

  const totalLimit = useMemo(
    () =>
      adminUsers.reduce(
        (s, u) => (u.status === 'active' ? s + u.eligibilityLimit : s),
        0,
      ),
    [adminUsers],
  );
  const totalUsed = useMemo(
    () => adminUsers.reduce((s, u) => s + u.usedAmount, 0),
    [adminUsers],
  );

  if (configured && liveLoading) {
    return (
      <>
        <Header
          title={t('admin.users.title')}
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
        title={t('admin.users.title')}
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
                  {t('admin.users.eyebrow')}
                </span>
                <h1 className="mt-4 editorial-title text-[22px] leading-tight text-white">
                  {t('admin.users.heroTitle')}
                </h1>
                <p className="mt-2 text-[12.5px] text-white/65 leading-relaxed max-w-[36ch]">
                  {t('admin.users.heroSubtitle')}
                </p>
              </div>
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <UsersIcon size={20} />
              </span>
            </div>

            <div className="relative mt-5 grid grid-cols-3 gap-2">
              <HeroStat
                label={t('admin.users.hero.total')}
                value={formatNumber(counts.all)}
              />
              <HeroStat
                label={t('admin.users.hero.limit')}
                value={formatCurrency(totalLimit)}
              />
              <HeroStat
                label={t('admin.users.hero.used')}
                value={formatCurrency(totalUsed)}
              />
            </div>
          </div>

          {/* Search */}
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('admin.users.searchPlaceholder')}
            leading={<SearchIcon size={16} />}
            trailing={
              query ? (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-[11px] font-semibold text-ink-400"
                >
                  {t('common.clear')}
                </button>
              ) : null
            }
          />

          {/* Tabs */}
          <div className="-mx-1 overflow-x-auto no-scrollbar">
            <div className="px-1 inline-flex gap-1.5 rounded-full bg-white hairline p-1 shadow-soft">
              {TABS.map((k) => {
                const active = tab === k;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={cn(
                      'inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-[12.5px] font-semibold transition-colors whitespace-nowrap',
                      active
                        ? 'bg-ink-900 text-white shadow-soft'
                        : 'text-ink-500 hover:bg-canvas-100',
                    )}
                  >
                    {t(`admin.users.tabs.${k}`)}
                    <span
                      className={cn(
                        'num text-[10.5px] font-bold rounded-full h-4 min-w-4 px-1 grid place-items-center',
                        active
                          ? 'bg-white/15 text-white'
                          : 'bg-canvas-200 text-ink-600',
                      )}
                    >
                      {counts[k]}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* List */}
          {visible.length === 0 ? (
            <EmptyState
              icon={query ? <SearchIcon size={22} /> : <InfoIcon size={22} />}
              title={
                query
                  ? t('admin.users.empty.search.title')
                  : t(`admin.users.empty.${tab}.title`)
              }
              description={
                query
                  ? t('admin.users.empty.search.hint')
                  : t(`admin.users.empty.${tab}.hint`)
              }
            />
          ) : (
            <div className="space-y-2.5">
              {visible.map((u) => (
                <UserCard
                  key={u.id}
                  item={u}
                  dir={dir}
                  formatCurrency={formatCurrency}
                  formatNumber={formatNumber}
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

function HeroStat({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-2.5 backdrop-blur">
      <div className="text-white/55 uppercase tracking-wide text-[10px]">
        {label}
      </div>
      <div className="mt-0.5 font-bold text-white num text-[14px] leading-tight truncate">
        {value}
      </div>
    </div>
  );
}

function UserCard({
  item,
  dir,
  formatCurrency,
  formatNumber,
  t,
}: {
  item: AdminUserRecord;
  dir: 'rtl' | 'ltr';
  formatCurrency: (n: number) => string;
  formatNumber: (n: number, opts?: Intl.NumberFormatOptions) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const remaining = Math.max(item.eligibilityLimit - item.usedAmount, 0);
  const pct =
    item.eligibilityLimit > 0
      ? Math.min(100, Math.round((item.usedAmount / item.eligibilityLimit) * 100))
      : 0;
  return (
    <Link to={`/admin/users/${item.id}`} className="block">
      <Card padded interactive className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center font-semibold text-[12px]">
            {item.initials}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                {item.fullName}
              </div>
              {item.nafathVerified && (
                <span
                  className="text-success-600"
                  title={t('admin.users.nafathVerified')}
                >
                  <BadgeCheckIcon size={13} />
                </span>
              )}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
              <span className="num">{item.mobile}</span>
              <span className="text-ink-300">·</span>
              <span className="inline-flex items-center gap-1 truncate">
                <MapPinIcon size={10} />
                <span className="truncate">{item.city}</span>
              </span>
            </div>
          </div>
          <StatusChip
            size="sm"
            tone={statusTone(item.status)}
            dot
            label={t(`admin.users.status.${item.status}`)}
          />
          <ChevronIcon
            size={14}
            className={cn(
              'text-ink-300 shrink-0',
              dir === 'rtl' ? '' : 'rotate-180',
            )}
          />
        </div>

        <div className="rounded-xl bg-canvas-100 px-3 py-2.5 space-y-2">
          <div className="flex items-center justify-between gap-2 text-[11.5px]">
            <span className="inline-flex items-center gap-1.5 text-ink-500">
              <WalletIcon size={12} />
              {t('admin.users.eligibility.label')}
            </span>
            <span className="num font-semibold text-ink-900">
              {formatCurrency(item.usedAmount)}
              <span className="text-ink-400"> / {formatCurrency(item.eligibilityLimit)}</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-canvas-200 overflow-hidden">
            <div
              className={cn(
                'h-full rounded-full transition-[width]',
                pct > 85
                  ? 'bg-danger-500'
                  : pct > 70
                    ? 'bg-warn-500'
                    : 'bg-success-500',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-500">
            <span>
              {t('admin.users.eligibility.remaining')}:{' '}
              <span className="num font-semibold text-ink-900">
                {formatCurrency(remaining)}
              </span>
            </span>
            <span className="num">
              {t('admin.users.eligibility.activeRentals', {
                count: formatNumber(item.activeRentals),
              })}
            </span>
          </div>
        </div>
      </Card>
    </Link>
  );
}
