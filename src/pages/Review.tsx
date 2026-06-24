import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  EmptyState,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import {
  AlertIcon,
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
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  acceptRentalInvoice,
  fetchInvoiceByToken,
  fetchMerchant,
  synthesizePackageFromInvoice,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { ScannedPackage } from '@/lib/data';
import { ReviewStepper, type ReviewStepKey } from '@/components/review/ReviewStepper';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { deriveJourneyFromInvoice, type JourneyStep } from '@/lib/rentalJourney';
import { StoreLogo } from '@/components/stores/StoreLogo';
import { IdentityVerificationSheet } from '@/components/identity/IdentityVerificationSheet';
import { cn } from '@/lib/cn';

export default function Review() {
  const t = useT();
  const { locale } = useI18n();
  const { token } = useParams();
  const navigate = useNavigate();
  const { scans, stores, session, approvePackage } = useStore();
  const { configured, profile, refresh } = useSupabaseAuth();
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
        if (cancelled) return;
        setLivePkg(synthesizePackageFromInvoice(res.invoice, res.items, merchant));
        setLiveInvoiceId(res.invoice.id);
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error('[applux] fetchInvoiceByToken failed', err);
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

  const [step, setStep] = useState<ReviewStepKey>('invoice');
  const [acceptError, setAcceptError] = useState<string | null>(null);
  // Identity verification — opens the bottom sheet when the customer
  // tries to commit but their profile isn't identity_verified yet. The
  // sheet's onVerified callback retries the original acceptance.
  const [identityOpen, setIdentityOpen] = useState(false);

  if (!pkg || (!store && !livePkg)) {
    return (
      <>
        <Header title={t('review.title')} showBack />
        <Screen>
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={resolving ? t('review.title') : t('qr.invalidCode')}
            description={resolving ? t('review.title') : t('review.invalid.hint')}
            action={
              !resolving && (
                <Button size="sm" onClick={() => navigate('/scan', { replace: true })}>
                  {t('qr.tryAgain')}
                </Button>
              )
            }
          />
        </Screen>
      </>
    );
  }

  // Tries to flip the invoice to 'accepted' (creating the contract).
  // The DB-side gate (Phase 8e) raises P0004 if the customer isn't
  // identity-verified — we surface that as the IdentityVerificationSheet
  // instead of a generic error, so the customer can complete Nafath
  // inline and retry without losing context.
  const tryAccept = async () => {
    if (!configured || !liveInvoiceId) {
      approvePackage(pkg.token);
      navigate(`/approval/${pkg.token}`, { replace: true });
      return;
    }
    try {
      await acceptRentalInvoice(liveInvoiceId);
      navigate(`/approval/${pkg.token}`, { replace: true });
    } catch (err) {
      // Postgres raises P0004 from accept_rental_invoice when the
      // caller's profile isn't identity_verified yet. Route the
      // customer through the Nafath sheet, then retry.
      const code = (err as { code?: string } | null)?.code;
      if (code === 'P0004') {
        setIdentityOpen(true);
        return;
      }
      const msg = err instanceof Error ? err.message : 'Failed to accept invoice.';
      setAcceptError(msg);
    }
  };

  const handleApproved = async () => {
    setAcceptError(null);
    // Fast path — skip the RPC round-trip if the local profile already
    // says the customer is unverified. Same UX, less server chatter.
    if (configured && profile && !profile.identity_verified) {
      setIdentityOpen(true);
      return;
    }
    await tryAccept();
  };

  const handleIdentityVerified = async () => {
    setAcceptError(null);
    // Pull the freshly-updated identity_verified flag onto the client
    // so any other gate (profile chip, etc.) re-renders, then retry
    // the acceptance.
    try {
      await refresh();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[lend] profile refresh after identity verification failed', err);
    }
    await tryAccept();
  };

  const journeySteps: JourneyStep[] = deriveJourneyFromInvoice(
    {
      issued_at: pkg.issuedAt,
      created_at: pkg.issuedAt,
      status: 'issued',
    },
    { viewerIsReviewing: true },
  );

  return (
    <>
      <Header title={t('review.title')} showBack />
      <ReviewStepper active={step} />
      <Screen padded={false} className="bg-canvas">
        <div className="px-4 pt-4 pb-28 space-y-4">
          {/* Framing band — names what the customer is about to do.
              Calm, single sentence, no CTA. Sets the room before the
              decision. */}
          <section className="rounded-xl3 bg-lavender-50/60 ring-1 ring-lavender-200/60 p-5 animate-reveal-up">
            <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.14em]">
              {t('review.framing.eyebrow')}
            </div>
            <p className="mt-2 editorial-title text-[17px] text-ink-900 leading-snug">
              {t('review.framing.title', {
                boutique: store ? store.name[locale] : t('review.framing.boutiqueFallback'),
              })}
            </p>
            <p className="mt-2 text-[12.5px] text-ink-500 leading-relaxed">
              {t('review.framing.body')}
            </p>
          </section>

          <RentalJourneyTimeline variant="lead" steps={journeySteps} />
          {step === 'invoice' && <InvoiceStep pkg={pkg} />}
          {step === 'contract' && <ContractStep pkg={pkg} />}
          {step === 'confirm' && (
            <ConfirmStep
              pkg={pkg}
              userName={session?.fullName}
              identityRequired={
                configured && profile ? !profile.identity_verified : false
              }
              onApproved={handleApproved}
            />
          )}
          {acceptError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
              {acceptError}
            </div>
          )}
        </div>
      </Screen>

      <IdentityVerificationSheet
        open={identityOpen}
        onClose={() => setIdentityOpen(false)}
        onVerified={handleIdentityVerified}
      />

      <StepFooter
        step={step}
        onBack={() => {
          const back: Record<ReviewStepKey, ReviewStepKey | null> = {
            invoice: null,
            contract: 'invoice',
            confirm: 'contract',
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
          };
          const nxt = next[step];
          if (nxt) setStep(nxt);
        }}
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
  const itemsTotal = pkg.items.reduce((sum, it) => sum + it.unitValue * it.qty, 0);

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
                    {formatCurrency(it.unitValue)}
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

function ContractStep({ pkg }: { pkg: ScannedPackage }) {
  const t = useT();
  const { locale, formatCurrency } = useI18n();
  const { stores, session } = useStore();
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
          <Field label={t('review.contract.lessor')} value={store?.name[locale] ?? '—'} />
          <CardDivider />
          <Field
            label={t('review.contract.lessee')}
            value={session?.fullName ?? '—'}
          />
        </Card>
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
          <div className="mt-3.5 rounded-xl2 bg-canvas-100 p-3.5 text-[12px] text-ink-500 leading-relaxed">
            {pkg.damages.note[locale]}
          </div>
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
  identityRequired,
  onApproved,
}: {
  pkg: ScannedPackage;
  userName: string | undefined;
  identityRequired: boolean;
  onApproved: () => void;
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
    if (!allAccepted || processing) return;
    setProcessing(true);
    // Calm 600ms still moment — the content above the button quiets while
    // the system "records" the rental, then we hand off to Approval where
    // the halo + stamp animations fire. Long enough to feel deliberate,
    // short enough that the user doesn't wait. Sits in the 0.3–0.6s sweet
    // spot called out by the design brief.
    window.setTimeout(onApproved, 600);
  };

  return (
    <>
      {identityRequired && (
        <section
          className="rounded-xl3 bg-warn-50 ring-1 ring-warn-500/30 p-4 animate-reveal-up"
          role="status"
        >
          <div className="flex items-start gap-3">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-white text-warn-700 grid place-items-center ring-1 ring-warn-500/30">
              <ShieldIcon size={18} />
            </span>
            <div className="min-w-0">
              <div className="text-[13.5px] font-semibold text-warn-700 tracking-tight">
                {t('identity.required.title')}
              </div>
              <p className="mt-1 text-[12.5px] text-ink-700 leading-relaxed">
                {t('identity.required.body')}
              </p>
            </div>
          </div>
        </section>
      )}

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
              {t('review.confirm.commitmentBody')}
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
        <Field
          label={t('review.note.principal')}
          value={<span className="num">{formatCurrency(pkg.note.principal)}</span>}
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
          label={t('review.confirm.consent3')}
        />
      </Card>

      {/* Quiet breathing space + the decision button. The breath line is
          a single 1px lavender hairline — visual pause before the act. */}
      <div className="pt-2 space-y-3 animate-reveal-up" style={{ animationDelay: '240ms' }}>
        <div className="h-px bg-lavender-200/60 mx-1" aria-hidden />
        <Button
          variant="primary"
          size="lg"
          block
          onClick={handleSign}
          disabled={!allAccepted || processing}
          loading={processing}
          leading={
            !processing ? (
              identityRequired ? <ShieldIcon size={18} /> : <SignatureIcon size={18} />
            ) : undefined
          }
        >
          {processing
            ? t('review.confirm.processing')
            : identityRequired
              ? t('identity.required.cta')
              : t('review.confirm.commitAction')}
        </Button>
        {processing ? (
          <p
            className="text-center text-[11px] font-semibold text-lavender-700 uppercase tracking-[0.14em] animate-reveal-up"
            aria-live="polite"
          >
            {t('review.confirm.recording')}
          </p>
        ) : (
          <p className="text-center text-[11.5px] text-ink-400 leading-relaxed px-4">
            {t('review.confirm.afterHint')}
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
  if (step === 'confirm') {
    return (
      <div className="sticky bottom-0 z-20 border-t border-ink-100 bg-white/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
        <div className="flex items-center gap-2 text-[11.5px] text-ink-400">
          <ClockIcon size={14} />
          <span>{t('review.confirm.nafithNote')}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="sticky bottom-0 z-20 border-t border-ink-100 bg-white/95 backdrop-blur px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+12px)] flex items-center gap-2">
      <Button variant="secondary" className="flex-1" onClick={onBack}>
        {t('review.nav.back')}
      </Button>
      <Button variant="primary" className="flex-1" onClick={onNext}>
        {step === 'contract' ? t('review.nav.accept') : t('review.nav.next')}
      </Button>
    </div>
  );
}
