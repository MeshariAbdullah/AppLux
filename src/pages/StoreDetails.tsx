import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, EmptyState, SectionHeader, Skeleton, StatusChip } from '@/components/ui';
import {
  BadgeCheckIcon,
  ChevronIcon,
  ClockIcon,
  InfoIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  StarIcon,
} from '@/components/icons';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { useCachedQuery } from '@/lib/cache/useCachedQuery';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptMerchantToStore,
  fetchMerchant,
  listMerchantActivities,
  listMerchantBranches,
  useSupabaseAuth,
} from '@/lib/supabase';
import { openExternalUrl } from '@/lib/openExternal';
import { cn } from '@/lib/cn';
import type { PartnerStore, StoreBranch, StoreCategory } from '@/lib/data';
import { StoreLogo, categoryIcon } from '@/components/stores/StoreLogo';

export default function StoreDetails() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { stores } = useStore();
  const { configured } = useSupabaseAuth();

  // Phase 3B: single-merchant read goes through the memory cache
  // (15-min TTL, no focus refetch). The Phase 9 entity-leak fix is
  // preserved structurally: the cache key embeds :id, so navigating to
  // another store either serves THAT store's cached row instantly or
  // shows the skeleton — the previous entity can never flash.
  const {
    data: liveMerchantRow,
    loading: liveLoading,
    error: liveError,
  } = useCachedQuery(
    configured && id ? cacheKeys.merchantEntity(id) : null,
    () => fetchMerchant(id!),
    { ttlMs: CACHE_TTL.merchantEntity, refetchOnFocus: false },
  );

  useEffect(() => {
    if (liveError) {
      logEvent('rpc_failure', 'warn', { op: 'fetch_merchant' }, liveError);
    }
  }, [liveError]);

  // Demo path — keeps the short delay so the skeleton flashes briefly
  // even with synchronous store reads.
  const [demoStore, setDemoStore] = useState<PartnerStore | null>(null);
  const [demoLoading, setDemoLoading] = useState(!configured);
  useEffect(() => {
    if (configured) return;
    let cancelled = false;
    setDemoStore(null);
    setDemoLoading(true);
    const tid = window.setTimeout(() => {
      if (cancelled) return;
      setDemoStore(stores.find((s) => s.id === id) ?? null);
      setDemoLoading(false);
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [configured, id, stores]);

  // Real branches (incl. Google Maps links) + the full activity set —
  // active-merchant public reads. Non-blocking: the store renders with
  // the merchant row first, then upgrades when these resolve.
  const [liveBranches, setLiveBranches] = useState<Awaited<ReturnType<typeof listMerchantBranches>> | null>(null);
  const [liveActivities, setLiveActivities] = useState<Awaited<ReturnType<typeof listMerchantActivities>> | null>(null);
  useEffect(() => {
    if (!configured || !id) return;
    let cancelled = false;
    setLiveBranches(null);
    setLiveActivities(null);
    void Promise.all([
      listMerchantBranches(id).catch(() => []),
      listMerchantActivities(id).catch(() => []),
    ]).then(([b, a]) => {
      if (cancelled) return;
      setLiveBranches(b);
      setLiveActivities(a);
    });
    return () => {
      cancelled = true;
    };
  }, [configured, id]);

  const store: PartnerStore | null = configured
    ? liveMerchantRow
      ? adaptMerchantToStore(liveMerchantRow, {
          branches: liveBranches ?? undefined,
          activities: liveActivities ?? undefined,
        })
      : null
    : demoStore;
  const loading = configured ? liveLoading : demoLoading;

  if (loading) return <DetailsSkeleton />;

  if (!store) {
    return (
      <>
        <Header title={t('stores.title')} showBack />
        <Screen>
          <EmptyState
            icon={<InfoIcon size={22} />}
            title={t('stores.notFound')}
            action={
              <Button size="sm" onClick={() => navigate('/stores', { replace: true })}>
                {t('stores.goBack')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const name = store.name[locale];
  const description = store.description[locale];
  const location = store.location[locale];
  const hours = store.hours[locale];
  const cityLabel = t(`register.cities.${store.city}`);

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        {/* C07 — navy header band: back square + title row, then the
            store identity (avatar, name, category, real-data chips). */}
        <div className="bg-navy-700 text-white px-5 pt-[calc(env(safe-area-inset-top)+16px)] pb-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              aria-label={t('stores.goBack')}
              className="h-9 w-9 grid place-items-center rounded-[10px] bg-white text-navy-700 shadow-soft"
            >
              <ChevronIcon size={15} className="rtl:rotate-180" />
            </button>
            <h1 className="flex-1 text-[16px] font-bold">{t('stores.detailsTitle')}</h1>
          </div>
          <div className="mt-5 flex items-center gap-4">
            <span className="h-16 w-16 shrink-0 rounded-full bg-green-50 text-green-700 grid place-items-center text-[22px] font-bold">
              {name.trim().charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[19px] font-bold leading-tight truncate">{name}</div>
              <div className="mt-0.5 text-[12.5px] text-white/60 truncate">
                {(store.activities && store.activities.length ? store.activities : [store.category])
                  .map((a) => t(`stores.filters.${a}`))
                  .join(' · ')}{' '}
                · {cityLabel}
              </div>
            </div>
          </div>
          {/* All activity chips */}
          {store.activities && store.activities.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {store.activities.map((a: StoreCategory) => (
                <span
                  key={a}
                  className="inline-flex items-center rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold text-white/80"
                >
                  {t(`stores.filters.${a}`)}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            {store.verified && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-500/20 text-green-200 px-3 py-1.5 text-[11px] font-bold">
                <BadgeCheckIcon size={11} />
                {t('stores.verified')}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">
              <StarIcon size={11} className="text-green-200" />
              <span className="num">{store.rating.toFixed(1)}</span>
            </span>
            <span className="inline-flex items-center rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold">
              {t('stores.branchesCount', { count: store.branches.length })}
            </span>
          </div>
        </div>

        <div className="px-5 pt-4 pb-10 space-y-4">

          {/* Quick contact (first branch) */}
          {store.branches[0] && (
            <a
              href={`tel:${store.branches[0].phone}`}
              className="block rounded-xl3 bg-ink-900 text-white px-5 py-4 active:scale-[0.995] transition-transform shadow-card"
            >
              <div className="flex items-center gap-3.5">
                <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/8 ring-1 ring-white/12 grid place-items-center text-gold-300">
                  <PhoneIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] uppercase tracking-[0.08em] text-white/55">
                    {t('stores.quickCall.label')}
                  </div>
                  <div className="mt-1 text-[15px] font-semibold num truncate tracking-tight">
                    {store.branches[0].phone}
                  </div>
                </div>
                <span className="text-[11.5px] text-white/55 truncate">
                  {store.branches[0].name[locale]}
                </span>
              </div>
            </a>
          )}

          {/* C07 informational note — the rental starts at the store. */}
          <div className="rounded-xl2 bg-navy-50 ring-1 ring-navy-100 px-4 py-3 text-[12.5px] text-navy-700 leading-[1.8]">
            {t('stores.notice')}
          </div>

          {/* C07 — "how do I rent from this store?" numbered steps. */}
          <section className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4">
            <div className="text-[13.5px] font-bold text-navy-700">
              {t('stores.howTo.title', { name })}
            </div>
            <ol className="mt-3">
              {[1, 2, 3].map((n) => (
                <li
                  key={n}
                  className={
                    n < 3
                      ? 'flex items-center gap-3 py-2.5 border-b border-beige-100'
                      : 'flex items-center gap-3 py-2.5'
                  }
                >
                  <span className="h-6 w-6 shrink-0 rounded-full bg-green-50 text-green-700 grid place-items-center text-[11.5px] font-bold num">
                    {n}
                  </span>
                  <span className="text-[13px] text-ink-800">
                    {t(`stores.howTo.step${n}`)}
                  </span>
                </li>
              ))}
            </ol>
          </section>

          {/* About */}
          <section>
            <SectionHeader title={t('stores.about')} />
            <Card padded>
              <p className="text-[14px] text-ink-700 leading-[1.7]">{description}</p>
            </Card>
          </section>

          {/* Location + Hours */}
          <section>
            <SectionHeader title={t('stores.location')} />
            <Card padded>
              <InfoRow
                icon={<MapPinIcon size={18} />}
                tone="bg-canvas-100 text-ink-700"
                label={cityLabel}
                value={location}
              />
              <div className="my-4 h-px bg-canvas-200/80" />
              <InfoRow
                icon={<ClockIcon size={18} />}
                tone="bg-canvas-100 text-ink-700"
                label={t('stores.hours')}
                value={hours}
              />
            </Card>
          </section>

          {/* Branches */}
          <section>
            <SectionHeader
              title={t('stores.branches')}
              action={
                <span className="text-[12px] text-ink-400 font-medium">
                  {t('stores.branchesCount', { count: store.branches.length })}
                </span>
              }
            />
            {store.branches.length === 0 ? (
              <EmptyState
                icon={<MapPinIcon size={20} />}
                title={t('stores.branches')}
                description="—"
              />
            ) : (
              <div className="space-y-2.5">
                {store.branches.map((b) => (
                  <BranchCard key={b.id} branch={b} />
                ))}
              </div>
            )}
          </section>
        </div>
      </Screen>
    </>
  );
}

// (unused since the C07 band; kept out — see git history)
function StatTile({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
  hint?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl2 bg-white hairline p-3.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-ink-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[15.5px] font-semibold text-ink-900 leading-none truncate tracking-tight">
        {value}
      </div>
      {hint && (
        <div className="mt-1.5 text-[10.5px] text-ink-400 truncate">{hint}</div>
      )}
    </div>
  );
}

function InfoRow({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3.5">
      <span className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
          {label}
        </div>
        <div className="mt-1 text-[14px] font-semibold text-ink-900 leading-relaxed tracking-tight">
          {value}
        </div>
      </div>
    </div>
  );
}

function BranchCard({ branch }: { branch: StoreBranch }) {
  const t = useT();
  const { locale } = useI18n();
  const name = branch.name[locale];
  const address = branch.address[locale];
  const hours = branch.hours[locale];

  return (
    <Card padded>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="editorial-title text-[15px] text-ink-900 truncate">{name}</div>
          <div className="mt-1.5 flex items-start gap-1.5 text-[12.5px] text-ink-500 leading-relaxed">
            <MapPinIcon size={14} className="mt-0.5 shrink-0" />
            <span>{address}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-400">
            <ClockIcon size={12} />
            <span>{hours}</span>
          </div>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-2">
        {branch.phone ? (
          <a
            href={`tel:+966${branch.phone}`}
            className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl2 bg-canvas-100 text-ink-800 text-[12.5px] font-semibold hover:bg-canvas-200 transition-colors"
          >
            <PhoneIcon size={14} />
            <span className="num" dir="ltr">+966 {branch.phone}</span>
          </a>
        ) : null}
        {branch.mapUrl ? (
          <button
            type="button"
            onClick={() => openExternalUrl(branch.mapUrl)}
            className={cn(
              'inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl2 bg-green-50 text-green-700 text-[12.5px] font-semibold hover:bg-green-100 transition-colors',
              branch.phone ? '' : 'flex-1',
            )}
          >
            <MapPinIcon size={14} />
            {t('stores.openMap')}
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl2 bg-canvas-100 text-ink-300 text-[12px] font-medium">
            {t('stores.mapUnavailable')}
          </span>
        )}
      </div>
    </Card>
  );
}

function DetailsSkeleton() {
  const t = useT();
  return (
    <>
      <Header title={t('stores.title')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-6">
          <div className="rounded-xl3 bg-ink-900/95 p-7 space-y-4 shadow-plush">
            <div className="flex items-start gap-5">
              <Skeleton className="h-20 w-20 rounded-3xl bg-white/10" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24 bg-white/10" />
                <Skeleton className="h-5 w-3/4 bg-white/10" />
                <Skeleton className="h-3 w-1/2 bg-white/10" />
              </div>
            </div>
          </div>
          <Card padded>
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6 mt-2" />
            <Skeleton className="h-3 w-2/3 mt-2" />
          </Card>
          <Card padded>
            <div className="space-y-3">
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
              <div className="h-px bg-canvas-200/80 my-2" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        </div>
      </Screen>
    </>
  );
}
