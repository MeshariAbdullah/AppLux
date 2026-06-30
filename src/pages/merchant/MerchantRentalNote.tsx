import { useEffect, useMemo, useState } from 'react';
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
  GavelIcon,
  InfoIcon,
  ShieldIcon,
  SignatureIcon,
} from '@/components/icons';
import { getInitials } from '@/lib/format/initials';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  fetchContractById,
  fetchMerchant,
  fetchNoteByContractId,
  fetchProfile,
  useSupabaseAuth,
  type PromissoryNoteRow,
} from '@/lib/supabase';
import type { MerchantRental } from '@/lib/data';
import { resolvePlatformBeneficiary } from '@/lib/platformIdentity';
import { toneForDocState, toneForNafith } from './MerchantRentalDetails';

export default function MerchantRentalNote() {
  const t = useT();
  const { formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals } = useStore();
  const { configured } = useSupabaseAuth();

  const demoRental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );
  const [liveRental, setLiveRental] = useState<MerchantRental | null>(null);
  // Live promissory note row drives the page: beneficiary
  // (platform constant, see below), principal (note.principal_amount),
  // due date (note.due_date), issuance (note.created_at), and
  // attestation (note.nafith_attested_at). Without it the page used
  // to read `rental.endDate` for the due date (= contract end, not
  // note.due_date) and `rental.liabilityTotal` for the principal
  // (= contract total, not note.principal_amount).
  const [liveNote, setLiveNote] = useState<PromissoryNoteRow | null>(null);
  const [resolving, setResolving] = useState<boolean>(() =>
    Boolean(configured && id && !demoRental),
  );

  useEffect(() => {
    if (!configured || !id || demoRental) {
      setLiveRental(null);
      setLiveNote(null);
      return;
    }
    let cancelled = false;
    // Phase 9 entity-leak fix — clear previous note state up front.
    setLiveRental(null);
    setLiveNote(null);
    setResolving(true);
    (async () => {
      const contract = await fetchContractById(id).catch(() => null);
      if (cancelled || !contract) return;
      const [m, c, note] = await Promise.all([
        fetchMerchant(contract.merchant_id).catch(() => null),
        fetchProfile(contract.customer_user_id).catch(() => null),
        fetchNoteByContractId(contract.id).catch(() => null),
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
          itemValue: Number(contract.total_amount),
          note,
        }),
      );
      setLiveNote(note);
    })()
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, id, demoRental]);

  const rental = liveRental ?? demoRental;

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

  // Source-of-truth rule: the note page MUST read from the
  // promissory_notes row. In live (configured) mode we never fall
  // back to contract values — a contract that's still 'pending' has
  // no note row yet, and displaying contract.total_amount /
  // contract.end_date in those slots would be displaying the wrong
  // entity's data. Show '—' instead and let the Nafath state chip
  // communicate the pending status.
  //
  // Demo mode keeps the existing rental-shape fallbacks so SEED
  // scenarios render unchanged.
  const isLive = configured;
  const principal: number | null =
    liveNote?.principal_amount != null
      ? Number(liveNote.principal_amount)
      : isLive
        ? null
        : rental.liabilityTotal;
  const dueDate: string | null =
    liveNote?.due_date ?? (isLive ? null : rental.endDate);
  const issuedAt = liveNote?.created_at ?? null;
  const attestedAt = liveNote?.nafith_attested_at ?? null;
  // Per the corrected product flow, the promissory note is between
  // the platform (Lend) and the renter — the merchant is NOT a party
  // on the note. Always show the platform legal entity here,
  // regardless of what beneficiary_name happens to be persisted on
  // the row.
  const beneficiary = resolvePlatformBeneficiary(locale);

  return (
    <>
      <Header
        title={t('merchant.rental.note.title')}
        subtitle={rental.noteRef}
        showBack
        trailing={
          <StatusChip
            tone={toneForDocState(rental.noteState)}
            dot
            label={t(`merchant.rental.docs.state.${rental.noteState}`)}
          />
        }
      />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 text-white grid place-items-center">
                <SignatureIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                  {t('merchant.rental.note.refLabel')}
                </div>
                <div className="mt-1.5 editorial-title text-[20px] leading-tight num truncate text-white">
                  {rental.noteRef}
                </div>
                <div className="mt-1 text-[12px] text-white/70 truncate">
                  {rental.customerName}
                </div>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.note.principal')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {principal != null
                    ? formatCurrency(principal)
                    : t('merchant.rental.timeline.pending')}
                </div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.note.dueDate')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {dueDate
                    ? formatDate(dueDate)
                    : t('merchant.rental.timeline.pending')}
                </div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.note.summary')}
              className="mb-0"
            />
            <Row
              label={t('merchant.rental.note.beneficiary')}
              value={beneficiary}
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.note.principalFull')}
              value={
                <span className="num">
                  {principal != null
                    ? formatCurrency(principal)
                    : t('merchant.rental.timeline.pending')}
                </span>
              }
              sub={t('merchant.rental.note.principalHint')}
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.note.purpose')}
              value={t('merchant.invoice.defaultPurpose')}
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.note.dueDate')}
              value={
                <span className="num">
                  {dueDate
                    ? formatDate(dueDate)
                    : t('merchant.rental.timeline.pending')}
                </span>
              }
            />
          </Card>

          {/* Nafith attestation */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.note.attestation')}
              className="mb-0"
              action={
                <StatusChip
                  tone={toneForNafith(rental.nafithState)}
                  dot
                  label={t(`merchant.rental.nafith.state.${rental.nafithState}`)}
                />
              }
            />
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
                <GavelIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                  {t('track.placeholders.nafith')}
                </div>
                <div className="mt-0.5 text-[11.5px] text-ink-400 leading-relaxed">
                  {t('track.placeholders.nafithDesc')}
                </div>
              </div>
            </div>
            <CardDivider />
            <Row
              label={t('merchant.rental.note.issuedAt')}
              value={
                issuedAt ? (
                  <span className="num">
                    {formatDate(issuedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                ) : (
                  t('merchant.rental.timeline.pending')
                )
              }
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.note.attestedAt')}
              value={
                attestedAt ? (
                  <span className="num">
                    {formatDate(attestedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                ) : (
                  t('merchant.rental.timeline.pending')
                )
              }
            />
          </Card>

          {/* Enforcement placeholder */}
          <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/15 p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-warn-600 grid place-items-center ring-1 ring-warn-500/20">
              <ShieldIcon size={18} />
            </span>
            <div className="min-w-0 text-[12px] text-warn-700/90 leading-relaxed">
              <div className="flex items-center gap-1.5 text-warn-800 font-semibold mb-0.5">
                <InfoIcon size={12} />
                {t('track.placeholders.execution')}
              </div>
              {t('track.placeholders.executionDesc')}
            </div>
          </div>

          {/* Nafith attested banner */}
          {rental.nafithState === 'approved' && (
            <div className="rounded-xl2 bg-success-50 ring-1 ring-success-500/20 p-3.5 flex items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-success-600 grid place-items-center ring-1 ring-success-500/20">
                <BadgeCheckIcon size={18} />
              </span>
              <div className="min-w-0 text-[12px] text-success-700/90 leading-relaxed">
                <div className="text-success-800 font-semibold mb-0.5">
                  {t('track.note.attested')}
                </div>
                {t('merchant.rental.note.attestedBanner')}
              </div>
            </div>
          )}

          <Button
            variant="secondary"
            block
            leading={<InfoIcon size={16} />}
            onClick={() => navigate(`/merchant/rentals/${rental.id}`)}
          >
            {t('merchant.rental.actions.backToRental')}
          </Button>
        </div>
      </Screen>
    </>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-400">{sub}</div>}
    </div>
  );
}
