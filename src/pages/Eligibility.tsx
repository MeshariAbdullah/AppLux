import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, CardSkeleton, EmptyState } from '@/components/ui';
import { InfoIcon, ShieldIcon } from '@/components/icons';
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
  const { formatCurrency, formatNumber } = useI18n();
  const navigate = useNavigate();
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
                    {t('eligibility.remaining')}
                  </div>
                  <div className="mt-1 editorial-title text-[26px] leading-none text-ink-900 num">
                    {formatCurrency(eligibility.remaining)}
                  </div>
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
                  {t('eligibility.usageOfLimit')} ·{' '}
                  {formatNumber(usagePct / 100, {
                    style: 'percent',
                    maximumFractionDigits: 0,
                  })}
                </div>
              </div>
            </section>

            {/* Limit + used — two quiet tiles. */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl2 bg-white hairline px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  {t('eligibility.limit')}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-ink-900 num">
                  {formatCurrency(eligibility.limit)}
                </div>
              </div>
              <div className="rounded-xl2 bg-white hairline px-4 py-3">
                <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-ink-500">
                  {t('eligibility.used')}
                </div>
                <div className="mt-1 text-[15px] font-semibold text-ink-900 num">
                  {formatCurrency(eligibility.used)}
                </div>
              </div>
            </div>

            {/* One-line explanation — no backend details. */}
            <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-4 py-3 flex items-start gap-2.5">
              <InfoIcon size={14} className="mt-0.5 shrink-0 text-ink-500" />
              <p className="text-[12px] text-ink-600 leading-relaxed">
                {t('eligibility.note')}
              </p>
            </div>
          </>
        )}
      </Screen>
    </>
  );
}
