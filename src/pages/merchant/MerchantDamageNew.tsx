import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  ConfirmSheet,
  EmptyState,
  FormField,
  ImageLightbox,
  Input,
  SectionHeader,
  Textarea,
} from '@/components/ui';
import {
  AlertIcon,
  CameraIcon,
  CarIcon,
  CheckIcon,
  DocIcon,
  GavelIcon,
  ImageIcon,
  InfoIcon,
  PackageIcon,
  ReceiptIcon,
  SignatureIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  createDamageCase,
  fetchContractById,
  fetchMerchant,
  fetchProfile,
  uploadDamageEvidence,
  useSupabaseAuth,
  type DamageSeverity,
} from '@/lib/supabase';
import type { MerchantDamageSeverity, MerchantRental } from '@/lib/data';

type SeverityOption = {
  key: MerchantDamageSeverity;
  tone: 'warn' | 'danger' | 'dangerDeep';
  icon: ReactNode;
};

const SEVERITY_OPTIONS: SeverityOption[] = [
  { key: 'partial', tone: 'warn', icon: <GavelIcon size={18} /> },
  { key: 'total', tone: 'danger', icon: <AlertIcon size={18} /> },
  { key: 'non-return', tone: 'dangerDeep', icon: <PackageIcon size={18} /> },
];

const SEVERITY_STYLE: Record<SeverityOption['tone'], {
  iconBg: string;
  activeRing: string;
  activeBg: string;
  chip: string;
}> = {
  warn: {
    iconBg: 'bg-warn-50 text-warn-600',
    activeRing: 'ring-warn-500/60',
    activeBg: 'bg-warn-50/60',
    chip: 'bg-warn-50 text-warn-600',
  },
  danger: {
    iconBg: 'bg-danger-50 text-danger-600',
    activeRing: 'ring-danger-500/60',
    activeBg: 'bg-danger-50/60',
    chip: 'bg-danger-50 text-danger-600',
  },
  dangerDeep: {
    iconBg: 'bg-danger-50 text-danger-700',
    activeRing: 'ring-danger-600/70',
    activeBg: 'bg-danger-50',
    chip: 'bg-danger-50 text-danger-700',
  },
};

function invoiceRefFromContract(contractRef: string): string {
  return `INV-${contractRef.replace('CN-', '')}-LATEST`;
}

function suggestedClaim(
  severity: MerchantDamageSeverity,
  itemValue: number,
  liabilityTotal: number,
): number {
  if (severity === 'partial') return Math.round(itemValue * 0.3);
  if (severity === 'total') return itemValue;
  return liabilityTotal || itemValue;
}

export default function MerchantDamageNew() {
  const t = useT();
  const { formatCurrency } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals, reportDamage } = useStore();
  const supabaseAuth = useSupabaseAuth();
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Demo-store match first (uses short ids like 'MR-2026-031').
  const demoRental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );
  // Live fetch — this page was completely missing this. For real
  // contracts (UUIDs), demoRental is undefined and the page used to
  // synchronously redirect back to /merchant/rentals before any
  // fetch could run.
  const [liveRental, setLiveRental] = useState<MerchantRental | null>(null);
  const [resolving, setResolving] = useState<boolean>(() =>
    Boolean(supabaseAuth.configured && id && !demoRental),
  );

  useEffect(() => {
    if (!supabaseAuth.configured || !id || demoRental) {
      setLiveRental(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    (async () => {
      const contract = await fetchContractById(id).catch(() => null);
      if (cancelled || !contract) return;
      const [m, c] = await Promise.all([
        fetchMerchant(contract.merchant_id).catch(() => null),
        fetchProfile(contract.customer_user_id).catch(() => null),
      ]);
      if (cancelled) return;
      const customerName = c?.full_name ?? '—';
      setLiveRental(
        adaptContractToMerchantRental(contract, {
          customerName,
          customerInitials:
            customerName.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? '').join('') || '—',
          customerCity: c?.city ?? '',
          customerMobile: c?.mobile ?? '',
          headlineItem: `Rental ${contract.contract_number}`,
          category: m?.primary_category,
          itemValue: Number(contract.total_amount),
        }),
      );
    })()
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseAuth.configured, id, demoRental]);

  const rental = liveRental ?? demoRental;

  const [severity, setSeverity] = useState<MerchantDamageSeverity | null>(null);
  const [claim, setClaim] = useState<string>('');
  const [claimTouched, setClaimTouched] = useState(false);
  const [notes, setNotes] = useState('');
  const [evidence, setEvidence] = useState<string[]>([]);
  // Original File objects kept alongside the dataURL previews so we can
  // upload to Storage when configured. Index-aligned with `evidence`.
  const [evidenceFiles, setEvidenceFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (!rental) {
    if (resolving) {
      return (
        <>
          <Header title="…" showBack />
          <Screen className="bg-canvas">
            <div className="min-h-[40vh] grid place-items-center">
              <span className="h-7 w-7 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
            </div>
          </Screen>
        </>
      );
    }
    return (
      <>
        <Header title={t('merchant.rentals.title')} showBack />
        <Screen className="bg-canvas">
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('merchant.rental.notFound.title')}
            description={t('merchant.rental.notFound.hint')}
            action={
              <Button
                size="sm"
                onClick={() => navigate('/merchant/rentals', { replace: true })}
              >
                {t('merchant.rental.notFound.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  if (rental.closureStatus === 'closed' || rental.closureStatus === 'damaged') {
    return <Navigate to={`/merchant/rentals/${rental.id}`} replace />;
  }

  const onSelectSeverity = (key: MerchantDamageSeverity) => {
    setSeverity(key);
    if (!claimTouched) {
      setClaim(String(suggestedClaim(key, rental.itemValue, rental.liabilityTotal)));
    }
  };

  const openGallery = () => galleryInputRef.current?.click();
  const openCamera = () => cameraInputRef.current?.click();

  const onFiles = (
    files: FileList | null,
    sourceRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    if (!files) return;
    const accepted: File[] = [];
    const pending: Promise<string>[] = [];
    Array.from(files).forEach((f) => {
      if (!f.type.startsWith('image/')) return;
      accepted.push(f);
      pending.push(
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('read-failed'));
          reader.readAsDataURL(f);
        }),
      );
    });
    Promise.all(pending)
      .then((datas) => {
        setEvidence((prev) => [...prev, ...datas].slice(0, 8));
        setEvidenceFiles((prev) => [...prev, ...accepted].slice(0, 8));
      })
      .catch(() => {
        /* ignore */
      });
    if (sourceRef.current) sourceRef.current.value = '';
  };

  const removeEvidence = (idx: number) => {
    setEvidence((prev) => prev.filter((_, i) => i !== idx));
    setEvidenceFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const claimValue = Number(claim) || 0;
  // SCRUM-42 Bug 12: claim_amount must NEVER exceed the original item
  // value. Total damage IS the item value; partial damage is anything
  // below it. We treat itemValue as the hard cap regardless of
  // severity so a typo or a "partial" classification can't push the
  // claim above the asset's value. Empty itemValue (legacy demo rows
  // with 0) is treated as "no cap known" — falls back to a positive-
  // value-only check.
  const itemValueCap = Number(rental.itemValue) || 0;
  const claimOverCap = itemValueCap > 0 && claimValue > itemValueCap;
  const canSubmit = severity !== null && claimValue > 0 && !claimOverCap;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || !severity) return;
    setConfirmOpen(true);
  };

  const mapSeverityToDB = (s: MerchantDamageSeverity): DamageSeverity =>
    s === 'non-return' ? 'non_return' : s;

  const handleConfirmedReport = async () => {
    if (!canSubmit || submitting || !severity) return;
    setSubmitting(true);
    setSubmitError(null);

    // Real path: create the damage_cases row + upload evidence to the
    // `damage-evidence` Storage bucket. The rental.id is the contract id
    // when liveRentals is in effect; when on demo we fall through to the
    // demo reporter below. Bucket setup is documented in
    // docs/mvp-phase5-operational.md (one-time Supabase dashboard task).
    if (supabaseAuth.configured) {
      try {
        const contract = await fetchContractById(rental.id);
        if (!contract) throw new Error('Contract not found for this rental.');
        const created = await createDamageCase({
          contract_id: contract.id,
          customer_user_id: contract.customer_user_id,
          merchant_id: contract.merchant_id,
          raised_by_user_id: supabaseAuth.session?.user?.id ?? null,
          severity: mapSeverityToDB(severity),
          claim_amount: claimValue,
          description: notes || `Damage report for ${rental.contractRef}`,
        });

        // Best-effort evidence upload — failures are logged but don't
        // unwind the case creation (the merchant already has the row).
        if (evidenceFiles.length > 0) {
          await Promise.all(
            evidenceFiles.map((file) =>
              uploadDamageEvidence({
                caseId: created.id,
                file,
                evidenceType: 'photo',
                uploadedByUserId: supabaseAuth.session?.user?.id,
              }).catch((err) => {
                // eslint-disable-next-line no-console
                console.error('[applux] uploadDamageEvidence failed', err);
              }),
            ),
          );
        }

        navigate(`/merchant/damages/${created.id}`, { replace: true });
        return;
      } catch (err) {
        // In configured mode the real path is authoritative — a failure
        // must NOT silently fall through to the demo store (that would
        // park a fake case id in local state while nothing exists on
        // the server). Surface the error, keep the form intact, let
        // the merchant retry.
        // eslint-disable-next-line no-console
        console.error('[applux] createDamageCase failed', err);
        setSubmitError(
          err instanceof Error
            ? err.message
            : 'Could not submit the damage report. Please try again.',
        );
        setSubmitting(false);
        setConfirmOpen(false);
        return;
      }
    }

    // Demo mode only.
    const created = reportDamage(rental.id, {
      severity,
      claimAmount: claimValue,
      notes,
      evidence,
    });
    if (created) {
      navigate(`/merchant/damages/${created.id}`, { replace: true });
    } else {
      setSubmitting(false);
      setConfirmOpen(false);
    }
  };

  return (
    <>
      <Header
        title={t('merchant.damage.new.title')}
        subtitle={rental.id}
        showBack
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            {/* Hero */}
            <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-danger-500/25 blur-3xl"
              />
              <div className="relative flex items-start gap-3">
                <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 text-white grid place-items-center">
                  <AlertIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[10.5px] text-white/55 uppercase tracking-[0.08em]">
                    {t('merchant.damage.new.hero.eyebrow')}
                  </div>
                  <div className="mt-1.5 editorial-title text-[20px] leading-tight truncate text-white">
                    {t('merchant.damage.new.hero.title')}
                  </div>
                  <p className="mt-2 text-[12.5px] text-white/65 leading-relaxed">
                    {t('merchant.damage.new.hero.subtitle')}
                  </p>
                </div>
              </div>
            </div>

            {/* Rental summary */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damage.new.rental')}
                className="mb-0"
              />
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                  <CarIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                    {rental.item}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-ink-400 truncate">
                    <UsersIcon size={11} />
                    <span className="truncate">{rental.customerName}</span>
                  </div>
                </div>
              </div>
            </Card>

            {/* Severity */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damage.new.severity.title')}
                className="mb-0"
                action={
                  <span className="text-[11.5px] text-ink-400">
                    {t('merchant.damage.new.severity.hint')}
                  </span>
                }
              />
              <div className="space-y-2">
                {SEVERITY_OPTIONS.map((o) => {
                  const active = severity === o.key;
                  const style = SEVERITY_STYLE[o.tone];
                  return (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => onSelectSeverity(o.key)}
                      className={cn(
                        'w-full text-start flex items-start gap-3 rounded-xl2 bg-white p-3.5 ring-1 transition-all',
                        active
                          ? `${style.activeRing} ring-2 ${style.activeBg}`
                          : 'hairline hover:ring-gold-200/70',
                      )}
                    >
                      <span
                        className={cn(
                          'h-10 w-10 shrink-0 rounded-xl grid place-items-center',
                          style.iconBg,
                        )}
                      >
                        {o.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink-900">
                          {t(`merchant.damages.severity.${o.key}`)}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-500 leading-relaxed">
                          {t(`merchant.damage.new.severity.desc.${o.key}`)}
                        </div>
                      </div>
                      <span
                        className={cn(
                          'h-5 w-5 mt-0.5 rounded-full ring-1 grid place-items-center shrink-0',
                          active
                            ? 'bg-ink-900 text-white ring-ink-900'
                            : 'bg-white hairline',
                        )}
                      >
                        {active && (
                          <span className="h-2 w-2 rounded-full bg-white" />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Claim amount */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damage.new.claim.title')}
                className="mb-0"
              />
              <FormField
                label={t('merchant.damage.new.claim.label')}
                hint={
                  itemValueCap > 0
                    ? t('merchant.damage.new.claim.cap', {
                        amount: formatCurrency(itemValueCap),
                      })
                    : severity
                      ? t('merchant.damage.new.claim.suggested', {
                          amount: formatCurrency(
                            suggestedClaim(
                              severity,
                              rental.itemValue,
                              rental.liabilityTotal,
                            ),
                          ),
                        })
                      : t('merchant.damage.new.claim.hint')
                }
                error={
                  claimOverCap
                    ? t('merchant.damage.new.claim.overCap', {
                        amount: formatCurrency(itemValueCap),
                      })
                    : undefined
                }
              >
                <Input
                  type="number"
                  min="0"
                  max={itemValueCap > 0 ? String(itemValueCap) : undefined}
                  inputMode="decimal"
                  placeholder="0"
                  value={claim}
                  onChange={(e) => {
                    setClaim(e.target.value);
                    setClaimTouched(true);
                  }}
                  invalid={claimOverCap}
                  trailing={
                    <span className="text-[12px] font-medium text-ink-500">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>
            </Card>

            {/* Evidence */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damage.new.evidence.title')}
                className="mb-0"
                action={
                  <span
                    className={cn(
                      'text-[11.5px] font-semibold num rounded-full px-2 py-0.5',
                      evidence.length === 0
                        ? 'bg-canvas-200 text-ink-500'
                        : evidence.length >= 8
                          ? 'bg-warn-50 text-warn-700'
                          : 'bg-success-50 text-success-700',
                    )}
                  >
                    {evidence.length}/8
                  </span>
                }
              />

              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                multiple
                className="sr-only"
                onChange={(e) => onFiles(e.target.files, galleryInputRef)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => onFiles(e.target.files, cameraInputRef)}
              />

              {/* Photography tips — shown only when no evidence yet */}
              {evidence.length === 0 && (
                <div className="rounded-xl2 bg-canvas-100 hairline p-3 space-y-2">
                  <div className="text-[12px] font-semibold text-ink-900">
                    {t('merchant.damage.new.evidence.tipsTitle')}
                  </div>
                  <ul className="space-y-1.5">
                    {(['lit', 'angles', 'reference'] as const).map((k) => (
                      <li
                        key={k}
                        className="flex items-start gap-2 text-[11.5px] text-ink-600 leading-relaxed"
                      >
                        <span className="h-4 w-4 shrink-0 mt-0.5 rounded-full bg-success-50 text-success-600 grid place-items-center ring-1 ring-success-500/15">
                          <CheckIcon size={10} />
                        </span>
                        <span>
                          {t(`merchant.damage.new.evidence.tips.${k}`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Capture buttons */}
              {evidence.length < 8 && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={openCamera}
                    className="h-11 rounded-xl bg-ink-900 text-white text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform shadow-soft"
                  >
                    <CameraIcon size={15} />
                    {t('merchant.damage.new.evidence.takePhoto')}
                  </button>
                  <button
                    type="button"
                    onClick={openGallery}
                    className="h-11 rounded-xl bg-white hairline text-ink-800 text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-canvas-100"
                  >
                    <ImageIcon size={15} />
                    {t('merchant.damage.new.evidence.fromGallery')}
                  </button>
                </div>
              )}

              {/* Previews */}
              {evidence.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {evidence.map((src, i) => (
                      <div
                        key={`${i}-${src.length}`}
                        className="relative group aspect-square overflow-hidden rounded-xl bg-canvas-200 hairline"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(i)}
                          className="absolute inset-0"
                          aria-label={t('merchant.damage.new.evidence.preview')}
                        >
                          <img
                            src={src}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        </button>
                        <span className="absolute top-1 start-1 num text-[10px] font-bold bg-black/65 text-white rounded-md px-1.5 py-0.5">
                          {i + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEvidence(i)}
                          aria-label={t('merchant.damage.new.evidence.remove')}
                          className="absolute top-1 end-1 h-6 w-6 rounded-full bg-black/70 text-white grid place-items-center text-[12px] font-bold hover:bg-black"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-ink-400 leading-relaxed">
                    {t('merchant.damage.new.evidence.hint')}
                  </p>
                </>
              )}
            </Card>

            {/* Notes */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damage.new.notes.title')}
                className="mb-0"
                action={
                  <span className="text-[11.5px] text-ink-400">
                    {t('common.optional')}
                  </span>
                }
              />
              <FormField label={t('merchant.damage.new.notes.label')}>
                <Textarea
                  rows={3}
                  placeholder={t('merchant.damage.new.notes.placeholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormField>
            </Card>

            {/* Linked docs */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.damage.new.linked')}
                className="mb-0"
              />
              <LinkedRow
                icon={<DocIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
                label={t('merchant.rental.docs.contract')}
                refValue={rental.contractRef}
              />
              <CardDivider />
              <LinkedRow
                icon={<SignatureIcon size={16} />}
                tone="bg-gold-50 text-gold-700"
                label={t('merchant.rental.docs.note')}
                refValue={rental.noteRef}
              />
              <CardDivider />
              <LinkedRow
                icon={<ReceiptIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
                label={t('merchant.damage.new.invoice')}
                refValue={invoiceRefFromContract(rental.contractRef)}
              />
            </Card>

            <div className="rounded-xl2 bg-danger-50/70 ring-1 ring-danger-500/15 p-3.5 flex items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-danger-600 grid place-items-center ring-1 ring-danger-500/20">
                <InfoIcon size={16} />
              </span>
              <div className="min-w-0 flex-1 text-[12px] text-danger-700/90 leading-relaxed">
                <div className="text-danger-800 font-semibold mb-0.5">
                  {t('merchant.damage.new.warn.title')}
                </div>
                <div>{t('merchant.damage.new.warn.hint')}</div>
              </div>
            </div>

            {submitError && (
              <div
                role="alert"
                className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed"
              >
                {submitError}
              </div>
            )}

            <Button
              type="submit"
              size="lg"
              block
              disabled={!canSubmit || submitting}
              leading={<AlertIcon size={16} />}
            >
              {t('merchant.damage.new.submit')}
            </Button>
          </form>
        </div>
      </Screen>

      <ImageLightbox
        open={lightboxIndex !== null}
        images={evidence}
        startIndex={lightboxIndex ?? 0}
        onClose={() => setLightboxIndex(null)}
        caption={(i, total) =>
          t('merchant.damage.new.evidence.preview') + ` · ${i + 1} / ${total}`
        }
      />

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => (submitting ? undefined : setConfirmOpen(false))}
        onConfirm={handleConfirmedReport}
        title={t('merchant.damage.new.confirmSheet.title')}
        description={t('merchant.damage.new.confirmSheet.description', {
          item: rental.item,
          customer: rental.customerName,
          amount: formatCurrency(claimValue),
        })}
        confirmLabel={t('merchant.damage.new.confirmSheet.confirm')}
        cancelLabel={t('common.cancel')}
        icon={<AlertIcon size={18} />}
        tone="danger"
        loading={submitting}
      />
    </>
  );
}

function LinkedRow({
  icon,
  tone,
  label,
  refValue,
}: {
  icon: ReactNode;
  tone: string;
  label: ReactNode;
  refValue: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-semibold text-ink-900 truncate">
          {label}
        </div>
        <div className="mt-0.5 text-[11px] text-ink-400 num truncate">
          {refValue}
        </div>
      </div>
    </div>
  );
}
