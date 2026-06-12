import { Link } from 'react-router-dom';
import { Card, StatusChip } from '@/components/ui';
import {
  ArrowIcon,
  BadgeCheckIcon,
  MapPinIcon,
  PackageIcon,
  StarIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import type { PartnerStore } from '@/lib/data';
import { StoreLogo } from './StoreLogo';
import { cn } from '@/lib/cn';

export function StoreCard({ store }: { store: PartnerStore }) {
  const t = useT();
  const { locale, dir } = useI18n();
  const name = store.name[locale];
  const location = store.location[locale];
  const city = t(`register.cities.${store.city}`);

  return (
    <Link to={`/stores/${store.id}`} className="block">
      <Card interactive padded className="space-y-4">
        <div className="flex items-start gap-4">
          <StoreLogo store={store} size="md" />
          <div className="flex-1 min-w-0">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="editorial-title text-[16px] text-ink-900 truncate leading-tight">
                  {name}
                </div>
                <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-ink-500 truncate">
                  <MapPinIcon size={12} className="shrink-0" />
                  <span className="truncate">
                    {city} · {location}
                  </span>
                </div>
              </div>
              {store.verified && (
                <span
                  className="inline-flex items-center gap-1 shrink-0 text-[10.5px] font-semibold text-gold-700 bg-gold-50 rounded-full px-1.5 py-0.5"
                  aria-label={t('stores.verified')}
                >
                  <BadgeCheckIcon size={11} />
                  {t('stores.verified')}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-900 num">
            <StarIcon size={13} className="text-gold-400" />
            {store.rating.toFixed(1)}
          </span>
          <span className="h-1 w-1 rounded-full bg-canvas-300" />
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-500">
            <PackageIcon size={12} />
            {t('stores.branchesCount', { count: store.branches.length })}
          </span>
          <StatusChip
            size="sm"
            tone="neutral"
            dot={false}
            label={t(`stores.filters.${store.category}`)}
            className="ms-auto"
          />
        </div>

        {/* Two-pill action row — both stay in-app: Lend remains the intermediary */}
        <div className="flex items-center gap-2 pt-1">
          <span className="flex-1 inline-flex items-center justify-center gap-1.5 h-9 px-3 rounded-full bg-lavender-400 text-white text-[12.5px] font-semibold shadow-soft">
            {t('stores.actions.viewBoutique')}
            <ArrowIcon size={12} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
          </span>
          <span className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-full bg-canvas-100 hairline text-ink-700 text-[12.5px] font-medium whitespace-nowrap">
            <MapPinIcon size={12} />
            {t('stores.actions.branchesAndLocation')}
          </span>
        </div>
      </Card>
    </Link>
  );
}
