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
import type { PartnerStore, StoreBranch } from '@/lib/data';
import { StoreLogo, categoryIcon } from '@/components/stores/StoreLogo';

export default function StoreDetails() {
  const t = useT();
  const { locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { stores } = useStore();

  const [loading, setLoading] = useState(true);
  const [store, setStore] = useState<PartnerStore | null>(null);

  useEffect(() => {
    const id2 = window.setTimeout(() => {
      setStore(stores.find((s) => s.id === id) ?? null);
      setLoading(false);
    }, 450);
    return () => window.clearTimeout(id2);
  }, [id, stores]);

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
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-5">
          {/* Hero card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-float">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-brand-500/25 blur-3xl"
            />
            <div className="relative flex items-start gap-4">
              <StoreLogo store={store} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2 py-0.5 text-[11px] font-semibold">
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
                <h1 className="text-[20px] font-bold leading-snug">{name}</h1>
                <div className="mt-1.5 flex items-center gap-3 text-[12.5px] text-white/80">
                  <span className="inline-flex items-center gap-1">
                    <StarIcon size={12} className="text-gold-400" />
                    <span className="num font-semibold">{store.rating.toFixed(1)}</span>
                  </span>
                  <span className="h-1 w-1 rounded-full bg-white/30" />
                  <span>{t('stores.branchesCount', { count: store.branches.length })}</span>
                </div>
              </div>
            </div>
          </div>

          {/* At-a-glance stats */}
          <div className="grid grid-cols-3 gap-2">
            <StatTile
              icon={<StarIcon size={14} className="text-gold-500" />}
              label={t('stores.stats.rating')}
              value={
                <span className="num">{store.rating.toFixed(1)}</span>
              }
              hint={t('stores.stats.ratingHint')}
            />
            <StatTile
              icon={<PackageIcon size={14} className="text-brand-600" />}
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
                    store.verified ? 'text-success-600' : 'text-ink-400'
                  }
                />
              }
              label={t('stores.stats.status')}
              value={
                <span
                  className={
                    store.verified ? 'text-success-700' : 'text-ink-500'
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
              className="block rounded-xl2 bg-ink-900 text-white px-4 py-3 ring-1 ring-ink-900 active:scale-[0.995] transition-transform"
            >
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
                  <PhoneIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] uppercase tracking-wide text-white/55">
                    {t('stores.quickCall.label')}
                  </div>
                  <div className="mt-0.5 text-[14px] font-bold num truncate">
                    {store.branches[0].phone}
                  </div>
                </div>
                <span className="text-[11.5px] text-white/60 truncate">
                  {store.branches[0].name[locale]}
                </span>
              </div>
            </a>
          )}

          {/* Informational notice */}
          <div className="rounded-xl2 bg-brand-50/70 ring-1 ring-brand-100 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-brand-900">
            <InfoIcon size={16} className="mt-0.5 shrink-0 text-brand-600" />
            <span className="leading-relaxed">{t('stores.notice')}</span>
          </div>

          {/* About */}
          <section>
            <SectionHeader title={t('stores.about')} />
            <Card padded>
              <p className="text-[13.5px] text-ink-700 leading-relaxed">{description}</p>
            </Card>
          </section>

          {/* Location + Hours */}
          <section>
            <SectionHeader title={t('stores.location')} />
            <Card padded>
              <InfoRow
                icon={<MapPinIcon size={18} />}
                tone="bg-brand-50 text-brand-600"
                label={cityLabel}
                value={location}
              />
              <div className="my-3 h-px bg-ink-100" />
              <InfoRow
                icon={<ClockIcon size={18} />}
                tone="bg-ink-100 text-ink-700"
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
    <div className="rounded-xl2 bg-white ring-1 ring-ink-100 p-3">
      <div className="flex items-center gap-1.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-400">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[15px] font-bold text-ink-900 leading-none truncate">
        {value}
      </div>
      {hint && (
        <div className="mt-1 text-[10.5px] text-ink-400 truncate">{hint}</div>
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
    <div className="flex items-start gap-3">
      <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11.5px] font-medium text-ink-400 uppercase tracking-wide">
          {label}
        </div>
        <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">
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
          <div className="text-[14px] font-semibold text-ink-900 truncate">{name}</div>
          <div className="mt-1 flex items-start gap-1.5 text-[12.5px] text-ink-500 leading-relaxed">
            <MapPinIcon size={14} className="mt-0.5 shrink-0" />
            <span>{address}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-400">
            <ClockIcon size={12} />
            <span>{hours}</span>
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <a
          href={`tel:${branch.phone}`}
          className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 rounded-xl bg-ink-50 text-ink-800 text-[12.5px] font-semibold hover:bg-ink-100"
        >
          <PhoneIcon size={14} />
          <span className="num">{branch.phone}</span>
        </a>
        <button
          type="button"
          className="inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-xl bg-white ring-1 ring-ink-100 text-ink-700 text-[12.5px] font-semibold hover:bg-ink-50"
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
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-5">
          <div className="rounded-3xl bg-ink-900/90 p-6 space-y-4">
            <div className="flex items-start gap-4">
              <Skeleton className="h-20 w-20 rounded-2xl bg-white/10" />
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
              <div className="h-px bg-ink-100 my-2" />
              <Skeleton className="h-3 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </Card>
        </div>
      </Screen>
    </>
  );
}
