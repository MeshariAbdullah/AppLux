import { Link } from 'react-router-dom';
import { StatusChip } from '@/components/ui';
import { useI18n, useT } from '@/lib/i18n';
import type { PartnerStore } from '@/lib/data';
import { getInitials } from '@/lib/format/initials';

// =====================================================================
// StoreCard — customer design C06. Compact partner row: letter avatar,
// name, "category · city · N branches" meta line, and the موثّق chip.
// Links to the existing /stores/:id details route. Real data only.
// =====================================================================

export function StoreCard({ store }: { store: PartnerStore }) {
  const t = useT();
  const { locale } = useI18n();
  const name = store.name[locale] || store.name.ar;
  const city = t(`register.cities.${store.city}`);

  const meta = [
    t(`stores.filters.${store.category}`),
    city,
    store.branches.length > 0
      ? t('stores.branchesCount', { count: store.branches.length })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Link to={`/stores/${store.id}`} className="block">
      <div className="rounded-[14px] bg-white ring-1 ring-beige-200 px-[18px] py-4 flex items-center gap-3 transition-transform active:scale-[0.995]">
        <span className="h-11 w-11 shrink-0 rounded-full bg-green-50 text-green-700 grid place-items-center text-[15px] font-bold">
          {getInitials(name)}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink-900 truncate">{name}</div>
          <div className="mt-0.5 text-[12px] text-ink-500 truncate">{meta}</div>
        </div>
        {store.verified && (
          <StatusChip
            size="sm"
            tone="success"
            dot={false}
            label={t('stores.verifiedShort')}
          />
        )}
      </div>
    </Link>
  );
}
