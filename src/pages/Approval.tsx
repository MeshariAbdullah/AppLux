import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card, EmptyState } from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  GavelIcon,
  QrIcon,
  SparkleIcon,
  SupportIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import {
  fetchInvoiceByToken,
  fetchMerchant,
  synthesizePackageFromInvoice,
  useSupabaseAuth,
} from '@/lib/supabase';
import type { ScannedPackage } from '@/lib/data';

export default function Approval() {
  const t = useT();
  const { token } = useParams();
  const navigate = useNavigate();
  const { approvals, scans, approvePackage } = useStore();
  const { configured } = useSupabaseAuth();
  const record = token ? approvals[token] : undefined;
  const demoPkg = useMemo(
    () => scans.find((s) => s.token === token),
    [scans, token],
  );
  const { dir, formatDate, formatNumber } = useI18n();

  const [livePkg, setLivePkg] = useState<ScannedPackage | null>(null);
  const [resolving, setResolving] = useState(false);

  useEffect(() => {
    if (!configured || !token || demoPkg) {
      setLivePkg(null);
      return;
    }
    let cancelled = false;
    setResolving(true);
    fetchInvoiceByToken(token)
      .then(async (res) => {
        if (cancelled || !res) return;
        const merchant = await fetchMerchant(res.invoice.merchant_id).catch(() => null);
        if (cancelled) return;
        setLivePkg(synthesizePackageFromInvoice(res.invoice, res.items, merchant));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, token, demoPkg]);

  const pkg = demoPkg ?? livePkg;

  useEffect(() => {
    if (!token || !demoPkg || record) return;
    approvePackage(token);
  }, [token, demoPkg, record, approvePackage]);

  if (!token || (!pkg && !resolving)) {
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

  if (!pkg) return null; // resolving

  const approvedAt = record?.approvedAt ?? new Date().toISOString();
  const approvedTime = formatDate(approvedAt, { dateStyle: 'medium', timeStyle: 'short' });

  const steps: { key: 'review' | 'invoice' | 'return'; icon: React.ReactNode }[] = [
    { key: 'review', icon: <DocIcon size={16} /> },
    { key: 'invoice', icon: <SparkleIcon size={16} /> },
    { key: 'return', icon: <BadgeCheckIcon size={16} /> },
  ];

  return (
    <>
      <Header title={t('approval.title')} />
      <Screen padded={false} className="bg-canvas">
        {/* Celebration hero */}
        <div className="relative px-6 pt-12 pb-10 text-center bg-gradient-to-b from-gold-50 to-canvas-50">
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white/60 to-transparent"
          />
          <div className="relative mx-auto h-24 w-24">
            <span
              aria-hidden
              className="absolute inset-0 rounded-full bg-gold-300/30 animate-pulse-ring"
            />
            <span
              aria-hidden
              className="absolute inset-2 rounded-full bg-gold-300/40"
            />
            <span className="absolute inset-4 rounded-full bg-lavender-400 grid place-items-center text-white shadow-plush">
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

        <div className="px-5 pt-2 pb-10 space-y-5">
          {/* Signing summary — compact two-row strip preserves contract + note linkage */}
          <Card padded className="space-y-3">
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center">
                <DocIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('approval.contractSigned')}
                </div>
                <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 num truncate">
                  {pkg.contract.reference}
                </div>
              </div>
              <span className="num text-[11px] text-ink-400">{approvedTime}</span>
            </div>
            <div className="h-px bg-canvas-200/80" />
            <div className="flex items-center gap-3">
              <span className="h-10 w-10 shrink-0 rounded-2xl bg-gold-50 text-gold-700 grid place-items-center ring-1 ring-gold-400/20">
                <GavelIcon size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] font-semibold text-ink-400 uppercase tracking-[0.08em]">
                  {t('approval.noteSigned')}
                </div>
                <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 num truncate">
                  {pkg.note.reference}
                </div>
              </div>
              <span className="inline-flex items-center gap-1 text-[10.5px] font-semibold text-gold-700 bg-gold-50 rounded-full px-1.5 py-0.5">
                <BadgeCheckIcon size={11} />
                {t('track.placeholders.nafith')}
              </span>
            </div>
          </Card>

          {/* Next steps */}
          <section>
            <div className="text-[11.5px] font-semibold text-ink-500 uppercase tracking-[0.08em] mb-2.5 px-1">
              {t('approval.nextStepsTitle')}
            </div>
            <Card padded className="space-y-1">
              {steps.map((s, i) => (
                <div key={s.key}>
                  <div className="flex items-start gap-3.5 py-2.5">
                    <span className="relative h-9 w-9 shrink-0 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center">
                      {s.icon}
                      <span className="absolute -top-1.5 -end-1.5 h-5 w-5 rounded-full bg-ink-900 text-white num text-[10.5px] font-bold grid place-items-center ring-2 ring-white">
                        {i + 1}
                      </span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13.5px] font-semibold text-ink-900 leading-tight">
                        {t(`approval.steps.${s.key}.title`)}
                      </div>
                      <div className="mt-1 text-[12px] text-ink-500 leading-relaxed">
                        {t(`approval.steps.${s.key}.hint`)}
                      </div>
                    </div>
                  </div>
                  {i < steps.length - 1 && <div className="h-px bg-canvas-200/80" />}
                </div>
              ))}
            </Card>
          </section>

          {/* Nafith disclaimer band — preserved per business model */}
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

          {/* Contact card */}
          <Card padded interactive className="flex items-center gap-3.5">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center">
              <SupportIcon size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13.5px] font-semibold text-ink-900">
                {t('approval.contact.title')}
              </div>
              <div className="mt-0.5 text-[12px] text-ink-500 leading-relaxed">
                {t('approval.contact.hint')}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-gold-700 shrink-0">
              {t('approval.contact.cta')}
              <ArrowIcon size={12} className={cn(dir === 'rtl' ? 'rotate-180' : '')} />
            </span>
          </Card>

          {/* CTA stack */}
          <div className="space-y-2.5 pt-2">
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
        </div>
      </Screen>
    </>
  );
}
