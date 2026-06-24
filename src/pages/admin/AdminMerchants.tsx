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
  BadgeCheckIcon,
  BuildingIcon,
  ChevronIcon,
  ClockIcon,
  InfoIcon,
  MapPinIcon,
  ShieldIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore, type AdminMerchantRequest } from '@/lib/store';
import {
  adaptMerchantApplication,
  listMerchantApplications,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { AdminMerchantDecisionStatus } from '@/lib/data';

type TabKey = 'all' | AdminMerchantDecisionStatus;
const TABS: TabKey[] = ['all', 'pending', 'approved', 'rejected'];

function statusTone(status: AdminMerchantDecisionStatus): StatusTone {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warn';
}

export default function AdminMerchants() {
  const t = useT();
  const { dir, formatDate } = useI18n();
  const { adminMerchantRequests: demoRequests } = useStore();
  const { configured } = useSupabaseAuth();
  const [requests, setRequests] = useState<AdminMerchantRequest[]>(demoRequests);
  const [liveLoading, setLiveLoading] = useState<boolean>(() => configured);
  const [tab, setTab] = useState<TabKey>('pending');

  useEffect(() => {
    if (!configured) {
      setRequests(demoRequests);
      setLiveLoading(false);
      return;
    }
    setLiveLoading(true);
    let cancelled = false;
    listMerchantApplications()
      .then((rows) => {
        if (!cancelled) {
          setRequests(rows.map(adaptMerchantApplication));
          setLiveLoading(false);
        }
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[applux] listMerchantApplications failed', err);
        // Phase 9: in live mode, do NOT fall back to demo seeds on error.
        // Empty list with an error pill is the right signal.
        if (!cancelled) {
          setRequests([]);
          setLiveLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [configured, demoRequests]);

  const counts = useMemo(() => {
    const acc: Record<TabKey, number> = {
      all: requests.length,
      pending: 0,
      approved: 0,
      rejected: 0,
    };
    for (const r of requests) acc[r.decision.status] += 1;
    return acc;
  }, [requests]);

  const visible = useMemo(() => {
    const list =
      tab === 'all'
        ? requests
        : requests.filter((r) => r.decision.status === tab);
    // Sort: pending first, then by decidedAt desc
    return [...list].sort((a, b) => {
      if (a.decision.status === 'pending' && b.decision.status !== 'pending') return -1;
      if (b.decision.status === 'pending' && a.decision.status !== 'pending') return 1;
      return (
        new Date(b.decision.decidedAt).getTime() -
        new Date(a.decision.decidedAt).getTime()
      );
    });
  }, [requests, tab]);

  return (
    <>
      <Header
        title={t('admin.merchants.title')}
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
                  {t('admin.merchants.eyebrow')}
                </span>
                <h1 className="mt-4 editorial-title text-[22px] leading-tight text-white">
                  {t('admin.merchants.heroTitle')}
                </h1>
                <p className="mt-2 text-[12.5px] text-white/65 leading-relaxed max-w-[36ch]">
                  {t('admin.merchants.heroSubtitle')}
                </p>
              </div>
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                <BuildingIcon size={20} />
              </span>
            </div>

            <div className="relative mt-5 grid grid-cols-3 gap-2">
              <HeroStat
                tone="warn"
                label={t('admin.merchants.tabs.pending')}
                value={counts.pending}
              />
              <HeroStat
                tone="success"
                label={t('admin.merchants.tabs.approved')}
                value={counts.approved}
              />
              <HeroStat
                tone="danger"
                label={t('admin.merchants.tabs.rejected')}
                value={counts.rejected}
              />
            </div>
          </div>

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
                    {t(`admin.merchants.tabs.${k}`)}
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
          {configured && liveLoading ? (
            <PageSkeleton rows={4} />
          ) : visible.length === 0 ? (
            <EmptyState
              icon={
                tab === 'pending' ? (
                  <BadgeCheckIcon size={22} />
                ) : (
                  <InfoIcon size={22} />
                )
              }
              title={t(`admin.merchants.empty.${tab}.title`)}
              description={t(`admin.merchants.empty.${tab}.hint`)}
            />
          ) : (
            <div className="space-y-2.5">
              {visible.map((r) => (
                <RequestCard
                  key={r.id}
                  item={r}
                  dir={dir}
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
  tone,
}: {
  label: ReactNode;
  value: number;
  tone: 'warn' | 'success' | 'danger';
}) {
  const dot =
    tone === 'success'
      ? 'bg-success-400'
      : tone === 'danger'
        ? 'bg-danger-400'
        : 'bg-gold-400';
  return (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-2.5 backdrop-blur">
      <div className="flex items-center gap-1.5">
        <span className={cn('h-1.5 w-1.5 rounded-full', dot)} />
        <span className="text-white/60 uppercase tracking-wide text-[10px]">
          {label}
        </span>
      </div>
      <div className="mt-0.5 font-bold text-white num text-[18px] leading-none">
        {value}
      </div>
    </div>
  );
}

function RequestCard({
  item,
  dir,
  formatDate,
  t,
}: {
  item: AdminMerchantRequest;
  dir: 'rtl' | 'ltr';
  formatDate: (d: string | Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  t: (key: string, vars?: Record<string, string | number>) => string;
}) {
  const tone = statusTone(item.decision.status);
  const statusLabel = t(`admin.merchants.status.${item.decision.status}`);
  const dateLabel =
    item.decision.status === 'pending'
      ? t('admin.merchants.submittedOn', {
          date: formatDate(item.submittedAt),
        })
      : t(`admin.merchants.decidedOn.${item.decision.status}`, {
          date: formatDate(item.decision.decidedAt),
        });
  return (
    <Link to={`/admin/merchants/${item.id}`} className="block">
      <Card padded interactive className="space-y-3">
        <div className="flex items-center gap-3">
          <span className="h-11 w-11 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center font-semibold text-[12px]">
            {item.initials}
          </span>
          <div className="flex-1 min-w-0">
            <div className="text-[13.5px] font-semibold text-ink-900 truncate">
              {item.companyName}
            </div>
            <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
              <span className="truncate">{item.authorizedName}</span>
              <span className="text-ink-300">·</span>
              <span className="num">{item.commercialReg}</span>
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

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <StatusChip
              size="sm"
              tone="neutral"
              dot={false}
              label={t(`admin.merchants.category.${item.category}`)}
            />
            <span className="inline-flex items-center gap-1 text-[11px] text-ink-400 truncate">
              <MapPinIcon size={11} />
              <span className="truncate">{item.city}</span>
            </span>
          </div>
          <StatusChip size="sm" tone={tone} dot label={statusLabel} />
        </div>

        <div className="flex items-center gap-1.5 text-[11px] text-ink-400">
          <ClockIcon size={11} />
          <span className="num">{dateLabel}</span>
        </div>
      </Card>
    </Link>
  );
}
