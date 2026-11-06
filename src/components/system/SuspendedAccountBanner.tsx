import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';
import { useSupabaseAuth } from '@/lib/supabase';
import { SUPPORT_EMAIL, SUPPORT_URL } from '@/lib/legalLinks';

/**
 * Persistent suspended-account notice for the CUSTOMER shell
 * (20260502130800). AppLayout renders it as a static row between the
 * page and the bottom nav, so it is visible on every customer screen
 * without covering page headers or the scroll region — and it never
 * redirects: a suspended customer keeps full access to contracts,
 * invoices and disputes to resolve existing obligations.
 *
 * Source of truth: profiles.account_status from the auth context —
 * the same column the database enforces on. The banner is purely
 * informational; the server rejects every new obligation (P0101)
 * whatever the client renders. A pending self-serve deletion also
 * sets 'suspended' and has its own notice on the Profile page, so
 * the banner stays quiet in that state.
 */
export function SuspendedAccountBanner() {
  const t = useT();
  const { configured, profile } = useSupabaseAuth();
  const [expanded, setExpanded] = useState(false);

  const suspended =
    configured &&
    profile?.role === 'customer' &&
    profile.account_status === 'suspended' &&
    !profile.deletion_requested_at;
  if (!suspended) return null;

  const supportHref = SUPPORT_URL || (SUPPORT_EMAIL ? `mailto:${SUPPORT_EMAIL}` : '');

  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="suspended-account-banner"
      className="shrink-0 z-20 border-t border-warn-500/25 bg-warn-50"
    >
      <div className="mx-auto w-full max-w-[640px] px-5 md:px-8 py-3">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 h-9 w-9 shrink-0 rounded-xl bg-white text-warn-600 ring-1 ring-warn-500/25 grid place-items-center">
            <AlertIcon size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-bold text-warn-700 leading-tight">
              {t('suspension.banner.title')}
            </p>
            <p className="mt-0.5 text-[12px] text-ink-700 leading-snug">
              {t('suspension.banner.summary')}
            </p>
            {expanded && (
              <ul className="mt-2 space-y-1.5 text-[12px] text-ink-700 leading-relaxed list-disc ps-4">
                <li>{t('suspension.banner.noNewRentals')}</li>
                <li>{t('suspension.banner.existingAccessible')}</li>
                <li>
                  {supportHref ? (
                    <a
                      href={supportHref}
                      target="_blank"
                      rel="noreferrer"
                      className="font-semibold text-lavender-700 underline underline-offset-2"
                    >
                      {t('suspension.banner.contactSupport')}
                    </a>
                  ) : (
                    t('suspension.banner.contactSupportFallback')
                  )}
                </li>
              </ul>
            )}
            <div className="mt-2 flex items-center gap-4 text-[12px] font-semibold">
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="text-warn-700 underline underline-offset-2"
              >
                {t(expanded ? 'suspension.banner.hide' : 'suspension.banner.details')}
              </button>
              <Link to="/contracts" className="text-lavender-700 underline underline-offset-2">
                {t('suspension.banner.viewContracts')}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
