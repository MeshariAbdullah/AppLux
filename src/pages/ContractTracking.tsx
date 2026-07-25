import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardSkeleton,
  EmptyState,
  PageSkeleton,
  SectionHeader,
} from '@/components/ui';
import {
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  DownloadIcon,
  InfoIcon,
  ReceiptIcon,
  ShieldIcon,
  SparkleIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { resolveMerchantName } from '@/lib/merchantName';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptInvoice,
  adaptNote,
  fetchContractById,
  fetchInvoiceById,
  fetchBranchById,
  fetchMerchant,
  fetchNoteByContractId,
  listInvoiceItems,
  useSupabaseAuth,
} from '@/lib/supabase';
import type {
  MerchantRow,
  RentalContractRow,
  RentalInvoiceItemRow,
  RentalInvoiceRow,
} from '@/lib/supabase';
import { logEvent } from '@/lib/observability/log';
import type { Contract, Invoice, PromissoryNote } from '@/lib/data';
import { ContractStatusChip } from '@/components/rental/StatusChips';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import {
  deriveJourneyFromUIContract,
  deriveSimpleJourney,
  simpleCurrentFromUIContract,
} from '@/lib/rentalJourney';
import {
  buildContractFromTemplate,
  formatOperatingHoursLabel,
  type ContractTemplateOutput,
} from '@/lib/contractTemplate';
import type { TimelineEvent } from '@/components/track/DocTimeline';

function daysBetween(start: string, end: string) {
  const a = new Date(start).getTime();
  const b = new Date(end).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return 0;
  return Math.max(1, Math.round((b - a) / (1000 * 60 * 60 * 24)));
}

export default function ContractTracking() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { contracts, invoices, notes, session } = useStore();
  const { configured, profile: supabaseProfile } = useSupabaseAuth();
  const { formatCurrency, formatDate, locale, dir } = useI18n();

  const demoContract = useMemo(() => contracts.find((c) => c.id === id), [contracts, id]);
  const [liveContract, setLiveContract] = useState<Contract | null>(null);
  const [liveInvoices, setLiveInvoices] = useState<Invoice[] | null>(null);
  const [liveNote, setLiveNote] = useState<PromissoryNote | null>(null);
  // Loading guard — true while the route-param-driven Supabase fetch
  // is in flight. Keeps the page from rendering the previous entity's
  // data while the new one loads (entity-leak risk on /track/:id
  // navigation) and prevents the "not found" empty state from
  // appearing before the fetch resolves.
  const [resolving, setResolving] = useState<boolean>(
    () => configured && Boolean(id),
  );
  // Generated contract content — the same template the customer
  // approved during the review wizard. Rendered inline when the
  // "View full contract" button is tapped (drives the panel below).
  const [contractTemplate, setContractTemplate] =
    useState<ContractTemplateOutput | null>(null);
  const [showFullContract, setShowFullContract] = useState(false);
  // Bugs 17/19 resume: a pending contract whose receipt photos are not
  // confirmed can re-enter the guided flow via the invoice scan token.
  const [resumeToken, setResumeToken] = useState<string | null>(null);
  // Party identity snapshots (20260502123500) — kept raw so the record
  // card shows the values FROZEN at acceptance, not mutable live data.
  // NULL on legacy contracts → the card falls back to live names.
  const [partySnapshot, setPartySnapshot] = useState<{
    lessorLegalName: string | null;
    lessorCr: string | null;
    lesseeLegalName: string | null;
    lesseeNationalId: string | null;
  } | null>(null);
  // PDF export — raw pieces captured at fetch time so the exported
  // document is built from EXACTLY the data this screen renders.
  const [pdfBits, setPdfBits] = useState<{
    row: RentalContractRow;
    invoiceRow: RentalInvoiceRow | null;
    itemName: string | null;
    durationDays: number;
    branchHours: { open: string | null; close: string | null } | null;
  } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  // Synchronous double-tap guard — state updates lag a render, so two
  // rapid taps could both pass an `exporting` check.
  const exportingRef = useRef(false);

  useEffect(() => {
    if (!configured || !id) {
      setLiveContract(null);
      setLiveInvoices(null);
      setLiveNote(null);
      setContractTemplate(null);
      setResolving(false);
      return;
    }
    // Clear any stale previous-entity state when the :id param changes
    // before kicking off the new fetch.
    setLiveContract(null);
    setLiveInvoices(null);
    setLiveNote(null);
    setContractTemplate(null);
    setResumeToken(null);
    setPdfBits(null);
    setExportError(null);
    setResolving(true);
    let cancelled = false;
    (async () => {
      const row = await fetchContractById(id).catch(() => null);
      if (cancelled) return;
      if (!row) {
        setResolving(false);
        return;
      }
      const merchant = await fetchMerchant(row.merchant_id).catch(() => null);
      if (cancelled) return;
      // Data-consistency fix: locale-aware resolution (same helper as
      // every other surface) — the Arabic UI previously showed the
      // ENGLISH display name here while Home showed the Arabic one.
      const merchantName = resolveMerchantName(merchant, locale, '—');
      setLiveContract(adaptContract(row, merchantName));
      setPartySnapshot({
        lessorLegalName: row.lessor_legal_name ?? merchant?.company_name ?? null,
        lessorCr: row.lessor_cr_number ?? merchant?.commercial_reg_number ?? null,
        lesseeLegalName: row.lessee_legal_name ?? null,
        lesseeNationalId: row.lessee_national_id ?? null,
      });

      let invoiceRow: RentalInvoiceRow | null = null;
      let items: RentalInvoiceItemRow[] = [];
      const fetchedInvoice = await fetchInvoiceById(row.invoice_id).catch(() => null);
      if (cancelled) return;
      if (!fetchedInvoice) {
        setLiveInvoices([]);
      } else {
        invoiceRow = fetchedInvoice;
        items = await listInvoiceItems(fetchedInvoice.id).catch(() => []);
        if (cancelled) return;
        setLiveInvoices([adaptInvoice(fetchedInvoice, items, merchantName)]);
        // Data-consistency fix: re-adapt the contract with the REAL
        // item name now that the invoice items are loaded (the early
        // set above painted with the reference fallback).
        if (items[0]?.item_name) {
          setLiveContract(adaptContract(row, merchantName, items[0].item_name));
        }
        // Bugs 17/19: unfinished receipt documentation — surface the
        // way back into the guided flow's photos step.
        if (
          row.status === 'pending' &&
          !row.receipt_photos_confirmed_at &&
          fetchedInvoice.scan_token
        ) {
          setResumeToken(fetchedInvoice.scan_token);
        }
      }

      // Build the generated contract content from the same template
      // the customer saw at review time. Uses the invoice's stored
      // light_damage_fraction + late_return_multiplier so the panel
      // here matches what was approved.
      if (invoiceRow) {
        // Mirror accept_rental_invoice: duration = max(rental_days).
        const durationDays = items.length
          ? Math.max(...items.map((it) => it.rental_days || 0)) || 30
          : 30;
        // Same wording source as the review step: real branch hours in
        // the rental-period clause when the branch has them.
        const branch = row.branch_id
          ? await fetchBranchById(row.branch_id).catch(() => null)
          : null;
        if (cancelled) return;
        const branchHours = branch
          ? { open: branch.hours_open, close: branch.hours_close }
          : null;
        setContractTemplate(
          buildContractFromTemplate({
            invoice: invoiceRow,
            items,
            merchant: merchant as MerchantRow | null,
            pickupDate: row.start_date,
            returnDate: row.end_date,
            durationDays,
            branchHours,
          }),
        );
        setPdfBits({
          row,
          invoiceRow,
          itemName: items[0]?.item_name ?? null,
          durationDays,
          branchHours,
        });
      } else {
        setContractTemplate(null);
        setPdfBits(null);
      }

      const noteRow = await fetchNoteByContractId(row.id).catch(() => null);
      if (!cancelled && noteRow) {
        setLiveNote(adaptNote(noteRow, merchantName));
      }
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
    // locale: the merchant display name is locale-resolved inside.
  }, [configured, id, locale]);

  const contract = liveContract ?? demoContract;

  // ------- PDF export (approved contracts only) -------
  // Approved = the contract exists and was accepted into an active (or
  // since-ended) state. Drafts/offers and pending-photo contracts can
  // never export; demo mode has no real contract to certify.
  const pdfApproved = Boolean(
    pdfBits &&
      contractTemplate &&
      pdfBits.row.contract_number &&
      (pdfBits.row.status === 'active' || pdfBits.row.status === 'ended'),
  );
  // The exact identity values the PDF would print (snapshot-first,
  // same fallbacks as the record card). An approved contract missing
  // ANY required contracting identifier must never export — commonly a
  // pre-123500 contract with no snapshots and no profile National ID.
  const pdfIdentity = {
    businessName: partySnapshot?.lessorLegalName ?? contract?.counterparty ?? null,
    crNumber: partySnapshot?.lessorCr ?? null,
    fullName: partySnapshot?.lesseeLegalName ?? supabaseProfile?.full_name ?? null,
    nationalId: partySnapshot?.lesseeNationalId ?? null,
  };
  const pdfIdentityComplete = Boolean(
    pdfIdentity.businessName &&
      pdfIdentity.businessName !== '—' &&
      pdfIdentity.crNumber &&
      pdfIdentity.fullName &&
      pdfIdentity.nationalId,
  );
  const canExportPdf = pdfApproved && pdfIdentityComplete;
  const exportBlockedByIdentity = pdfApproved && !pdfIdentityComplete;

  const onExportPdf = async () => {
    if (!canExportPdf || !pdfBits || !contractTemplate || exportingRef.current) return;
    exportingRef.current = true;
    setExporting(true);
    setExportError(null);
    try {
      const { row, invoiceRow, itemName, durationDays, branchHours } = pdfBits;
      // Latin digits in both languages (app-wide contract rule). One
      // consistent Arabic form throughout: "26 يوليو 2026م".
      const dateTag = locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB';
      const fmtPdfDate = (iso: string) => {
        const s = new Date(iso).toLocaleDateString(dateTag, {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        });
        return locale === 'ar' ? `${s}م` : s;
      };
      const fmtPdfCurrency = (n: number) =>
        `${n.toLocaleString('en-US', { maximumFractionDigits: 0 })} ${locale === 'ar' ? 'ر.س' : 'SAR'}`;

      const { exportContractPdf } = await import('@/lib/pdf/contractPdf');
      await exportContractPdf({
        dir,
        reference: row.contract_number,
        fileName: `Lend-Contract-${row.contract_number}.pdf`,
        labels: {
          brand: 'Lend',
          docTitle: t('track.contract.pdf.docTitle'),
          reference: t('review.contract.reference'),
          status: t('track.contract.pdf.statusLabel'),
          approvedAt: t('track.contract.pdf.approvedAt'),
          partiesTitle: t('review.contract.parties'),
          lessorTitle: t('review.contract.lessor'),
          lesseeTitle: t('review.contract.lessee'),
          businessName: t('review.contract.businessName'),
          crNumber: t('review.contract.crNumber'),
          fullName: t('review.contract.partyFullName'),
          nationalId: t('review.contract.partyNationalId'),
          itemTitle: t('track.contract.pdf.itemTitle'),
          itemName: t('track.contract.pdf.itemName'),
          itemValue: t('track.contract.pdf.itemValue'),
          periodTitle: t('track.contract.pdf.periodTitle'),
          startDate: t('track.contract.pdf.startDate'),
          endDate: t('track.contract.pdf.endDate'),
          duration: t('track.contract.pdf.duration'),
          financialsTitle: t('track.contract.pdf.financialsTitle'),
          rentalFee: t('track.contract.rentalFee'),
          tax: t('track.contract.pdf.tax'),
          total: t('track.contract.pdf.total'),
          clausesTitle: t('track.contract.fullContractTitle'),
          obligationsTitle: t('review.contract.damagesTitle'),
          electronicRecord: t('track.contract.pdf.electronicRecord'),
          pageOf: t('track.contract.pdf.pageOf'),
        },
        values: {
          statusLabel:
            row.status === 'active'
              ? t('track.contract.pdf.statusActive')
              : t('track.contract.pdf.statusEnded'),
          approvedAtLabel: fmtPdfDate(row.signed_at ?? row.created_at),
          // Snapshot-first parties — the gate above guarantees all four
          // are present before this handler can run.
          businessName: pdfIdentity.businessName ?? '—',
          crNumber: pdfIdentity.crNumber ?? '—',
          fullName: pdfIdentity.fullName ?? '—',
          nationalId: pdfIdentity.nationalId ?? '—',
          itemName: itemName ?? contract?.title ?? '—',
          itemValue: row.original_item_value
            ? fmtPdfCurrency(Number(row.original_item_value))
            : null,
          startLabel: fmtPdfDate(row.start_date),
          endLabel: fmtPdfDate(row.end_date),
          durationLabel: t('track.contract.days', { count: durationDays }),
          hoursLabel: formatOperatingHoursLabel(
            branchHours?.open,
            branchHours?.close,
            locale === 'ar' ? 'ar' : 'en',
          ),
          rentalFee: fmtPdfCurrency(Number(row.rental_fee_amount)),
          tax: fmtPdfCurrency(Number(invoiceRow?.tax_amount ?? 0)),
          total: fmtPdfCurrency(Number(row.total_amount)),
        },
        clauses: contractTemplate.clauses.map((c) => ({
          title: c.title[locale],
          body: c.body[locale],
        })),
        obligations: [
          {
            label: t('review.contract.nonReturn'),
            amount: fmtPdfCurrency(contractTemplate.damages.nonReturn),
          },
          {
            label: t('review.contract.partialDamage'),
            amount: fmtPdfCurrency(contractTemplate.damages.partialDamage),
          },
          {
            label: t('review.contract.totalDamage'),
            amount: fmtPdfCurrency(contractTemplate.damages.totalDamage),
          },
        ],
      });
    } catch (err) {
      logEvent('rpc_failure', 'warn', { op: 'export_contract_pdf' }, err);
      setExportError(t('track.contract.pdf.failed'));
    } finally {
      exportingRef.current = false;
      setExporting(false);
    }
  };

  const linkedInvoices =
    liveInvoices ??
    (contract ? invoices.filter((i) => i.contractRef === id) : []);
  const linkedNote =
    liveNote ??
    (contract ? notes.find((n) => n.counterparty === contract.counterparty) : undefined);

  // Loading first — never let the "not found" empty state flash while
  // the live fetch is still resolving (or while the previous entity's
  // data is being cleared after the :id param changed).
  if (!contract && resolving) {
    return (
      <>
        <Header title={t('track.contractTitle')} showBack />
        <Screen>
          <CardSkeleton />
          <div className="mt-4">
            <PageSkeleton rows={2} />
          </div>
        </Screen>
      </>
    );
  }

  if (!contract) {
    return (
      <>
        <Header title={t('track.contractTitle')} showBack />
        <Screen>
          <EmptyState
            icon={<InfoIcon size={22} />}
            title={t('track.notFound')}
            action={
              <Button size="sm" onClick={() => navigate('/home', { replace: true })}>
                {t('track.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const duration = daysBetween(contract.startDate, contract.endDate);

  return (
    <>
      <Header title={t('track.contractTitle')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero — soft tinted, framed as an official record */}
          <div className="relative overflow-hidden rounded-[14px] bg-white ring-1 ring-beige-200 p-6">
            <div className="relative inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-green-700">
              <BadgeCheckIcon size={11} />
              {t('track.recordedOn', { date: formatDate(contract.startDate) })}
            </div>
            <div className="relative mt-4 flex items-start gap-3">
              <span className="h-11 w-11 rounded-xl bg-white text-ink-700 hairline grid place-items-center shrink-0">
                <DocIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('track.contractTitle')}
                </div>
                <div className="mt-1.5 editorial-title text-[22px] leading-tight truncate text-ink-900">
                  {contract.title}
                </div>
                <div className="mt-1 text-[12px] text-ink-500 truncate">
                  {contract.counterparty}
                </div>
              </div>
              <ContractStatusChip status={contract.status} />
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.contract.rentalFee')}
                </div>
                <div className="mt-0.5 font-semibold num text-ink-900">
                  {formatCurrency(contract.monthlyAmount)}
                </div>
              </div>
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.contract.duration')}
                </div>
                <div className="mt-0.5 font-semibold num text-ink-900">
                  {t('track.contract.days', { count: duration })}
                </div>
              </div>
            </div>
          </div>

          {/* Bugs 17/19: the rental cannot start until the receipt
              photos are uploaded + confirmed — this is the resume path
              back into the guided flow's photos step. */}
          {resumeToken && contract.status === 'pending' && (
            <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/25 p-4 space-y-3">
              <div className="text-[13px] font-semibold text-warn-700 leading-tight">
                {t('track.contract.receiptPending.title')}
              </div>
              <p className="text-[12px] text-ink-600 leading-relaxed">
                {t('track.contract.receiptPending.body')}
              </p>
              <Button
                variant="primary"
                size="md"
                block
                onClick={() => navigate(`/review/${resumeToken}`)}
              >
                {t('track.contract.receiptPending.cta')}
              </Button>
            </div>
          )}

          {/* Journey is the primary structural element — leads the page.
              Current phase: the approved 4-stage reference journey. */}
          <RentalJourneyTimeline
            variant="lead"
            steps={
              ENABLE_PAYMENTS_AND_NOTES
                ? deriveJourneyFromUIContract(
                    contract,
                    linkedInvoices[0] ? { issuedAt: linkedInvoices[0].issuedAt } : null,
                    linkedNote ? { status: linkedNote.status } : null,
                  )
                : deriveSimpleJourney({
                    current: simpleCurrentFromUIContract(contract.status),
                    requestAt: linkedInvoices[0]?.issuedAt ?? null,
                    startedAt: contract.startDate,
                  })
            }
          />

          {/* Single calm "Record" card — parties + key terms merged. */}
          <section className="rounded-xl3 bg-white hairline p-5 shadow-soft">
            <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.14em]">
              {t('track.contract.recordTitle')}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3.5">
              {/* Party identity — SNAPSHOT-first (frozen at acceptance,
                  20260502123500); live fallbacks cover legacy rows. */}
              <Field
                label={t('review.contract.businessName')}
                value={partySnapshot?.lessorLegalName ?? contract.counterparty}
              />
              <Field
                label={t('review.contract.crNumber')}
                value={
                  partySnapshot?.lessorCr ? (
                    <span className="num" dir="ltr">{partySnapshot.lessorCr}</span>
                  ) : (
                    '—'
                  )
                }
              />
              <Field
                label={t('review.contract.partyFullName')}
                value={
                  partySnapshot?.lesseeLegalName ??
                  supabaseProfile?.full_name ??
                  session?.fullName ??
                  '—'
                }
              />
              <Field
                label={t('review.contract.partyNationalId')}
                value={
                  partySnapshot?.lesseeNationalId ? (
                    <span className="num" dir="ltr">{partySnapshot.lesseeNationalId}</span>
                  ) : (
                    '—'
                  )
                }
              />
              <Field
                label={t('track.contract.startOn')}
                value={<span className="num">{formatDate(contract.startDate)}</span>}
              />
              <Field
                label={t('track.contract.endOn')}
                value={<span className="num">{formatDate(contract.endDate)}</span>}
              />
              <div className="col-span-2 h-px bg-canvas-200/80" />
              <Field
                label={t('track.contract.rentalFee')}
                value={
                  <span className="num">{formatCurrency(contract.monthlyAmount)}</span>
                }
              />
              <Field
                label={t('track.contract.duration')}
                value={
                  <span className="num">
                    {t('track.contract.days', { count: duration })}
                  </span>
                }
              />
            </div>
          </section>

          {/* Linked docs */}
          <section>
            <SectionHeader title={t('track.contract.linkedDocs')} />
            <div className="space-y-2.5">
              {/* Promissory-note document link — hidden in the current
                  phase (ENABLE_PAYMENTS_AND_NOTES). */}
              {ENABLE_PAYMENTS_AND_NOTES && linkedNote && (
                <button
                  type="button"
                  onClick={() => navigate(`/track/note/${linkedNote.id}`)}
                  className="w-full text-start"
                >
                  <Card padded interactive className="flex items-center gap-3">
                    <span className="h-10 w-10 shrink-0 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
                      <WalletIcon size={18} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                        {t('track.linkedNote')}
                      </div>
                      <div className="mt-0.5 text-[12px] text-ink-400 num truncate">
                        {linkedNote.reference}
                      </div>
                    </div>
                    <span className="num text-[12.5px] font-semibold text-ink-900 shrink-0">
                      {formatCurrency(linkedNote.amount)}
                    </span>
                  </Card>
                </button>
              )}
              {linkedInvoices.length === 0 ? (
                <EmptyState
                  icon={<ReceiptIcon size={20} />}
                  title={t('sections.noInvoices')}
                  description={t('sections.emptyHint')}
                />
              ) : (
                linkedInvoices.map((inv) => (
                  <button
                    type="button"
                    key={inv.id}
                    onClick={() => navigate(`/track/invoice/${inv.id}`)}
                    className="w-full text-start"
                  >
                    <Card padded interactive className="flex items-center gap-3">
                      <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                        <ReceiptIcon size={18} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                          {inv.title}
                        </div>
                        <div className="mt-0.5 text-[12px] text-ink-400 truncate">
                          {t('sections.due')} · {formatDate(inv.dueDate)}
                        </div>
                      </div>
                      <span className="num text-[12.5px] font-semibold text-ink-900 shrink-0">
                        {formatCurrency(inv.amount)}
                      </span>
                    </Card>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Primary action — expands the inline full-contract panel
              with all the generated clauses the customer approved.
              Below it: the SEPARATE secondary export-to-PDF action
              (approved contracts only — never drafts/offers). */}
          <div className="pt-2 space-y-3">
            <Button
              variant="primary"
              size="lg"
              block
              className="!bg-navy-700 hover:!bg-navy-800 active:!bg-navy-800 disabled:!bg-navy-700/50"
              leading={<DocIcon size={18} />}
              onClick={() => setShowFullContract((v) => !v)}
              disabled={!contractTemplate}
            >
              {showFullContract
                ? t('track.contract.hideFullContract')
                : t('track.contract.openContract')}
            </Button>
            {(canExportPdf || exportBlockedByIdentity) && (
              <Button
                variant="secondary"
                size="lg"
                block
                leading={<DownloadIcon size={18} />}
                onClick={() => void onExportPdf()}
                loading={exporting}
                disabled={exporting || !canExportPdf}
              >
                {exporting
                  ? t('track.contract.pdf.exporting')
                  : t('track.contract.pdf.exportCta')}
              </Button>
            )}
            {exportBlockedByIdentity && (
              <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-4 py-3 text-[12.5px] text-danger-700 leading-relaxed">
                {t('track.contract.pdf.identityIncomplete')}
              </div>
            )}
            {exportError && (
              <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-4 py-3 text-[12.5px] text-danger-700 leading-relaxed">
                {exportError}
              </div>
            )}
          </div>

          {showFullContract && contractTemplate && (
            <section className="space-y-2.5 animate-fade-in">
              <SectionHeader title={t('track.contract.fullContractTitle')} />
              <Card padded className="space-y-3.5">
                {contractTemplate.clauses.map((c, i) => (
                  <div key={c.id} className="flex items-start gap-3">
                    <span className="num h-6 w-6 shrink-0 rounded-full bg-canvas-100 text-ink-700 grid place-items-center text-[10.5px] font-semibold">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink-900 tracking-tight">
                        {c.title[locale]}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-ink-600 leading-relaxed">
                        {c.body[locale]}
                      </div>
                    </div>
                  </div>
                ))}
                {/* The old percentage/per-day note duplicated the light-
                    damage and late-return clauses above — removed. */}
              </Card>
            </section>
          )}
        </div>
      </Screen>
    </>
  );
}

function buildContractEvents(
  contract: {
    status: 'active' | 'pending' | 'ended';
    startDate: string;
    endDate: string;
  },
  t: (key: string, vars?: Record<string, string | number>) => string,
): TimelineEvent[] {
  const created = contract.startDate;
  const nafath = contract.startDate;
  const signed = contract.startDate;
  const nafith = contract.startDate;
  const active = contract.startDate;

  const base: TimelineEvent[] = [
    evt('created', t('track.contract.events.created'), created, 'done', 'brand', <DocIcon size={14} />),
    evt('nafath', t('track.contract.events.nafathVerified'), nafath, 'done', 'success', <ShieldIcon size={14} />),
    evt('signed', t('track.contract.events.signed'), signed, 'done', 'success', <CheckIcon size={14} strokeWidth={2.6} />),
    evt('nafith', t('track.contract.events.nafithAttested'), nafith, 'done', 'gold', <BadgeCheckIcon size={14} />),
  ];

  if (contract.status === 'pending') {
    return [
      evt('created', t('track.contract.events.created'), created, 'done', 'brand', <DocIcon size={14} />),
      evt('nafath', t('track.contract.events.nafathVerified'), nafath, 'current', 'warn', <ShieldIcon size={14} />),
      evt('signed', t('track.contract.events.signed'), null, 'pending', 'neutral', <CheckIcon size={14} />),
      evt('nafith', t('track.contract.events.nafithAttested'), null, 'pending', 'neutral', <BadgeCheckIcon size={14} />),
      evt('active', t('track.contract.events.active'), null, 'pending', 'neutral', <SparkleIcon size={14} />),
    ];
  }

  if (contract.status === 'ended') {
    return [
      ...base,
      evt('active', t('track.contract.events.active'), active, 'done', 'success', <SparkleIcon size={14} />),
      evt('ended', t('track.contract.events.ended'), contract.endDate, 'current', 'neutral', <ClockIcon size={14} />),
    ];
  }

  return [
    ...base,
    evt('active', t('track.contract.events.active'), active, 'done', 'success', <SparkleIcon size={14} />),
    evt('ended', t('track.contract.events.ended'), contract.endDate, 'pending', 'neutral', <ArrowIcon size={14} />),
  ];
}

function evt(
  id: string,
  label: string,
  at: string | null,
  state: TimelineEvent['state'],
  tone: TimelineEvent['tone'],
  icon: TimelineEvent['icon'],
): TimelineEvent {
  return { id, label, at, state, tone, icon };
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">{value}</div>
    </div>
  );
}
