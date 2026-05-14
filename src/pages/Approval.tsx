import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, EmptyState } from '@/components/ui';
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
import {
  fetchInvoiceByToken,
  fetchMerchant,
  synthesizePackageFromInvoice,
  useSupabaseAuth,
} from '@/lib/supabase';
import { RentalJourneyTimeline } from '@/components/rental/RentalJourneyTimeline';
import { deriveJourneyOnApproval } from '@/lib/rentalJourney';
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
  const { formatDate, formatNumber } = useI18n();

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
          {/* Journey is the primary structural element of this screen. */}
          <RentalJourneyTimeline
            variant="lead"
            steps={deriveJourneyOnApproval(
              { issuedAt: pkg.issuedAt },
              approvedAt,
            )}
          />

          {/* Documented record — the contract + note are now part of the
              rental's official record. Quiet, lavender, no actions. */}
          <section className="rounded-xl3 bg-lavender-50/60 ring-1 ring-lavender-200/60 p-5">
            <div className="text-[10.5px] font-semibold text-lavender-700 uppercase tracking-[0.14em]">
              {t('approval.documentedRecordTitle')}
            </div>
            <div className="mt-3 space-y-3">
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 shrink-0 rounded-2xl bg-white text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
                  <DocIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-ink-500">{t('approval.contractSigned')}</div>
                  <div className="text-[13px] font-semibold text-ink-900 num truncate">
                    {pkg.contract.reference}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-white ring-1 ring-inset ring-lavender-200 rounded-full px-1.5 py-0.5">
                  <BadgeCheckIcon size={10} />
                  {t('journey.badges.signed.label')}
                </span>
              </div>
              <div className="h-px bg-lavender-200/60" />
              <div className="flex items-center gap-3">
                <span className="h-9 w-9 shrink-0 rounded-2xl bg-white text-lavender-700 grid place-items-center ring-1 ring-lavender-200">
                  <GavelIcon size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-ink-500">{t('approval.noteSigned')}</div>
                  <div className="text-[13px] font-semibold text-ink-900 num truncate">
                    {pkg.note.reference}
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-lavender-700 bg-white ring-1 ring-inset ring-lavender-200 rounded-full px-1.5 py-0.5">
                  <BadgeCheckIcon size={10} />
                  {t('journey.badges.attested.label')}
                </span>
              </div>
            </div>
            <div className="mt-4 text-[11px] text-ink-500 num">
              {t('approval.documentedRecordTime', { time: approvedTime })}
            </div>
          </section>

          {/* Nafith disclaimer band — preserved per business model, slimmer. */}
          <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 p-3.5 flex items-start gap-3 text-[11.5px] leading-relaxed text-ink-600">
            <SparkleIcon size={14} className="mt-0.5 shrink-0 text-lavender-600" />
            <div className="min-w-0 flex-1">{t('review.note.disclaimer')}</div>
            <span className="num text-[10.5px] text-ink-400 self-start">
              #{formatNumber(Date.parse(approvedAt) % 1_000_000)}
            </span>
          </div>

          {/* Single primary action — anything else is a quiet inline link. */}
          <div className="pt-2 space-y-3">
            <Button
              variant="primary"
              size="lg"
              block
              onClick={() => navigate(`/tracking/${token}`, { replace: true })}
            >
              {t('approval.viewTracking')}
            </Button>
            <div className="text-center text-[12.5px] text-ink-500">
              <button
                type="button"
                onClick={() => navigate('/home', { replace: true })}
                className="text-ink-700 hover:text-ink-900 underline underline-offset-4 decoration-canvas-300 hover:decoration-ink-700"
              >
                {t('approval.goHome')}
              </button>
            </div>
          </div>
        </div>
      </Screen>
    </>
  );
}
