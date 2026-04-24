import { useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  ConfirmSheet,
  FormField,
  SectionHeader,
  StatusChip,
  Textarea,
} from '@/components/ui';
import {
  BadgeCheckIcon,
  CarIcon,
  CheckIcon,
  DocIcon,
  InfoIcon,
  PackageIcon,
  SignatureIcon,
  UsersIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function MerchantRentalClose() {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals, closeRental } = useStore();
  const [notes, setNotes] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const rental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );

  if (!rental) {
    return <Navigate to="/merchant/rentals" replace />;
  }

  const alreadyClosed = rental.closureStatus === 'closed';
  const damaged = rental.closureStatus === 'damaged';

  if (damaged) {
    return <Navigate to={`/merchant/rentals/${rental.id}`} replace />;
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm || submitted) return;
    setConfirmOpen(true);
  };

  const handleConfirmedClose = () => {
    if (submitted) return;
    closeRental(rental.id, { notes });
    setConfirmOpen(false);
    setSubmitted(true);
  };

  if (submitted || alreadyClosed) {
    return (
      <>
        <Header title={t('merchant.close.title')} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-4 pt-6 pb-8 space-y-4 flex flex-col min-h-full">
            <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-12 start-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-success-500/25 blur-3xl"
              />
              <div className="relative mx-auto h-14 w-14 rounded-2xl bg-success-500/20 ring-1 ring-success-400/30 text-success-200 grid place-items-center">
                <CheckIcon size={24} />
              </div>
              <h1 className="relative mt-4 text-[20px] font-bold">
                {t('merchant.close.success.title')}
              </h1>
              <p className="relative mt-2 text-[13px] text-white/70 leading-relaxed max-w-[38ch] mx-auto">
                {t('merchant.close.success.subtitle')}
              </p>
              <div className="relative mt-4 inline-flex items-center gap-2 rounded-full bg-white/10 ring-1 ring-white/15 px-3 py-1.5 text-[12px] font-semibold">
                <BadgeCheckIcon size={14} />
                <span className="num">{rental.id}</span>
              </div>
            </div>

            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.close.summary')}
                className="mb-0"
              />
              <div className="flex items-center gap-3">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                  <CarIcon size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                    {rental.item}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400 truncate">
                    {rental.customerName}
                  </div>
                </div>
              </div>
              <CardDivider />
              <Row
                label={t('merchant.close.closedAt')}
                value={
                  <span className="num">
                    {formatDate(rental.closedAt ?? new Date().toISOString(), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                }
              />
              <CardDivider />
              <Row
                label={t('merchant.close.contractRef')}
                value={<span className="num">{rental.contractRef}</span>}
              />
              <CardDivider />
              <Row
                label={t('merchant.close.totalPaid')}
                value={
                  <span className="num">
                    {formatCurrency(rental.monthlyAmount)}
                  </span>
                }
              />
            </Card>

            <div className="mt-auto space-y-2.5 pt-4">
              <Button
                size="lg"
                block
                leading={<InfoIcon size={16} />}
                onClick={() => navigate(`/merchant/rentals/${rental.id}`)}
              >
                {t('merchant.close.success.backToRental')}
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => navigate('/merchant/rentals')}
              >
                {t('merchant.close.success.backToList')}
              </Button>
            </div>
          </div>
        </Screen>
      </>
    );
  }

  return (
    <>
      <Header
        title={t('merchant.close.title')}
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
                className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-success-500/20 blur-3xl"
              />
              <div className="relative flex items-start gap-3">
                <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 text-white grid place-items-center">
                  <PackageIcon size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                    {t('merchant.close.hero.eyebrow')}
                  </div>
                  <div className="mt-0.5 text-[16px] font-bold truncate">
                    {t('merchant.close.hero.title')}
                  </div>
                  <p className="mt-1.5 text-[12.5px] text-white/70 leading-relaxed">
                    {t('merchant.close.hero.subtitle')}
                  </p>
                </div>
              </div>
            </div>

            {/* Rental summary */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.close.rental')}
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
              <div className="grid grid-cols-3 gap-2 text-[11.5px]">
                <MiniStat
                  label={t('merchant.close.fields.start')}
                  value={formatDate(rental.startDate)}
                />
                <MiniStat
                  label={t('merchant.close.fields.end')}
                  value={formatDate(rental.endDate)}
                />
                <MiniStat
                  label={t('merchant.close.fields.rentalFee')}
                  value={formatCurrency(rental.monthlyAmount)}
                  numeric
                />
              </div>
            </Card>

            {/* Linked docs */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.close.linked')}
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
            </Card>

            {/* Notes */}
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.close.notes.title')}
                className="mb-0"
                action={
                  <span className="text-[11.5px] text-ink-400">
                    {t('common.optional')}
                  </span>
                }
              />
              <FormField label={t('merchant.close.notes.label')}>
                <Textarea
                  rows={3}
                  placeholder={t('merchant.close.notes.placeholder')}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </FormField>
            </Card>

            {/* Confirmation */}
            <label
              className="flex items-start gap-3 rounded-xl2 bg-white hairline p-3.5 cursor-pointer select-none"
            >
              <span
                className={`h-5 w-5 mt-0.5 shrink-0 rounded-md grid place-items-center ring-1 ${
                  confirm
                    ? 'bg-ink-900 ring-ink-900 text-white'
                    : 'bg-white ring-canvas-300 text-transparent'
                }`}
              >
                <CheckIcon size={12} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-ink-900">
                  {t('merchant.close.confirm.title')}
                </div>
                <div className="mt-0.5 text-[12px] text-ink-500 leading-relaxed">
                  {t('merchant.close.confirm.subtitle')}
                </div>
              </div>
              <input
                type="checkbox"
                className="sr-only"
                checked={confirm}
                onChange={(e) => setConfirm(e.target.checked)}
              />
            </label>

            {/* Alt action info */}
            <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/15 p-3.5 flex items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-warn-600 grid place-items-center ring-1 ring-warn-500/20">
                <InfoIcon size={16} />
              </span>
              <div className="min-w-0 flex-1 text-[12px] text-warn-700/90 leading-relaxed">
                <div className="text-warn-800 font-semibold mb-0.5">
                  {t('merchant.close.altTitle')}
                </div>
                <div>{t('merchant.close.altHint')}</div>
                <button
                  type="button"
                  onClick={() =>
                    navigate(`/merchant/rentals/${rental.id}/damage/new`)
                  }
                  className="mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-warn-800 hover:underline"
                >
                  {t('merchant.close.altAction')}
                </button>
              </div>
            </div>

            <StatusChip
              size="md"
              tone="success"
              dot
              label={t('merchant.close.outcome.closedPreview')}
              className="self-center mx-auto"
            />

            <Button
              type="submit"
              size="lg"
              block
              disabled={!confirm}
              leading={<CheckIcon size={16} />}
            >
              {t('merchant.close.submit')}
            </Button>
          </form>
        </div>
      </Screen>

      <ConfirmSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleConfirmedClose}
        title={t('merchant.close.confirmSheet.title')}
        description={t('merchant.close.confirmSheet.description', {
          item: rental.item,
          customer: rental.customerName,
        })}
        confirmLabel={t('merchant.close.confirmSheet.confirm')}
        cancelLabel={t('common.cancel')}
        icon={<CheckIcon size={18} />}
        tone="success"
      />
    </>
  );
}

function MiniStat({
  label,
  value,
  numeric,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  numeric?: boolean;
}) {
  return (
    <div className="rounded-xl bg-canvas-100 p-2.5">
      <div className="text-[10.5px] uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div
        className={`mt-0.5 text-[12.5px] font-semibold text-ink-900 truncate ${
          numeric ? 'num' : ''
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function LinkedRow({
  icon,
  tone,
  label,
  refValue,
}: {
  icon: React.ReactNode;
  tone: string;
  label: React.ReactNode;
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
        <div className="mt-0.5 text-[11px] text-ink-400 num truncate">{refValue}</div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">
        {label}
      </div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">
        {value}
      </div>
    </div>
  );
}
