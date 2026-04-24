import { useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, CardDivider, EmptyState } from '@/components/ui';
import {
  AlertIcon,
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  GavelIcon,
  QrIcon,
  SparkleIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function Approval() {
  const t = useT();
  const { token } = useParams();
  const navigate = useNavigate();
  const { approvals, scans, approvePackage } = useStore();
  const record = token ? approvals[token] : undefined;
  const pkg = useMemo(() => scans.find((s) => s.token === token), [scans, token]);
  const { formatDate, formatNumber } = useI18n();

  useEffect(() => {
    if (!token || !pkg || record) return;
    approvePackage(token);
  }, [token, pkg, record, approvePackage]);

  if (!token || !pkg) {
    return (
      <>
        <Header title={t('approval.title')} showBack />
        <Screen>
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('approval.invalid.title')}
            description={t('approval.invalid.hint')}
            action={
              <div className="flex flex-col items-stretch gap-2 w-full max-w-[260px]">
                <Button
                  size="sm"
                  leading={<QrIcon size={14} />}
                  onClick={() => navigate('/scan', { replace: true })}
                >
                  {t('approval.invalid.rescan')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => navigate('/home', { replace: true })}
                >
                  {t('approval.goHome')}
                </Button>
              </div>
            }
          />
        </Screen>
      </>
    );
  }

  const approvedAt = record?.approvedAt ?? new Date().toISOString();
  const approvedTime = formatDate(approvedAt, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <>
      <Header title={t('approval.title')} />
      <Screen padded={false} className="bg-canvas">
        <div className="relative px-6 pt-12 pb-10 text-center bg-gradient-to-b from-gold-50 to-canvas-50">
          <div className="relative mx-auto h-24 w-24">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-gold-300/30 animate-pulse-ring"
            />
            <span
              aria-hidden
              className="absolute inset-2 rounded-full bg-gold-300/40"
            />
            <span className="absolute inset-4 rounded-full bg-gold-400 grid place-items-center text-ink-950 shadow-plush">
              <CheckIcon size={36} strokeWidth={3} />
            </span>
          </div>
          <h1 className="mt-7 editorial-title text-[26px] text-ink-900 leading-tight">
            {t('approval.title')}
          </h1>
          <p className="mt-2.5 text-[13.5px] text-ink-500 leading-relaxed max-w-xs mx-auto">
            {t('approval.subtitle')}
          </p>
        </div>

        <div className="px-5 pb-10 space-y-5">
          <Card padded className="space-y-3">
            <Row
              icon={<DocIcon size={18} />}
              tone="bg-canvas-100 text-ink-700"
              label={t('approval.contractSigned')}
              value={<span className="num">{pkg.contract.reference}</span>}
            />
            <CardDivider />
            <Row
              icon={<GavelIcon size={18} />}
              tone="bg-gold-50 text-gold-700"
              label={t('approval.noteSigned')}
              value={<span className="num">{pkg.note.reference}</span>}
            />
            <CardDivider />
            <Row
              icon={<BadgeCheckIcon size={18} />}
              tone="bg-canvas-100 text-ink-700"
              label={t('approval.approvedAt')}
              value={<span className="num">{approvedTime}</span>}
            />
          </Card>

          <div className="rounded-xl3 bg-ink-900 text-white p-4 flex items-start gap-3.5 shadow-card">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-white/8 ring-1 ring-white/12 grid place-items-center text-gold-300">
              <SparkleIcon size={16} />
            </span>
            <div className="min-w-0 flex-1 text-[12.5px] leading-relaxed text-white/75">
              {t('review.note.disclaimer')}
            </div>
            <span className="num text-[11.5px] text-white/45 self-start">
              #{formatNumber(Date.parse(approvedAt) % 1_000_000)}
            </span>
          </div>

          <Button
            variant="primary"
            size="lg"
            block
            onClick={() => navigate(`/tracking/${token}`, { replace: true })}
          >
            {t('approval.viewTracking')}
          </Button>
          <Button
            variant="ghost"
            block
            onClick={() => navigate('/home', { replace: true })}
          >
            {t('approval.goHome')}
          </Button>
        </div>
      </Screen>
    </>
  );
}

function Row({
  icon,
  tone,
  label,
  value,
}: {
  icon: React.ReactNode;
  tone: string;
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3.5">
      <span className={`h-10 w-10 rounded-2xl grid place-items-center shrink-0 ${tone}`}>{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">{label}</div>
        <div className="mt-1 text-[14px] font-semibold text-ink-900 truncate tracking-tight">{value}</div>
      </div>
    </div>
  );
}
