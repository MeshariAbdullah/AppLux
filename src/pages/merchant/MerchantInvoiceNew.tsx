import { useMemo, useState, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  CardDivider,
  FormField,
  Input,
  SectionHeader,
  Select,
} from '@/components/ui';
import {
  BadgeCheckIcon,
  CheckIcon,
  InfoIcon,
  ReceiptIcon,
  ShieldIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

type Draft = {
  customerName: string;
  customerId: string;
  item: string;
  amount: string;
  duration: string;
  branchId: string;
};

type Errors = Partial<Record<keyof Draft, string>>;

const emptyDraft: Draft = {
  customerName: '',
  customerId: '',
  item: '',
  amount: '',
  duration: '12',
  branchId: '',
};

export default function MerchantInvoiceNew() {
  const t = useT();
  const { formatCurrency } = useI18n();
  const navigate = useNavigate();
  const { merchant } = useStore();
  const [values, setValues] = useState<Draft>(emptyDraft);
  const [errors, setErrors] = useState<Errors>({});
  const [submitted, setSubmitted] = useState(false);

  const branches = merchant?.branches ?? [];

  const onChange =
    (key: keyof Draft) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const validate = (): Errors => {
    const next: Errors = {};
    const req = t('merchant.register.errors.required');
    if (!values.customerName.trim()) next.customerName = req;
    if (!/^[12]\d{9}$/.test(values.customerId.trim()))
      next.customerId = t('merchant.register.errors.authorizedId');
    if (!values.item.trim()) next.item = req;
    if (!(Number(values.amount) > 0))
      next.amount = t('register.errors.income');
    if (!(Number(values.duration) > 0))
      next.duration = t('register.errors.income');
    return next;
  };

  const amount = Number(values.amount) || 0;
  const duration = Number(values.duration) || 0;
  const subtotal = amount * duration;
  const vat = Math.round(subtotal * 0.15);
  const total = subtotal + vat;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (Object.keys(err).length) {
      setErrors(err);
      return;
    }
    setSubmitted(true);
  };

  const branchOptions = useMemo(
    () =>
      branches.length === 0
        ? [{ key: 'main', label: merchant?.companyName ?? 'Main' }]
        : branches.map((b) => ({ key: b.id, label: b.name })),
    [branches, merchant?.companyName],
  );

  if (submitted) {
    return (
      <>
        <Header title={t('merchant.invoice.title')} showBack />
        <Screen padded={false} className="bg-ink-50">
          <div className="px-4 pt-8 pb-8 space-y-4 flex flex-col min-h-full">
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-float text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-10 start-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-success-500/25 blur-3xl"
              />
              <div className="relative mx-auto h-14 w-14 rounded-2xl bg-success-500/20 ring-1 ring-success-400/30 text-success-200 grid place-items-center">
                <CheckIcon size={24} />
              </div>
              <h1 className="relative mt-4 text-[20px] font-bold">
                {t('merchant.invoice.submittedTitle')}
              </h1>
              <p className="relative mt-2 text-[13px] text-white/70 leading-relaxed max-w-[36ch] mx-auto">
                {t('merchant.invoice.submittedSubtitle')}
              </p>
            </div>

            <Card padded className="space-y-3">
              <SectionHeader title={t('merchant.invoice.previewTitle')} className="mb-0" />
              <Field label={t('merchant.invoice.customerName')} value={values.customerName} />
              <CardDivider />
              <Field label={t('merchant.invoice.item')} value={values.item} />
              <CardDivider />
              <Field
                label={t('merchant.invoice.amount')}
                value={<span className="num">{formatCurrency(amount)}</span>}
              />
              <CardDivider />
              <Field
                label={t('merchant.invoice.grandTotal')}
                value={<span className="num">{formatCurrency(total)}</span>}
              />
            </Card>

            <div className="mt-auto space-y-2.5 pt-4">
              <Button
                size="lg"
                block
                leading={<ReceiptIcon size={18} />}
                onClick={() => navigate('/merchant/approvals')}
              >
                {t('merchant.invoice.viewApprovals')}
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => navigate('/merchant/home')}
              >
                {t('merchant.invoice.backToHome')}
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
        title={t('merchant.invoice.title')}
        subtitle={t('merchant.invoice.subtitle')}
        showBack
      />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-4">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <FormField
              label={t('merchant.invoice.customerName')}
              required
              error={errors.customerName}
            >
              <Input
                placeholder={t('merchant.invoice.customerNamePh')}
                value={values.customerName}
                onChange={onChange('customerName')}
                invalid={Boolean(errors.customerName)}
              />
            </FormField>
            <FormField
              label={t('merchant.invoice.customerId')}
              required
              error={errors.customerId}
            >
              <Input
                inputMode="numeric"
                maxLength={10}
                placeholder={t('merchant.invoice.customerIdPh')}
                value={values.customerId}
                onChange={onChange('customerId')}
                invalid={Boolean(errors.customerId)}
                className="num"
              />
            </FormField>
            <FormField label={t('merchant.invoice.item')} required error={errors.item}>
              <Input
                placeholder={t('merchant.invoice.itemPh')}
                value={values.item}
                onChange={onChange('item')}
                invalid={Boolean(errors.item)}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label={t('merchant.invoice.amount')} required error={errors.amount}>
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={values.amount}
                  onChange={onChange('amount')}
                  invalid={Boolean(errors.amount)}
                  className="num"
                  trailing={
                    <span className="text-ink-400 text-[12px] font-medium">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>
              <FormField
                label={t('merchant.invoice.duration')}
                required
                error={errors.duration}
              >
                <Input
                  inputMode="numeric"
                  placeholder="12"
                  value={values.duration}
                  onChange={onChange('duration')}
                  invalid={Boolean(errors.duration)}
                  className="num"
                />
              </FormField>
            </div>
            <FormField label={t('merchant.invoice.branch')} error={errors.branchId}>
              <Select
                value={values.branchId}
                onChange={onChange('branchId')}
                invalid={Boolean(errors.branchId)}
              >
                <option value="" disabled>
                  {t('merchant.invoice.branchPh')}
                </option>
                {branchOptions.map((b) => (
                  <option key={b.key} value={b.key}>
                    {b.label}
                  </option>
                ))}
              </Select>
            </FormField>

            {amount > 0 && duration > 0 && (
              <Card padded className="space-y-2 bg-ink-900 text-white ring-0">
                <div className="flex items-center gap-2 text-[12.5px] text-white/80">
                  <InfoIcon size={14} />
                  {t('merchant.invoice.previewHint')}
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div className="text-[11.5px] uppercase tracking-wide text-white/60">
                    {t('merchant.invoice.grandTotal')}
                  </div>
                  <div className="num text-[22px] font-bold">
                    {formatCurrency(total)}
                  </div>
                </div>
                <div className="text-[11.5px] text-white/50">
                  {t('merchant.invoice.vatHint')}
                </div>
              </Card>
            )}

            <div className="rounded-xl2 bg-brand-50/70 ring-1 ring-brand-100 p-3.5 flex items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-brand-600 grid place-items-center ring-1 ring-brand-100">
                <BadgeCheckIcon size={18} />
              </span>
              <div className="min-w-0 text-[12px] text-brand-800/90 leading-relaxed">
                <div className="flex items-center gap-1.5 text-brand-900 font-semibold mb-0.5">
                  <ShieldIcon size={12} />
                  {t('track.placeholders.nafith')}
                </div>
                {t('track.placeholders.nafithDesc')}
              </div>
            </div>

            <Button type="submit" size="lg" block leading={<ReceiptIcon size={18} />}>
              {t('merchant.invoice.submit')}
            </Button>
          </form>
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
