import { useEffect, useState } from 'react';
import { ShieldIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { getMyRenterOtp, type PendingRenterOtp } from '@/lib/otp';
import { formatGregorian } from '@/lib/format/date';

// =====================================================================
// In-app OTP delivery — the CUSTOMER's side of the merchant rental
// session verification. While SMS delivery is not integrated, the
// server generates a random one-time code per challenge and this card
// is the only place it can be read: the get_my_renter_otp RPC is
// scoped to the signed-in customer's own account (auth.uid()).
//
// The customer reads the code to the merchant at the counter. Honest
// framing: the code confirms control of this Lend account — it is not
// a National ID or government identity verification.
//
// Renders nothing when no code is pending. Polls on mount, on window
// focus, and every 15s while a rental session could be in progress —
// codes live for 10 minutes, so this stays cheap.
// =====================================================================

const POLL_MS = 15_000;

export function RenterOtpCard({ active }: { active: boolean }) {
  const t = useT();
  const { locale } = useI18n();
  const [pending, setPending] = useState<PendingRenterOtp | null>(null);

  useEffect(() => {
    if (!active) {
      setPending(null);
      return;
    }
    let cancelled = false;
    const load = () => {
      getMyRenterOtp()
        .then((row) => {
          if (!cancelled) setPending(row);
        })
        // Silent: the card is a convenience surface — a failed poll
        // must never disturb the Home screen.
        .catch(() => {});
    };
    load();
    const id = window.setInterval(load, POLL_MS);
    const onFocus = () => load();
    window.addEventListener('focus', onFocus);
    return () => {
      cancelled = true;
      window.clearInterval(id);
      window.removeEventListener('focus', onFocus);
    };
  }, [active]);

  if (!active || !pending) return null;

  const merchantLabel =
    pending.merchantName?.[locale]?.trim() ||
    pending.merchantName?.ar?.trim() ||
    null;
  const expiresLabel = formatGregorian(locale, new Date(pending.expiresAt), {
    timeStyle: 'short',
  });

  return (
    <section
      className="rounded-[14px] bg-navy-700 text-white p-4 ring-1 ring-navy-700/20"
      aria-live="polite"
    >
      <div className="flex items-start gap-3">
        <span className="h-10 w-10 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/20 text-green-200 grid place-items-center">
          <ShieldIcon size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold leading-tight">
            {merchantLabel
              ? t('home.renterOtp.titleNamed', { merchant: merchantLabel })
              : t('home.renterOtp.title')}
          </div>
          <p className="mt-1 text-[11.5px] text-white/70 leading-relaxed">
            {t('home.renterOtp.body')}
          </p>
        </div>
      </div>
      <div
        className="mt-3 rounded-xl2 bg-white/10 ring-1 ring-white/15 px-4 py-3 text-center"
        dir="ltr"
      >
        <span className="num text-[26px] font-bold tracking-[0.35em] text-green-200">
          {pending.code}
        </span>
      </div>
      <div className="mt-2 text-[10.5px] text-white/50 num text-center">
        {t('home.renterOtp.expires', { time: expiresLabel })}
      </div>
    </section>
  );
}
