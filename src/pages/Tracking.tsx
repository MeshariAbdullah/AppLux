import { useMemo } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, EmptyState, StatusChip } from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  GavelIcon,
  QrIcon,
  SparkleIcon,
  SupportIcon,
} from '@/components/icons';
import { ENABLE_PAYMENTS_AND_NOTES } from '@/lib/featureFlags';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { demoMode } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { StoreLogo } from '@/components/stores/StoreLogo';

type Step = {
  key: 'scanned' | 'reviewed' | 'signed' | 'activated';
  icon: React.ReactNode;
  at: string;
};

export default function Tracking() {
  const t = useT();
  const { token } = useParams();
  const navigate = useNavigate();
  const { approvals, scans, stores } = useStore();
  const { locale, formatDate } = useI18n();

  const record = token ? approvals[token] : undefined;
  const pkg = useMemo(() => scans.find((s) => s.token === token), [scans, token]);
  const store = useMemo(() => stores.find((s) => s.id === pkg?.storeId), [stores, pkg]);

  // Phase 9: this token-based tracking page is a demo flow. The
  // canonical live tracking lives at /track/contract/<id> and
  // /track/invoice/<id> (real Supabase-backed routes). In live mode
  // the seed scans/stores are empty so this page would otherwise
  // render its "invalid token" empty state with no recoverable
  // action. Send the user back to home instead.
  if (!demoMode) {
    return <Navigate to="/home" replace />;
  }

  if (!pkg || !store) {
    return (
      <>
        <Header title={t('tracking.title')} showBack />
        <Screen>
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('tracking.invalid.title')}
            description={t('tracking.invalid.hint')}
            action={
              <Button
                size="sm"
                onClick={() => navigate('/home', { replace: true })}
              >
                {t('tracking.invalid.backHome')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const approvedAt = record?.approvedAt ?? pkg.issuedAt;
  const steps: Step[] = [
    { key: 'scanned', icon: <QrIcon size={14} />, at: approvedAt },
    { key: 'reviewed', icon: <CheckIcon size={14} />, at: approvedAt },
    { key: 'signed', icon: <GavelIcon size={14} />, at: approvedAt },
    { key: 'activated', icon: <SparkleIcon size={14} />, at: approvedAt },
  ];

  return (
    <>
      <Header title={t('tracking.title')} subtitle={t('tracking.subtitle')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          {/* Hero status card */}
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div className="relative flex items-start gap-3">
              <StoreLogo store={store} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                  {t('tracking.current')}
                </div>
                <div className="mt-1.5 editorial-title text-[20px] leading-tight truncate text-white">
                  {pkg.rental.title[locale]}
                </div>
                <div className="mt-1 text-[12px] text-white/70 truncate">
                  {store.name[locale]}
                </div>
              </div>
              <StatusChip
                tone="success"
                dot
                label={t('tracking.active')}
                className="shrink-0"
              />
            </div>
            <div className="relative mt-4 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('tracking.refContract')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">{pkg.contract.reference}</div>
              </div>
              {/* Note reference — hidden in the current phase
                  (ENABLE_PAYMENTS_AND_NOTES). */}
              {ENABLE_PAYMENTS_AND_NOTES && (
                <div>
                  <div className="text-white/55 uppercase tracking-wide text-[11px]">
                    {t('tracking.refNote')}
                  </div>
                  <div className="mt-0.5 font-semibold num truncate">{pkg.note.reference}</div>
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <section>
            <div className="mb-3 px-1 text-[13px] font-semibold text-ink-900">
              {t('tracking.timeline')}
            </div>
            <Card padded>
              <ol className="relative">
                {steps.map((s, i) => {
                  const isLast = i === steps.length - 1;
                  return (
                    <li key={s.key} className="flex items-start gap-3 relative">
                      <div className="flex flex-col items-center">
                        <span
                          className={cn(
                            'h-8 w-8 rounded-full grid place-items-center shrink-0 ring-2',
                            'bg-gold-400 text-ink-950 ring-gold-100',
                          )}
                        >
                          {s.icon}
                        </span>
                        {!isLast && <span className="w-px flex-1 bg-canvas-200 my-1 min-h-6" />}
                      </div>
                      <div className={cn('flex-1 min-w-0', !isLast && 'pb-5')}>
                        <div className="text-[13.5px] font-semibold text-ink-900">
                          {t(`tracking.steps.${s.key}`)}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-400 num">
                          {formatDate(s.at, { dateStyle: 'medium', timeStyle: 'short' })}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </section>

          {/* Documents — note + Nafith rows hidden in the current
              phase (ENABLE_PAYMENTS_AND_NOTES). */}
          <Card padded className="space-y-3">
            <DocRow
              icon={<DocIcon size={18} />}
              tone="bg-canvas-100 text-ink-700"
              label={t('tracking.downloadContract')}
              ref={pkg.contract.reference}
            />
            {ENABLE_PAYMENTS_AND_NOTES && (
              <>
                <CardDivider />
                <DocRow
                  icon={<GavelIcon size={18} />}
                  tone="bg-gold-50 text-gold-700"
                  label={t('tracking.downloadNote')}
                  ref={pkg.note.reference}
                />
                <CardDivider />
                <DocRow
                  icon={<BadgeCheckIcon size={18} />}
                  tone="bg-success-50 text-success-600"
                  label={t('review.confirm.nafith')}
                  ref={t('nafath.verified')}
                />
              </>
            )}
          </Card>

          <Button
            variant="secondary"
            block
            leading={<SupportIcon size={16} />}
            onClick={() => navigate('/home')}
          >
            {t('tracking.support')}
          </Button>
        </div>
      </Screen>
    </>
  );
}

function DocRow({
  icon,
  tone,
  label,
  ref: refValue,
}: {
  icon: React.ReactNode;
  tone: string;
  label: React.ReactNode;
  ref: React.ReactNode;
}) {
  return (
    <button type="button" className="flex items-center gap-3 w-full text-start">
      <span className={`h-9 w-9 rounded-xl grid place-items-center shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-ink-900 truncate">{label}</div>
        <div className="mt-0.5 text-[11.5px] text-ink-400 num truncate">{refValue}</div>
      </div>
      <span className="text-ink-300">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
        </svg>
      </span>
    </button>
  );
}
