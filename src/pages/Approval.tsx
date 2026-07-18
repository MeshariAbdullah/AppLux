import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, CardSkeleton, EmptyState, PageSkeleton } from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  GavelIcon,
  QrIcon,
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  fetchInvoiceByToken,
  fetchMerchant,
  getSupabase,
  synthesizePackageFromInvoice,
  useSupabaseAuth,
} from '@/lib/supabase';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { deriveJourneyOnApproval } from '@/lib/rentalJourney';
import type { ScannedPackage } from '@/lib/data';
import { PaymentSimulationSheet } from '@/components/payment/PaymentSimulationSheet';

export default function Approval() {
  const t = useT();
  const { token } = useParams();
  const navigate = useNavigate();
  const { approvals, scans, approvePackage } = useStore();
  const { configured } = useSupabaseAuth();
  const record = token ? approvals[token] : undefined;
  const demoPkg = useMemo(
    () => scans.find((s) => s.token === token),
    [scans, token],
  );
  const { formatCurrency, formatDate } = useI18n();

  const [livePkg, setLivePkg] = useState<ScannedPackage | null>(null);
  // Bug 14: capture the live invoice id so the "Continue contract"
  // CTA can navigate to /track/invoice/<id> (a configured-mode page
  // backed by Supabase) instead of /tracking/<token> (a demo-only
  // page that silently dead-ends configured customers).
  const [liveInvoiceId, setLiveInvoiceId] = useState<string | null>(null);
  // Contract id created by accept_rental_invoice (RPC fires from the
  // Review wizard). Captured here so the post-approval payment
  // simulation can route to the active rental tracking page.
  const [liveContractId, setLiveContractId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [paySheetOpen, setPaySheetOpen] = useState(false);

  useEffect(() => {
    if (!configured || !token || demoPkg) {
      setLivePkg(null);
      setLiveInvoiceId(null);
      setLiveContractId(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    fetchInvoiceByToken(token)
      .then(async (res) => {
        if (cancelled || !res) return;
        setLiveInvoiceId(res.invoice.id);
        const [merchant, contractRow] = await Promise.all([
          fetchMerchant(res.invoice.merchant_id).catch(() => null),
          (async () => {
            // Static import (Phase 5A): the module is in the main chunk
            // via ~50 static importers, so the previous dynamic import
            // could never split — it only produced the recurring Vite
            // mixed-import warning.
            const sb = getSupabase();
            if (!sb) return null;
            const { data } = await sb
              .from('rental_contracts')
              .select('id')
              .eq('invoice_id', res.invoice.id)
              .maybeSingle();
            return data;
          })(),
        ]);
        if (cancelled) return;
        setLivePkg(synthesizePackageFromInvoice(res.invoice, res.items, merchant));
        if (contractRow?.id) setLiveContractId(contractRow.id);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, token, demoPkg]);

  const pkg = demoPkg ?? livePkg;

  useEffect(() => {
    if (!token || !demoPkg || record) return;
    approvePackage(token);
  }, [token, demoPkg, record, approvePackage]);

  if (!token || (!pkg && !resolving)) {
    return (
      <>
        <Header title={t('approval.title')} showBack />
        <Screen>
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('approval.invalid.title')}
            description={t('approval.invalid.hint')}
            action={
              <div className="flex flex-col items-stretch gap-2 w-full max-w-[260px]">
                <Button
                  size="sm"
                  leading={<QrIcon size={14} />}
                  onClick={() => navigate('/scan', { replace: true })}
                >
                  {t('approval.invalid.rescan')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate('/home', { replace: true })}
                >
                  {t('approval.goHome')}
                </Button>
              </div>
            }
          />
        </Screen>
      </>
    );
  }

  if (!pkg) {
    // Phase 9: while the live invoice fetch is in flight, render a
    // skeleton instead of a blank screen so the user understands the
    // page is loading rather than broken.
    return (
      <>
        <Header title={t('approval.title')} />
        <Screen className="bg-canvas">
          <CardSkeleton />
          <div className="mt-4">
            <PageSkeleton rows={2} />
          </div>
        </Screen>
      </>
    );
  }

  const approvedAt = record?.approvedAt ?? new Date().toISOString();
  const approvedTime = formatDate(approvedAt, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <Screen padded={false} className="bg-beige-100">
        {/* C10 — centered green success. */}
        <div className="px-6 pt-[calc(env(safe-area-inset-top)+72px)] pb-6 text-center flex flex-col items-center">
          <span className="h-[84px] w-[84px] rounded-full bg-green-700 text-white grid place-items-center ring-[14px] ring-green-50 animate-stamp-in">
            <CheckIcon size={34} strokeWidth={2.5} />
          </span>
          <h1 className="mt-7 text-[24px] font-bold text-navy-700 leading-tight animate-reveal-up">
            {t('approval.documentedHeadline')}
          </h1>
          <p className="mt-2.5 text-[13.5px] text-ink-600 leading-[1.9] max-w-[300px] animate-reveal-up">
            {t(ENABLE_PAYMENTS_AND_NOTES ? 'approval.documentedSubtitle' : 'approval.documentedSubtitleSimple')}
          </p>
        </div>

        <div className="px-5 pb-10 space-y-4">
          {/* C10 reference card — real contract reference + the current
              journey stage chip (stage 3 · بدء الإيجار in the
              no-payment path). */}
          <div className="rounded-[14px] bg-white ring-1 ring-beige-200 p-[18px]">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[11.5px] text-ink-500">
                  {t('approval.contractSigned')}
                </div>
                <div className="mt-0.5 text-[14px] font-bold num truncate" dir="ltr">
                  {pkg.contract.reference}
                </div>
              </div>
              <span className="shrink-0 rounded-full bg-green-50 text-green-700 px-3 py-1.5 text-[11.5px] font-bold">
                {t('journey.stages.started')}
              </span>
            </div>
            <div className="mt-3 text-[11px] text-ink-400 num">
              {t('approval.documentedRecordTime', { time: approvedTime })}
            </div>
          </div>

          {/* Legacy flag-ON structure preserved below (journey lead +
              note rows render only when payments/notes return). */}
          {ENABLE_PAYMENTS_AND_NOTES && (
            <RentalJourneyTimeline
              variant="lead"
              steps={deriveJourneyOnApproval({ issuedAt: pkg.issuedAt }, approvedAt)}
            />
          )}
          {ENABLE_PAYMENTS_AND_NOTES && (
          <section className="rounded-xl3 bg-lavender-50/60 ring-1 ring-lavender-200/60 p-5">
            <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.14em]">
              {t('approval.documentedRecordTitle')}
            </div>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 shrink-0 rounded-2xl bg-white text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
                  <DocIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-ink-500">{t('approval.contractSigned')}</div>
                  <div className="text-[13px] font-semibold text-ink-900 num truncate">
                    {pkg.contract.reference}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-white ring-1 ring-inset ring-lavender-200 rounded-full px-1.5 py-0.5">
                  <BadgeCheckIcon size={10} />
                  {t('journey.badges.signed.label')}
                </span>
              </div>
              {/* Promissory-note row — hidden in the current phase
                  (no note exists; ENABLE_PAYMENTS_AND_NOTES). */}
              {ENABLE_PAYMENTS_AND_NOTES && (
                <>
                  <div className="h-px bg-lavender-200/60" />
                  <div className="flex items-center gap-3">
                    <span className="h-9 w-9 shrink-0 rounded-2xl bg-white text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
                      <GavelIcon size={16} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[12px] text-ink-500">{t('approval.noteSigned')}</div>
                      <div className="text-[13px] font-semibold text-ink-900 num truncate">
                        {pkg.note.reference}
                      </div>
                    </div>
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-white ring-1 ring-inset ring-lavender-200 rounded-full px-1.5 py-0.5">
                      <BadgeCheckIcon size={10} />
                      {t('journey.badges.attested.label')}
                    </span>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 text-[11px] text-ink-500 num">
              {t('approval.documentedRecordTime', { time: approvedTime })}
            </div>
          </section>
          )}

          {/* Nafith disclaimer band — current phase: no note exists,
              so no disclaimer (ENABLE_PAYMENTS_AND_NOTES). */}
          {ENABLE_PAYMENTS_AND_NOTES && (
            <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 p-3.5 flex items-start gap-3 text-[11.5px] leading-relaxed text-ink-600">
              <SparkleIcon size={14} className="mt-0.5 shrink-0 text-lavender-600" />
              <div className="min-w-0 flex-1">{t('review.note.disclaimer')}</div>
            </div>
          )}

          {/* Primary action.
              Flag ON: opens the payment simulation (pay → Nafath →
              verify → activate).
              Flag OFF (current phase): the rental is ALREADY active —
              the primary action is simply opening the tracking page. */}
          <div className="pt-2 space-y-3">
            {ENABLE_PAYMENTS_AND_NOTES ? (
              <Button
                variant="primary"
                size="lg"
                block
                leading={<SparkleIcon size={18} />}
                onClick={() => setPaySheetOpen(true)}
              >
                {t('payment.simulation.pay.cta', {
                  amount: formatCurrency(pkg.fees.grandTotal),
                })}
              </Button>
            ) : (
              <Button
                variant="primary"
                size="lg"
                block
                className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
                onClick={() => {
                  if (configured && liveContractId) {
                    navigate(`/track/contract/${liveContractId}`, { replace: true });
                  } else if (configured && liveInvoiceId) {
                    navigate(`/track/invoice/${liveInvoiceId}`, { replace: true });
                  } else {
                    navigate(`/tracking/${token}`, { replace: true });
                  }
                }}
              >
                {t('approval.viewTracking')}
              </Button>
            )}
            <div className="text-center text-[12.5px] text-ink-500 space-x-3 rtl:space-x-reverse">
              {/* Secondary tracking link only makes sense when the
                  primary CTA is the payment sheet (flag on) — the
                  current-phase primary IS the tracking button. */}
              {ENABLE_PAYMENTS_AND_NOTES && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      if (configured && liveInvoiceId) {
                        navigate(`/track/invoice/${liveInvoiceId}`, { replace: true });
                      } else {
                        navigate(`/tracking/${token}`, { replace: true });
                      }
                    }}
                    className="text-ink-700 hover:text-ink-900 underline underline-offset-4 decoration-canvas-300 hover:decoration-ink-700"
                  >
                    {t('approval.viewTracking')}
                  </button>
                  <span aria-hidden className="text-ink-300">·</span>
                </>
              )}
              <button
                type="button"
                onClick={() => navigate('/home', { replace: true })}
                className="font-bold text-green-700 hover:text-green-800"
              >
                {t('approval.goHome')}
              </button>
            </div>
          </div>
        </div>
      </Screen>

      {/* Payment simulation — gated off in the current phase; the
          component is preserved for flag restoration. */}
      {ENABLE_PAYMENTS_AND_NOTES && (
        <PaymentSimulationSheet
          open={paySheetOpen}
          onClose={() => setPaySheetOpen(false)}
          amount={pkg.fees.grandTotal}
          contractId={liveContractId}
          invoiceId={liveInvoiceId}
        />
      )}
    </>
  );
}
