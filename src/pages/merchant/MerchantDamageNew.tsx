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
  PackageIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { cachedFetch, cacheInvalidate } from '@/lib/cache/memoryCache';
import { logEvent } from '@/lib/observability/log';
import { translateError, withSupportId } from '@/lib/errors';
import { getInitials } from '@/lib/format/initials';
import { isRentalFinalized } from '@/lib/format/rentalFinalization';
import { useSensitiveFlow } from '@/lib/session/flowGuard';
import { useI18n, useT } from '@/lib/i18n';
import { prepareEvidenceImage, PrepareImageError } from '@/lib/image/prepareEvidenceImage';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  createDamageCase,
  fetchContractById,
  fetchContractDamageCase,
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

// Business rule (see damage/non-return claim policy):
//   * partial      → 30% of the item's ORIGINAL VALUE (repairable
//                    damage; the merchant can override this default)
//   * total        → the item's ORIGINAL VALUE (irreparable damage)
//   * non-return   → the item's ORIGINAL VALUE (customer kept the item)
// Rental fee is DELIBERATELY not used for any of these — the item's
// underlying value is the correct anchor per the promissory note
// principal + eligibility hold logic (see 20260502120500).
// `_liabilityTotal` is kept in the signature purely to preserve the
// existing call site's shape; a future cleanup can drop it once
// every caller is updated.
function suggestedClaim(
  severity: MerchantDamageSeverity,
  itemValue: number,
  _liabilityTotal: number,
): number {
  if (severity === 'partial') return Math.round(itemValue * 0.3);
  return itemValue; // total AND non-return both anchor on item value
}

/** One captured/selected evidence photo: a compressed JPEG to upload +
 *  an object-URL preview (owned here; revoked on remove/unmount). */
type EvidenceItem = { id: string; previewUrl: string; file: File };

const MAX_EVIDENCE = 8;
let evidenceSeq = 0;

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
    // Phase 9 entity-leak fix.
    setLiveRental(null);
    setResolving(true);
    (async () => {
      // Phase 4A: cached bundle reads (see MerchantRentalDetails note);
      // customer profile stays live. The SUBMIT-path contract re-read
      // further down stays live too.
      const contract = await cachedFetch(
        cacheKeys.contract(id),
        CACHE_TTL.rentalBundle,
        () => fetchContractById(id),
      ).catch(() => null);
      if (cancelled || !contract) return;
      // Resume-not-duplicate: if this contract already has an
      // unresolved case, open IT instead of offering a second report
      // (the DB's one-unresolved-case index would reject it anyway).
      const existing = await fetchContractDamageCase(contract.id).catch(
        () => null,
      );
      if (cancelled) return;
      if (existing && (existing.status === 'open' || existing.status === 'escalated')) {
        navigate(`/merchant/damages/${existing.id}`, { replace: true });
        return;
      }
      const [m, c] = await Promise.all([
        cachedFetch(
          cacheKeys.merchantEntity(contract.merchant_id),
          CACHE_TTL.merchantEntity,
          () => fetchMerchant(contract.merchant_id),
        ).catch(() => null),
        fetchProfile(contract.customer_user_id).catch(() => null),
      ]);
      if (cancelled) return;
      const customerName = c?.full_name ?? '—';
      setLiveRental(
        adaptContractToMerchantRental(contract, {
          customerName,
          customerInitials: getInitials(customerName),
          customerCity: c?.city ?? '',
          customerMobile: c?.mobile ?? '',
          headlineItem: `Rental ${contract.contract_number}`,
          category: m?.primary_category,
          // Damage claim math is anchored on the item's ORIGINAL
          // VALUE — never the rental fee. The adapter now defaults
          // itemValue to contract.original_item_value (falling back
          // to total_amount for legacy rows), so no override needed.
        }),
      );
    })()
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [supabaseAuth.configured, id, demoRental, navigate]);

  const rental = liveRental ?? demoRental;

  const [severity, setSeverity] = useState<MerchantDamageSeverity | null>(null);
  const [claim, setClaim] = useState<string>('');
  const [claimTouched, setClaimTouched] = useState(false);
  const [notes, setNotes] = useState('');
  // Each evidence item holds a COMPRESSED JPEG File (upload) + an object-
  // URL preview (never a full-resolution Base64 string, which would
  // jettison the WKWebView). previewUrl is revoked on remove/unmount.
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  // Synchronous re-entrancy guard: never open two native pickers at once
  // (double-tap / opening while one is already up).
  const captureBusyRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  // Session hardening: never idle-logout while the damage-case create
  // (+ evidence upload) is in flight (see src/lib/session/flowGuard.ts).
  useSensitiveFlow(submitting);

  // Free every preview object URL on unmount (no leaked native memory).
  const evidenceRef = useRef<EvidenceItem[]>(evidence);
  evidenceRef.current = evidence;
  useEffect(
    () => () => {
      evidenceRef.current.forEach((e) => URL.revokeObjectURL(e.previewUrl));
    },
    [],
  );

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

  // Guard against opening a new damage case on an already-finalised
  // rental. Uses the shared helper so status='returned' AND
  // closureStatus='closed'/'damaged' all redirect out.
  if (isRentalFinalized(rental)) {
    return <Navigate to={`/merchant/rentals/${rental.id}`} replace />;
  }

  const onSelectSeverity = (key: MerchantDamageSeverity) => {
    setSeverity(key);
    if (!claimTouched) {
      setClaim(String(suggestedClaim(key, rental.itemValue, rental.liabilityTotal)));
    }
  };

  // Open exactly one native picker at a time. captureBusyRef is cleared
  // when the user returns to the app (a file was chosen OR the picker was
  // cancelled — both fire window 'focus'), so cancel is a no-op, never an
  // error or a stuck button.
  const openPicker = (which: 'camera' | 'gallery') => {
    if (captureBusyRef.current || processing) return;
    captureBusyRef.current = true;
    setEvidenceError(null);
    logEvent('info', 'info', { op: 'evidence_capture_open', source: which });
    const release = () => {
      window.setTimeout(() => {
        captureBusyRef.current = false;
      }, 300);
      window.removeEventListener('focus', release);
    };
    window.addEventListener('focus', release);
    (which === 'camera' ? cameraInputRef : galleryInputRef).current?.click();
  };
  const openGallery = () => openPicker('gallery');
  const openCamera = () => openPicker('camera');

  const onFiles = async (
    files: FileList | null,
    sourceRef: React.RefObject<HTMLInputElement | null>,
  ) => {
    // Snapshot the files into a stable array BEFORE touching the input —
    // FileList is live, so resetting input.value would empty it.
    const list = files ? Array.from(files) : [];
    // Reset the input so re-selecting the same file re-fires the change.
    if (sourceRef.current) sourceRef.current.value = '';
    // Cancellation → empty files → nothing added, no error.
    if (list.length === 0) return;
    const remaining = MAX_EVIDENCE - evidence.length;
    if (remaining <= 0) {
      setEvidenceError(t('merchant.damage.new.evidence.errors.max'));
      return;
    }
    const batch = list.slice(0, remaining);
    setProcessing(true);
    const prepared: EvidenceItem[] = [];
    let failures = 0;
    for (const f of batch) {
      try {
        const p = await prepareEvidenceImage(f);
        // eslint-disable-next-line no-plusplus
        prepared.push({ id: `ev-${(evidenceSeq += 1)}`, previewUrl: p.previewUrl, file: p.file });
      } catch (err) {
        failures += 1;
        logEvent('rpc_failure', 'warn', {
          op: 'evidence_prepare_failed',
          cause: err instanceof PrepareImageError ? err.kind : 'unknown',
        });
      }
    }
    // Prior successful items are never dropped; a partial failure only
    // surfaces a soft message.
    if (prepared.length) {
      setEvidence((prev) => [...prev, ...prepared].slice(0, MAX_EVIDENCE));
    }
    setEvidenceError(failures > 0 ? t('merchant.damage.new.evidence.errors.capture') : null);
    setProcessing(false);
  };

  const removeEvidence = (idx: number) => {
    setEvidence((prev) => {
      const item = prev[idx];
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
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
        // DELIBERATELY UNCACHED (Phase 4A): point-in-time contract
        // re-read on the WRITE path, immediately before the legally
        // sensitive damage-case insert. Never serve this from cache.
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

        // Phase 4A invalidation — IMMEDIATELY after mutation success,
        // before the navigate below. Since 20260502124500 the insert
        // does NOT touch the contract (it stays active, in dispute),
        // but sibling pages must still refetch so they pick up the
        // new case and render the dispute state instead of the
        // Close/Report actions.
        cacheInvalidate(cacheKeys.contract(contract.id));
        cacheInvalidate(cacheKeys.noteByContract(contract.id));
        {
          const uid = supabaseAuth.session?.user?.id;
          if (uid) cacheInvalidate(cacheKeys.merchantContracts(uid));
        }

        // Best-effort evidence upload — failures are logged but don't
        // unwind the case creation (the merchant already has the row).
        if (evidence.length > 0) {
          await Promise.all(
            evidence.map(({ file }) =>
              uploadDamageEvidence({
                caseId: created.id,
                file,
                evidenceType: 'photo',
                uploadedByUserId: supabaseAuth.session?.user?.id,
              }).catch((err) => {
                logEvent('rpc_failure', 'warn', { op: 'upload_damage_evidence' }, err);
              }),
            ),
          );
        }

        navigate(`/merchant/damages/${created.id}`, { replace: true });
        return;
      } catch (err) {
        // Unique violation (damage_cases_one_unresolved_per_contract):
        // a case for this contract already exists — a double-tap racing
        // past the submitting flag, or a parallel session. That is a
        // RESUME, not an error: open the existing case.
        if ((err as { code?: unknown })?.code === '23505') {
          const existing = await fetchContractDamageCase(rental.id).catch(
            () => null,
          );
          if (existing) {
            cacheInvalidate(cacheKeys.contract(rental.id));
            navigate(`/merchant/damages/${existing.id}`, { replace: true });
            return;
          }
        }
        // In configured mode the real path is authoritative — a failure
        // must NOT silently fall through to the demo store (that would
        // park a fake case id in local state while nothing exists on
        // the server). Surface the error, keep the form intact, let
        // the merchant retry. NO navigation, NO lifecycle change — the
        // rental stays exactly as it was.
        const eventId = logEvent(
          'damage_case_failed',
          'error',
          { op: 'create_damage_case' },
          err,
        );
        setSubmitError(
          withSupportId(
            translateError(err, t, 'merchant.damage.new.errors.createFailed'),
            eventId,
          ),
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
      evidence: evidence.map((e) => e.previewUrl),
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
        subtitle={rental.contractRef}
        showBack
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            {/* M15 warning banner — opening a case halts the normal
                return path; shown FIRST per the design. */}
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/20 px-4 py-3">
              <div className="text-[12.5px] font-bold text-danger-700 flex items-center gap-1.5">
                <AlertIcon size={13} />
                {t('merchant.damage.new.warn.title')}
              </div>
              <p className="mt-1 text-[12.5px] text-danger-700/90 leading-[1.8]">
                {t('merchant.damage.new.warn.hint')}
              </p>
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
                      {/* Design M15: red radio for the selected case type. */}
                      <span
                        className={cn(
                          'h-5 w-5 mt-0.5 rounded-full grid place-items-center shrink-0',
                          active
                            ? 'bg-danger-600 ring-1 ring-danger-600'
                            : 'bg-white ring-1 hairline',
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
                onChange={(e) => void onFiles(e.target.files, galleryInputRef)}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => void onFiles(e.target.files, cameraInputRef)}
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
              {evidence.length < MAX_EVIDENCE && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={openCamera}
                    disabled={processing}
                    className="h-11 rounded-xl bg-ink-900 text-white text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 active:scale-[0.98] transition-transform shadow-soft disabled:opacity-60 disabled:active:scale-100"
                  >
                    <CameraIcon size={15} />
                    {t('merchant.damage.new.evidence.takePhoto')}
                  </button>
                  <button
                    type="button"
                    onClick={openGallery}
                    disabled={processing}
                    className="h-11 rounded-xl bg-white hairline text-ink-800 text-[12.5px] font-semibold inline-flex items-center justify-center gap-1.5 hover:bg-canvas-100 disabled:opacity-60"
                  >
                    <ImageIcon size={15} />
                    {t('merchant.damage.new.evidence.fromGallery')}
                  </button>
                </div>
              )}

              {processing && (
                <div
                  className="flex items-center gap-2 text-[12px] text-ink-500"
                  aria-live="polite"
                >
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-lavender-300 border-t-lavender-600" />
                  {t('merchant.damage.new.evidence.processing')}
                </div>
              )}
              {evidenceError && (
                <div
                  className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12px] text-danger-700 leading-relaxed"
                  role="alert"
                >
                  {evidenceError}
                </div>
              )}

              {/* Previews */}
              {evidence.length > 0 && (
                <>
                  <div className="grid grid-cols-3 gap-2">
                    {evidence.map((item, i) => (
                      <div
                        key={item.id}
                        className="relative group aspect-square overflow-hidden rounded-xl bg-canvas-200 hairline"
                      >
                        <button
                          type="button"
                          onClick={() => setLightboxIndex(i)}
                          className="absolute inset-0"
                          aria-label={t('merchant.damage.new.evidence.preview')}
                        >
                          <img
                            src={item.previewUrl}
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
              {/* Note + invoice rows removed: the promissory note is
                  disabled in the current phase and the old invoice ref
                  here was SYNTHESIZED (not a real document reference).
                  Real references only. */}
              <LinkedRow
                icon={<DocIcon size={16} />}
                tone="bg-canvas-100 text-ink-700"
                label={t('merchant.rental.docs.contract')}
                refValue={rental.contractRef}
              />
            </Card>

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
              className="!bg-danger-600 hover:!bg-danger-700 active:!bg-danger-700 disabled:!bg-danger-600/50"
            >
              {t('merchant.damage.new.submit')}
            </Button>
          </form>
        </div>
      </Screen>

      <ImageLightbox
        open={lightboxIndex !== null}
        images={evidence.map((e) => e.previewUrl)}
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
