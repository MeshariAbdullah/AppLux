import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, SectionHeader, StatusChip } from '@/components/ui';
import {
  BadgeCheckIcon,
  GavelIcon,
  InfoIcon,
  ShieldIcon,
  SignatureIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { toneForDocState, toneForNafith } from './MerchantRentalDetails';

export default function MerchantRentalNote() {
  const t = useT();
  const { formatCurrency, formatDate } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantRentals, merchant } = useStore();

  const rental = useMemo(
    () => merchantRentals.find((r) => r.id === id),
    [id, merchantRentals],
  );

  if (!rental) {
    return <Navigate to="/merchant/rentals" replace />;
  }

  const issuedAt = rental.timeline.find((e) => e.key === 'note-ready')?.at;
  const attestedAt = rental.timeline.find((e) => e.key === 'nafith-approved')?.at;

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
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-4">
          {/* Hero */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 shadow-float">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-gold-500/25 blur-3xl"
            />
            <div className="relative flex items-start gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-white/10 ring-1 ring-white/15 text-white grid place-items-center">
                <SignatureIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                  {t('merchant.rental.note.refLabel')}
                </div>
                <div className="mt-0.5 text-[16px] font-bold num truncate">
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
                  {formatCurrency(rental.liabilityTotal)}
                </div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.rental.note.dueDate')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">
                  {formatDate(rental.endDate)}
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
              value={merchant?.companyName ?? ''}
            />
            <CardDivider />
            <Row
              label={t('merchant.rental.note.principalFull')}
              value={
                <span className="num">{formatCurrency(rental.liabilityTotal)}</span>
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
              value={<span className="num">{formatDate(rental.endDate)}</span>}
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
              <span className="h-10 w-10 shrink-0 rounded-xl bg-[#FBF2DD] text-gold-600 grid place-items-center">
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
