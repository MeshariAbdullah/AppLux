import { Link } from 'react-router-dom';
import { Card, StatusChip } from '@/components/ui';
import { MapPinIcon, StarIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import type { PartnerStore } from '@/lib/data';
import { StoreLogo } from './StoreLogo';

export function StoreCard({ store }: { store: PartnerStore }) {
  const t = useT();
  const { locale } = useI18n();
  const name = store.name[locale];
  const location = store.location[locale];
  const city = t(`register.cities.${store.city}`);

  return (
    <Link to={`/stores/${store.id}`} className="block">
      <Card interactive padded className="flex items-center gap-3">
        <StoreLogo store={store} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[14px] font-semibold text-ink-900 truncate">{name}</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[12px] text-ink-500 truncate">
            <MapPinIcon size={12} />
            <span className="truncate">{city} · {location}</span>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <StatusChip
              tone="neutral"
              dot={false}
              label={t(`stores.filters.${store.category}`)}
            />
            <span className="inline-flex items-center gap-0.5 text-[11.5px] text-ink-600 font-semibold num">
              <StarIcon size={12} className="text-gold-500" />
              {store.rating.toFixed(1)}
            </span>
            {store.verified && (
              <StatusChip tone="success" dot label={t('stores.verified')} />
            )}
          </div>
        </div>
      </Card>
    </Link>
  );
}
