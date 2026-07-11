import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, EmptyState } from '@/components/ui';
import { ClockIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';

// =====================================================================
// Eligibility — customer-facing UI HIDDEN.
// =====================================================================
// The eligibility data model, backend RPCs, admin-side assignment
// flow, and the merchant-side rental-session eligibility check all
// remain fully wired. This page is deliberately empty so that if a
// customer navigates to `/eligibility` (from a stale link, deep
// link, or history) they see a clean "coming soon" state instead
// of the previous balance / limit / used / remaining dashboard.
//
// To re-enable the full eligibility screen, restore the previous
// implementation from commit b50e70b (or earlier) — the `Home.tsx`
// EligibilityCompact hero is preserved dead-code above the hero
// block, so re-enabling is a one-line JSX change there.
//
// Nothing else in this file — no live Supabase calls, no store
// reads, no numbers. The customer-facing eligibility surface stays
// hidden until product signs off on the design refresh.
// =====================================================================

export default function Eligibility() {
  const t = useT();
  const navigate = useNavigate();
  return (
    <>
      <Header title={t('eligibility.title')} showBack />
      <Screen className="bg-canvas">
        <EmptyState
          tone="brand"
          icon={<ClockIcon size={22} />}
          title={t('eligibility.comingSoonTitle')}
          description={t('eligibility.comingSoonBody')}
          action={
            <Button
              size="sm"
              onClick={() => navigate('/home', { replace: true })}
            >
              {t('eligibility.backHome')}
            </Button>
          }
        />
      </Screen>
    </>
  );
}
