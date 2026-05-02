import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  EmptyState,
  SectionHeader,
} from '@/components/ui';
import {
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  InfoIcon,
  ReceiptIcon,
  ShieldIcon,
  SparkleIcon,
  SupportIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptInvoice,
  adaptNote,
  fetchContractById,
  fetchInvoiceById,
  fetchMerchant,
  fetchNoteByContractId,
  listInvoiceItems,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, Invoice, PromissoryNote } from '@/lib/data';
import { ContractStatusChip } from '@/components/rental/StatusChips';
import {
  DocTimeline,
  type TimelineEvent,
} from '@/components/track/DocTimeline';
import { PlatformBadge } from '@/components/track/PlatformBadge';

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
  const { configured } = useSupabaseAuth();
  const { formatCurrency, formatDate } = useI18n();

  const demoContract = useMemo(() => contracts.find((c) => c.id === id), [contracts, id]);
  const [liveContract, setLiveContract] = useState<Contract | null>(null);
  const [liveInvoices, setLiveInvoices] = useState<Invoice[] | null>(null);
  const [liveNote, setLiveNote] = useState<PromissoryNote | null>(null);

  useEffect(() => {
    if (!configured || !id) {
      setLiveContract(null);
      setLiveInvoices(null);
      setLiveNote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const row = await fetchContractById(id).catch(() => null);
      if (cancelled || !row) return;
      const merchant = await fetchMerchant(row.merchant_id).catch(() => null);
      if (cancelled) return;
      const merchantName =
        merchant?.display_name?.en ?? merchant?.company_name ?? '—';
      setLiveContract(adaptContract(row, merchantName));

      const invoiceRow = await fetchInvoiceById(row.invoice_id).catch(() => null);
      if (cancelled || !invoiceRow) {
        setLiveInvoices([]);
      } else {
        const items = await listInvoiceItems(invoiceRow.id).catch(() => []);
        if (cancelled) return;
        setLiveInvoices([adaptInvoice(invoiceRow, items)]);
      }

      const noteRow = await fetchNoteByContractId(row.id).catch(() => null);
      if (!cancelled && noteRow) {
        setLiveNote(adaptNote(noteRow, merchantName));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, id]);

  const contract = liveContract ?? demoContract;
  const linkedInvoices =
    liveInvoices ??
    (contract ? invoices.filter((i) => i.contractRef === id) : []);
  const linkedNote =
    liveNote ??
    (contract ? notes.find((n) => n.counterparty === contract.counterparty) : undefined);

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
  const events = buildContractEvents(contract, t);

  return (
    <>
      <Header title={t('track.contractTitle')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero — soft tinted */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-canvas-50 via-white to-gold-50 hairline p-6 shadow-card">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-15%] h-44 w-44 rounded-full bg-gold-300/18 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
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

          {/* Parties */}
          <section>
            <SectionHeader title={t('track.contract.parties')} />
            <Card padded className="space-y-3">
              <Field label={t('track.contract.lessor')} value={contract.counterparty} />
              <CardDivider />
              <Field label={t('review.contract.lessee')} value={session?.fullName ?? '—'} />
            </Card>
          </section>

          {/* Key terms */}
          <section>
            <SectionHeader title={t('track.contract.keyTerms')} />
            <Card padded className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field
                  label={t('track.contract.startOn')}
                  value={<span className="num">{formatDate(contract.startDate)}</span>}
                />
                <Field
                  label={t('track.contract.endOn')}
                  value={<span className="num">{formatDate(contract.endDate)}</span>}
                />
              </div>
              <CardDivider />
              <Field
                label={t('track.contract.rentalFee')}
                value={<span className="num">{formatCurrency(contract.monthlyAmount)}</span>}
              />
            </Card>
          </section>

          {/* Platform placeholders */}
          <div className="grid grid-cols-1 gap-2.5">
            <PlatformBadge
              platform="nafath"
              state={contract.status === 'pending' ? 'pending' : 'verified'}
              title={t('track.placeholders.nafath')}
              description={t('track.placeholders.nafathDesc')}
              stateLabel={
                contract.status === 'pending'
                  ? t('track.placeholders.pending')
                  : t('track.placeholders.verified')
              }
              meta={formatDate(contract.startDate)}
            />
            <PlatformBadge
              platform="nafith"
              state={contract.status === 'pending' ? 'pending' : 'verified'}
              title={t('track.placeholders.nafith')}
              description={t('track.placeholders.nafithDesc')}
              stateLabel={
                contract.status === 'pending'
                  ? t('track.placeholders.pending')
                  : t('track.placeholders.verified')
              }
              meta={formatDate(contract.startDate)}
            />
          </div>

          {/* Timeline */}
          <section>
            <SectionHeader title={t('track.activity')} />
            <Card padded>
              <DocTimeline events={events} />
            </Card>
          </section>

          {/* Linked docs */}
          <section>
            <SectionHeader title={t('track.contract.linkedDocs')} />
            <div className="space-y-2.5">
              {linkedNote && (
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

          {/* Actions */}
          <div className="space-y-2.5">
            <Button variant="primary" size="lg" block leading={<DocIcon size={18} />}>
              {t('track.contract.openContract')}
            </Button>
            <Button variant="secondary" block leading={<SupportIcon size={16} />}>
              {t('track.contactSupport')}
            </Button>
          </div>
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
