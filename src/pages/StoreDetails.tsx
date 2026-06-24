import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, EmptyState, SectionHeader, Skeleton, StatusChip } from '@/components/ui';
import {
  BadgeCheckIcon,
  ClockIcon,
  InfoIcon,
  MapPinIcon,
  PackageIcon,
  PhoneIcon,
  StarIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptMerchantToStore,
  fetchMerchant,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { PartnerStore, StoreBranch } from '@/lib/data';
import { StoreLogo, categoryIcon } from '@/components/stores/StoreLogo';

export default function StoreDetails() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { stores } = useStore();
  const { configured } = useSupabaseAuth();

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<PartnerStore | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Clear previous entity + start loading on every :id change so the
    // page never flashes the previous store's data while the new one
    // resolves (Phase 9 entity-leak fix).
    setStore(null);
    setLoading(true);

    if (configured && id) {
      fetchMerchant(id)
        .then((m) => {
          if (cancelled) return;
          setStore(m ? adaptMerchantToStore(m) : null);
        })
        .catch((err) => {
          if (cancelled) return;
          // eslint-disable-next-line no-console
          console.error('[lend] fetchMerchant failed', err);
          setStore(null);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }

    // Demo path — keeps the short delay so the skeleton flashes briefly
    // even with synchronous store reads.
    const tid = window.setTimeout(() => {
      if (cancelled) return;
      setStore(stores.find((s) => s.id === id) ?? null);
      setLoading(false);
    }, 450);
    return () => {
      cancelled = true;
      window.clearTimeout(tid);
    };
  }, [configured, id, stores]);

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
      <Header title={t('stores.title')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-6">
          {/* Hero card */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-7 shadow-plush">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-18%] h-56 w-56 rounded-full bg-gold-400/22 blur-[100px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-16 start-[-15%] h-48 w-48 rounded-full bg-gold-500/12 blur-[100px]"
            />
            <div className="relative flex items-start gap-5">
              <StoreLogo store={store} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11px] font-semibold">
                    {categoryIcon(store.category, 12)}
                    {t(`stores.filters.${store.category}`)}
                  </span>
                  {store.verified && (
                    <StatusChip
                      tone="gold"
                      dot={false}
                      label={t('stores.verified')}
                    />
                  )}
                </div>
                <h1 className="editorial-title text-[24px] leading-tight text-white">{name}</h1>
                <div className="mt-2.5 flex items-center gap-3 text-[12.5px] text-white/75">
                  <span className="inline-flex items-center gap-1">
                    <StarIcon size={12} className="text-gold-300" />
                    <span className="num font-semibold">{store.rating.toFixed(1)}</span>
                  </span>
                  <span className="h-1 w-1 rounded-full bg-white/30" />
                  <span>{t('stores.branchesCount', { count: store.branches.length })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* At-a-glance stats */}
          <div className="grid grid-cols-3 gap-2.5">
            <StatTile
              icon={<StarIcon size={14} className="text-gold-400" />}
              label={t('stores.stats.rating')}
              value={
                <span className="num">{store.rating.toFixed(1)}</span>
              }
              hint={t('stores.stats.ratingHint')}
            />
            <StatTile
              icon={<PackageIcon size={14} className="text-ink-700" />}
              label={t('stores.stats.branches')}
              value={
                <span className="num">{store.branches.length}</span>
              }
              hint={t('stores.stats.branchesHint')}
            />
            <StatTile
              icon={
                <BadgeCheckIcon
                  size={14}
                  className={
                    store.verified ? 'text-gold-700' : 'text-ink-400'
                  }
                />
              }
              label={t('stores.stats.status')}
              value={
                <span
                  className={
                    store.verified ? 'text-gold-700' : 'text-ink-500'
                  }
                >
                  {store.verified
                    ? t('stores.verified')
                    : t('stores.stats.notVerified')}
                </span>
              }
              hint={t('stores.stats.statusHint')}
            />
          </div>

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

          {/* Informational notice */}
          <div className="rounded-xl2 bg-gold-50 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-gold-700">
            <InfoIcon size={16} className="mt-0.5 shrink-0" />
            <span className="leading-relaxed">{t('stores.notice')}</span>
          </div>

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
        <a
          href={`tel:${branch.phone}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-10 rounded-xl2 bg-canvas-100 text-ink-800 text-[12.5px] font-semibold hover:bg-canvas-200 transition-colors"
        >
          <PhoneIcon size={14} />
          <span className="num">{branch.phone}</span>
        </a>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 h-10 px-3.5 rounded-xl2 bg-white hairline text-ink-700 text-[12.5px] font-semibold hover:bg-canvas-100 transition-colors"
        >
          <MapPinIcon size={14} />
          {t('stores.openMap')}
        </button>
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
