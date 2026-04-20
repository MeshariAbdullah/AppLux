import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, StatusChip } from '@/components/ui';
import {
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  GavelIcon,
  QrIcon,
  SparkleIcon,
  SupportIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
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

  if (!pkg || !store) {
    return (
      <>
        <Header title={t('tracking.title')} showBack />
        <Screen>
          <div />
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
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-4">
          {/* Hero status card */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 shadow-float">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div className="relative flex items-start gap-3">
              <StoreLogo store={store} size="md" />
              <div className="min-w-0 flex-1">
                <div className="text-[11.5px] text-white/55 uppercase tracking-wide">
                  {t('tracking.current')}
                </div>
                <div className="mt-0.5 text-[17px] font-bold truncate">
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
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('tracking.refNote')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">{pkg.note.reference}</div>
              </div>
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
                            'bg-success-500 text-white ring-success-500/25',
                          )}
                        >
                          {s.icon}
                        </span>
                        {!isLast && <span className="w-px flex-1 bg-ink-100 my-1 min-h-6" />}
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

          {/* Documents */}
          <Card padded className="space-y-3">
            <DocRow
              icon={<DocIcon size={18} />}
              tone="bg-brand-50 text-brand-600"
              label={t('tracking.downloadContract')}
              ref={pkg.contract.reference}
            />
            <CardDivider />
            <DocRow
              icon={<GavelIcon size={18} />}
              tone="bg-[#FBF2DD] text-gold-600"
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
