import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  CardSkeleton,
  ConfirmSheet,
  EmptyState,
  PageSkeleton,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  InfoIcon,
  MapPinIcon,
  ReceiptIcon,
  ShieldIcon,
  SignatureIcon,
  XIcon,
} from '@/components/icons';
import { cacheKeys } from '@/lib/cache/keys';
import { cacheInvalidate } from '@/lib/cache/memoryCache';
import { translateError, withSupportId } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { useSensitiveFlow } from '@/lib/session/flowGuard';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { resolveMerchantName } from '@/lib/merchantName';
import {
  acceptRentalInvoice,
  activateRentalWithoutPaymentAndNote,
  confirmContractReceiptPhotos,
  fetchBranchById,
  rejectRentalInvoice,
  fetchContractByInvoiceId,
  fetchInvoiceByToken,
  fetchMerchant,
  synthesizePackageFromInvoice,
  useSupabaseAuth,
  type MerchantRow,
} from '@/lib/supabase';
import type { ScannedPackage } from '@/lib/data';
import { ReviewStepper, type ReviewStepKey } from '@/components/review/ReviewStepper';
import { ReceiptPhotosStep } from '@/components/review/ReceiptPhotosStep';
import { StoreLogo } from '@/components/stores/StoreLogo';
import { cn } from '@/lib/cn';

export default function Review() {
  const t = useT();
  const { locale } = useI18n();
  const { token } = useParams();
  const navigate = useNavigate();
  // Session hardening: the whole contract-review/signing page is a
  // sensitive flow — never idle-logout a customer while they read or
  // sign the contract (see src/lib/session/flowGuard.ts).
  useSensitiveFlow(true);
  const { scans, stores, session, approvePackage } = useStore();
  const {
    configured,
    profile: supabaseProfile,
    session: supabaseSession,
    refresh: refreshAuthContext,
  } = useSupabaseAuth();
  const supabaseUserId = supabaseSession?.user?.id ?? null;
  const demoPkg = useMemo(
    () => scans.find((s) => s.token === token),
    [scans, token],
  );
  const demoStore = useMemo(
    () => stores.find((s) => s.id === demoPkg?.storeId),
    [stores, demoPkg],
  );

  // Live invoice resolution when configured. Falls back to demo if missing.
  const [livePkg, setLivePkg] = useState<ScannedPackage | null>(null);
  const [liveInvoiceId, setLiveInvoiceId] = useState<string | null>(null);
  // Merchant row from the live fetch — kept so the contract "parties"
  // card can show the real lessor name (the demo `stores` lookup is
  // empty in live mode, which used to render "—").
  const [liveMerchantRow, setLiveMerchantRow] = useState<MerchantRow | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!configured || !token) {
      setLivePkg(null);
      setLiveInvoiceId(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    fetchInvoiceByToken(token)
      .then(async (res) => {
        if (cancelled || !res) {
          setLivePkg(null);
          setLiveInvoiceId(null);
          return;
        }
        const merchant = await fetchMerchant(res.invoice.merchant_id).catch(() => null);
        // Real pickup branch (public-select policy) — the customer sees
        // the branch the merchant actually issued from.
        const branch = res.invoice.branch_id
          ? await fetchBranchById(res.invoice.branch_id).catch(() => null)
          : null;
        if (cancelled) return;
        setLiveMerchantRow(merchant);
        setLivePkg(synthesizePackageFromInvoice(res.invoice, res.items, merchant, branch));
        setLiveInvoiceId(res.invoice.id);
        // Offer-decision lifecycle: expiry + terminal states gate the
        // whole wizard (server enforces the same rules — P0170/P0171).
        setOfferExpiresAt(res.invoice.expires_at ?? null);
        setOfferStatus(res.invoice.status);
        // Bugs 17/19 resume path: the invoice was already accepted on a
        // previous visit. Its contract exists — if it's still pending,
        // re-enter the guided flow directly at the receipt-photos step
        // (acceptance must never re-run); if it's already active or
        // closed, this wizard has nothing left to do — hand off to the
        // read-only tracking page.
        if (res.invoice.status === 'accepted') {
          const contract = await fetchContractByInvoiceId(res.invoice.id).catch(
            () => null,
          );
          if (cancelled || !contract) return;
          if (contract.status === 'pending') {
            setLiveContractId(contract.id);
            setReceiptConfirmed(Boolean(contract.receipt_photos_confirmed_at));
            setStep('photos');
          } else {
            navigate(`/track/contract/${contract.id}`, { replace: true });
          }
        }
      })
      .catch((err) => {
        logEvent('rpc_failure', 'warn', { op: 'fetch_invoice_by_token' }, err);
      })
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, token]);

  const pkg = livePkg ?? demoPkg;
  const store = demoStore; // Customer-side store lookup stays demo for now

  // Contract parties — resolved from data that is ALREADY loaded:
  //   lessor  ← live merchant row (this page's fetch) or demo store
  //   lessee  ← Supabase profile (auth provider) or demo session
  // Names only; no national ID / mobile / other profile fields.
  const lessorName =
    (liveMerchantRow ? resolveMerchantName(liveMerchantRow, locale, '') : '') ||
    (store ? store.name[locale] : '') ||
    null;
  const lesseeName =
    supabaseProfile?.full_name?.trim() || session?.fullName?.trim() || null;

  // Official contracting-party identifiers (shown on the contract step
  // — this is the one screen where the customer sees their own full
  // National ID and the merchant CR, because both are required to form
  // the contract). Real persisted data only; missing values render '—'
  // and BLOCK approval in live mode — nothing is ever fabricated.
  const lessorLegalName = configured
    ? liveMerchantRow?.company_name?.trim() || null
    : store?.name[locale] ?? null;
  const lessorCr = configured
    ? liveMerchantRow?.commercial_reg_number?.trim() || null
    : null;
  const lesseeLegalName = configured
    ? supabaseProfile?.full_name?.trim() || null
    : session?.fullName?.trim() || null;
  const lesseeNationalId = configured
    ? supabaseProfile?.national_id?.trim() || null
    : session?.nationalId?.trim() || null;
  // Server backstop: accept_rental_invoice raises P0150 for the same
  // condition (20260502123500) — this client gate just fails earlier
  // with the business message instead of a failed RPC.
  const partyIncomplete =
    configured &&
    !(lessorLegalName && lessorCr && lesseeLegalName && lesseeNationalId);

  const [step, setStep] = useState<ReviewStepKey>('invoice');
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // Offer-decision lifecycle (20260502123700): expiry + rejection.
  const [offerExpiresAt, setOfferExpiresAt] = useState<string | null>(null);
  const [offerStatus, setOfferStatus] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [rejectedDone, setRejectedDone] = useState(false);
  // Synchronous double-tap guard — React state lags a render.
  const rejectingRef = useRef(false);
  // A 15s clock tick so an offer expiring WHILE the page is open flips
  // the wizard into the expired state without a reload; the server
  // remains the authority either way.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowTick(Date.now()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  const offerExpired = Boolean(
    configured && offerExpiresAt && new Date(offerExpiresAt).getTime() <= nowTick,
  );
  const offerRejected = rejectedDone || offerStatus === 'rejected';

  const handleReject = async () => {
    if (rejectingRef.current || !liveInvoiceId) return;
    rejectingRef.current = true;
    setRejecting(true);
    setRejectError(null);
    try {
      await rejectRentalInvoice(liveInvoiceId);
      // Same invalidations the accept path performs — pending lists and
      // eligibility-consuming screens refetch fresh data.
      if (supabaseUserId) {
        cacheInvalidate(cacheKeys.customerInvoices(supabaseUserId));
        cacheInvalidate(cacheKeys.customerInvoiceItems(supabaseUserId));
      }
      setRejectOpen(false);
      setRejectedDone(true);
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'reject_rental_invoice' }, err);
      setRejectError(translateError(err, t));
      setRejectOpen(false);
    } finally {
      rejectingRef.current = false;
      setRejecting(false);
    }
  };
  // Bugs 17/19 — receipt-photo step state. The contract id exists the
  // moment acceptance succeeds; photos are uploaded against it, and
  // activation only runs after confirm_contract_receipt_photos.
  const [liveContractId, setLiveContractId] = useState<string | null>(null);
  const [receiptConfirmed, setReceiptConfirmed] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [finalizing, setFinalizing] = useState(false);
  // Current-phase activation recovery: when acceptance SUCCEEDED but
  // the follow-up activation RPC failed, the contract id is parked here
  // and the customer gets an explicit "retry activation" action. Retry
  // only calls the idempotent activation RPC — it never re-accepts the
  // invoice, so no second contract and no duplicate eligibility hold.
  const [pendingActivationId, setPendingActivationId] = useState<string | null>(null);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);
  const activationAttemptRef = useRef(0);

  // Loading first — never show the "invalid code" empty state while
  // the live invoice fetch is still resolving (Phase 9 production
  // safety: live mode must never fall back to demo data).
  if (resolving && !livePkg) {
    return (
      <>
        <Header title={t('review.title')} showBack />
        <Screen>
          <CardSkeleton />
          <div className="mt-4">
            <PageSkeleton rows={2} />
          </div>
        </Screen>
      </>
    );
  }

  if (!pkg || (!store && !livePkg)) {
    return (
      <>
        <Header title={t('review.title')} showBack />
        <Screen>
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('qr.invalidCode')}
            description={t('review.invalid.hint')}
            action={
              <Button size="sm" onClick={() => navigate('/scan', { replace: true })}>
                {t('qr.tryAgain')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  // Offer-decision lifecycle: rejected (now or previously) and expired
  // offers are terminal — no wizard, no approve/reject actions. The
  // server enforces the same rules (P0170/P0171/P0172); this is the
  // matching non-actionable presentation.
  if (offerRejected || (offerExpired && offerStatus !== 'accepted')) {
    const expired = !offerRejected;
    return (
      <>
        <Header title={t('review.title')} showBack />
        <Screen>
          <EmptyState
            tone="warn"
            icon={expired ? <ClockIcon size={22} /> : <XIcon size={22} />}
            title={t(expired ? 'review.decision.expiredTitle' : 'review.decision.rejectedTitle')}
            description={t(
              expired
                ? 'review.decision.expiredBody'
                : rejectedDone
                  ? 'review.decision.rejectedSuccessBody'
                  : 'review.decision.rejectedBody',
            )}
            action={
              <Button size="sm" onClick={() => navigate('/home', { replace: true })}>
                {t('eligibility.backHome')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  // Current-phase activation (ENABLE_PAYMENTS_AND_NOTES = false): flips
  // the freshly accepted contract to active with NO payment / note /
  // Nafath steps, then refreshes the caches that just changed so Home /
  // tracking immediately show "بدء الإيجار". Idempotent server-side.
  const activateContract = async (contractId: string) => {
    setActivating(true);
    setActivationError(null);
    activationAttemptRef.current += 1;
    try {
      await activateRentalWithoutPaymentAndNote(contractId);
      const uid = supabaseUserId;
      if (uid) {
        cacheInvalidate(cacheKeys.customerInvoices(uid));
        cacheInvalidate(cacheKeys.customerContracts(uid));
        cacheInvalidate(cacheKeys.customerInvoiceItems(uid));
        cacheInvalidate(cacheKeys.customerNotes(uid));
        cacheInvalidate(cacheKeys.eligibility(uid));
      }
      cacheInvalidate(cacheKeys.contract(contractId));
      // Eligibility hold changed — refresh the provider snapshot.
      void refreshAuthContext();
      setPendingActivationId(null);
      navigate(`/approval/${pkg.token}`, { replace: true });
    } catch (err) {
      const eventId = logEvent(
        'rental_activation_failed',
        'error',
        {
          op: 'activate_rental_without_payment_and_note',
          attempt: activationAttemptRef.current,
          paymentsAndNotesEnabled: ENABLE_PAYMENTS_AND_NOTES,
        },
        err,
      );
      setPendingActivationId(contractId);
      setActivationError(withSupportId(translateError(err, t), eventId));
    } finally {
      setActivating(false);
    }
  };

  const handleApproved = async () => {
    setAcceptError(null);
    if (configured && liveInvoiceId) {
      // Acceptance already succeeded (resume / earlier attempt) — never
      // re-accept. The guided flow continues at the photos step; the
      // photo-confirm CTA drives the (idempotent) activation from there.
      if (liveContractId || pendingActivationId) {
        setStep('photos');
        return;
      }
      try {
        const contractId = await acceptRentalInvoice(liveInvoiceId);
        // Phase 4B: acceptance flipped the invoice status and created
        // the contract — drop the cached customer lists NOW, so even
        // if the follow-up steps fail the lists never serve the
        // stale pre-acceptance rows within their TTL.
        if (supabaseUserId) {
          cacheInvalidate(cacheKeys.customerInvoices(supabaseUserId));
          cacheInvalidate(cacheKeys.customerContracts(supabaseUserId));
          cacheInvalidate(cacheKeys.customerInvoiceItems(supabaseUserId));
        }
        if (!ENABLE_PAYMENTS_AND_NOTES) {
          // Bugs 17/19: the guided flow moves IMMEDIATELY to the item
          // receipt-photography step. Activation is deferred until the
          // photos are uploaded (≥1) and confirmed — enforced again
          // server-side by the P0117 gate in the activation RPC.
          setLiveContractId(contractId);
          setStep('photos');
          return;
        }
        navigate(`/approval/${pkg.token}`, { replace: true });
      } catch (err) {
        const eventId = logEvent(
          'rental_accept_failed',
          'error',
          { op: 'accept_rental_invoice', paymentsAndNotesEnabled: ENABLE_PAYMENTS_AND_NOTES },
          err,
        );
        setAcceptError(withSupportId(translateError(err, t), eventId));
      }
      return;
    }
    // Demo mode: same guided-flow shape — the receipt-photos step comes
    // before the demo approval is recorded.
    setStep('photos');
  };

  // Photos-step final action: confirm the photos (locks them), then
  // activate. Debounced here; the confirm RPC is idempotent and the
  // activation RPC row-locks, so a double submission can never confirm
  // or activate twice.
  const handleFinalizePhotos = async () => {
    if (finalizing) return;
    setReceiptError(null);
    setFinalizing(true);
    try {
      if (configured && liveContractId) {
        if (!receiptConfirmed) {
          await confirmContractReceiptPhotos(liveContractId);
          setReceiptConfirmed(true);
          // The contract row changed (receipt_photos_confirmed_at) —
          // drop the cached entity so revisits within the TTL see it.
          cacheInvalidate(cacheKeys.contract(liveContractId));
        }
        await activateContract(liveContractId);
      } else {
        // Demo mode: record the demo approval and hand off, exactly
        // where the demo flow used to do it.
        approvePackage(pkg.token);
        navigate(`/approval/${pkg.token}`, { replace: true });
      }
    } catch (err) {
      const eventId = logEvent(
        'rpc_failure',
        'error',
        { op: 'confirm_receipt_photos' },
        err,
      );
      setReceiptError(withSupportId(translateError(err, t), eventId));
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <>
      <Header title={t('review.title')} showBack />
      <ReviewStepper active={step} />
      <Screen padded={false} className="bg-canvas">
        <div className="px-4 pt-4 pb-28 space-y-4">
          {/* The generic "بداية إيجار" framing band was removed from
              EVERY stage (approved review cleanup) — each step begins
              directly with its actual content. */}
          {/* The embedded rental-journey timeline was removed here —
              the ReviewStepper above is the ONLY step indicator on the
              review experience (approved journey simplification). */}
          {step === 'invoice' && <InvoiceStep pkg={pkg} />}
          {step === 'contract' && (
            <ContractStep
              pkg={pkg}
              lessorName={lessorName}
              lesseeName={lesseeName}
              partyIds={{
                lessorLegalName,
                lessorCr,
                lesseeLegalName,
                lesseeNationalId,
              }}
              partyIncomplete={partyIncomplete}
            />
          )}
          {step === 'confirm' && (
            <ConfirmStep
              pkg={pkg}
              userName={lesseeName ?? undefined}
              onApproved={handleApproved}
              blocked={partyIncomplete}
              onRejectRequest={
                configured && liveInvoiceId ? () => setRejectOpen(true) : undefined
              }
            />
          )}
          {step === 'confirm' && rejectError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-4 py-3 text-[12.5px] text-danger-700 leading-relaxed">
              {rejectError}
            </div>
          )}
          {step === 'photos' && (
            <ReceiptPhotosStep
              live={configured && Boolean(liveContractId)}
              contractId={liveContractId}
              locked={receiptConfirmed}
              finalizing={finalizing || activating}
              onFinalize={handleFinalizePhotos}
            />
          )}
          {receiptError && (
            <div
              role="alert"
              className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed"
            >
              {receiptError}
            </div>
          )}
          {acceptError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
              {acceptError}
            </div>
          )}
          {/* Explicit activation recovery: acceptance succeeded but
              activation failed — the customer retries the idempotent
              activation only, never the whole review flow. On the
              photos step the step's own locked CTA is the retry
              control, so only the error text renders there. */}
          {pendingActivationId && activationError && (
            <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/25 p-4 space-y-3">
              <div className="text-[13px] font-semibold text-warn-700 leading-tight">
                {t('review.activation.failedTitle')}
              </div>
              <p className="text-[12px] text-ink-600 leading-relaxed">
                {activationError}
              </p>
              {step !== 'photos' && (
                <Button
                  variant="primary"
                  size="md"
                  block
                  loading={activating}
                  disabled={activating}
                  onClick={() => void activateContract(pendingActivationId)}
                >
                  {t('review.activation.retryCta')}
                </Button>
              )}
            </div>
          )}
        </div>
      </Screen>

      <StepFooter
        step={step}
        onBack={() => {
          const back: Record<ReviewStepKey, ReviewStepKey | null> = {
            invoice: null,
            contract: 'invoice',
            confirm: 'contract',
            // Point of no return: acceptance already ran — the wizard
            // never navigates back out of the photos step.
            photos: null,
          };
          const prev = back[step];
          if (prev) setStep(prev);
          else navigate(-1);
        }}
        onNext={() => {
          const next: Record<ReviewStepKey, ReviewStepKey | null> = {
            invoice: 'contract',
            contract: 'confirm',
            confirm: null,
            photos: null,
          };
          const nxt = next[step];
          if (nxt) setStep(nxt);
        }}
      />

      <ConfirmSheet
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={() => void handleReject()}
        title={t('review.decision.confirmTitle')}
        description={t('review.decision.confirmBody')}
        confirmLabel={rejecting ? t('review.decision.rejecting') : t('review.decision.confirmCta')}
        cancelLabel={t('review.decision.cancelCta')}
        icon={<AlertIcon size={22} />}
        tone="danger"
        loading={rejecting}
      />
    </>
  );
}

/* --------- Shared header card --------- */

function ReviewHero({ pkg }: { pkg: ScannedPackage }) {
  const t = useT();
  const { locale, formatDate } = useI18n();
  const { stores } = useStore();
  const store = stores.find((s) => s.id === pkg.storeId);
  const branch = store?.branches.find((b) => b.id === pkg.branchId);
  if (!store) return null;

  return (
    <Card padded className="flex items-center gap-3">
      <StoreLogo store={store} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-semibold text-ink-400 uppercase tracking-wide">
            {t('review.partner')}
          </span>
          {store.verified && (
            <StatusChip tone="gold" dot label={t('stores.verified')} />
          )}
        </div>
        <div className="text-[14.5px] font-semibold text-ink-900 truncate">
          {store.name[locale]}
        </div>
        {branch && (
          <div className="mt-0.5 text-[12px] text-ink-500 truncate">
            {t('review.branch')} · {branch.name[locale]}
          </div>
        )}
        <div className="mt-1 text-[11.5px] text-ink-400">
          {t('review.issuedOn')} <span className="num">{formatDate(pkg.issuedAt)}</span>
        </div>
      </div>
    </Card>
  );
}

/* --------- Invoice step --------- */

function InvoiceStep({ pkg }: { pkg: ScannedPackage }) {
  const t = useT();
  const { locale, formatCurrency, formatDate } = useI18n();
  const itemsTotal = pkg.items.reduce(
    (sum, it) => sum + (it.unitValue ?? 0) * it.qty,
    0,
  );

  return (
    <>
      <ReviewHero pkg={pkg} />

      <Card padded>
        <div className="flex items-start gap-2.5">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
            <ReceiptIcon size={18} />
          </span>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink-900">{t('review.invoice.title')}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-500 leading-relaxed">
              {t('review.invoice.subtitle')}
            </div>
          </div>
        </div>
      </Card>

      <section>
        <SectionHeader title={t('review.invoice.rentalDetails')} />
        <Card padded className="space-y-3">
          <Field label={t('review.invoice.purpose')} value={pkg.rental.purpose[locale]} />
          <CardDivider />
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={t('review.invoice.pickupOn')}
              value={<span className="num">{formatDate(pkg.rental.pickupDate)}</span>}
            />
            <Field
              label={t('review.invoice.returnOn')}
              value={<span className="num">{formatDate(pkg.rental.returnDate)}</span>}
            />
          </div>
          <Field
            label={t('review.invoice.duration')}
            value={
              <span className="num">
                {t('review.invoice.durationValue', { days: pkg.rental.durationDays })}
              </span>
            }
          />
          <Field
            label={t('review.invoice.pickupLocation')}
            value={
              <span className="inline-flex items-start gap-1.5">
                <MapPinIcon size={14} className="mt-0.5 shrink-0 text-ink-400" />
                {pkg.rental.pickupLocation[locale]}
              </span>
            }
          />
        </Card>
      </section>

      <section>
        <SectionHeader
          title={t('review.invoice.items')}
          action={
            <span className="text-[12px] text-ink-400 font-medium">
              {t('review.invoice.itemsCount', { count: pkg.items.length })}
            </span>
          }
        />
        <Card padded={false} className="divide-y divide-canvas-200/80">
          {pkg.items.map((it) => (
            <div key={it.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-ink-900">{it.name[locale]}</div>
                  {it.serial && (
                    <div className="mt-0.5 text-[11.5px] text-ink-400 num">
                      {t('review.invoice.serial')}: {it.serial}
                    </div>
                  )}
                </div>
                <div className="text-end shrink-0">
                  <div className="text-[13px] font-semibold text-ink-900 num">
                    {it.unitValue != null ? formatCurrency(it.unitValue) : '—'}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">
                    {t('review.invoice.qty')}: <span className="num">{it.qty}</span>
                  </div>
                </div>
              </div>
              {it.attributes && it.attributes.length > 0 && (
                <dl className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl2 bg-canvas-100/70 px-3.5 py-3">
                  {it.attributes.map((a, i) => (
                    <div key={i} className="min-w-0">
                      <dt className="text-[10.5px] uppercase tracking-wide text-ink-400 truncate">
                        {a.label[locale]}
                      </dt>
                      <dd className="mt-0.5 text-[12px] font-semibold text-ink-900 truncate">
                        {a.value[locale]}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          ))}
          <div className="p-4 flex items-center justify-between bg-canvas-100/60">
            <span className="text-[12.5px] text-ink-500 font-medium">
              {t('review.invoice.unitValue')}
            </span>
            <span className="text-[14px] font-bold text-ink-900 num">
              {formatCurrency(itemsTotal)}
            </span>
          </div>
        </Card>
      </section>

      <section>
        <SectionHeader title={t('review.invoice.fees')} />
        <Card padded className="space-y-2">
          <FeeRow label={t('review.invoice.rentalTotal')} amount={pkg.fees.rentalTotal} />
          <FeeRow label={t('review.invoice.deposit')} amount={pkg.fees.deposit} />
          {/* SCRUM-42 Bug 10: the "Insurance" line item was confusing —
              there isn't an explicit coverage product. The customer's
              financial exposure to damage is the original item value,
              which is already covered by the promissory note. Hidden
              here on purpose; the contract clauses still describe the
              damage rule clearly. */}
          <FeeRow label={t('review.invoice.vat')} amount={pkg.fees.vat} muted />
          <div className="h-px bg-canvas-200/80 my-1" />
          <div className="flex items-center justify-between">
            <span className="text-[13px] font-semibold text-ink-900">
              {t('review.invoice.grandTotal')}
            </span>
            <span className="text-[17px] font-bold text-ink-900 num">
              {formatCurrency(pkg.fees.grandTotal)}
            </span>
          </div>
        </Card>
      </section>
    </>
  );
}

function FeeRow({ label, amount, muted }: { label: string; amount: number; muted?: boolean }) {
  const { formatCurrency } = useI18n();
  return (
    <div className="flex items-center justify-between text-[13px]">
      <span className={muted ? 'text-ink-400' : 'text-ink-700'}>{label}</span>
      <span className={cn('num font-semibold', muted ? 'text-ink-500' : 'text-ink-900')}>
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

/* --------- Contract step --------- */

function ContractStep({
  pkg,
  lessorName,
  lesseeName,
  partyIds,
  partyIncomplete,
}: {
  pkg: ScannedPackage;
  /** Parties — resolved by the parent from live merchant + profile
   *  data (demo store/session as demo-mode fallback). */
  lessorName: string | null;
  lesseeName: string | null;
  /** Official contracting identifiers — real persisted values only;
   *  null renders '—' and (in live mode) blocks approval. */
  partyIds: {
    lessorLegalName: string | null;
    lessorCr: string | null;
    lesseeLegalName: string | null;
    lesseeNationalId: string | null;
  };
  partyIncomplete: boolean;
}) {
  const t = useT();
  const { locale, formatCurrency } = useI18n();
  const { stores } = useStore();
  const store = stores.find((s) => s.id === pkg.storeId);
  const [open, setOpen] = useState<string>(pkg.contract.clauses[0]?.id ?? '');

  return (
    <>
      <ReviewHero pkg={pkg} />

      <Card padded>
        <div className="flex items-start gap-2.5">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
            <DocIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink-900">{t('review.contract.title')}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-500 leading-relaxed">
              {t('review.contract.subtitle')}
            </div>
          </div>
          <StatusChip tone="neutral" dot={false} label={<span className="num">{pkg.contract.reference}</span>} />
        </div>
      </Card>

      <section>
        <SectionHeader title={t('review.contract.parties')} />
        <Card padded className="space-y-3">
          {/* Lessor — official business identity */}
          <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.12em]">
            {t('review.contract.lessor')}
          </div>
          <Field
            label={t('review.contract.businessName')}
            value={partyIds.lessorLegalName ?? lessorName ?? store?.name[locale] ?? '—'}
          />
          <Field
            label={t('review.contract.crNumber')}
            value={
              partyIds.lessorCr ? (
                <span className="num" dir="ltr">{partyIds.lessorCr}</span>
              ) : (
                '—'
              )
            }
          />
          <CardDivider />
          {/* Lessee — official personal identity */}
          <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.12em]">
            {t('review.contract.lessee')}
          </div>
          <Field
            label={t('review.contract.partyFullName')}
            value={partyIds.lesseeLegalName ?? lesseeName ?? '—'}
          />
          <Field
            label={t('review.contract.partyNationalId')}
            value={
              partyIds.lesseeNationalId ? (
                <span className="num" dir="ltr">{partyIds.lesseeNationalId}</span>
              ) : (
                '—'
              )
            }
          />
        </Card>
        {partyIncomplete && (
          <div className="mt-2.5 rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-4 py-3 text-[12.5px] text-danger-700 leading-relaxed">
            {t('errors.contractPartyIncomplete')}
          </div>
        )}
      </section>

      <section>
        <SectionHeader title={t('review.contract.clauses')} />
        <div className="space-y-2.5">
          {pkg.contract.clauses.map((c, idx) => {
            const isOpen = open === c.id;
            return (
              <Card key={c.id} padded={false}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? '' : c.id)}
                  className="w-full flex items-center gap-3 p-4 text-start"
                >
                  <span className="h-9 w-9 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center text-[12.5px] font-semibold num shrink-0">
                    {idx + 1}
                  </span>
                  <span className="flex-1 min-w-0 text-[14.5px] font-semibold text-ink-900 tracking-tight">
                    {c.title[locale]}
                  </span>
                  <span
                    className={cn(
                      'h-6 w-6 rounded-full bg-canvas-100 text-ink-500 grid place-items-center transition-transform',
                      isOpen && 'rotate-180',
                    )}
                    aria-hidden
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </span>
                </button>
                {isOpen && (
                  <div className="px-4 pb-4 text-[13px] text-ink-700 leading-relaxed">
                    {c.body[locale]}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </section>

      <section>
        <SectionHeader title={t('review.contract.damagesTitle')} />
        <Card padded>
          <div className="flex items-start gap-2 mb-3">
            <AlertIcon size={16} className="mt-0.5 shrink-0 text-warn-600" />
            <p className="text-[12.5px] text-ink-600 leading-relaxed">
              {t('review.contract.damagesHint')}
            </p>
          </div>
          <div className="grid grid-cols-1 gap-2.5">
            <DamageRow
              tone="danger"
              label={t('review.contract.nonReturn')}
              amount={formatCurrency(pkg.damages.nonReturn)}
            />
            <DamageRow
              tone="warn"
              label={t('review.contract.partialDamage')}
              amount={formatCurrency(pkg.damages.partialDamage)}
            />
            <DamageRow
              tone="danger"
              label={t('review.contract.totalDamage')}
              amount={formatCurrency(pkg.damages.totalDamage)}
            />
          </div>
          {/* The percentage/per-day summary that used to sit here was a
              duplicate of the الضرر الجزئي and التأخر في الإرجاع terms
              above — removed so the amounts are stated once, in the
              contract terms. */}
        </Card>
      </section>

      <div className="rounded-xl2 bg-gold-50 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-gold-700">
        <InfoIcon size={16} className="mt-0.5 shrink-0" />
        <span className="leading-relaxed">{t('review.contract.readAll')}</span>
      </div>
    </>
  );
}

function DamageRow({
  label,
  amount,
  tone,
}: {
  label: string;
  amount: string;
  tone: 'warn' | 'danger';
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between rounded-xl px-3.5 py-2.5 ring-1',
        tone === 'warn' && 'bg-warn-50 ring-warn-500/20',
        tone === 'danger' && 'bg-danger-50 ring-danger-500/20',
      )}
    >
      <span
        className={cn(
          'text-[13px] font-semibold',
          tone === 'warn' && 'text-warn-600',
          tone === 'danger' && 'text-danger-600',
        )}
      >
        {label}
      </span>
      <span className="num text-[14px] font-bold text-ink-900">{amount}</span>
    </div>
  );
}

/* --------- Note step --------- */

function NoteStep({ pkg }: { pkg: ScannedPackage }) {
  const t = useT();
  const { locale, formatCurrency, formatDate } = useI18n();
  const { session } = useStore();

  return (
    <>
      <ReviewHero pkg={pkg} />

      <Card padded>
        <div className="flex items-start gap-2.5">
          <span className="h-9 w-9 shrink-0 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
            <GavelIcon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink-900">{t('review.note.title')}</div>
            <div className="mt-0.5 text-[12.5px] text-ink-500 leading-relaxed">
              {t('review.note.subtitle')}
            </div>
          </div>
          <StatusChip tone="gold" dot={false} label={<span className="num">{pkg.note.reference}</span>} />
        </div>
      </Card>

      {/* Note preview card — premium look */}
      <div className="relative overflow-hidden rounded-xl3 p-6 text-white shadow-plush bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900">
        <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
        <div aria-hidden className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-gold-500/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11.5px] font-semibold">
              <BadgeCheckIcon size={13} />
              {t('review.note.summary')}
            </span>
            <span className="num text-[11.5px] text-white/60">{pkg.note.reference}</span>
          </div>
          <div className="mt-4">
            <div className="text-[11.5px] text-white/60 uppercase tracking-wide">
              {t('review.note.principal')}
            </div>
            <div className="mt-1 text-[28px] font-bold num leading-none">
              {formatCurrency(pkg.note.principal)}
            </div>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 text-[12.5px]">
            <DarkField label={t('review.note.beneficiary')} value={pkg.note.beneficiary[locale]} />
            <DarkField
              label={t('review.note.dueDate')}
              value={<span className="num">{formatDate(pkg.note.dueDate)}</span>}
            />
            <DarkField label={t('review.note.place')} value={pkg.note.place[locale]} />
            <DarkField
              label={t('review.contract.lessee')}
              value={session?.fullName ?? '—'}
            />
          </div>
        </div>
      </div>

      <section>
        <SectionHeader title={t('review.note.purpose')} />
        <Card padded>
          <p className="text-[13.5px] text-ink-700 leading-relaxed">{pkg.note.purpose[locale]}</p>
        </Card>
      </section>

      <div className="rounded-xl2 bg-ink-900/95 px-4 py-3.5 flex items-start gap-3 text-[12.5px] text-white">
        <span className="h-8 w-8 shrink-0 rounded-lg bg-white/10 grid place-items-center ring-1 ring-white/15">
          <ShieldIcon size={16} />
        </span>
        <div className="min-w-0">
          <div className="font-semibold">{t('review.confirm.nafith')}</div>
          <div className="mt-0.5 text-white/70 leading-relaxed">
            {t('review.note.disclaimer')}
          </div>
        </div>
      </div>
    </>
  );
}

function DarkField({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-white/55">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-white truncate">{value}</div>
    </div>
  );
}

/* --------- Confirm step --------- */

function ConfirmStep({
  pkg,
  userName,
  onApproved,
  blocked = false,
  onRejectRequest,
}: {
  pkg: ScannedPackage;
  userName: string | undefined;
  /** May reject (live accept RPC) — handleSign awaits it so the
   *  processing flag resets when acceptance fails. */
  onApproved: () => void | Promise<void>;
  /** Party identity incomplete (live mode) — approval is disabled and
   *  the business message shows; the accept RPC would raise P0150 for
   *  the same condition anyway. */
  blocked?: boolean;
  /** Opens the reject confirmation (live offers only). */
  onRejectRequest?: () => void;
}) {
  const t = useT();
  const { formatCurrency } = useI18n();
  const [accepted, setAccepted] = useState<[boolean, boolean, boolean]>([false, false, false]);
  const [processing, setProcessing] = useState(false);

  const allAccepted = accepted.every(Boolean);

  const toggle = useCallback((i: 0 | 1 | 2) => {
    setAccepted((prev) => {
      const next = [...prev] as [boolean, boolean, boolean];
      next[i] = !next[i];
      return next;
    });
  }, []);

  const handleSign = () => {
    if (!allAccepted || processing || blocked) return;
    setProcessing(true);
    // Calm 600ms still moment — the content above the button quiets while
    // the system "records" the rental, then we hand off to Approval where
    // the halo + stamp animations fire. Long enough to feel deliberate,
    // short enough that the user doesn't wait. Sits in the 0.3–0.6s sweet
    // spot called out by the design brief.
    //
    // `processing` MUST reset when onApproved rejects or returns after a
    // failed accept — otherwise the sign button stays disabled until a
    // manual reload. On success the navigate() unmounts this component,
    // making the reset a harmless no-op.
    window.setTimeout(() => {
      void Promise.resolve(onApproved()).finally(() => setProcessing(false));
    }, 600);
  };

  return (
    <>
      {/* Commitment headline — names the decision. */}
      <section
        className={cn(
          'rounded-xl3 bg-white hairline shadow-soft p-5 animate-reveal-up transition-opacity duration-500',
          processing && 'opacity-50',
        )}
      >
        <div className="flex items-start gap-3">
          <span className="h-11 w-11 shrink-0 rounded-2xl bg-lavender-50 text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
            <SignatureIcon size={20} />
          </span>
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.14em]">
              {t('review.confirm.eyebrow')}
            </div>
            <div className="mt-1.5 editorial-title text-[18px] text-ink-900 leading-snug">
              {t('review.confirm.commitmentTitle')}
            </div>
            <div className="mt-2 text-[12.5px] text-ink-500 leading-relaxed">
              {t(ENABLE_PAYMENTS_AND_NOTES ? 'review.confirm.commitmentBody' : 'review.confirm.commitmentBodySimple')}
            </div>
          </div>
        </div>
      </section>

      {/* The three core facts of the agreement, no headers, calm rhythm. */}
      <Card
        padded
        className={cn(
          'space-y-3 animate-reveal-up transition-opacity duration-500',
          processing && 'opacity-50',
        )}
        style={{ animationDelay: '80ms' }}
      >
        <Field label={t('review.contract.lessee')} value={userName ?? '—'} />
        <CardDivider />
        {/* Data-consistency fix: in the current phase the amount the
            customer commits to is the invoice's persisted total — the
            same figure the merchant issued and the invoice step shows.
            The note principal (total + deposit) belongs to the flag-on
            promissory-note flow only. */}
        <Field
          label={t(ENABLE_PAYMENTS_AND_NOTES ? 'review.note.principal' : 'review.invoice.grandTotal')}
          value={
            <span className="num">
              {formatCurrency(
                ENABLE_PAYMENTS_AND_NOTES ? pkg.note.principal : pkg.fees.grandTotal,
              )}
            </span>
          }
        />
        <CardDivider />
        <Field
          label={t('review.contract.reference')}
          value={<span className="num">{pkg.contract.reference}</span>}
        />
      </Card>

      {/* Consent rows — kept, label tightened on the page. */}
      <Card
        padded
        className={cn(
          'space-y-2.5 animate-reveal-up transition-opacity duration-500',
          processing && 'opacity-50',
        )}
        style={{ animationDelay: '160ms' }}
      >
        <ConsentRow
          checked={accepted[0]}
          onChange={() => toggle(0)}
          label={t('review.confirm.consent1')}
        />
        <ConsentRow
          checked={accepted[1]}
          onChange={() => toggle(1)}
          label={t('review.confirm.consent2')}
        />
        <ConsentRow
          checked={accepted[2]}
          onChange={() => toggle(2)}
          label={t(ENABLE_PAYMENTS_AND_NOTES ? 'review.confirm.consent3' : 'review.confirm.consent3Simple')}
        />
      </Card>

      {/* Quiet breathing space + the decision button. The breath line is
          a single 1px lavender hairline — visual pause before the act. */}
      <div className="pt-2 space-y-3 animate-reveal-up" style={{ animationDelay: '240ms' }}>
        <div className="h-px bg-lavender-200/60 mx-1" aria-hidden />
        {blocked && (
          <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-4 py-3 text-[12.5px] text-danger-700 leading-relaxed">
            {t('errors.contractPartyIncomplete')}
          </div>
        )}
        <Button
          variant="primary"
          size="lg"
          block
          onClick={handleSign}
          disabled={!allAccepted || processing || blocked}
          loading={processing}
          leading={!processing ? <SignatureIcon size={18} /> : undefined}
        >
          {processing ? t('review.confirm.processing') : t(ENABLE_PAYMENTS_AND_NOTES ? 'review.confirm.commitAction' : 'review.confirm.commitActionSimple')}
        </Button>
        {onRejectRequest && !processing && (
          <button
            type="button"
            onClick={onRejectRequest}
            className="w-full h-11 rounded-xl2 bg-white text-danger-600 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-danger-500/30 hover:bg-danger-50 transition-colors"
          >
            {t('review.decision.rejectCta')}
          </button>
        )}
        {processing ? (
          <p
            className="text-center text-[11px] font-semibold text-lavender-700 uppercase tracking-[0.14em] animate-reveal-up"
            aria-live="polite"
          >
            {t(ENABLE_PAYMENTS_AND_NOTES ? 'review.confirm.recording' : 'review.confirm.recordingSimple')}
          </p>
        ) : (
          <p className="text-center text-[11.5px] text-ink-400 leading-relaxed px-4">
            {t(ENABLE_PAYMENTS_AND_NOTES ? 'review.confirm.afterHint' : 'review.confirm.afterHintSimple')}
          </p>
        )}
      </div>
    </>
  );
}

function ConsentRow({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onChange}
      className={cn(
        'w-full flex items-start gap-3 text-start rounded-xl p-3 transition-colors ring-1',
        checked ? 'bg-gold-50 ring-gold-300/40' : 'bg-white ring-canvas-200 hover:bg-canvas-100',
      )}
    >
      <span
        className={cn(
          'h-5 w-5 shrink-0 rounded-md grid place-items-center transition-colors mt-0.5',
          checked ? 'bg-lavender-400 text-white' : 'bg-canvas-200 text-transparent',
        )}
      >
        <CheckIcon size={13} strokeWidth={3} />
      </span>
      <span className="text-[13px] font-medium text-ink-900 leading-relaxed">{label}</span>
    </button>
  );
}

/* --------- Shared field --------- */

function Field({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">{value}</div>
    </div>
  );
}

/* --------- Footer --------- */

// Test-fix Bug 12 — explicit previous/next step navigation:
//   * Previous renders ONLY when a previous step exists (hidden on the
//     first step; the header back remains the way to leave the flow).
//   * Next renders ONLY when a following step exists — the confirm
//     step has NO next arrow; the approval button inside the step is
//     the final action and stays the only primary.
//   * Arrows navigate between existing steps one at a time and never
//     submit or mutate anything.
//   * Arrow glyphs flip with the reading direction (AR RTL / EN LTR).
function StepFooter({
  step,
  onBack,
  onNext,
}: {
  step: ReviewStepKey;
  onBack: () => void;
  onNext: () => void;
}) {
  const t = useT();
  const { dir } = useI18n();
  // Photos step (Bugs 17/19): no wizard navigation at all — acceptance
  // already ran (going back would be misleading) and the step's own
  // confirm button is the final action. Bug 12's "no next on the final
  // action step" rule applies here exactly as on confirm.
  if (step === 'photos') return null;
  const prevButton = (
    <button
      type="button"
      onClick={onBack}
      className="flex-1 h-11 rounded-xl2 bg-white text-navy-700 font-bold text-[13.5px] ring-[1.5px] ring-inset ring-beige-300 hover:bg-beige-50 transition-colors inline-flex items-center justify-center gap-1.5"
    >
      <ArrowIcon
        size={13}
        className={cn('shrink-0', dir === 'ltr' && 'rotate-180')}
      />
      {t('review.nav.back')}
    </button>
  );
  if (step === 'confirm') {
    return (
      <div className="sticky bottom-0 z-20 border-t border-beige-200 bg-white/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex items-center gap-3">
        {prevButton}
        <div className="flex-[2] flex items-center gap-2 text-[11.5px] text-ink-400 min-w-0">
          <ClockIcon size={14} className="shrink-0" />
          <span>{t(ENABLE_PAYMENTS_AND_NOTES ? 'review.confirm.nafithNote' : 'review.confirm.footerSimple')}</span>
        </div>
      </div>
    );
  }
  // C09 footer — السابق on the START side (right in RTL, matching the
  // confirm-step footer), متابعة filling the end side. Flex order in
  // an RTL document places the FIRST child on the right, so السابق
  // must come first in the DOM.
  return (
    <div className="sticky bottom-0 z-20 border-t border-beige-200 bg-white/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex items-center gap-2.5">
      {step !== 'invoice' && prevButton}
      <Button
        variant="primary"
        className="flex-[2] !bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800"
        onClick={onNext}
        trailing={
          <ArrowIcon
            size={14}
            className={cn('shrink-0', dir === 'rtl' && 'rotate-180')}
          />
        }
      >
        {t('review.nav.next')}
      </Button>
    </div>
  );
}
