import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  EmptyState,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  BuildingIcon,
  ChevronIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  InfoIcon,
  MapPinIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
  SignatureIcon,
  UserIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  SEED_ADMIN_ACTIVE_CASES,
  SEED_ADMIN_OVERDUE,
  type AdminActiveCase,
  type AdminCaseContractStatus,
  type AdminCaseInvoiceStatus,
  type AdminCaseKind,
  type AdminCaseNoteDocStatus,
  type AdminCaseSeverity,
  type AdminCaseStage,
  type AdminOverdueCase,
} from '@/lib/data';

function severityTone(s: AdminCaseSeverity): StatusTone {
  if (s === 'partial') return 'warn';
  return 'danger';
}

function stageTone(s: AdminCaseStage): StatusTone {
  if (s === 'review') return 'brand';
  if (s === 'settlement') return 'gold';
  if (s === 'nafith') return 'warn';
  return 'danger';
}

function invoiceTone(s: AdminCaseInvoiceStatus): StatusTone {
  if (s === 'paid') return 'success';
  if (s === 'pending') return 'warn';
  return 'danger';
}

function contractTone(s: AdminCaseContractStatus): StatusTone {
  if (s === 'active' || s === 'signed') return 'success';
  if (s === 'closed') return 'neutral';
  return 'danger';
}

function noteTone(s: AdminCaseNoteDocStatus): StatusTone {
  if (s === 'collected') return 'success';
  if (s === 'issued') return 'brand';
  if (s === 'pending') return 'warn';
  return 'danger';
}

type CaseHeader = {
  kind: AdminCaseKind;
  merchantName: string;
  customerName: string;
  customerInitials: string;
  item: string;
  severity?: AdminCaseSeverity;
  claimAmount?: number;
  reportedAt?: string;
  daysOverdue?: number;
  bucketAmount?: number;
};

function findHeader(
  kind: AdminCaseKind,
  id: string,
): CaseHeader | null {
  if (kind === 'damage') {
    const c: AdminActiveCase | undefined = SEED_ADMIN_ACTIVE_CASES.find(
      (x) => x.id === id,
    );
    if (!c) return null;
    return {
      kind,
      merchantName: c.merchantName,
      customerName: c.customerName,
      customerInitials: c.customerInitials,
      item: c.item,
      severity: c.severity,
      claimAmount: c.claimAmount,
      reportedAt: c.reportedAt,
    };
  }
  const c: AdminOverdueCase | undefined = SEED_ADMIN_OVERDUE.find(
    (x) => x.id === id,
  );
  if (!c) return null;
  return {
    kind,
    merchantName: c.merchantName,
    customerName: c.customerName,
    customerInitials: c.customerInitials,
    item: c.item,
    daysOverdue: c.daysOverdue,
    bucketAmount: c.amount,
  };
}

export default function AdminCaseDetails() {
  const t = useT();
  const navigate = useNavigate();
  const { dir, formatCurrency, formatDate } = useI18n();
  const { kind: rawKind = 'damage', id = '' } = useParams<{
    kind: string;
    id: string;
  }>();

  const kind: AdminCaseKind = rawKind === 'overdue' ? 'overdue' : 'damage';
  const detailKey = kind === 'overdue' ? `${id}-OD` : id;

  const { adminCases } = useStore();

  const detail = useMemo(
    () => adminCases.find((c) => c.id === detailKey) ?? null,
    [adminCases, detailKey],
  );
  const header = useMemo(() => findHeader(kind, id), [kind, id]);

  if (!detail || !header) {
    return (
      <>
        <Header title={t('admin.case.title')} showBack />
        <Screen padded={false} className="bg-ink-50">
          <div className="px-4 pt-6">
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('admin.case.notFound.title')}
              description={t('admin.case.notFound.hint')}
              action={
                <Button onClick={() => navigate('/admin/cases')}>
                  {t('admin.case.notFound.cta')}
                </Button>
              }
            />
          </div>
        </Screen>
      </>
    );
  }

  const { linked, escalation, summary } = detail;
  const stage = escalation.currentStage;

  return (
    <>
      <Header
        title={t('admin.case.title')}
        subtitle={header.customerName}
        showBack
      />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-10 space-y-4">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 shadow-float">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-15%] h-56 w-56 rounded-full bg-gold-500/25 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span
                className={cn(
                  'h-12 w-12 shrink-0 rounded-2xl ring-1 grid place-items-center',
                  kind === 'damage'
                    ? 'bg-danger-500/15 ring-danger-400/30 text-danger-200'
                    : 'bg-warn-500/15 ring-warn-400/30 text-warn-200',
                )}
              >
                {kind === 'damage' ? (
                  <GavelIcon size={20} />
                ) : (
                  <ClockIcon size={20} />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11px] font-semibold text-gold-200">
                  <ShieldIcon size={12} />
                  {t(`admin.case.kind.${kind}`)}
                </div>
                <h1 className="mt-2 text-[18px] leading-tight font-bold truncate">
                  {detail.id}
                </h1>
                <div className="mt-1 text-[12px] text-white/65 truncate">
                  {header.merchantName} · {header.item}
                </div>
              </div>
            </div>

            <p className="relative mt-3 text-[12.5px] text-white/75 leading-relaxed">
              {summary}
            </p>

            <div className="relative mt-4 flex flex-wrap items-center gap-2">
              {kind === 'damage' && header.severity && (
                <StatusChip
                  size="md"
                  tone={severityTone(header.severity)}
                  dot={false}
                  label={t(`merchant.damages.severity.${header.severity}`)}
                />
              )}
              {kind === 'overdue' && typeof header.daysOverdue === 'number' && (
                <StatusChip
                  size="md"
                  tone="danger"
                  dot
                  label={t('admin.home.overdue.daysOverdue', {
                    count: header.daysOverdue,
                  })}
                />
              )}
              <StatusChip
                size="md"
                tone={stageTone(stage)}
                dot
                label={t(`admin.home.activeCases.stage.${stage}`)}
              />
            </div>

            <div className="relative mt-4 grid grid-cols-2 gap-2">
              <HeroTile
                label={t('admin.case.hero.customer')}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <span className="h-5 w-5 shrink-0 rounded-md bg-white/15 grid place-items-center text-[9.5px] font-bold">
                      {header.customerInitials}
                    </span>
                    <span className="truncate">{header.customerName}</span>
                  </span>
                }
              />
              <HeroTile
                label={
                  kind === 'damage'
                    ? t('admin.case.hero.claim')
                    : t('admin.case.hero.outstanding')
                }
                value={formatCurrency(
                  kind === 'damage'
                    ? header.claimAmount ?? 0
                    : header.bucketAmount ?? 0,
                )}
              />
            </div>
          </div>

          {/* Parties & case meta */}
          <Section
            title={t('admin.case.sections.overview')}
            icon={<InfoIcon size={14} />}
          >
            <Card padded className="space-y-0">
              <Field
                label={t('admin.case.fields.merchant')}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <BuildingIcon size={12} className="text-ink-400" />
                    {header.merchantName}
                  </span>
                }
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.case.fields.customer')}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <UserIcon size={12} className="text-ink-400" />
                    {header.customerName}
                  </span>
                }
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.case.fields.item')}
                value={header.item}
              />
              {kind === 'damage' && header.reportedAt && (
                <>
                  <CardDivider className="my-2" />
                  <Field
                    label={t('admin.case.fields.reportedAt')}
                    value={formatDate(header.reportedAt, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                    numeric
                  />
                </>
              )}
              {kind === 'overdue' && typeof header.daysOverdue === 'number' && (
                <>
                  <CardDivider className="my-2" />
                  <Field
                    label={t('admin.case.fields.daysOverdue')}
                    value={t('admin.home.overdue.daysOverdue', {
                      count: header.daysOverdue,
                    })}
                    numeric
                  />
                </>
              )}
            </Card>
          </Section>

          {/* Linked invoice */}
          <Section
            title={t('admin.case.sections.invoice')}
            icon={<ReceiptIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 text-brand-600 grid place-items-center">
                  <ReceiptIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink-900 truncate num">
                    {linked.invoiceRef}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">
                    {t('admin.case.invoice.due', {
                      date: formatDate(linked.invoiceDueAt),
                    })}
                  </div>
                </div>
                <StatusChip
                  size="sm"
                  tone={invoiceTone(linked.invoiceStatus)}
                  dot
                  label={t(`admin.case.invoice.status.${linked.invoiceStatus}`)}
                />
              </div>
              <div className="h-px bg-ink-100" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-ink-500 inline-flex items-center gap-1.5">
                  <WalletIcon size={12} />
                  {t('admin.case.invoice.amount')}
                </span>
                <span className="text-[14px] font-bold text-ink-900 num">
                  {formatCurrency(linked.invoiceAmount)}
                </span>
              </div>
              <Link
                to={`/track/invoice/${linked.invoiceRef}`}
                className="flex items-center gap-1.5 justify-center text-[12.5px] font-semibold text-brand-700 pt-1"
              >
                {t('admin.case.openInvoice')}
                <ChevronIcon
                  size={12}
                  className={cn(dir === 'rtl' ? 'rotate-180' : '')}
                />
              </Link>
            </Card>
          </Section>

          {/* Linked contract */}
          <Section
            title={t('admin.case.sections.contract')}
            icon={<DocIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-[#FBF2DD] text-gold-600 grid place-items-center">
                  <DocIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink-900 truncate num">
                    {linked.contractRef}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">
                    {t('admin.case.contract.startedAt', {
                      date: formatDate(linked.contractStartedAt),
                    })}
                  </div>
                </div>
                <StatusChip
                  size="sm"
                  tone={contractTone(linked.contractStatus)}
                  dot
                  label={t(
                    `admin.case.contract.status.${linked.contractStatus}`,
                  )}
                />
              </div>
              <div className="h-px bg-ink-100" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-ink-500 inline-flex items-center gap-1.5">
                  <MapPinIcon size={12} />
                  {t('admin.case.contract.parties')}
                </span>
                <span className="text-[12px] font-semibold text-ink-700 truncate max-w-[60%] text-end">
                  {header.merchantName} · {header.customerName}
                </span>
              </div>
              <Link
                to={`/track/contract/${linked.contractRef}`}
                className="flex items-center gap-1.5 justify-center text-[12.5px] font-semibold text-brand-700 pt-1"
              >
                {t('admin.case.openContract')}
                <ChevronIcon
                  size={12}
                  className={cn(dir === 'rtl' ? 'rotate-180' : '')}
                />
              </Link>
            </Card>
          </Section>

          {/* Linked promissory note */}
          <Section
            title={t('admin.case.sections.note')}
            icon={<SignatureIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-danger-50 text-danger-600 grid place-items-center">
                  <SignatureIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold text-ink-900 truncate num">
                    {linked.noteRef}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400">
                    {t('admin.case.note.principalLabel')}
                  </div>
                </div>
                <StatusChip
                  size="sm"
                  tone={noteTone(linked.noteStatus)}
                  dot
                  label={t(`admin.case.note.status.${linked.noteStatus}`)}
                />
              </div>
              <div className="h-px bg-ink-100" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-ink-500 inline-flex items-center gap-1.5">
                  <PackageIcon size={12} />
                  {t('admin.case.note.principal')}
                </span>
                <span className="text-[14px] font-bold text-ink-900 num">
                  {formatCurrency(linked.noteAmount)}
                </span>
              </div>
              {linked.noteStatus === 'forwarded-nafith' && (
                <div className="rounded-xl bg-danger-50 ring-1 ring-inset ring-danger-500/20 px-3 py-2 flex items-start gap-2 text-[11.5px] text-danger-700">
                  <AlertIcon size={14} className="shrink-0 mt-0.5" />
                  <span>{t('admin.case.note.forwardedHint')}</span>
                </div>
              )}
              <Link
                to={`/track/note/${linked.noteRef}`}
                className="flex items-center gap-1.5 justify-center text-[12.5px] font-semibold text-brand-700 pt-1"
              >
                {t('admin.case.openNote')}
                <ChevronIcon
                  size={12}
                  className={cn(dir === 'rtl' ? 'rotate-180' : '')}
                />
              </Link>
            </Card>
          </Section>

          <Link
            to="/admin/cases"
            className="block text-center text-[12.5px] font-semibold text-brand-700 py-2"
          >
            {t('admin.case.backToList')}
          </Link>
        </div>
      </Screen>
    </>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: ReactNode;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <span className="text-ink-500">{icon}</span>
        <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
          {title}
        </h2>
      </div>
      {children}
    </section>
  );
}

function Field({
  label,
  value,
  numeric,
}: {
  label: ReactNode;
  value: ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-1">
      <span className="text-[12px] text-ink-400 shrink-0">{label}</span>
      <span
        className={cn(
          'text-[13px] font-semibold text-ink-900 text-end break-words',
          numeric && 'num',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function HeroTile({
  label,
  value,
}: {
  label: ReactNode;
  value: ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white/5 ring-1 ring-white/10 p-2.5 backdrop-blur">
      <div className="text-white/55 uppercase tracking-wide text-[10px]">
        {label}
      </div>
      <div className="mt-0.5 font-bold text-white num text-[13px] leading-tight truncate">
        {value}
      </div>
    </div>
  );
}
