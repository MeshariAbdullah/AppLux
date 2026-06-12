/**
 * Single source of truth for the sector taxonomy shown on /welcome
 * and /stores.
 *
 * Sectors are the top-level product categorisation layer for Lend:
 * what kind of thing is being rented. Each sector lists its
 * sub-categories (rendered as a tag line) and the legacy
 * `StoreCategory` keys that map onto it — the Stores page uses that
 * mapping to derive a real partner count from the merchants table.
 *
 * Sectors with no `storeCategories` yet (because no merchants have
 * been onboarded in that sector) still render with a "partners
 * coming soon" badge. When new sectors gain merchants in the DB,
 * the only change here is wiring up the corresponding category
 * key — the UI handles the count automatically.
 */
import type { StoreCategory } from '@/lib/data';

export type SectorKey = 'fashion' | 'jewellery' | 'vehicles' | 'events';

export type Sector = {
  key: SectorKey;
  /** i18n key for the sector's display name. */
  i18nName: string;
  /** i18n key for the sub-category tag line. */
  i18nSub: string;
  /**
   * Legacy `StoreCategory` keys that map onto this sector. Empty
   * means the sector has no merchants yet — render the "coming
   * soon" partner badge instead of a count.
   */
  storeCategories: StoreCategory[];
};

export const SECTORS: Sector[] = [
  {
    key: 'fashion',
    i18nName: 'welcome.sectors.fashion.name',
    i18nSub: 'welcome.sectors.fashion.sub',
    storeCategories: ['dresses', 'bags', 'watches', 'bishts'],
  },
  {
    key: 'jewellery',
    i18nName: 'welcome.sectors.jewellery.name',
    i18nSub: 'welcome.sectors.jewellery.sub',
    storeCategories: [],
  },
  {
    key: 'vehicles',
    i18nName: 'welcome.sectors.vehicles.name',
    i18nSub: 'welcome.sectors.vehicles.sub',
    storeCategories: [],
  },
  {
    key: 'events',
    i18nName: 'welcome.sectors.events.name',
    i18nSub: 'welcome.sectors.events.sub',
    storeCategories: [],
  },
];
