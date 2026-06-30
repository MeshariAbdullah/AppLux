import { useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
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
  Textarea,
} from '@/components/ui';
import {
  AlertIcon,
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  DocIcon,
  InfoIcon,
  PackageIcon,
  PlusIcon,
  ReceiptIcon,
  SearchIcon,
  ShieldIcon,
  SignatureIcon,
  SparkleIcon,
  UsersIcon,
} from '@/components/icons';
import { cn } from '@/lib/cn';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { SEED_SCANS } from '@/lib/data';
import {
  createInvoiceWithItems,
  fetchMyMerchant,
  requireSupabase,
  useSupabaseAuth,
} from '@/lib/supabase';

type CustomerMode = 'existing' | 'new';

const CITY_KEYS = [
  'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'tabuk',
  'abha', 'taif', 'qassim', 'hail', 'najran', 'jazan', 'baha', 'yanbu',
] as const;

type RentalItem = {
  id: string;
  name: string;
  quantity: string;
  rentalPrice: string;
  itemValue: string;
  liability: string;
};

type DraftClause = {
  id: string;
  title: string;
  body: string;
};

type ItemErrors = Partial<Record<keyof RentalItem, string>>;
type ClauseErrors = Partial<Record<'title' | 'body', string>>;

type FlatErrorKey =
  | 'customerMode'
  | 'selectedCustomerId'
  | 'customerName'
  | 'customerId'
  | 'customerMobile'
  | 'customerEmail'
  | 'customerCity'
  | 'branchId'
  | 'items'
  | 'nonReturn'
  | 'partialDamage'
  | 'totalDamage'
  | 'clauses';

type Draft = {
  customerMode: CustomerMode;
  selectedCustomerId: string;
  customerName: string;
  customerId: string;
  customerMobile: string;
  customerEmail: string;
  customerCity: string;
  branchId: string;
  items: RentalItem[];
  nonReturn: string;
  partialDamage: string;
  totalDamage: string;
  clauses: DraftClause[];
};

type Errors = Partial<Record<FlatErrorKey, string>> & {
  itemFields?: Record<string, ItemErrors>;
  clauseFields?: Record<string, ClauseErrors>;
};

function newItem(): RentalItem {
  return {
    id: `IT-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: '',
    quantity: '1',
    rentalPrice: '',
    itemValue: '',
    liability: '',
  };
}

function newClause(title = '', body = ''): DraftClause {
  return {
    id: `CL-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    title,
    body,
  };
}

function defaultClauses(locale: 'ar' | 'en'): DraftClause[] {
  const src = SEED_SCANS[0]?.contract.clauses ?? [];
  return src.map((c) => newClause(c.title[locale], c.body[locale]));
}

type IssuanceResult = {
  token: string;
  contractRef: string;
  noteRef: string;
  issuedAt: string;
  dueDate: string;
};

function generateIssuance(): IssuanceResult {
  const now = new Date();
  const stamp =
    String(now.getFullYear()).slice(-2) +
    String(now.getMonth() + 1).padStart(2, '0') +
    String(now.getDate()).padStart(2, '0') +
    Math.random().toString(36).slice(2, 6).toUpperCase();
  const due = new Date(now);
  due.setDate(due.getDate() + 30);
  return {
    token: `APX-${stamp}`,
    contractRef: `CN-APX-${stamp}`,
    noteRef: `PN-APX-${stamp}`,
    issuedAt: now.toISOString(),
    dueDate: due.toISOString(),
  };
}

const emptyDraft: Draft = {
  customerMode: 'existing',
  selectedCustomerId: '',
  customerName: '',
  customerId: '',
  customerMobile: '',
  customerEmail: '',
  customerCity: '',
  branchId: '',
  items: [newItem()],
  nonReturn: '',
  partialDamage: '',
  totalDamage: '',
  clauses: [],
};

export default function MerchantInvoiceNew() {
  const t = useT();
  const { formatCurrency, formatDate, locale } = useI18n();
  const navigate = useNavigate();
  const { merchant, merchantCustomers } = useStore();
  const supabaseAuth = useSupabaseAuth();
  const [submitting, setSubmitting] = useState(false);
  const [submitWarning, setSubmitWarning] = useState<string | null>(null);
  const [values, setValues] = useState<Draft>(() => ({
    ...emptyDraft,
    clauses: defaultClauses(locale),
  }));
  const [errors, setErrors] = useState<Errors>({});
  const [issuance, setIssuance] = useState<IssuanceResult | null>(null);
  const [customerQuery, setCustomerQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const submitted = issuance !== null;

  const branches = merchant?.branches ?? [];

  const patch = (p: Partial<Draft>) => {
    setValues((v) => ({ ...v, ...p }));
    const keys = Object.keys(p) as FlatErrorKey[];
    if (keys.some((k) => errors[k])) {
      setErrors((prev) => {
        const next = { ...prev };
        for (const k of keys) next[k] = undefined;
        return next;
      });
    }
  };

  const onChange =
    (key: keyof Draft) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      patch({ [key]: e.target.value } as Partial<Draft>);
    };

  const setMode = (mode: CustomerMode) => {
    patch({ customerMode: mode });
  };

  const patchItem = (id: string, p: Partial<RentalItem>) => {
    setValues((v) => ({
      ...v,
      items: v.items.map((it) => (it.id === id ? { ...it, ...p } : it)),
    }));
    const keys = Object.keys(p) as (keyof RentalItem)[];
    if (errors.itemFields?.[id] && keys.some((k) => errors.itemFields?.[id]?.[k])) {
      setErrors((prev) => {
        const nextFields = { ...(prev.itemFields ?? {}) };
        const current = { ...(nextFields[id] ?? {}) };
        for (const k of keys) current[k] = undefined;
        nextFields[id] = current;
        return { ...prev, itemFields: nextFields, items: undefined };
      });
    } else if (errors.items) {
      setErrors((prev) => ({ ...prev, items: undefined }));
    }
  };

  const onItemChange =
    (id: string, key: keyof RentalItem) =>
    (e: ChangeEvent<HTMLInputElement>) => {
      patchItem(id, { [key]: e.target.value } as Partial<RentalItem>);
    };

  const addItem = () => {
    setValues((v) => ({ ...v, items: [...v.items, newItem()] }));
  };

  const removeItem = (id: string) => {
    setValues((v) => ({
      ...v,
      items: v.items.length > 1 ? v.items.filter((it) => it.id !== id) : v.items,
    }));
  };

  const patchClause = (id: string, p: Partial<DraftClause>) => {
    setValues((v) => ({
      ...v,
      clauses: v.clauses.map((c) => (c.id === id ? { ...c, ...p } : c)),
    }));
    const keys = Object.keys(p) as (keyof DraftClause)[];
    if (
      errors.clauseFields?.[id] &&
      keys.some((k) => k !== 'id' && errors.clauseFields?.[id]?.[k as 'title' | 'body'])
    ) {
      setErrors((prev) => {
        const nextFields = { ...(prev.clauseFields ?? {}) };
        const current = { ...(nextFields[id] ?? {}) };
        for (const k of keys) if (k !== 'id') current[k as 'title' | 'body'] = undefined;
        nextFields[id] = current;
        return { ...prev, clauseFields: nextFields, clauses: undefined };
      });
    } else if (errors.clauses) {
      setErrors((prev) => ({ ...prev, clauses: undefined }));
    }
  };

  const addClause = () => {
    setValues((v) => ({ ...v, clauses: [...v.clauses, newClause()] }));
  };

  const removeClause = (id: string) => {
    setValues((v) => ({ ...v, clauses: v.clauses.filter((c) => c.id !== id) }));
  };

  const itemTotals = useMemo(() => {
    const perItem = values.items.map((it) => {
      const qty = Number(it.quantity) || 0;
      const price = Number(it.rentalPrice) || 0;
      return { id: it.id, subtotal: qty * price };
    });
    const subtotal = perItem.reduce((sum, it) => sum + it.subtotal, 0);
    const vat = Math.round(subtotal * 0.15);
    return { perItem, subtotal, vat, total: subtotal + vat };
  }, [values.items]);

  const filteredCustomers = useMemo(() => {
    const q = customerQuery.trim().toLowerCase();
    if (!q) return merchantCustomers;
    return merchantCustomers.filter(
      (c) =>
        c.fullName.toLowerCase().includes(q) ||
        c.nationalId.includes(q) ||
        c.mobile.includes(q),
    );
  }, [customerQuery, merchantCustomers]);

  const selectedCustomer = useMemo(
    () => merchantCustomers.find((c) => c.id === values.selectedCustomerId) ?? null,
    [merchantCustomers, values.selectedCustomerId],
  );

  const validate = (): Errors => {
    const next: Errors = {};
    const req = t('merchant.invoice.errors.required');
    const positive = t('merchant.invoice.errors.positive');
    if (values.customerMode === 'existing') {
      if (!values.selectedCustomerId)
        next.selectedCustomerId = t('merchant.invoice.errors.selectCustomer');
    } else {
      if (!values.customerName.trim()) next.customerName = req;
      if (!/^[12]\d{9}$/.test(values.customerId.trim()))
        next.customerId = t('merchant.register.errors.authorizedId');
      if (!/^5\d{8}$/.test(values.customerMobile.trim()))
        next.customerMobile = t('merchant.register.errors.mobile');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.customerEmail.trim()))
        next.customerEmail = t('merchant.register.errors.email');
      if (!values.customerCity.trim()) next.customerCity = req;
    }
    if (values.items.length === 0) {
      next.items = t('merchant.invoice.errors.addAtLeastOne');
    } else {
      const fieldErrs: Record<string, ItemErrors> = {};
      for (const it of values.items) {
        const ie: ItemErrors = {};
        if (!it.name.trim()) ie.name = req;
        if (!(Number(it.quantity) > 0)) ie.quantity = positive;
        if (!(Number(it.rentalPrice) > 0)) ie.rentalPrice = positive;
        if (!(Number(it.itemValue) > 0)) ie.itemValue = positive;
        if (!(Number(it.liability) > 0)) ie.liability = positive;
        if (Object.keys(ie).length) fieldErrs[it.id] = ie;
      }
      if (Object.keys(fieldErrs).length) next.itemFields = fieldErrs;
    }
    if (!(Number(values.nonReturn) > 0)) next.nonReturn = positive;
    if (!(Number(values.partialDamage) > 0)) next.partialDamage = positive;
    if (!(Number(values.totalDamage) > 0)) next.totalDamage = positive;
    if (values.clauses.length === 0) {
      next.clauses = t('merchant.invoice.errors.addAtLeastOne');
    } else {
      const clauseErrs: Record<string, ClauseErrors> = {};
      for (const c of values.clauses) {
        const ce: ClauseErrors = {};
        if (!c.title.trim()) ce.title = req;
        if (!c.body.trim()) ce.body = req;
        if (Object.keys(ce).length) clauseErrs[c.id] = ce;
      }
      if (Object.keys(clauseErrs).length) next.clauseFields = clauseErrs;
    }
    return next;
  };

  const subtotal = itemTotals.subtotal;
  const vat = itemTotals.vat;
  const total = itemTotals.total;

  const liabilityTotal = useMemo(
    () =>
      values.items.reduce((sum, it) => {
        const q = Number(it.quantity) || 0;
        const l = Number(it.liability) || 0;
        return sum + q * l;
      }, 0),
    [values.items],
  );

  const itemValueTotal = useMemo(
    () =>
      values.items.reduce((sum, it) => {
        const q = Number(it.quantity) || 0;
        const v = Number(it.itemValue) || 0;
        return sum + q * v;
      }, 0),
    [values.items],
  );

  const displayCustomerName =
    values.customerMode === 'existing'
      ? selectedCustomer?.fullName ?? ''
      : values.customerName;

  const hasErrors = (err: Errors) => {
    const flat = (Object.keys(err) as (keyof Errors)[]).some(
      (k) =>
        k !== 'itemFields' &&
        k !== 'clauseFields' &&
        Boolean(err[k as FlatErrorKey]),
    );
    const itemsNested = err.itemFields && Object.keys(err.itemFields).length > 0;
    const clauseNested = err.clauseFields && Object.keys(err.clauseFields).length > 0;
    return flat || Boolean(itemsNested) || Boolean(clauseNested);
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (hasErrors(err)) {
      setErrors(err);
      return;
    }
    setSubmitWarning(null);

    // Real Supabase path: create rental_invoice + items, surface scan_token.
    if (supabaseAuth.configured && supabaseAuth.session?.user?.id) {
      setSubmitting(true);
      try {
        const myMerchant = await fetchMyMerchant(supabaseAuth.session.user.id);
        if (!myMerchant) {
          throw new Error(
            'No merchant entity exists for this account yet. Ask an admin to approve and provision your application.',
          );
        }

        // Customer linkage requires the customer to already have an Lend
        // account. Look them up by email.
        const customerEmail =
          values.customerMode === 'existing'
            ? merchantCustomers.find((c) => c.id === values.selectedCustomerId)?.email ?? ''
            : values.customerEmail;
        if (!customerEmail) {
          throw new Error('Customer email is required to issue a real invoice.');
        }
        const sb = requireSupabase();
        const { data: customerProfile, error: profileErr } = await sb
          .from('profiles')
          .select('id')
          .eq('email', customerEmail)
          .maybeSingle();
        if (profileErr) throw profileErr;
        if (!customerProfile) {
          throw new Error(
            "We couldn't find a customer with that email. Ask them to sign up first.",
          );
        }

        const subtotal = values.items.reduce(
          (s, it) =>
            s +
            (Number(it.rentalPrice) || 0) * Math.max(Number(it.quantity) || 1, 1),
          0,
        );
        const liability = values.items.reduce(
          (s, it) => s + (Number(it.liability) || 0),
          0,
        );

        const result = await createInvoiceWithItems({
          merchantId: myMerchant.id,
          customerUserId: customerProfile.id,
          subtotalAmount: subtotal,
          totalAmount: subtotal,
          // The legacy form's "liability" column maps onto the new
          // original_item_value semantic: underlying value of the
          // rented pieces. Eligibility + note principal hinge on this.
          originalItemValue: liability,
          items: values.items.map((it, i) => ({
            position: i,
            item_name: it.name,
            // Demo form doesn't yet collect category — default to merchant's
            // primary category (Phase 5 adds an explicit picker).
            category: myMerchant.primary_category,
            size_label: null,
            color: null,
            daily_rate: Number(it.rentalPrice) || 0,
            rental_days: Math.max(Number(it.quantity) || 1, 1),
            subtotal:
              (Number(it.rentalPrice) || 0) * Math.max(Number(it.quantity) || 1, 1),
            replacement_value: Number(it.itemValue) || null,
            notes: null,
          })),
        });

        const inv = result.invoice;
        setIssuance({
          token: inv.scan_token ?? inv.invoice_number,
          contractRef: inv.invoice_number,
          noteRef: inv.invoice_number,
          issuedAt: inv.issued_at ?? inv.created_at,
          dueDate:
            inv.expires_at ??
            new Date(Date.now() + 30 * 86_400_000).toISOString(),
        });
      } catch (caught) {
        // In configured (production) mode a real-path failure must NOT
        // fall back to demo issuance. Doing so would surface a token
        // the merchant believes is valid even though no rental_invoices
        // row exists, and a customer scan of that token would 404.
        // Show the error, keep the form intact, and let the merchant
        // retry. The previous demo-fallback behaviour was a silent
        // success masquerading as a real one.
        // eslint-disable-next-line no-console
        console.error('[lend] createInvoiceWithItems failed', caught);
        const message =
          caught instanceof Error ? caught.message : 'Failed to issue invoice.';
        setSubmitWarning(message);
      } finally {
        setSubmitting(false);
      }
      return;
    }

    // Demo mode only (env not configured): synthesise a demo issuance
    // so local exploration without a backend still terminates the
    // happy-path form. Production builds with valid env vars never
    // reach this branch.
    setIssuance(generateIssuance());
  };

  const onCopyToken = async () => {
    if (!issuance) return;
    try {
      await navigator.clipboard?.writeText(issuance.token);
    } catch {
      /* no-op */
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const onShare = async () => {
    if (!issuance) return;
    const text = `${t('merchant.invoice.qr.title')} — ${issuance.token}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: t('merchant.invoice.qr.title'), text });
        return;
      } catch {
        /* fall through */
      }
    }
    try {
      await navigator.clipboard?.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* no-op */
    }
  };

  const onCreateAnother = () => {
    setValues({ ...emptyDraft, clauses: defaultClauses(locale) });
    setErrors({});
    setIssuance(null);
    setCustomerQuery('');
  };

  const branchOptions = useMemo(
    () =>
      branches.length === 0
        ? [{ key: 'main', label: merchant?.companyName ?? 'Main' }]
        : branches.map((b) => ({ key: b.id, label: b.name })),
    [branches, merchant?.companyName],
  );

  if (submitted && issuance) {
    const principal = liabilityTotal || itemValueTotal || total;
    const place =
      values.customerMode === 'existing'
        ? selectedCustomer
          ? t(`register.cities.${selectedCustomer.city}`)
          : ''
        : values.customerCity
          ? t(`register.cities.${values.customerCity}`)
          : '';
    const customerIdDisplay =
      values.customerMode === 'existing'
        ? selectedCustomer?.nationalId ?? ''
        : values.customerId;
    const customerMobileDisplay =
      values.customerMode === 'existing'
        ? selectedCustomer?.mobile ?? ''
        : values.customerMobile;

    return (
      <>
        <Header title={t('merchant.invoice.qr.title')} showBack />
        <Screen padded={false} className="bg-canvas">
          <div className="px-5 pt-5 pb-10 space-y-5">
            <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-plush text-center">
              <div
                aria-hidden
                className="pointer-events-none absolute -top-12 start-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-success-500/25 blur-3xl"
              />
              <div className="relative mx-auto h-14 w-14 rounded-2xl bg-gold-400/20 ring-1 ring-gold-400/30 text-gold-300 grid place-items-center">
                <CheckIcon size={24} />
              </div>
              <h1 className="relative mt-5 editorial-title text-[26px] leading-tight text-white">
                {t('merchant.invoice.qr.title')}
              </h1>
              <p className="relative mt-2.5 text-[12.5px] text-white/65 leading-relaxed max-w-[38ch] mx-auto">
                {t('merchant.invoice.qr.subtitle')}
              </p>
              <div className="relative mx-auto mt-4 rounded-2xl bg-white p-3 w-fit ring-1 ring-white/20">
                <PseudoQr token={issuance.token} />
              </div>
              <div className="relative mt-3 flex items-center justify-center gap-1.5 text-[11.5px] text-white/70">
                <InfoIcon size={12} />
                {t('merchant.invoice.qr.scanHint')}
              </div>
              <div className="relative mt-3 flex items-center justify-center gap-2">
                <div className="text-[11px] uppercase tracking-wide text-white/50">
                  {t('merchant.invoice.qr.tokenLabel')}
                </div>
                <div className="num text-[13px] font-semibold text-white">
                  {issuance.token}
                </div>
              </div>
              <div className="relative mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={onCopyToken}
                  className={cn(
                    'h-10 rounded-xl text-[13px] font-semibold ring-1 transition-colors flex items-center justify-center gap-1.5',
                    copied
                      ? 'bg-success-500/20 text-success-200 ring-success-400/30'
                      : 'bg-white/10 text-white ring-white/20 hover:bg-white/15',
                  )}
                >
                  {copied ? <CheckIcon size={14} /> : <DocIcon size={14} />}
                  {copied
                    ? t('merchant.invoice.qr.copied')
                    : t('merchant.invoice.qr.copy')}
                </button>
                <button
                  type="button"
                  onClick={onShare}
                  className="h-10 rounded-xl bg-white text-ink-900 text-[13px] font-semibold hover:bg-white/90 flex items-center justify-center gap-1.5"
                >
                  <ArrowIcon size={14} />
                  {t('merchant.invoice.qr.share')}
                </button>
              </div>
            </div>

            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.invoice.qr.includedTitle')}
                className="mb-0"
              />
              <div className="space-y-2 text-[12.5px] text-ink-600">
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-lg bg-canvas-100 text-ink-700 grid place-items-center">
                    <DocIcon size={12} />
                  </span>
                  {t('merchant.invoice.qr.includedContract')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-lg bg-canvas-100 text-ink-700 grid place-items-center">
                    <SignatureIcon size={12} />
                  </span>
                  {t('merchant.invoice.qr.includedNote')}
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-6 w-6 rounded-lg bg-success-50 text-success-600 grid place-items-center">
                    <ShieldIcon size={12} />
                  </span>
                  {t('merchant.invoice.qr.includedBoth')}
                </div>
              </div>
            </Card>

            <Card padded className="space-y-3">
              <SectionHeader title={t('merchant.invoice.reviewCustomer')} className="mb-0" />
              <Field label={t('merchant.invoice.customerName')} value={displayCustomerName} />
              <CardDivider />
              <Field
                label={t('merchant.invoice.customerId')}
                value={<span className="num">{customerIdDisplay}</span>}
              />
              <CardDivider />
              <Field
                label={t('merchant.invoice.customerMobile')}
                value={<span className="num">{customerMobileDisplay}</span>}
              />
            </Card>

            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.invoice.reviewItems')}
                className="mb-0"
                action={
                  <span className="text-[12px] text-ink-400">
                    {t('merchant.invoice.itemsCount', { count: values.items.length })}
                  </span>
                }
              />
              {values.items.map((it, idx) => {
                const qty = Number(it.quantity) || 0;
                const price = Number(it.rentalPrice) || 0;
                return (
                  <div key={it.id}>
                    {idx > 0 && <CardDivider />}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                          {it.name}
                        </div>
                        <div className="mt-0.5 text-[11.5px] text-ink-400 num">
                          {qty} × {formatCurrency(price)}
                        </div>
                      </div>
                      <div className="shrink-0 num text-[13px] font-semibold text-ink-900">
                        {formatCurrency(qty * price)}
                      </div>
                    </div>
                  </div>
                );
              })}
              <CardDivider />
              <div className="flex items-center justify-between text-[12.5px] text-ink-500">
                <span>{t('merchant.invoice.subtotal')}</span>
                <span className="num">{formatCurrency(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between text-[12.5px] text-ink-500">
                <span>{t('merchant.invoice.vat')}</span>
                <span className="num">{formatCurrency(vat)}</span>
              </div>
              <div className="flex items-center justify-between text-[14px] font-semibold text-ink-900">
                <span>{t('merchant.invoice.grandTotal')}</span>
                <span className="num">{formatCurrency(total)}</span>
              </div>
            </Card>

            <Card padded className="space-y-3">
              <SectionHeader title={t('merchant.invoice.reviewDamages')} className="mb-0" />
              <Field
                label={t('merchant.invoice.nonReturn')}
                value={<span className="num">{formatCurrency(Number(values.nonReturn) || 0)}</span>}
              />
              <CardDivider />
              <Field
                label={t('merchant.invoice.partialDamage')}
                value={<span className="num">{formatCurrency(Number(values.partialDamage) || 0)}</span>}
              />
              <CardDivider />
              <Field
                label={t('merchant.invoice.totalDamage')}
                value={<span className="num">{formatCurrency(Number(values.totalDamage) || 0)}</span>}
              />
            </Card>

            <Card padded className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-xl bg-canvas-100 text-ink-700 grid place-items-center">
                  <DocIcon size={14} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink-900">
                    {t('merchant.invoice.reviewContract')}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400 num truncate">
                    {t('merchant.invoice.contractRef')} · {issuance.contractRef}
                  </div>
                </div>
              </div>
              <CardDivider />
              <ol className="space-y-2.5 list-none p-0 m-0">
                {values.clauses.map((c, idx) => (
                  <li key={c.id} className="flex gap-2.5">
                    <span className="mt-0.5 h-5 w-5 shrink-0 rounded-full bg-canvas-100 text-ink-700 grid place-items-center text-[11px] font-semibold num">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="text-[13px] font-semibold text-ink-900">
                        {c.title}
                      </div>
                      <div className="mt-0.5 text-[12.5px] text-ink-600 leading-relaxed">
                        {c.body}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </Card>

            <Card padded className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="h-8 w-8 rounded-xl bg-gold-50 text-gold-700 grid place-items-center">
                  <SignatureIcon size={14} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13.5px] font-semibold text-ink-900">
                    {t('merchant.invoice.reviewNote')}
                  </div>
                  <div className="mt-0.5 text-[11.5px] text-ink-400 num truncate">
                    {t('merchant.invoice.noteRef')} · {issuance.noteRef}
                  </div>
                </div>
              </div>
              <CardDivider />
              <Field
                label={t('merchant.invoice.principal')}
                value={<span className="num">{formatCurrency(principal)}</span>}
              />
              <CardDivider />
              <Field
                label={t('merchant.invoice.beneficiary')}
                value={merchant?.companyName ?? ''}
              />
              <CardDivider />
              <Field
                label={t('merchant.invoice.dueDate')}
                value={<span className="num">{formatDate(issuance.dueDate, { dateStyle: 'medium' })}</span>}
              />
              <CardDivider />
              <Field label={t('merchant.invoice.place')} value={place} />
              <CardDivider />
              <Field
                label={t('merchant.invoice.purpose')}
                value={t('merchant.invoice.defaultPurpose')}
              />
            </Card>

            <div className="space-y-2.5 pt-2">
              <Button
                size="lg"
                block
                leading={<PlusIcon size={16} />}
                onClick={onCreateAnother}
              >
                {t('merchant.invoice.qr.newInvoice')}
              </Button>
              <Button
                variant="secondary"
                block
                onClick={() => navigate('/merchant/home')}
              >
                {t('merchant.invoice.qr.backHome')}
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
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-5 pb-10 space-y-5">
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.invoice.steps.customer')}
                className="mb-0"
              />
              <p className="text-[12px] text-ink-500 leading-relaxed">
                {t('merchant.invoice.steps.customerSub')}
              </p>

              <div className="grid grid-cols-2 gap-2 rounded-xl2 bg-canvas-100 p-1">
                {(['existing', 'new'] as const).map((mode) => {
                  const active = values.customerMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => setMode(mode)}
                      className={cn(
                        'h-9 rounded-xl text-[13px] font-semibold transition-colors',
                        active
                          ? 'bg-white text-ink-900 shadow-soft ring-1 hairline'
                          : 'text-ink-500 hover:text-ink-700',
                      )}
                    >
                      {mode === 'existing'
                        ? t('merchant.invoice.existingCustomer')
                        : t('merchant.invoice.newCustomer')}
                    </button>
                  );
                })}
              </div>

              {values.customerMode === 'existing' ? (
                <div className="space-y-3">
                  <Input
                    leading={<SearchIcon size={16} />}
                    placeholder={t('merchant.invoice.searchCustomer')}
                    value={customerQuery}
                    onChange={(e) => setCustomerQuery(e.target.value)}
                  />
                  {filteredCustomers.length === 0 ? (
                    <div className="py-4 text-center text-[12.5px] text-ink-400">
                      {t('merchant.invoice.noCustomers')}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[260px] overflow-y-auto -mx-1 px-1">
                      {filteredCustomers.map((c) => {
                        const selected = c.id === values.selectedCustomerId;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => patch({ selectedCustomerId: c.id })}
                            className={cn(
                              'w-full text-start flex items-center gap-3 rounded-xl2 p-3 ring-1 transition-colors',
                              selected
                                ? 'bg-gold-50 ring-gold-300/50'
                                : 'bg-white hairline hover:bg-canvas-100',
                            )}
                          >
                            <span
                              className={cn(
                                'h-10 w-10 shrink-0 rounded-xl grid place-items-center font-semibold text-[13px]',
                                selected
                                  ? 'bg-brand-600 text-white'
                                  : 'bg-canvas-200 text-ink-600',
                              )}
                            >
                              {c.initials}
                            </span>
                            <div className="flex-1 min-w-0">
                              <div className="text-[13.5px] font-semibold text-ink-900 truncate">
                                {c.fullName}
                              </div>
                              <div className="mt-0.5 text-[11.5px] text-ink-400 truncate num">
                                {c.nationalId} · {t(`register.cities.${c.city}`)}
                              </div>
                            </div>
                            <span
                              className={cn(
                                'h-5 w-5 shrink-0 rounded-full grid place-items-center ring-1',
                                selected
                                  ? 'bg-ink-900 text-white ring-ink-900'
                                  : 'bg-white text-transparent ring-ink-200',
                              )}
                            >
                              <CheckIcon size={12} />
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {errors.selectedCustomerId && (
                    <div className="text-[12px] text-danger-600">
                      {errors.selectedCustomerId}
                    </div>
                  )}
                  {selectedCustomer && (
                    <div className="rounded-xl2 bg-canvas-100 p-3 flex items-center gap-2 text-[12px] text-ink-600">
                      <UsersIcon size={14} />
                      <span className="truncate num">
                        {selectedCustomer.mobile} · {selectedCustomer.email}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
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
                  <FormField
                    label={t('merchant.invoice.customerMobile')}
                    required
                    error={errors.customerMobile}
                  >
                    <Input
                      inputMode="tel"
                      maxLength={9}
                      placeholder={t('merchant.invoice.customerMobilePh')}
                      value={values.customerMobile}
                      onChange={onChange('customerMobile')}
                      invalid={Boolean(errors.customerMobile)}
                      className="num"
                      leading={
                        <span className="text-ink-500 text-[13px] font-medium num">+966</span>
                      }
                    />
                  </FormField>
                  <FormField
                    label={t('merchant.invoice.customerEmail')}
                    required
                    error={errors.customerEmail}
                  >
                    <Input
                      type="email"
                      placeholder={t('merchant.invoice.customerEmailPh')}
                      value={values.customerEmail}
                      onChange={onChange('customerEmail')}
                      invalid={Boolean(errors.customerEmail)}
                    />
                  </FormField>
                  <FormField
                    label={t('merchant.invoice.customerCity')}
                    required
                    error={errors.customerCity}
                  >
                    <Select
                      value={values.customerCity}
                      onChange={onChange('customerCity')}
                      invalid={Boolean(errors.customerCity)}
                    >
                      <option value="" disabled>
                        {t('merchant.invoice.customerCityPh')}
                      </option>
                      {CITY_KEYS.map((c) => (
                        <option key={c} value={c}>
                          {t(`register.cities.${c}`)}
                        </option>
                      ))}
                    </Select>
                  </FormField>
                </div>
              )}
            </Card>

            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.invoice.itemsTitle')}
                className="mb-0"
                action={
                  <span className="text-[12px] text-ink-400">
                    {t('merchant.invoice.itemsCount', { count: values.items.length })}
                  </span>
                }
              />
              <p className="text-[12px] text-ink-500 leading-relaxed">
                {t('merchant.invoice.itemsHint')}
              </p>

              {errors.items && (
                <div className="text-[12px] text-danger-600">{errors.items}</div>
              )}

              <div className="space-y-3">
                {values.items.map((it, idx) => {
                  const ie = errors.itemFields?.[it.id] ?? {};
                  const sub = itemTotals.perItem.find((p) => p.id === it.id)?.subtotal ?? 0;
                  const canRemove = values.items.length > 1;
                  return (
                    <div
                      key={it.id}
                      className="rounded-xl2 hairline bg-white p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 rounded-lg bg-canvas-100 text-ink-700 grid place-items-center">
                            <PackageIcon size={14} />
                          </span>
                          <div className="text-[13px] font-semibold text-ink-900">
                            {t('merchant.invoice.itemIndex', { index: idx + 1 })}
                          </div>
                        </div>
                        {canRemove && (
                          <button
                            type="button"
                            onClick={() => removeItem(it.id)}
                            className="text-[12px] font-medium text-danger-600 hover:underline"
                          >
                            {t('merchant.invoice.removeItem')}
                          </button>
                        )}
                      </div>

                      <FormField
                        label={t('merchant.invoice.itemName')}
                        required
                        error={ie.name}
                      >
                        <Input
                          placeholder={t('merchant.invoice.itemNamePh')}
                          value={it.name}
                          onChange={onItemChange(it.id, 'name')}
                          invalid={Boolean(ie.name)}
                        />
                      </FormField>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          label={t('merchant.invoice.quantity')}
                          required
                          error={ie.quantity}
                        >
                          <Input
                            inputMode="numeric"
                            placeholder={t('merchant.invoice.quantityPh')}
                            value={it.quantity}
                            onChange={onItemChange(it.id, 'quantity')}
                            invalid={Boolean(ie.quantity)}
                            className="num"
                          />
                        </FormField>
                        <FormField
                          label={t('merchant.invoice.rentalPrice')}
                          required
                          error={ie.rentalPrice}
                        >
                          <Input
                            inputMode="numeric"
                            placeholder={t('merchant.invoice.rentalPricePh')}
                            value={it.rentalPrice}
                            onChange={onItemChange(it.id, 'rentalPrice')}
                            invalid={Boolean(ie.rentalPrice)}
                            className="num"
                            trailing={
                              <span className="text-ink-400 text-[11px] font-medium">
                                {t('common.sar')}
                              </span>
                            }
                          />
                        </FormField>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <FormField
                          label={t('merchant.invoice.itemValue')}
                          required
                          error={ie.itemValue}
                        >
                          <Input
                            inputMode="numeric"
                            placeholder={t('merchant.invoice.itemValuePh')}
                            value={it.itemValue}
                            onChange={onItemChange(it.id, 'itemValue')}
                            invalid={Boolean(ie.itemValue)}
                            className="num"
                            trailing={
                              <span className="text-ink-400 text-[11px] font-medium">
                                {t('common.sar')}
                              </span>
                            }
                          />
                        </FormField>
                        <FormField
                          label={t('merchant.invoice.liabilityValue')}
                          required
                          error={ie.liability}
                        >
                          <Input
                            inputMode="numeric"
                            placeholder={t('merchant.invoice.itemValuePh')}
                            value={it.liability}
                            onChange={onItemChange(it.id, 'liability')}
                            invalid={Boolean(ie.liability)}
                            className="num"
                            trailing={
                              <span className="text-ink-400 text-[11px] font-medium">
                                {t('common.sar')}
                              </span>
                            }
                          />
                        </FormField>
                      </div>

                      {sub > 0 && (
                        <div className="flex items-center justify-between rounded-xl bg-canvas-100 px-3 py-2 text-[12px]">
                          <span className="text-ink-500">
                            {t('merchant.invoice.itemSubtotal')}
                          </span>
                          <span className="num font-semibold text-ink-900">
                            {formatCurrency(sub)}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="secondary"
                block
                leading={<PlusIcon size={16} />}
                onClick={addItem}
              >
                {t('merchant.invoice.addItem')}
              </Button>
            </Card>

            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.invoice.damagesTitle')}
                className="mb-0"
              />
              <p className="text-[12px] text-ink-500 leading-relaxed">
                {t('merchant.invoice.damagesHint')}
              </p>

              {(liabilityTotal > 0 || itemValueTotal > 0) && (
                <div className="rounded-xl2 bg-gold-50 hairline p-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[11.5px] text-gold-700/70 uppercase tracking-wide">
                      {t('merchant.invoice.suggest')}
                    </div>
                    <div className="mt-0.5 text-[13px] font-semibold text-brand-900 num truncate">
                      {formatCurrency(itemValueTotal || liabilityTotal)}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      patch({
                        nonReturn: String(itemValueTotal || liabilityTotal),
                        totalDamage: String(itemValueTotal || liabilityTotal),
                        partialDamage: String(
                          Math.round((itemValueTotal || liabilityTotal) * 0.25),
                        ),
                      })
                    }
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-white ring-1 ring-gold-300/40 text-gold-700 text-[12px] font-semibold px-2.5 py-1.5 hover:bg-gold-50"
                  >
                    <SparkleIcon size={12} />
                    {t('merchant.invoice.applySuggestion')}
                  </button>
                </div>
              )}

              <FormField
                label={t('merchant.invoice.nonReturn')}
                required
                error={errors.nonReturn}
              >
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={values.nonReturn}
                  onChange={onChange('nonReturn')}
                  invalid={Boolean(errors.nonReturn)}
                  className="num"
                  leading={<AlertIcon size={14} />}
                  trailing={
                    <span className="text-ink-400 text-[11px] font-medium">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>
              <FormField
                label={t('merchant.invoice.partialDamage')}
                required
                error={errors.partialDamage}
              >
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={values.partialDamage}
                  onChange={onChange('partialDamage')}
                  invalid={Boolean(errors.partialDamage)}
                  className="num"
                  trailing={
                    <span className="text-ink-400 text-[11px] font-medium">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>
              <FormField
                label={t('merchant.invoice.totalDamage')}
                required
                error={errors.totalDamage}
              >
                <Input
                  inputMode="numeric"
                  placeholder="0"
                  value={values.totalDamage}
                  onChange={onChange('totalDamage')}
                  invalid={Boolean(errors.totalDamage)}
                  className="num"
                  trailing={
                    <span className="text-ink-400 text-[11px] font-medium">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>
            </Card>

            <Card padded className="space-y-3">
              <SectionHeader
                title={t('merchant.invoice.clausesTitle')}
                className="mb-0"
                action={
                  <span className="text-[12px] text-ink-400">
                    {values.clauses.length}
                  </span>
                }
              />
              <p className="text-[12px] text-ink-500 leading-relaxed">
                {t('merchant.invoice.clausesHint')}
              </p>

              {errors.clauses && (
                <div className="text-[12px] text-danger-600">{errors.clauses}</div>
              )}

              <div className="space-y-3">
                {values.clauses.map((c, idx) => {
                  const ce = errors.clauseFields?.[c.id] ?? {};
                  return (
                    <div
                      key={c.id}
                      className="rounded-xl2 hairline bg-white p-3.5 space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="h-7 w-7 rounded-lg bg-canvas-100 text-ink-600 grid place-items-center">
                            <DocIcon size={14} />
                          </span>
                          <div className="text-[13px] font-semibold text-ink-900">
                            {t('merchant.invoice.clauseIndex', { index: idx + 1 })}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeClause(c.id)}
                          className="text-[12px] font-medium text-danger-600 hover:underline"
                        >
                          {t('merchant.invoice.removeClause')}
                        </button>
                      </div>

                      <FormField
                        label={t('merchant.invoice.clauseTitle')}
                        required
                        error={ce.title}
                      >
                        <Input
                          value={c.title}
                          onChange={(e) => patchClause(c.id, { title: e.target.value })}
                          invalid={Boolean(ce.title)}
                        />
                      </FormField>
                      <FormField
                        label={t('merchant.invoice.clauseBody')}
                        required
                        error={ce.body}
                      >
                        <Textarea
                          rows={3}
                          value={c.body}
                          onChange={(e) => patchClause(c.id, { body: e.target.value })}
                          invalid={Boolean(ce.body)}
                        />
                      </FormField>
                    </div>
                  );
                })}
              </div>

              <Button
                type="button"
                variant="secondary"
                block
                leading={<PlusIcon size={16} />}
                onClick={addClause}
              >
                {t('merchant.invoice.addClause')}
              </Button>
            </Card>

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

            {subtotal > 0 && (
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

            <div className="rounded-xl2 bg-gold-50 hairline p-3.5 flex items-start gap-3">
              <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-gold-700 grid place-items-center ring-1 hairline">
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

            {submitWarning && (
              <div className="rounded-xl2 bg-warn-50 ring-1 ring-warn-500/25 px-3.5 py-2.5 text-[12.5px] text-warn-700 leading-relaxed">
                {submitWarning}
              </div>
            )}
            <Button
              type="submit"
              size="lg"
              block
              loading={submitting}
              leading={<ReceiptIcon size={18} />}
            >
              {t('merchant.invoice.submit')}
            </Button>
          </form>
        </div>
      </Screen>
    </>
  );
}

function Field({ label, value }: { label: ReactNode; value: ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold text-ink-900 leading-relaxed">{value}</div>
    </div>
  );
}

function PseudoQr({ token, size = 160 }: { token: string; size?: number }) {
  const modules = 25;
  const cell = size / modules;
  const seed = Array.from(token).reduce((acc, ch) => (acc * 33 + ch.charCodeAt(0)) >>> 0, 5381);

  const isFinder = (r: number, c: number) => {
    const inCorner = (rr: number, cc: number) =>
      rr >= 0 && rr <= 6 && cc >= 0 && cc <= 6;
    const corners = [
      inCorner(r, c),
      inCorner(r, c - (modules - 7)),
      inCorner(r - (modules - 7), c),
    ];
    return corners.some(Boolean);
  };

  const finderFill = (r: number, c: number) => {
    const localR = r <= 6 ? r : r - (modules - 7);
    const localC =
      c <= 6 ? c : c >= modules - 7 ? c - (modules - 7) : -1;
    if (localC < 0) return false;
    const edge = localR === 0 || localR === 6 || localC === 0 || localC === 6;
    const inner = localR >= 2 && localR <= 4 && localC >= 2 && localC <= 4;
    return edge || inner;
  };

  const cells: ReactNode[] = [];
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      let filled = false;
      if (isFinder(r, c)) {
        filled = finderFill(r, c);
      } else {
        const h = (seed ^ ((r * 131 + c * 17 + r * c) >>> 0)) >>> 0;
        filled = (h & 0b11) < 2;
      }
      if (!filled) continue;
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={c * cell}
          y={r * cell}
          width={cell}
          height={cell}
          fill="#0f172a"
          rx={0.5}
        />,
      );
    }
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-label={token}
      role="img"
    >
      <rect width={size} height={size} fill="#ffffff" />
      {cells}
    </svg>
  );
}
