import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  SectionHeader,
  StatusChip,
} from '@/components/ui';
import {
  BadgeCheckIcon,
  BuildingIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function MerchantPending() {
  const t = useT();
  const { formatDate } = useI18n();
  const navigate = useNavigate();
  const { merchant, approveMerchant, signOutMerchant } = useStore();

  useEffect(() => {
    if (!merchant) {
      navigate('/merchant/welcome', { replace: true });
      return;
    }
    if (merchant.status === 'approved') {
      navigate('/merchant/home', { replace: true });
    }
  }, [merchant, navigate]);

  if (!merchant) return null;

  const steps = [
    { icon: <ShieldIcon size={14} />, label: t('merchant.pending.whatNext1') },
    { icon: <WalletIcon size={14} />, label: t('merchant.pending.whatNext2') },
    { icon: <BadgeCheckIcon size={14} />, label: t('merchant.pending.whatNext3') },
  ];

  return (
    <>
      <Header title={t('merchant.pending.title')} />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-4">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-5 shadow-float">
            <div aria-hidden className="pointer-events-none absolute inset-0 pattern-dots opacity-25" />
            <div aria-hidden className="pointer-events-none absolute -top-10 end-[-15%] h-48 w-48 rounded-full bg-warn-500/25 blur-3xl" />
            <div className="relative flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 ring-1 ring-white/15 px-2.5 py-1 text-[11.5px] font-semibold">
                  <ClockIcon size={13} />
                  {t('merchant.pending.badge')}
                </span>
                <h1 className="mt-3 text-[22px] leading-tight font-bold">
                  {t('merchant.pending.title')}
                </h1>
                <p className="mt-2 text-[13px] text-white/70 leading-relaxed max-w-[36ch]">
                  {t('merchant.pending.subtitle')}
                </p>
              </div>
              <span className="h-12 w-12 shrink-0 rounded-2xl bg-warn-500/20 ring-1 ring-warn-400/30 text-warn-200 grid place-items-center">
                <ClockIcon size={22} />
              </span>
            </div>

            <div className="relative mt-5 grid grid-cols-2 gap-3 text-[12px]">
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.pending.requestId')}
                </div>
                <div className="mt-0.5 font-semibold num truncate">{merchant.id}</div>
              </div>
              <div>
                <div className="text-white/55 uppercase tracking-wide text-[11px]">
                  {t('merchant.pending.submittedAt')}
                </div>
                <div className="mt-0.5 font-semibold num">{formatDate(merchant.submittedAt)}</div>
              </div>
            </div>
          </div>

          <section>
            <SectionHeader title={t('merchant.pending.whatNextTitle')} />
            <Card padded>
              <ul className="space-y-3">
                {steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="h-8 w-8 shrink-0 rounded-xl bg-brand-50 text-brand-600 grid place-items-center ring-1 ring-brand-100">
                      {s.icon}
                    </span>
                    <span className="text-[13px] text-ink-700 leading-relaxed">{s.label}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </section>

          <section>
            <SectionHeader title={t('merchant.pending.summaryTitle')} />
            <Card padded className="space-y-3">
              <div className="flex items-start gap-3">
                <span className="h-10 w-10 rounded-xl bg-ink-100 text-ink-700 grid place-items-center shrink-0">
                  <BuildingIcon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                    {merchant.companyName}
                  </div>
                  <div className="mt-0.5 text-[12px] text-ink-400 num truncate">
                    CR {merchant.commercialReg}
                  </div>
                </div>
                <StatusChip size="sm" tone="warn" dot label={t('merchant.pending.badge')} />
              </div>
              <CardDivider />
              <Field label={t('merchant.register.authorizedName')} value={merchant.authorizedName} />
              <CardDivider />
              <Field
                label={t('merchant.register.iban')}
                value={<span className="num">{merchant.iban}</span>}
              />
              <CardDivider />
              <Field label={t('merchant.register.contactEmail')} value={merchant.contactEmail} />
              <CardDivider />
              <Field
                label={t('merchant.register.contactPhone')}
                value={<span className="num">+966 {merchant.contactPhone}</span>}
              />
              {merchant.branches.length > 0 && (
                <>
                  <CardDivider />
                  <Field
                    label={t('merchant.register.steps.branches')}
                    value={t('merchant.home.branchesCount', {
                      count: merchant.branches.length,
                    })}
                  />
                </>
              )}
            </Card>
          </section>

          <div className="space-y-2.5">
            <Button
              variant="primary"
              size="lg"
              block
              leading={<CheckIcon size={18} />}
              onClick={() => {
                approveMerchant();
                navigate('/merchant/home', { replace: true });
              }}
            >
              {t('merchant.pending.simulateApproval')}
            </Button>
            <Button
              variant="ghost"
              block
              onClick={() => {
                signOutMerchant();
                navigate('/merchant/welcome', { replace: true });
              }}
            >
              {t('merchant.pending.signOut')}
            </Button>
          </div>
        </div>
      </Screen>
    </>
  );
}

function Field({ label, value }: { label: React.ReactNode; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">{value}</div>
    </div>
  );
}
