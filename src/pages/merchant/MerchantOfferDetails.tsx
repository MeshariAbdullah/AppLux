import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  EmptyState,
  StatusChip,
  type StatusTone,
} from '@/components/ui';
import { AlertIcon, ClockIcon, ReceiptIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { getInitials } from '@/lib/format/initials';
import { formatValidUntil, isOfferExpired } from '@/lib/offerExpiry';
import { useStore } from '@/lib/store';
import {
  fetchContractByInvoiceId,
  fetchInvoiceById,
  fetchProfile,
  useSupabaseAuth,
  type InvoiceStatus,
} from '@/lib/supabase';

// =====================================================================
// MerchantOfferDetails — /merchant/approvals/:id
//
// The per-offer tracking page. Before it existed, every issued-offer
// card (rentals list "مراجعة العميل" rows, home feed, approvals list)
// could only link to the GENERIC approvals queue, which is how tapping
// a specific rental card landed on "الموافقات المعلقة" with the
// selected record nowhere in sight. This page renders exactly ONE
// offer, addressed by its canonical rental_invoices.id UUID — deep
// linkable and reload-safe.
// =====================================================================

type OfferView = {
  ref: string;
  status: InvoiceStatus;
  customerName: string;
  customerInitials: string;
  amount: number;
  sentAt: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  /** Set when the offer was accepted and a contract row exists. */
  contractId: string | null;
};

function toneForOfferStatus(s: InvoiceStatus, expired: boolean): StatusTone {
  if (expired) return 'danger';
  if (s === 'accepted') return 'success';
  if (s === 'rejected' || s === 'cancelled') return 'danger';
  if (s === 'issued' || s === 'viewed') return 'warn';
  return 'neutral';
}

export default function MerchantOfferDetails() {
  const t = useT();
  const { formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { id } = useParams();
  const { merchantApprovals } = useStore();
  const { configured } = useSupabaseAuth();

  // Demo rows carry no invoice statuses — present them as issued.
  const demoOffer: OfferView | null = (() => {
    const a = merchantApprovals.find((x) => x.id === id);
    if (!a) return null;
    return {
      ref: a.id,
      status: 'issued',
      customerName: a.customerName,
      customerInitials: a.customerInitials,
      amount: a.amount,
      sentAt: a.submittedAt,
      startsAt: null,
      expiresAt: null,
      contractId: null,
    };
  })();

  const [liveOffer, setLiveOffer] = useState<OfferView | null>(null);
  const [resolving, setResolving] = useState<boolean>(() =>
    Boolean(configured && id && !demoOffer),
  );

  useEffect(() => {
    if (!configured || !id || demoOffer) {
      setLiveOffer(null);
      return;
    }
    let cancelled = false;
    setLiveOffer(null);
    setResolving(true);
    (async () => {
      const inv = await fetchInvoiceById(id).catch(() => null);
      if (cancelled || !inv) return;
      const [customer, contract] = await Promise.all([
        fetchProfile(inv.customer_user_id).catch(() => null),
        // Accepted offers have a contract — surface the direct path to
        // it so the merchant lands on the record, not a list.
        inv.status === 'accepted'
          ? fetchContractByInvoiceId(inv.id).catch(() => null)
          : Promise.resolve(null),
      ]);
      if (cancelled) return;
      const customerName = customer?.full_name ?? '—';
      setLiveOffer({
        ref: inv.invoice_number,
        status: inv.status,
        customerName,
        customerInitials: getInitials(customerName),
        amount: Number(inv.total_amount),
        sentAt: inv.issued_at ?? inv.created_at,
        startsAt: inv.starts_at ?? null,
        expiresAt: inv.expires_at ?? null,
        contractId: contract?.id ?? null,
      });
    })()
      .finally(() => {
        if (!cancelled) setResolving(false);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, id, demoOffer]);

  const offer = liveOffer ?? demoOffer;

  if (!offer) {
    if (resolving) {
      // Fetch in flight — placeholder only; never a redirect, never the
      // not-found state.
      return (
        <>
          <Header title={t('merchant.offer.title')} showBack />
          <Screen className="bg-canvas">
            <div className="min-h-[40vh] grid place-items-center">
              <span className="h-7 w-7 rounded-full border-2 border-canvas-200 border-t-lavender-600 animate-spin" />
            </div>
          </Screen>
        </>
      );
    }
    return (
      <>
        <Header title={t('merchant.offer.title')} showBack />
        <Screen className="bg-canvas">
          <EmptyState
            tone="warn"
            icon={<AlertIcon size={22} />}
            title={t('merchant.offer.notFound.title')}
            description={t('merchant.offer.notFound.body')}
            action={
              <Button
                size="sm"
                onClick={() => navigate('/merchant/approvals', { replace: true })}
              >
                {t('merchant.offer.notFound.back')}
              </Button>
            }
          />
        </Screen>
      </>
    );
  }

  const expired =
    (offer.status === 'issued' || offer.status === 'viewed') &&
    isOfferExpired(offer.expiresAt);
  const validUntil =
    !expired && (offer.status === 'issued' || offer.status === 'viewed')
      ? formatValidUntil(offer.expiresAt, locale)
      : null;

  return (
    <>
      <Header title={t('merchant.offer.title')} showBack />
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-4">
          <Card padded className="space-y-4">
            <div className="flex items-center gap-3">
              <span className="h-11 w-11 shrink-0 rounded-2xl bg-gold-50 text-gold-700 grid place-items-center">
                <ReceiptIcon size={20} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[10.5px] text-ink-400 uppercase tracking-[0.08em]">
                  {t('merchant.offer.eyebrow')}
                </div>
                <div className="mt-0.5 text-[16px] font-bold text-ink-900 num truncate" dir="ltr">
                  {offer.ref}
                </div>
              </div>
              <StatusChip
                tone={toneForOfferStatus(offer.status, expired)}
                dot
                label={t(`merchant.offer.status.${offer.status}`)}
              />
            </div>

            {expired && (
              <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/20 px-3.5 py-2.5 text-[12.5px] text-danger-700">
                {t('merchant.offer.expiredBanner')}
              </div>
            )}
            {validUntil && (
              <div className="rounded-xl2 bg-canvas-100 ring-1 ring-canvas-200 px-3.5 py-2.5 text-[12px] text-ink-600 flex items-center gap-2">
                <ClockIcon size={13} className="shrink-0 text-ink-400" />
                <span className="num">
                  {t('merchant.offer.validUntil', { at: validUntil })}
                </span>
              </div>
            )}

            <CardDivider />

            <div className="space-y-3 text-[12.5px]">
              <FactRow
                label={t('merchant.offer.customer')}
                value={offer.customerName}
              />
              <FactRow
                label={t('merchant.offer.amount')}
                value={<span className="num">{formatCurrency(offer.amount)}</span>}
              />
              {offer.sentAt && (
                <FactRow
                  label={t('merchant.offer.sentAt')}
                  value={<span className="num">{formatDate(offer.sentAt)}</span>}
                />
              )}
              {offer.startsAt && (
                <FactRow
                  label={t('merchant.offer.startsAt')}
                  value={<span className="num">{formatDate(offer.startsAt)}</span>}
                />
              )}
            </div>
          </Card>

          {offer.status === 'accepted' && offer.contractId && (
            <Card padded className="space-y-3">
              <p className="text-[12.5px] text-ink-600 leading-relaxed">
                {t('merchant.offer.acceptedHint')}
              </p>
              <Button
                size="lg"
                block
                onClick={() => navigate(`/merchant/rentals/${offer.contractId}`)}
              >
                {t('merchant.offer.openContract')}
              </Button>
            </Card>
          )}
        </div>
      </Screen>
    </>
  );
}

function FactRow({
  label,
  value,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-400">{label}</span>
      <span className="font-semibold text-ink-900 text-end truncate">{value}</span>
    </div>
  );
}
