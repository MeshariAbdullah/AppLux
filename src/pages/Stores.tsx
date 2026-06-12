import { useEffect, useMemo, useState } from 'react';
import { Header, Screen } from '@/components/layout';
import { EmptyState, Skeleton } from '@/components/ui';
import { BadgeCheckIcon, BuildingIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import type { PartnerStore, StoreCategory } from '@/lib/data';
import {
  adaptMerchantToStore,
  listMerchants,
  useSupabaseAuth,
} from '@/lib/supabase';

// =====================================================================
// Sectors-only view (SCRUM-41 Bug 5).
//
// Customers now see only the top-level sectors with their sub-categories
// and a partner count. Individual partner store cards (name, branches,
// city, rating, contact) are intentionally hidden — the only signal a
// customer needs at this stage is "this sector has partner businesses
// you can rent from". Per-store details surface later in the flow
// (after picking a category, scanning an invoice, etc.).
//
// Sector taxonomy is defined locally because we don't have a sectors
// table yet. When more sectors are added (homes, vehicles, equipment),
// extend SECTORS below and add the matching i18n keys.
// =====================================================================

type Sector = {
  key: 'fashion';
  i18nName: string; // welcome.sectors.<key>.name
  i18nSub: string; // welcome.sectors.<key>.sub
  categories: StoreCategory[];
};

const SECTORS: Sector[] = [
  {
    key: 'fashion',
    i18nName: 'welcome.sectors.fashion.name',
    i18nSub: 'welcome.sectors.fashion.sub',
    categories: ['dresses', 'bags', 'watches', 'bishts'],
  },
];

export default function Stores() {
  const t = useT();
  const { stores: demoStores } = useStore();
  const { configured } = useSupabaseAuth();
  const [stores, setStores] = useState<PartnerStore[]>(demoStores);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!configured) {
      setStores(demoStores);
      const id = window.setTimeout(() => setLoading(false), 250);
      return () => window.clearTimeout(id);
    }
    setLoading(true);
    listMerchants()
      .then((rows) => {
        if (cancelled) return;
        setStores(rows.map(adaptMerchantToStore));
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.error('[lend] listMerchants failed; falling back to demo seed', err);
        setStores(demoStores);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, demoStores]);

  const sectorCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const sector of SECTORS) {
      counts[sector.key] = stores.filter((s) =>
        sector.categories.includes(s.category),
      ).length;
    }
    return counts;
  }, [stores]);

  return (
    <>
      <Header title={t('stores.title')} subtitle={t('stores.subtitle')} />
      <Screen className="bg-canvas">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 2 }).map((_, i) => (
              <SectorSkeleton key={i} />
            ))}
          </div>
        ) : (
          <div className="space-y-2.5">
            {SECTORS.map((sector, i) => (
              <SectorCard
                key={sector.key}
                index={i + 1}
                name={t(sector.i18nName)}
                sub={t(sector.i18nSub)}
                partnerCount={sectorCounts[sector.key] ?? 0}
                t={t}
              />
            ))}
            {/* Reassurance line — sets the expectation that stores
                listed elsewhere in the app are partners, not random
                third parties. Stays on the page even when the sector
                count is zero. */}
            <div className="rounded-xl2 bg-canvas-100/60 ring-1 ring-canvas-200 px-4 py-3 text-center text-[11.5px] text-ink-500 leading-relaxed">
              {t('stores.sectorPartnerNote')}
            </div>
            {SECTORS.length === 0 && (
              <EmptyState
                icon={<BuildingIcon size={22} />}
                title={t('stores.sectorNoPartners')}
                description={t('stores.subtitle')}
              />
            )}
          </div>
        )}
      </Screen>
    </>
  );
}

function SectorCard({
  index,
  name,
  sub,
  partnerCount,
  t,
}: {
  index: number;
  name: string;
  sub: string;
  partnerCount: number;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const partnerLabel =
    partnerCount === 0
      ? t('stores.sectorNoPartners')
      : partnerCount === 1
        ? t('stores.sectorPartner')
        : t('stores.sectorPartners', { count: partnerCount });
  return (
    <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 shadow-soft p-4">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-xl bg-lavender-50 text-lavender-700 grid place-items-center text-[13px] font-bold">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-semibold text-ink-900 truncate">
            {name}
          </div>
          <div className="mt-0.5 text-[11.5px] text-ink-500 truncate">
            {sub}
          </div>
        </div>
        <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-lavender-50 rounded-full px-2 py-0.5 shrink-0">
          <BadgeCheckIcon size={10} />
          {partnerLabel}
        </span>
      </div>
    </div>
  );
}

function SectorSkeleton() {
  return (
    <div className="rounded-xl3 bg-white ring-1 ring-canvas-200 p-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 rounded-xl" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3.5 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
        <Skeleton className="h-5 w-20 rounded-full" />
      </div>
    </div>
  );
}
