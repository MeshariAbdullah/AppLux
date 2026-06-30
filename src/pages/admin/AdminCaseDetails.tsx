import { useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  ConfirmSheet,
  EmptyState,
  FormField,
  StatusChip,
  Textarea,
  type StatusTone,
} from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  BadgeCheckIcon,
  BuildingIcon,
  CarIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  HistoryIcon,
  InfoIcon,
  MapPinIcon,
  PackageIcon,
  ReceiptIcon,
  ShieldIcon,
  SignatureIcon,
  SparkleIcon,
  TimelineIcon,
  UserIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import {
  caseSeverityTone as severityTone,
  caseStageTone as stageTone,
} from '@/lib/format/statusTones';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { demoMode, useSupabaseAuth } from '@/lib/supabase';
import {
  SEED_ADMIN_ACTIVE_CASES,
  SEED_ADMIN_OVERDUE,
  type AdminActiveCase,
  type AdminCaseAuditAction,
  type AdminCaseContractStatus,
  type AdminCaseEvidence,
  type AdminCaseEvidenceKind,
  type AdminCaseEvidenceSource,
  type AdminCaseInvoiceStatus,
  type AdminCaseKind,
  type AdminCaseNoteDocStatus,
  type AdminCaseNoteRole,
  type AdminCaseSeverity,
  type AdminCaseStage,
  type AdminOverdueCase,
} from '@/lib/data';


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

type EvidenceVisual = {
  gradient: string;
  ring: string;
  icon: ReactNode;
  chipClass: string;
};

function evidenceVisual(kind: AdminCaseEvidenceKind): EvidenceVisual {
  switch (kind) {
    case 'damage-exterior':
      return {
        gradient: 'from-danger-500/85 via-danger-600/90 to-danger-700',
        ring: 'ring-danger-500/30',
        icon: <GavelIcon size={22} />,
        chipClass: 'bg-danger-50 text-danger-700',
      };
    case 'damage-interior':
      return {
        gradient: 'from-danger-400/80 via-danger-500/85 to-danger-600',
        ring: 'ring-danger-500/25',
        icon: <PackageIcon size={22} />,
        chipClass: 'bg-danger-50 text-danger-700',
      };
    case 'dashboard':
      return {
        gradient: 'from-brand-500/80 via-brand-600/85 to-brand-700',
        ring: 'ring-brand-500/25',
        icon: <CarIcon size={22} />,
        chipClass: 'bg-canvas-100 text-ink-800',
      };
    case 'odometer':
      return {
        gradient: 'from-gold-400 via-gold-500 to-gold-600',
        ring: 'ring-gold-500/30',
        icon: <ClockIcon size={22} />,
        chipClass: 'bg-gold-50 text-gold-700',
      };
    case 'signature':
      return {
        gradient: 'from-ink-700 via-ink-800 to-ink-900',
        ring: 'ring-ink-900/40',
        icon: <SignatureIcon size={22} />,
        chipClass: 'bg-canvas-100 text-ink-700',
      };
    case 'receipt':
      return {
        gradient: 'from-brand-400/80 via-brand-500/85 to-brand-600',
        ring: 'ring-brand-500/25',
        icon: <ReceiptIcon size={22} />,
        chipClass: 'bg-canvas-100 text-ink-800',
      };
    case 'missing':
      return {
        gradient: 'from-warn-400 via-warn-500 to-warn-600',
        ring: 'ring-warn-500/30',
        icon: <AlertIcon size={22} />,
        chipClass: 'bg-warn-50 text-warn-700',
      };
    case 'location':
    default:
      return {
        gradient: 'from-brand-500/80 via-brand-600/90 to-ink-800',
        ring: 'ring-brand-500/25',
        icon: <MapPinIcon size={22} />,
        chipClass: 'bg-canvas-100 text-ink-800',
      };
  }
}

function evidenceSourceTone(s: AdminCaseEvidenceSource): StatusTone {
  if (s === 'operator') return 'brand';
  if (s === 'merchant') return 'gold';
  return 'neutral';
}

type NoteVisual = {
  bubble: string;
  badge: string;
  icon: ReactNode;
};

function noteVisual(role: AdminCaseNoteRole): NoteVisual {
  if (role === 'merchant') {
    return {
      bubble: 'bg-brand-50/80 ring-brand-500/15 text-ink-800',
      badge: 'bg-brand-100 text-gold-700',
      icon: <BuildingIcon size={11} />,
    };
  }
  if (role === 'operator') {
    return {
      bubble: 'bg-gold-50 ring-gold-500/20 text-ink-800',
      badge: 'bg-gold-50 text-gold-700',
      icon: <ShieldIcon size={11} />,
    };
  }
  return {
    bubble: 'bg-canvas-100 hairline text-ink-800',
    badge: 'bg-canvas-200 text-ink-600',
    icon: <SparkleIcon size={11} />,
  };
}

type AuditVisual = {
  dotClass: string;
  icon: ReactNode;
};

function auditVisual(action: AdminCaseAuditAction): AuditVisual {
  switch (action) {
    case 'reported':
      return {
        dotClass: 'bg-canvas-100 text-ink-800 ring-brand-500/20',
        icon: <InfoIcon size={12} />,
      };
    case 'evidence-added':
      return {
        dotClass: 'bg-canvas-100 text-ink-800 ring-brand-500/20',
        icon: <PackageIcon size={12} />,
      };
    case 'reviewed':
      return {
        dotClass: 'bg-success-50 text-success-700 ring-success-500/20',
        icon: <BadgeCheckIcon size={12} />,
      };
    case 'note-added':
      return {
        dotClass: 'bg-canvas-100 text-ink-700 hairline',
        icon: <DocIcon size={12} />,
      };
    case 'escalated-settlement':
      return {
        dotClass: 'bg-gold-50 text-gold-700 ring-gold-500/25',
        icon: <ArrowIcon size={12} />,
      };
    case 'escalated-nafith':
      return {
        dotClass: 'bg-warn-50 text-warn-700 ring-warn-500/25',
        icon: <GavelIcon size={12} />,
      };
    case 'escalated-execution':
      return {
        dotClass: 'bg-danger-50 text-danger-700 ring-danger-500/25',
        icon: <AlertIcon size={12} />,
      };
    case 'settled':
      return {
        dotClass: 'bg-success-50 text-success-700 ring-success-500/20',
        icon: <CheckIcon size={12} />,
      };
    default:
      return {
        dotClass: 'bg-canvas-100 text-ink-700 hairline',
        icon: <InfoIcon size={12} />,
      };
  }
}

function escalationStageTone(s: AdminCaseStage): StatusTone {
  if (s === 'review') return 'brand';
  if (s === 'settlement') return 'gold';
  if (s === 'nafith') return 'warn';
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
  demoMode: boolean,
): CaseHeader | null {
  // Phase 9: SEED_ADMIN_* lookups are demo-only. In live mode the
  // header comes back null and the page renders the case-not-found
  // empty state until a live Supabase fetch is wired up.
  if (!demoMode) return null;
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

  const { adminCases, addCaseNote, escalateCase } = useStore();
  const { configured } = useSupabaseAuth();

  const detail = useMemo(
    () => adminCases.find((c) => c.id === detailKey) ?? null,
    [adminCases, detailKey],
  );
  const header = useMemo(
    () => findHeader(kind, id, demoMode),
    [kind, id],
  );

  const [noteDraft, setNoteDraft] = useState('');
  const [noteFlash, setNoteFlash] = useState(false);
  const [escalateFlash, setEscalateFlash] = useState(false);
  const [escalateConfirmOpen, setEscalateConfirmOpen] = useState(false);

  const handleAddNote = () => {
    const trimmed = noteDraft.trim();
    if (!trimmed) return;
    const next = addCaseNote(detailKey, trimmed);
    if (next) {
      setNoteDraft('');
      setNoteFlash(true);
      window.setTimeout(() => setNoteFlash(false), 1800);
    }
  };

  const handleEscalate = () => {
    const next = escalateCase(detailKey);
    setEscalateConfirmOpen(false);
    if (next) {
      setEscalateFlash(true);
      window.setTimeout(() => setEscalateFlash(false), 1800);
    }
  };

  if (!detail || !header) {
    return (
      <>
        <Header title={t('admin.case.title')} showBack />
        <Screen padded={false} className="bg-canvas">
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
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-25"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 end-[-15%] h-56 w-56 rounded-full bg-gold-400/22 blur-3xl"
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
                <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11px] font-semibold text-gold-200">
                  <ShieldIcon size={12} />
                  {t(`admin.case.kind.${kind}`)}
                </div>
                <h1 className="mt-3 editorial-title text-[22px] leading-tight truncate num text-white">
                  {detail.id}
                </h1>
                <div className="mt-1.5 text-[12px] text-white/65 truncate">
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
                <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
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
              <div className="h-px bg-canvas-200/80" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-ink-500 inline-flex items-center gap-1.5">
                  <WalletIcon size={12} />
                  {t('admin.case.invoice.amount')}
                </span>
                <span className="text-[14px] font-bold text-ink-900 num">
                  {formatCurrency(linked.invoiceAmount)}
                </span>
              </div>
            </Card>
          </Section>

          {/* Linked contract */}
          <Section
            title={t('admin.case.sections.contract')}
            icon={<DocIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
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
              <div className="h-px bg-canvas-200/80" />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] text-ink-500 inline-flex items-center gap-1.5">
                  <MapPinIcon size={12} />
                  {t('admin.case.contract.parties')}
                </span>
                <span className="text-[12px] font-semibold text-ink-700 truncate max-w-[60%] text-end">
                  {header.merchantName} · {header.customerName}
                </span>
              </div>
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
              <div className="h-px bg-canvas-200/80" />
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
            </Card>
          </Section>

          {/* Evidence */}
          <Section
            title={t('admin.case.sections.evidence')}
            icon={<PackageIcon size={14} />}
            count={detail.evidence.length}
          >
            {detail.evidence.length === 0 ? (
              <Card padded>
                <EmptyState
                  icon={<InfoIcon size={20} />}
                  title={t('admin.case.evidence.empty.title')}
                  description={t('admin.case.evidence.empty.hint')}
                />
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {detail.evidence.map((ev) => (
                  <EvidenceTile key={ev.id} evidence={ev} />
                ))}
              </div>
            )}
          </Section>

          {/* Escalation */}
          <Section
            title={t('admin.case.sections.escalation')}
            icon={<GavelIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                  {t('admin.case.escalation.current')}
                </span>
                <StatusChip
                  size="sm"
                  tone={escalationStageTone(escalation.currentStage)}
                  dot
                  label={t(
                    `admin.home.activeCases.stage.${escalation.currentStage}`,
                  )}
                />
                {escalation.nextStage && (
                  <>
                    <ChevronIcon
                      size={12}
                      className={cn(
                        'text-ink-300',
                        dir === 'rtl' ? 'rotate-180' : '',
                      )}
                    />
                    <StatusChip
                      size="sm"
                      tone={escalationStageTone(escalation.nextStage)}
                      dot={false}
                      label={t(
                        `admin.home.activeCases.stage.${escalation.nextStage}`,
                      )}
                    />
                  </>
                )}
              </div>

              <p className="text-[12px] text-ink-500 leading-relaxed">
                {escalation.nextStage
                  ? t('admin.case.escalation.hint')
                  : t('admin.case.escalation.awaitingHint')}
              </p>

              {escalateFlash && (
                <div className="rounded-xl bg-success-50 ring-1 ring-inset ring-success-500/25 px-3 py-2 flex items-center gap-2 text-[12px] font-semibold text-success-700">
                  <CheckIcon size={14} />
                  {t('admin.case.escalation.flash')}
                </div>
              )}

              {/* Escalation is demo-only — `escalateCase` mutates only
                  the in-memory store. No real escalation RPC exists.
                  Hidden when configured. */}
              {!configured && (
                <Button
                  onClick={() =>
                    escalation.nextStage && setEscalateConfirmOpen(true)
                  }
                  disabled={!escalation.nextStage}
                  variant={escalation.nextStage ? 'primary' : 'ghost'}
                  className="w-full"
                >
                  {t(`admin.case.escalation.action.${escalation.nextActionKey}`)}
                </Button>
              )}
            </Card>
          </Section>

          {/* Notes */}
          <Section
            title={t('admin.case.sections.notes')}
            icon={<DocIcon size={14} />}
            count={detail.notes.length}
          >
            <Card padded className="space-y-3">
              {detail.notes.length === 0 ? (
                <EmptyState
                  icon={<InfoIcon size={20} />}
                  title={t('admin.case.notes.empty.title')}
                  description={t('admin.case.notes.empty.hint')}
                />
              ) : (
                <ul className="space-y-2">
                  {detail.notes.map((n) => (
                    <li key={n.id}>
                      <NoteBubble
                        role={n.role}
                        author={n.author}
                        at={formatDate(n.at, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                        roleLabel={t(`admin.case.notes.role.${n.role}`)}
                        text={n.text}
                      />
                    </li>
                  ))}
                </ul>
              )}

              {/* Notes are a demo-only feature today — `addCaseNote`
                  mutates the in-memory store and there is no real
                  damage_cases.notes column. Hidden when configured to
                  avoid a write that looks real but isn't. The existing
                  notes (above) still display as read-only history. */}
              {!configured && (
                <>
                  <CardDivider />

                  <FormField
                    label={t('admin.case.notes.addLabel')}
                    hint={t('admin.case.notes.addHint')}
                  >
                    <Textarea
                      value={noteDraft}
                      onChange={(e) => setNoteDraft(e.target.value)}
                      placeholder={t('admin.case.notes.addPlaceholder')}
                      rows={3}
                    />
                  </FormField>

                  {noteFlash && (
                    <div className="rounded-xl bg-success-50 ring-1 ring-inset ring-success-500/25 px-3 py-2 flex items-center gap-2 text-[12px] font-semibold text-success-700">
                      <CheckIcon size={14} />
                      {t('admin.case.notes.flash')}
                    </div>
                  )}

                  <Button
                    onClick={handleAddNote}
                    disabled={noteDraft.trim().length === 0}
                    className="w-full"
                  >
                    {t('admin.case.notes.submit')}
                  </Button>
                </>
              )}
            </Card>
          </Section>

          {/* Audit trail */}
          <Section
            title={t('admin.case.sections.audit')}
            icon={<TimelineIcon size={14} />}
            count={detail.audit.length}
          >
            <Card padded>
              {detail.audit.length === 0 ? (
                <EmptyState
                  icon={<HistoryIcon size={20} />}
                  title={t('admin.case.audit.empty.title')}
                  description={t('admin.case.audit.empty.hint')}
                />
              ) : (
                <ol className="relative">
                  <span
                    aria-hidden
                    className="absolute top-1 bottom-1 w-px bg-canvas-200 start-[13px]"
                  />
                  {detail.audit.map((a, i) => {
                    const av = auditVisual(a.action);
                    return (
                      <li
                        key={a.id}
                        className={cn(
                          'relative flex items-start gap-3',
                          i < detail.audit.length - 1 ? 'pb-3' : '',
                        )}
                      >
                        <span
                          className={cn(
                            'relative z-10 h-6 w-6 shrink-0 rounded-full ring-1 grid place-items-center',
                            av.dotClass,
                          )}
                        >
                          {av.icon}
                        </span>
                        <div className="min-w-0 flex-1 pt-0.5">
                          <div className="text-[12.5px] font-semibold text-ink-900">
                            {t(`admin.case.audit.action.${a.action}`)}
                          </div>
                          <div className="mt-0.5 text-[11px] text-ink-500 num">
                            {a.actor} ·{' '}
                            {formatDate(a.at, {
                              dateStyle: 'medium',
                              timeStyle: 'short',
                            })}
                          </div>
                          {a.detail && (
                            <div className="mt-1 text-[11.5px] text-ink-600">
                              {a.detail}
                            </div>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </Card>
          </Section>

          <Link
            to="/admin/cases"
            className="block text-center text-[12.5px] font-semibold text-gold-700 py-2"
          >
            {t('admin.case.backToList')}
          </Link>
        </div>
      </Screen>

      <ConfirmSheet
        open={escalateConfirmOpen}
        onClose={() => setEscalateConfirmOpen(false)}
        onConfirm={handleEscalate}
        title={t('admin.case.escalation.confirmSheet.title')}
        description={
          escalation.nextStage
            ? t('admin.case.escalation.confirmSheet.description', {
                stage: t(
                  `admin.home.activeCases.stage.${escalation.nextStage}`,
                ),
              })
            : ''
        }
        confirmLabel={t(
          `admin.case.escalation.action.${escalation.nextActionKey}`,
        )}
        cancelLabel={t('common.cancel')}
        icon={<AlertIcon size={18} />}
        tone="warn"
      />
    </>
  );
}

function Section({
  title,
  icon,
  count,
  children,
}: {
  title: ReactNode;
  icon: ReactNode;
  count?: number;
  children: ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <span className="text-ink-500">{icon}</span>
        <h2 className="text-[12.5px] font-semibold uppercase tracking-wide text-ink-500">
          {title}
        </h2>
        {typeof count === 'number' && (
          <span className="ms-auto text-[11px] font-semibold text-ink-500 num bg-canvas-200 rounded-full px-2 py-0.5">
            {count}
          </span>
        )}
      </div>
      {children}
    </section>
  );
}

function EvidenceTile({ evidence }: { evidence: AdminCaseEvidence }) {
  const t = useT();
  const { formatDate } = useI18n();
  const v = evidenceVisual(evidence.kind);
  return (
    <div className="rounded-2xl bg-white hairline overflow-hidden flex flex-col">
      <div
        className={cn(
          'relative aspect-[4/3] bg-gradient-to-br text-white grid place-items-center ring-1 ring-inset',
          v.gradient,
          v.ring,
        )}
      >
        <div
          aria-hidden
          className="absolute inset-0 pattern-dots opacity-25 pointer-events-none"
        />
        <div className="relative flex flex-col items-center gap-1">
          <span className="h-10 w-10 rounded-xl bg-white/15 ring-1 ring-white/20 grid place-items-center backdrop-blur">
            {v.icon}
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-white/80">
            {t(`admin.case.evidence.kind.${evidence.kind}`)}
          </span>
        </div>
        <span
          className={cn(
            'absolute top-1.5 end-1.5 text-[9.5px] font-semibold uppercase tracking-wide rounded-full px-1.5 py-0.5',
            v.chipClass,
          )}
        >
          {t(`admin.case.evidence.source.${evidence.source}`)}
        </span>
      </div>
      <div className="p-2.5 space-y-1">
        <p className="text-[12px] text-ink-800 leading-snug line-clamp-2">
          {evidence.caption}
        </p>
        <div className="flex items-center gap-1 text-[10.5px] text-ink-400 num">
          <ClockIcon size={10} />
          <span>{formatDate(evidence.uploadedAt)}</span>
        </div>
      </div>
    </div>
  );
}

function NoteBubble({
  role,
  author,
  at,
  roleLabel,
  text,
}: {
  role: AdminCaseNoteRole;
  author: string;
  at: string;
  roleLabel: string;
  text: string;
}) {
  const v = noteVisual(role);
  return (
    <div
      className={cn(
        'rounded-2xl ring-1 ring-inset px-3 py-2.5',
        v.bubble,
      )}
    >
      <div className="flex items-center gap-1.5 flex-wrap">
        <span
          className={cn(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            v.badge,
          )}
        >
          {v.icon}
          {roleLabel}
        </span>
        <span className="text-[11.5px] font-semibold text-ink-700 truncate max-w-[55%]">
          {author}
        </span>
        <span className="ms-auto text-[10.5px] text-ink-400 num">{at}</span>
      </div>
      <p className="mt-1.5 text-[12.5px] leading-relaxed">{text}</p>
    </div>
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
