import { useEffect, useMemo, useState, type ReactNode } from 'react';
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
  BadgeCheckIcon,
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  InfoIcon,
  MapPinIcon,
  PhoneIcon,
  ShieldIcon,
  WalletIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore, type AdminMerchantRequest } from '@/lib/store';
import type {
  AdminMerchantDecisionStatus,
  AdminMerchantDocStatus,
} from '@/lib/data';

function statusTone(status: AdminMerchantDecisionStatus): StatusTone {
  if (status === 'approved') return 'success';
  if (status === 'rejected') return 'danger';
  return 'warn';
}

function docTone(s: AdminMerchantDocStatus): StatusTone {
  if (s === 'verified') return 'success';
  if (s === 'pending') return 'warn';
  return 'danger';
}

const DOC_KEYS = ['commercialReg', 'vat', 'bankLetter', 'authorizedId'] as const;

export default function AdminMerchantDetails() {
  const t = useT();
  const navigate = useNavigate();
  const { dir, formatCurrency, formatDate } = useI18n();
  const { id = '' } = useParams<{ id: string }>();
  const {
    adminMerchantRequests,
    approveMerchantRequest,
    rejectMerchantRequest,
    resetMerchantRequest,
  } = useStore();

  const request = useMemo(
    () => adminMerchantRequests.find((r) => r.id === id) ?? null,
    [adminMerchantRequests, id],
  );

  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<'approve' | 'reject' | null>(null);
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false);

  useEffect(() => {
    setNotes(request?.decision.notes ?? '');
  }, [request?.id, request?.decision.status, request?.decision.notes]);

  if (!request) {
    return (
      <>
        <Header title={t('admin.merchantRequest.title')} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-4 pt-6">
            <EmptyState
              icon={<InfoIcon size={22} />}
              title={t('admin.merchantRequest.notFound.title')}
              description={t('admin.merchantRequest.notFound.hint')}
              action={
                <Button onClick={() => navigate('/admin/merchants')}>
                  {t('admin.merchantRequest.notFound.cta')}
                </Button>
              }
            />
          </div>
        </Screen>
      </>
    );
  }

  const status = request.decision.status;
  const isPending = status === 'pending';
  const docsVerified = DOC_KEYS.filter((k) => request.docs[k] === 'verified').length;
  const docsPending = DOC_KEYS.filter((k) => request.docs[k] === 'pending').length;
  const docsMissing = DOC_KEYS.filter((k) => request.docs[k] === 'missing').length;

  const handleApprove = () => {
    setBusy('approve');
    approveMerchantRequest(request.id, notes);
    setBusy(null);
  };
  const handleConfirmedReject = () => {
    setBusy('reject');
    rejectMerchantRequest(request.id, notes);
    setBusy(null);
    setRejectConfirmOpen(false);
  };
  const handleReset = () => {
    resetMerchantRequest(request.id);
  };

  return (
    <>
      <Header
        title={t('admin.merchantRequest.title')}
        subtitle={request.companyName}
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
              <span className="h-12 w-12 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white font-semibold text-[12.5px]">
                {request.initials}
              </span>
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11px] font-semibold text-gold-200">
                  <ShieldIcon size={12} />
                  {t(`admin.merchantRequest.category.${request.category}`)}
                </div>
                <h1 className="mt-3 editorial-title text-[22px] leading-tight text-white">
                  {request.companyName}
                </h1>
                <div className="mt-1 text-[12px] text-white/65">
                  {request.authorizedName} · <span className="num">{request.commercialReg}</span>
                </div>
              </div>
            </div>
            <div className="relative mt-4 flex items-center justify-between gap-2">
              <StatusChip
                size="md"
                tone={statusTone(status)}
                dot
                label={t(`admin.merchants.status.${status}`)}
              />
              <div className="text-[11px] text-white/65 num">
                {isPending
                  ? t('admin.merchantRequest.submittedOn', {
                      date: formatDate(request.submittedAt),
                    })
                  : t(`admin.merchantRequest.decidedOn.${status}`, {
                      date: formatDate(request.decision.decidedAt),
                    })}
              </div>
            </div>
          </div>

          {/* Decision banner */}
          {!isPending && (
            <DecisionBanner
              status={status}
              decidedAt={request.decision.decidedAt}
              reviewer={request.decision.reviewer}
              notes={request.decision.notes}
              t={t}
              formatDate={formatDate}
              onReset={handleReset}
            />
          )}

          {/* Company details */}
          <Section
            title={t('admin.merchantRequest.sections.company')}
            icon={<BuildingIcon size={14} />}
          >
            <Card padded className="space-y-0">
              <Field
                label={t('admin.merchantRequest.fields.commercialReg')}
                value={request.commercialReg}
                numeric
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.vat')}
                value={request.vatNumber}
                numeric
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.iban')}
                value={request.iban}
                numeric
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.authorizedName')}
                value={request.authorizedName}
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.authorizedId')}
                value={request.authorizedId}
                numeric
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.expectedVolume')}
                value={formatCurrency(request.expectedVolume)}
                numeric
              />
            </Card>
          </Section>

          {/* Contact */}
          <Section
            title={t('admin.merchantRequest.sections.contact')}
            icon={<PhoneIcon size={14} />}
          >
            <Card padded className="space-y-0">
              <Field
                label={t('admin.merchantRequest.fields.phone')}
                value={request.contactPhone}
                numeric
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.email')}
                value={request.contactEmail}
              />
              <CardDivider className="my-2" />
              <Field
                label={t('admin.merchantRequest.fields.headOffice')}
                value={
                  <span className="inline-flex items-center gap-1.5">
                    <MapPinIcon size={12} className="text-ink-400" />
                    <span>{request.address}</span>
                    <span className="text-ink-300">·</span>
                    <span>{request.city}</span>
                  </span>
                }
              />
            </Card>
          </Section>

          {/* Branches */}
          <Section
            title={t('admin.merchantRequest.sections.branches', {
              count: request.branches.length,
            })}
            icon={<BuildingIcon size={14} />}
          >
            <Card padded className="space-y-3">
              {request.branches.map((b, i) => (
                <div key={b.id}>
                  <div className="flex items-start gap-3">
                    <span className="h-9 w-9 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                      <BuildingIcon size={15} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold text-ink-900 truncate">
                        {b.name}
                      </div>
                      <div className="mt-0.5 text-[11.5px] text-ink-400 inline-flex items-center gap-1.5 truncate">
                        <MapPinIcon size={10} />
                        <span className="truncate">{b.address}</span>
                        <span className="text-ink-300">·</span>
                        <span className="truncate">{b.city}</span>
                      </div>
                      <div className="mt-1 text-[11.5px] text-ink-500 inline-flex items-center gap-1.5 num">
                        <PhoneIcon size={10} />
                        {b.phone}
                      </div>
                    </div>
                  </div>
                  {i < request.branches.length - 1 && (
                    <div className="mt-3 h-px bg-canvas-200/80" />
                  )}
                </div>
              ))}
            </Card>
          </Section>

          {/* Documents */}
          <Section
            title={t('admin.merchantRequest.sections.docs')}
            icon={<DocIcon size={14} />}
          >
            <Card padded className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <DocSummary
                  label={t('admin.merchantRequest.docs.verified')}
                  count={docsVerified}
                  tone="success"
                />
                <DocSummary
                  label={t('admin.merchantRequest.docs.pending')}
                  count={docsPending}
                  tone="warn"
                />
                <DocSummary
                  label={t('admin.merchantRequest.docs.missing')}
                  count={docsMissing}
                  tone="danger"
                />
              </div>
              <div className="h-px bg-canvas-200/80" />
              <div className="space-y-2">
                {DOC_KEYS.map((k) => (
                  <DocRow
                    key={k}
                    label={t(`admin.merchantRequest.docFields.${k}`)}
                    status={request.docs[k]}
                    statusLabel={t(
                      `admin.merchantRequest.docStatus.${request.docs[k]}`,
                    )}
                  />
                ))}
              </div>
            </Card>
          </Section>

          {/* Decision: notes + actions OR reset */}
          {isPending ? (
            <Section
              title={t('admin.merchantRequest.sections.decision')}
              icon={<WalletIcon size={14} />}
            >
              <Card padded className="space-y-3">
                <FormField
                  label={t('admin.merchantRequest.notesLabel')}
                  hint={t('admin.merchantRequest.notesHint')}
                  optionalLabel={t('admin.merchantRequest.optional')}
                >
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('admin.merchantRequest.notesPlaceholder')}
                    rows={3}
                  />
                </FormField>
                <div className="flex flex-col gap-2 pt-1">
                  <Button
                    size="lg"
                    block
                    leading={<CheckIcon size={16} />}
                    onClick={handleApprove}
                    loading={busy === 'approve'}
                    disabled={busy !== null}
                  >
                    {t('admin.merchantRequest.actions.approve')}
                  </Button>
                  <Button
                    size="lg"
                    block
                    variant="danger"
                    leading={<AlertIcon size={16} />}
                    onClick={() => setRejectConfirmOpen(true)}
                    loading={busy === 'reject'}
                    disabled={busy !== null}
                  >
                    {t('admin.merchantRequest.actions.reject')}
                  </Button>
                </div>
              </Card>
            </Section>
          ) : (
            <Link
              to="/admin/merchants"
              className={cn(
                'block text-center text-[12.5px] font-semibold text-gold-700 py-2',
              )}
            >
              {t('admin.merchantRequest.backToList')}
            </Link>
          )}

          <div className="rounded-xl2 bg-ink-900 text-white p-3.5 flex items-start gap-3">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-white/10 ring-1 ring-white/15 grid place-items-center text-white">
              <InfoIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12px] text-white/70 leading-relaxed">
              <div className="text-white font-semibold mb-0.5">
                {t('admin.merchantRequest.footerNote.title')}
              </div>
              <div>{t('admin.merchantRequest.footerNote.hint')}</div>
            </div>
          </div>
        </div>
      </Screen>

      <ConfirmSheet
        open={rejectConfirmOpen}
        onClose={() => (busy === 'reject' ? undefined : setRejectConfirmOpen(false))}
        onConfirm={handleConfirmedReject}
        title={t('admin.merchantRequest.confirmSheet.reject.title')}
        description={t('admin.merchantRequest.confirmSheet.reject.description', {
          company: request.companyName,
        })}
        confirmLabel={t('admin.merchantRequest.actions.reject')}
        cancelLabel={t('common.cancel')}
        icon={<AlertIcon size={18} />}
        tone="danger"
        loading={busy === 'reject'}
      />
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

function DocSummary({
  label,
  count,
  tone,
}: {
  label: ReactNode;
  count: number;
  tone: 'success' | 'warn' | 'danger';
}) {
  const skin =
    tone === 'success'
      ? 'bg-success-50 text-success-700'
      : tone === 'warn'
        ? 'bg-warn-50 text-warn-700'
        : 'bg-danger-50 text-danger-700';
  return (
    <div className={cn('rounded-xl px-2.5 py-2 text-center', skin)}>
      <div className="text-[10px] uppercase tracking-wide opacity-75">
        {label}
      </div>
      <div className="mt-0.5 text-[16px] font-bold num leading-none">
        {count}
      </div>
    </div>
  );
}

function DocRow({
  label,
  status,
  statusLabel,
}: {
  label: ReactNode;
  status: AdminMerchantDocStatus;
  statusLabel: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="inline-flex items-center gap-2 text-[12.5px] text-ink-700 min-w-0">
        <DocIcon size={13} className="text-ink-400 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <StatusChip
        size="sm"
        tone={docTone(status)}
        dot
        label={statusLabel}
      />
    </div>
  );
}

function DecisionBanner({
  status,
  decidedAt,
  reviewer,
  notes,
  t,
  formatDate,
  onReset,
}: {
  status: AdminMerchantDecisionStatus;
  decidedAt: string;
  reviewer?: string;
  notes?: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
  formatDate: (d: string | Date | number, opts?: Intl.DateTimeFormatOptions) => string;
  onReset: () => void;
}) {
  const isApproved = status === 'approved';
  const skin = isApproved
    ? 'bg-success-50 ring-success-500/25'
    : 'bg-danger-50 ring-danger-500/25';
  const iconSkin = isApproved
    ? 'bg-success-500/10 text-success-600'
    : 'bg-danger-500/10 text-danger-600';
  const titleColor = isApproved ? 'text-success-700' : 'text-danger-700';
  const subColor = isApproved ? 'text-success-700/80' : 'text-danger-700/80';
  return (
    <div
      className={cn(
        'rounded-xl2 ring-1 ring-inset p-3.5 space-y-3',
        skin,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'h-10 w-10 shrink-0 rounded-xl grid place-items-center',
            iconSkin,
          )}
        >
          {isApproved ? <BadgeCheckIcon size={18} /> : <AlertIcon size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className={cn('text-[14px] font-semibold', titleColor)}>
            {t(`admin.merchantRequest.banner.${status}.title`)}
          </div>
          <div className={cn('mt-0.5 text-[12px]', subColor)}>
            {t(`admin.merchantRequest.banner.${status}.subtitle`)}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 text-[11.5px]">
        <div className="rounded-xl bg-white/70 p-2.5">
          <div className="text-ink-400 uppercase tracking-wide text-[10px] flex items-center gap-1">
            <ClockIcon size={10} />
            {t('admin.merchantRequest.banner.decidedAt')}
          </div>
          <div className="mt-0.5 font-semibold text-ink-900 num">
            {formatDate(decidedAt, { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        </div>
        <div className="rounded-xl bg-white/70 p-2.5">
          <div className="text-ink-400 uppercase tracking-wide text-[10px] flex items-center gap-1">
            <ShieldIcon size={10} />
            {t('admin.merchantRequest.banner.reviewer')}
          </div>
          <div className="mt-0.5 font-semibold text-ink-900 truncate">
            {reviewer ?? t('admin.merchantRequest.banner.unknownReviewer')}
          </div>
        </div>
      </div>
      {notes && (
        <div className="rounded-xl bg-white/70 p-2.5">
          <div className="text-ink-400 uppercase tracking-wide text-[10px]">
            {t('admin.merchantRequest.banner.notes')}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-700 leading-relaxed whitespace-pre-line">
            {notes}
          </div>
        </div>
      )}
      <Button size="sm" variant="secondary" block onClick={onReset}>
        {t('admin.merchantRequest.actions.reset')}
      </Button>
    </div>
  );
}
