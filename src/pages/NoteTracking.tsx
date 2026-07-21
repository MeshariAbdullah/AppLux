import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  CardSkeleton,
  EmptyState,
  PageSkeleton,
  SectionHeader,
} from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CheckIcon,
  ClockIcon,
  DocIcon,
  GavelIcon,
  InfoIcon,
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { resolveMerchantName } from '@/lib/merchantName';
import { resolvePlatformBeneficiary } from '@/lib/platformIdentity';
import { useStore } from '@/lib/store';
import {
  adaptContract,
  adaptNote,
  fetchContractById,
  fetchMerchant,
  fetchNoteById,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { Contract, PromissoryNote } from '@/lib/data';
import { NoteStatusChip } from '@/components/rental/StatusChips';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { deriveJourneyFromUIContract } from '@/lib/rentalJourney';
import {
  DocTimeline,
  type TimelineEvent,
} from '@/components/track/DocTimeline';
import { PlatformBadge } from '@/components/track/PlatformBadge';

function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export default function NoteTracking() {
  const t = useT();
  const { id } = useParams();
  const navigate = useNavigate();
  const { notes, contracts } = useStore();
  const { configured } = useSupabaseAuth();
  const { formatCurrency, formatDate, locale } = useI18n();

  const demoNote = useMemo(() => notes.find((n) => n.id === id), [notes, id]);

  const [liveNote, setLiveNote] = useState<PromissoryNote | null>(null);
  const [liveContract, setLiveContract] = useState<Contract | null>(null);
  const [resolving, setResolving] = useState<boolean>(
    () => configured && Boolean(id),
  );

  useEffect(() => {
    if (!configured || !id) {
      setLiveNote(null);
      setLiveContract(null);
      setResolving(false);
      return;
    }
    setLiveNote(null);
    setLiveContract(null);
    setResolving(true);
    let cancelled = false;
    (async () => {
      const row = await fetchNoteById(id).catch(() => null);
      if (cancelled) return;
      if (!row) {
        setResolving(false);
        return;
      }
      const merchant = await fetchMerchant(row.merchant_id).catch(() => null);
      if (cancelled) return;
      // Locale-aware merchant name (data-consistency fix — was .en).
      const merchantName = resolveMerchantName(merchant, locale, row.beneficiary_name);
      setLiveNote(adaptNote(row, merchantName));

      const contractRow = await fetchContractById(row.contract_id).catch(() => null);
      if (!cancelled && contractRow) {
        setLiveContract(adaptContract(contractRow, merchantName));
      }
      if (!cancelled) setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
    // locale: the merchant display name is locale-resolved inside.
  }, [configured, id, locale]);

  const note = liveNote ?? demoNote;
  const linkedContract =
    liveContract ??
    (note ? contracts.find((c) => c.counterparty === note.counterparty) : undefined);

  // Current phase (ENABLE_PAYMENTS_AND_NOTES = false): the note surface
  // is hidden. Redirect to the linked contract's tracking page when it
  // resolves (the effect above still fetches it), otherwise fall back
  // to the rentals list. Normal navigation no longer links here — this
  // covers deep links and stale history entries.
  if (!ENABLE_PAYMENTS_AND_NOTES) {
    if (linkedContract) {
      return <Navigate to={`/track/contract/${linkedContract.id}`} replace />;
    }
    if (!resolving) {
      return <Navigate to="/contracts" replace />;
    }
    return (
      <>
        <Header title={t('track.contractTitle')} showBack />
        <Screen>
          <CardSkeleton />
        </Screen>
      </>
    );
  }

  if (!note && resolving) {
    return (
      <>
        <Header title={t('track.noteTitle')} showBack />
        <Screen>
          <CardSkeleton />
          <div className="mt-4">
            <PageSkeleton rows={2} />
          </div>
        </Screen>
      </>
    );
  }

  if (!note) {
    return (
      <>
        <Header title={t('track.noteTitle')} showBack />
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

  const events = buildNoteEvents(note, t);
  const isDefaulted = note.status === 'defaulted';

  return (
    <>
      <Header title={t('track.noteTitle')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Premium note hero — soft gold tint, framed as an official record */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-gold-50 via-white to-canvas-50 hairline p-6 shadow-card">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-12 end-[-15%] h-48 w-48 rounded-full bg-gold-400/22 blur-3xl"
            />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white ring-1 ring-lavender-200 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-lavender-700">
                  <BadgeCheckIcon size={11} />
                  {t('track.recordedOn', { date: formatDate(note.dueDate) })}
                </div>
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11.5px] font-semibold text-gold-700">
                  <GavelIcon size={13} />
                  {t('track.noteTitle')}
                </div>
                <div className="mt-3 text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('track.note.principal')}
                </div>
                <div className="mt-1 editorial-title text-[30px] font-bold num leading-none text-ink-900">
                  {formatCurrency(note.amount)}
                </div>
              </div>
              <NoteStatusChip status={note.status} />
            </div>
            <div className="relative mt-5 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.note.beneficiary')}
                </div>
                <div className="mt-0.5 font-semibold truncate text-ink-900">
                  {resolvePlatformBeneficiary(locale)}
                </div>
              </div>
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.note.dueDate')}
                </div>
                <div className="mt-0.5 font-semibold num text-ink-900">{formatDate(note.dueDate)}</div>
              </div>
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('review.note.reference')}
                </div>
                <div className="mt-0.5 font-semibold num truncate text-ink-900">{note.reference}</div>
              </div>
              <div>
                <div className="text-ink-400 uppercase tracking-wide text-[10.5px] font-medium">
                  {t('track.note.attested')}
                </div>
                <div className="mt-0.5 font-semibold inline-flex items-center gap-1 text-gold-700">
                  <BadgeCheckIcon size={13} />
                  {t('track.placeholders.nafith')}
                </div>
              </div>
            </div>
          </div>

          {linkedContract && (
            <RentalJourneyTimeline
              variant="lead"
              steps={deriveJourneyFromUIContract(linkedContract, null, {
                status: note.status,
              })}
            />
          )}

          {isDefaulted && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/20 px-4 py-3 flex items-start gap-2.5 text-[12.5px] text-danger-600">
              <AlertIcon size={16} className="mt-0.5 shrink-0" />
              <span className="leading-relaxed">{t('track.note.defaultedBanner')}</span>
            </div>
          )}

          {/* Platform badges */}
          <div className="grid grid-cols-1 gap-2.5">
            <PlatformBadge
              platform="nafith"
              state={note.status === 'pending' ? 'pending' : 'verified'}
              title={t('track.placeholders.nafith')}
              description={t('track.placeholders.nafithDesc')}
              stateLabel={
                note.status === 'pending'
                  ? t('track.placeholders.pending')
                  : t('track.placeholders.verified')
              }
              meta={formatDate(note.dueDate)}
            />
            {isDefaulted && (
              <PlatformBadge
                platform="execution"
                state="escalated"
                title={t('track.placeholders.execution')}
                description={t('track.placeholders.executionDesc')}
                stateLabel={t('track.placeholders.escalated')}
              />
            )}
          </div>

          {/* Activity */}
          <section>
            <SectionHeader title={t('track.activity')} />
            <Card padded>
              <DocTimeline events={events} />
            </Card>
          </section>

          {/* Linked contract */}
          {linkedContract && (
            <section>
              <SectionHeader title={t('track.linkedContract')} />
              <button
                type="button"
                onClick={() => navigate(`/track/contract/${linkedContract.id}`)}
                className="w-full text-start"
              >
                <Card padded interactive className="flex items-center gap-3">
                  <span className="h-10 w-10 shrink-0 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                    <DocIcon size={18} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                      {linkedContract.title}
                    </div>
                    <div className="mt-0.5 text-[12px] text-ink-400 truncate">
                      {linkedContract.counterparty}
                    </div>
                  </div>
                  <span className="num text-[11.5px] text-ink-400 shrink-0">
                    {linkedContract.id}
                  </span>
                </Card>
              </button>
            </section>
          )}

          {/* Summary */}
          <section>
            <SectionHeader title={t('track.summary')} />
            <Card padded className="space-y-3">
              <Field
                label={t('track.note.issuedOn')}
                value={
                  <span className="num">
                    {formatDate(addDays(note.dueDate, -365))}
                  </span>
                }
              />
              <CardDivider />
              <Field
                label={t('track.note.dueDate')}
                value={<span className="num">{formatDate(note.dueDate)}</span>}
              />
              <CardDivider />
              <Field
                label={t('track.note.principal')}
                value={<span className="num">{formatCurrency(note.amount)}</span>}
              />
            </Card>
          </section>

          {/* Actions */}
          <div className="space-y-2.5">
            <Button variant="primary" size="lg" block leading={<GavelIcon size={18} />}>
              {t('tracking.downloadNote')}
            </Button>
          </div>
        </div>
      </Screen>
    </>
  );
}

function buildNoteEvents(
  note: { dueDate: string; status: 'signed' | 'pending' | 'defaulted' },
  t: (key: string, vars?: Record<string, string | number>) => string,
): TimelineEvent[] {
  const issued = addDays(note.dueDate, -365);
  const attested = addDays(issued, 1);
  const active = addDays(issued, 2);
  const reminder = addDays(note.dueDate, -14);
  const settled = addDays(note.dueDate, -7);
  const defaulted = addDays(note.dueDate, 7);
  const execution = addDays(note.dueDate, 21);

  if (note.status === 'pending') {
    return [
      evt('issued', t('track.note.events.issued'), issued, 'done', 'brand', <DocIcon size={14} />),
      evt('nafith', t('track.note.events.nafithAttested'), null, 'current', 'warn', <BadgeCheckIcon size={14} />),
      evt('active', t('track.note.events.active'), null, 'pending', 'neutral', <SparkleIcon size={14} />),
    ];
  }

  if (note.status === 'defaulted') {
    return [
      evt('issued', t('track.note.events.issued'), issued, 'done', 'brand', <DocIcon size={14} />),
      evt('nafith', t('track.note.events.nafithAttested'), attested, 'done', 'gold', <BadgeCheckIcon size={14} />),
      evt('active', t('track.note.events.active'), active, 'done', 'success', <SparkleIcon size={14} />),
      evt('reminder', t('track.note.events.reminder'), reminder, 'done', 'warn', <ClockIcon size={14} />),
      evt('defaulted', t('track.note.events.defaulted'), defaulted, 'current', 'danger', <AlertIcon size={14} />),
      evt('execution', t('track.note.events.execution'), execution, 'pending', 'danger', <GavelIcon size={14} />),
    ];
  }

  return [
    evt('issued', t('track.note.events.issued'), issued, 'done', 'brand', <DocIcon size={14} />),
    evt('nafith', t('track.note.events.nafithAttested'), attested, 'done', 'gold', <BadgeCheckIcon size={14} />),
    evt('active', t('track.note.events.active'), active, 'done', 'success', <SparkleIcon size={14} />),
    evt('reminder', t('track.note.events.reminder'), reminder, 'current', 'warn', <ClockIcon size={14} />),
    evt('settled', t('track.note.events.settled'), settled, 'pending', 'success', <CheckIcon size={14} />),
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
