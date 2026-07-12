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
  CarIcon,
  DocIcon,
  InfoIcon,
  ShieldIcon,
} from '@/components/icons';
import { CACHE_TTL, cacheKeys } from '@/lib/cache/keys';
import { cachedFetch } from '@/lib/cache/memoryCache';
import { getInitials } from '@/lib/format/initials';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContractToMerchantRental,
  fetchContractById,
  fetchInvoiceById,
  fetchMerchant,
  fetchNoteByContractId,
  fetchProfile,
  listInvoiceItems,
  useSupabaseAuth,
  type MerchantRow,
} from '@/lib/supabase';
import type {
  ContractClause,
  MerchantRental,
} from '@/lib/data';
import { buildContractFromTemplate } from '@/lib/contractTemplate';
import { resolveMerchantName } from '@/lib/merchantName';
import { toneForDocState } from './MerchantRentalDetails';

export default function MerchantRentalContract() {
  const t = useT();
  const { formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals, merchant } = useStore();
  const { configured } = useSupabaseAuth();

  const demoRental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );
  const [liveRental, setLiveRental] = useState<MerchantRental | null>(null);
  // Real generated clauses from the same template the customer sees
  // and the merchant confirmed at issuance time. Replaces the
  // hardcoded SEED_SCANS demo clauses that used to render here.
  const [liveClauses, setLiveClauses] = useState<ContractClause[] | null>(null);
  // Live merchant row — resolved via the shared resolveMerchantName
  // helper so the lessor row uses display_name (locale-aware) with a
  // proper fallback to company_name. Replaces the prior ad-hoc
  // Localized state that didn't fall back beyond display_name.
  const [liveMerchant, setLiveMerchant] = useState<MerchantRow | null>(null);
  // Rental period (days) from the FIRST invoice item — same value
  // the clauses panel uses. Drives the Key Terms "Duration" stat so
  // it can't diverge from the contract clauses.
  const [liveRentalDays, setLiveRentalDays] = useState<number | null>(null);
  // Same lazy-init pattern as MerchantRentalDetails — starts in the
  // "resolving" state for live ids so the first render doesn't
  // synchronously redirect before useEffect can run the fetch.
  const [resolving, setResolving] = useState<boolean>(() =>
    Boolean(configured && id && !demoRental),
  );

  useEffect(() => {
    if (!configured || !id || demoRental) {
      setLiveRental(null);
      setLiveClauses(null);
      setLiveMerchant(null);
      setLiveRentalDays(null);
      return;
    }
    let cancelled = false;
    // Phase 9 entity-leak fix — clear the previous contract's state
    // before the new :id fetch starts.
    setLiveRental(null);
    setLiveClauses(null);
    setLiveMerchant(null);
    setLiveRentalDays(null);
    setResolving(true);
    (async () => {
      // Phase 4A: cached bundle reads (see MerchantRentalDetails note).
      // Invoice + items are immutable post-issuance, so the 1-min TTL
      // is over-conservative there by design. Customer profile stays
      // live (full row includes national_id).
      const contract = await cachedFetch(
        cacheKeys.contract(id),
        CACHE_TTL.rentalBundle,
        () => fetchContractById(id),
      ).catch(() => null);
      if (cancelled || !contract) return;
      const [m, c, note, invoice] = await Promise.all([
        cachedFetch(
          cacheKeys.merchantEntity(contract.merchant_id),
          CACHE_TTL.merchantEntity,
          () => fetchMerchant(contract.merchant_id),
        ).catch(() => null),
        fetchProfile(contract.customer_user_id).catch(() => null),
        cachedFetch(
          cacheKeys.noteByContract(contract.id),
          CACHE_TTL.rentalBundle,
          () => fetchNoteByContractId(contract.id),
        ).catch(() => null),
        cachedFetch(
          cacheKeys.invoice(contract.invoice_id),
          CACHE_TTL.rentalBundle,
          () => fetchInvoiceById(contract.invoice_id),
        ).catch(() => null),
      ]);
      if (cancelled) return;
      const items = invoice
        ? await cachedFetch(
            cacheKeys.invoiceItems(invoice.id),
            CACHE_TTL.rentalBundle,
            () => listInvoiceItems(invoice.id),
          ).catch(() => [])
        : [];
      if (cancelled) return;
      const customerName = c?.full_name ?? '—';
      // Real item title + item value come from the first invoice
      // item, NOT from a placeholder + contract.total_amount. This
      // guarantees the Key Terms summary uses the same source the
      // clauses panel uses; both now read items[0] directly.
      const firstItem = items[0];
      const headlineItem =
        firstItem?.item_name?.trim() ||
        `Rental ${contract.contract_number}`;
      const itemValue =
        firstItem?.replacement_value != null
          ? Number(firstItem.replacement_value)
          : invoice?.original_item_value != null
            ? Number(invoice.original_item_value)
            : Number(contract.total_amount);
      // Period length the contract was actually written for — same
      // value the template uses for the period clause.
      const itemRentalDays = firstItem?.rental_days ?? null;
      setLiveRentalDays(itemRentalDays);
      setLiveRental(
        adaptContractToMerchantRental(contract, {
          customerName,
          customerInitials: getInitials(customerName),
          customerCity: c?.city ?? '',
          customerMobile: c?.mobile ?? '',
          headlineItem,
          category: m?.primary_category,
          itemValue,
          note,
        }),
      );

      // Regenerate the contract template using the merchant overrides
      // stored on the invoice row — what the customer was shown at
      // review time and the merchant confirmed at issuance.
      if (invoice && items.length > 0) {
        const durationDays = items[0]?.rental_days ?? 30;
        const template = buildContractFromTemplate({
          invoice,
          items,
          merchant: m,
          pickupDate: contract.start_date,
          returnDate: contract.end_date,
          durationDays,
        });
        setLiveClauses(template.clauses);
      } else {
        setLiveClauses([]);
      }
      setLiveMerchant(m);
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

  // Prefer the canonical period from invoice items (same source the
  // clauses panel uses) over an arithmetic on contract start/end —
  // contract.end_date was historically hardcoded to start + 30 days
  // by accept_rental_invoice, so for any non-30-day rental the two
  // diverged. The Phase 8d migration fixes this for new contracts,
  // but for any legacy row we still read items[0].rental_days first.
  const durationDays =
    liveRentalDays ??
    (() => {
      const s = new Date(rental.startDate).getTime();
      const e = new Date(rental.endDate).getTime();
      if (Number.isNaN(s) || Number.isNaN(e) || e <= s) return 0;
      return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24)));
    })();
  // Live generated clauses if we have them; otherwise empty (the
  // page handles an empty clauses list gracefully).
  const clauses: ContractClause[] = liveClauses ?? [];
  const readyAt = rental.timeline.find((e) => e.key === 'contract-ready')?.at;
  const signedAt = rental.timeline.find((e) => e.key === 'nafith-approved')?.at;

  return (
    <>
      <Header
        title={t('merchant.rental.contract.title')}
        subtitle={rental.contractRef}
        showBack
        trailing={
          <StatusChip
            tone={toneForDocState(rental.contractState)}
            dot
            label={t(`merchant.rental.docs.state.${rental.contractState}`)}
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
                <DocIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                  {t('merchant.rental.contract.refLabel')}
                </div>
                <div className="mt-1.5 editorial-title text-[20px] leading-tight num truncate text-white">
                  {rental.contractRef}
                </div>
                <div className="mt-1 text-[12px] text-white/70 truncate">
                  {rental.item}
                </div>
              </div>
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.contract.startOn')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {formatDate(rental.startDate)}
                </div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.contract.endOn')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {formatDate(rental.endDate)}
                </div>
              </div>
            </div>
          </div>

          {/* Parties */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.parties')}
              className="mb-0"
            />
            <Row
              label={t('merchant.rental.contract.lessor')}
              value={
                liveMerchant
                  ? resolveMerchantName(liveMerchant, locale)
                  : merchant?.companyName ?? '—'
              }
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.contract.lessee')}
              value={rental.customerName}
              sub={<span className="num">+966{rental.customerMobile}</span>}
            />
          </Card>

          {/* Key terms */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.keyTerms')}
              className="mb-0"
            />
            <div className="grid grid-cols-2 gap-3">
              <Stat
                icon={<CarIcon size={14} />}
                label={t('merchant.rental.contract.item')}
                value={rental.item}
              />
              <Stat
                label={t('merchant.rental.contract.rentalFee')}
                value={
                  <span className="num">{formatCurrency(rental.monthlyAmount)}</span>
                }
              />
              <Stat
                label={t('merchant.rental.contract.duration')}
                value={
                  <span className="num">
                    {t('merchant.rentals.rentalPeriod', { count: durationDays })}
                  </span>
                }
              />
              <Stat
                label={t('merchant.rental.contract.itemValue')}
                value={
                  <span className="num">{formatCurrency(rental.itemValue)}</span>
                }
              />
            </div>
          </Card>

          {/* Clauses summary */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.clauses')}
              className="mb-0"
              action={
                <span className="text-[12px] text-ink-400">
                  {t('merchant.rental.contract.clausesCount', {
                    count: clauses.length,
                  })}
                </span>
              }
            />
            <ol className="space-y-2.5 list-none p-0 m-0">
              {clauses.map((c, idx) => (
                <li key={c.id} className="flex gap-2.5">
                  <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-canvas-100 text-ink-700 grid place-items-center text-[11px] font-semibold num">
                    {idx + 1}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[13px] font-semibold text-ink-900">
                      {c.title[locale]}
                    </div>
                    <div className="mt-0.5 text-[12.5px] text-ink-600 leading-relaxed">
                      {c.body[locale]}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </Card>

          {/* Readiness */}
          <Card padded className="space-y-3">
            <SectionHeader
              title={t('merchant.rental.contract.readiness')}
              className="mb-0"
            />
            <Row
              label={t('merchant.rental.contract.readyAt')}
              value={
                readyAt ? (
                  <span className="num">
                    {formatDate(readyAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                ) : (
                  t('merchant.rental.timeline.pending')
                )
              }
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.contract.signedAt')}
              value={
                signedAt ? (
                  <span className="num">
                    {formatDate(signedAt, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                ) : (
                  t('merchant.rental.timeline.pending')
                )
              }
            />
          </Card>

          {/* Nafith placeholder */}
          <div className="rounded-xl2 bg-gold-50 hairline p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-gold-700 grid place-items-center ring-1 hairline">
              <BadgeCheckIcon size={18} />
            </span>
            <div className="min-w-0 text-[12px] text-brand-800/90 leading-relaxed">
              <div className="flex items-center gap-1.5 text-brand-900 font-semibold mb-0.5">
                <ShieldIcon size={12} />
                {t('track.placeholders.nafith')}
              </div>
              {t('track.placeholders.nafithDesc')}
            </div>
          </div>

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
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-400 num">{sub}</div>}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon?: React.ReactNode;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="rounded-xl2 bg-canvas-100 p-3">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-ink-500">
        {icon}
        {label}
      </div>
      <div className="mt-1 text-[13.5px] font-semibold text-ink-900 truncate">
        {value}
      </div>
    </div>
  );
}
