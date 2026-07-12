// =====================================================================
// Cache keys + TTLs — Phase 3A. The ONLY place cache key strings are
// built; call sites must use these builders (never ad-hoc string
// concatenation) so prefix-invalidation patterns stay reliable and
// the whole key space is auditable in one file.
//
// Shape: {scope}:{userId}:{entity}[:{id}][:{params}]
//   * Every user-scoped key embeds the auth user id, so a fast
//     account switch can't be served the previous user's rows even
//     before cacheClearAll() runs on SIGNED_OUT.
//   * `public:` keys hold display-only, non-personal data (partner
//     store list); they are still wiped on sign-out.
//
// TTLs are read-side (approved plan §3): callers pass them to
// useCachedQuery. Values live here so tuning is a one-file change.
// =====================================================================

const MINUTE = 60_000;

export const CACHE_TTL = {
  /** Partner store list + single merchant — changes only via admin. */
  storeList: 15 * MINUTE,
  merchantEntity: 15 * MINUTE,
  /** Own merchant row — effectively session-lifetime; admin-side
   *  changes are picked up on next sign-in (or focus revalidation
   *  once a consumer opts in). */
  myMerchant: Number.POSITIVE_INFINITY,
  /** Display-only name/city lookups. */
  profileBatch: 10 * MINUTE,
  /** Customer + merchant working lists — short; cross-device actions
   *  affect them. */
  customerLists: 2 * MINUTE,
  merchantLists: 2 * MINUTE,
  /** Single rental bundle (contract + note) — near-live. */
  rentalBundle: 1 * MINUTE,
  adminLists: 5 * MINUTE,
  eligibility: 5 * MINUTE,
} as const;

/** Floor between focus-triggered revalidations of the same key, so
 *  iOS app-switcher flapping can't hammer the backend. */
export const FOCUS_REVALIDATE_MIN_MS = 10_000;

function idsHash(ids: readonly string[]): string {
  return [...ids].sort().join(',');
}

export const cacheKeys = {
  // ---- public / display-only ----
  publicMerchants: () => 'public:merchants',
  merchantEntity: (merchantId: string) => `entity:merchant:${merchantId}`,
  profileBatch: (ids: readonly string[]) => `entity:profiles:${idsHash(ids)}`,
  merchantBatch: (ids: readonly string[]) => `entity:merchants:${idsHash(ids)}`,

  // ---- customer-scoped ----
  customerInvoices: (uid: string) => `customer:${uid}:invoices`,
  customerContracts: (uid: string) => `customer:${uid}:contracts`,
  customerNotes: (uid: string) => `customer:${uid}:notes`,
  customerPrefix: (uid: string) => `customer:${uid}:`,

  // ---- merchant-scoped ----
  myMerchant: (uid: string) => `merchant:${uid}:entity`,
  merchantContracts: (uid: string) => `merchant:${uid}:contracts`,
  merchantInvoices: (uid: string, status?: string) =>
    `merchant:${uid}:invoices${status ? `:${status}` : ''}`,
  merchantPrefix: (uid: string) => `merchant:${uid}:`,

  // ---- single-entity ----
  contract: (contractId: string) => `entity:contract:${contractId}`,
  noteByContract: (contractId: string) => `entity:note:byContract:${contractId}`,
  eligibility: (uid: string) => `eligibility:${uid}`,

  // ---- admin-scoped (memory only — rows include PII; NEVER persist) ----
  adminUsers: (uid: string) => `admin:${uid}:users`,
  adminMerchantApps: (uid: string) => `admin:${uid}:merchantApps`,
  adminDamageCases: (uid: string) => `admin:${uid}:damageCases`,
  adminPrefix: (uid: string) => `admin:${uid}:`,
} as const;
