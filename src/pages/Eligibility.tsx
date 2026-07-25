import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, CardSkeleton, EmptyState } from '@/components/ui';
import { ShieldIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { adaptEligibility, useSupabaseAuth } from '@/lib/supabase';

// =====================================================================
// Eligibility — LIGHTWEIGHT summary page (replaces the "coming soon"
// placeholder from 417c0ec).
//
// Deliberately simple: status/tier, total limit, used, remaining, a
// slim usage bar with a percentage, and one explanatory sentence.
// The old detailed dashboard (usage-distribution breakdown, manual
// assignment card, assigned-by metadata) stays retired — do not add
// sections here without product sign-off.
//
// Data source is IDENTICAL to the Home EligibilityCompact card: the
// auth provider's eligibility row (adapted) when Supabase is
// configured, the demo store otherwise. No new queries, no RPC or
// schema changes. A missing/zero-limit row renders the calm
// "not active yet" state instead of numbers.
// =====================================================================

export default function Eligibility() {
  const t = useT();
  const { locale, dir } = useI18n();
  const navigate = useNavigate();

  // Product rule for THIS page: numbers always render in English
  // (Latin) numerals in both locales. `-u-nu-latn` keeps the Arabic
  // currency label and grouping while forcing 0-9 digits — the page-
  // local equivalent of the shared formatCurrency, display-only.
  const numberLocale = locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US';
  const fmtCurrency = (n: number) =>
    new Intl.NumberFormat(numberLocale, {
      style: 'currency',
      currency: 'SAR',
      maximumFractionDigits: 0,
    }).format(n);
  const { eligibility: demoEligibility } = useStore();
  const {
    configured,
    eligibility: dbEligibility,
    eligibilityLoading,
  } = useSupabaseAuth();

  // Same source rules as Home: live row when configured, demo store
  // otherwise. `null` (no row) or a zero limit both mean "not active".
  const eligibility = configured
    ? dbEligibility
      ? adaptEligibility(dbEligibility)
      : null
    : demoEligibility;
  const active = Boolean(eligibility && eligibility.limit > 0);

  const usagePct =
    active && eligibility
      ? Math.min(100, Math.round((eligibility.used / eligibility.limit) * 100))
      : 0;

  return (
    <>
      <Header title={t('eligibility.title')} showBack />
      <Screen className="bg-canvas">
        {configured && eligibilityLoading ? (
          <CardSkeleton />
        ) : !active || !eligibility ? (
          <EmptyState
            tone="brand"
            icon={<ShieldIcon size={22} />}
            title={t('eligibility.inactiveTitle')}
            action={
              <Button
                size="sm"
                onClick={() => navigate('/home', { replace: true })}
              >
                {t('eligibility.backHome')}
              </Button>
            }
          />
        ) : (
          <>
            {/* Remaining — the number the customer actually acts on. */}
            <section className="rounded-xl3 bg-white hairline shadow-soft p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[10.5px] font-semibold text-ink-500 uppercase tracking-[0.12em]">
                    {t('eligibility.remainingTitle')}
                  </div>
                  <div className="mt-1 editorial-title text-[26px] leading-none text-ink-900 num">
                    {fmtCurrency(eligibility.remaining)}
                  </div>
                  {/* The calculation rule, spelled out in words. */}
                  <p className="mt-2 text-[11.5px] text-ink-500 leading-relaxed">
                    {t('eligibility.subtitle')}
                  </p>
                </div>
                <span className="shrink-0 inline-flex items-center text-[10.5px] font-semibold text-lavender-700 bg-lavender-50 ring-1 ring-lavender-200 rounded-full px-2.5 py-1">
                  {t(`eligibility.tiers.${eligibility.tier}`)}
                </span>
              </div>

              {/* Slim usage bar — a hairline, not a chart. */}
              <div className="mt-4">
                <div className="h-1.5 rounded-full bg-canvas-200 overflow-hidden">
                  <span
                    className="block h-full rounded-full bg-lavender-400"
                    style={{ width: `${usagePct}%` }}
                    aria-hidden
                  />
                </div>
                <div className="mt-1.5 text-[11px] text-ink-500 num">
                  {t('eligibility.usageOfLimit')} · {`${usagePct}%`}
                </div>
              </div>
            </section>

            {/* The same rule as a VISUAL equation — the flex row lays
                out with the page direction, so it reads الحد الكلي −
                المستهلك = المتبقي in RTL and total − used = remaining
                in LTR. Same tile chrome as before. */}
            <div className="flex items-stretch gap-1.5" dir={dir}>
              <EquationTile
                label={t('eligibility.limit')}
                value={fmtCurrency(eligibility.limit)}
              />
              <span className="self-center text-[15px] font-bold text-ink-400 shrink-0" aria-hidden>
                −
              </span>
              <EquationTile
                label={t('eligibility.used')}
                value={fmtCurrency(eligibility.used)}
              />
              <span className="self-center text-[15px] font-bold text-ink-400 shrink-0" aria-hidden>
                =
              </span>
              <EquationTile
                label={t('eligibility.remaining')}
                value={fmtCurrency(eligibility.remaining)}
                highlight
              />
            </div>
          </>
        )}
      </Screen>
    </>
  );
}

// One term of the limit equation — quiet tile, same chrome as the old
// two-tile grid; `highlight` marks the result (المتبقي).
function EquationTile({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        highlight
          ? 'flex-1 min-w-0 rounded-xl2 bg-lavender-50 ring-1 ring-lavender-200 px-2 py-3 text-center'
          : 'flex-1 min-w-0 rounded-xl2 bg-white hairline px-2 py-3 text-center'
      }
    >
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.08em] text-ink-500 truncate">
        {label}
      </div>
      <div className="mt-1 text-[12.5px] font-semibold text-ink-900 num whitespace-nowrap" dir="ltr">
        {value}
      </div>
    </div>
  );
}
