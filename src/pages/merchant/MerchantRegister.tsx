import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  FormField,
  Input,
  Select,
} from '@/components/ui';
import { translateAuthError } from '@/lib/errors';
import { logEvent } from '@/lib/observability/log';
import { useI18n, useT } from '@/lib/i18n';
import {
  useStore,
  emptyMerchantDraft,
  type MerchantDraft,
} from '@/lib/store';
import {
  listMerchantApplications,
  submitMerchantApplication,
  useSupabaseAuth,
} from '@/lib/supabase';
import { cn } from '@/lib/cn';
import { ArrowIcon, BuildingIcon } from '@/components/icons';

const CITY_KEYS = [
  'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'tabuk',
  'abha', 'taif', 'qassim', 'hail', 'najran', 'jazan', 'baha', 'yanbu',
] as const;

// =====================================================================
// Auth Hardening Phase 1 — the wizard collects ONLY what
// merchant_applications actually persists. IBAN, free-text address,
// and branch collection were removed: they were validated, then
// silently discarded (the table has no columns for them), which is
// unacceptable for bank data in particular. They return only together
// with the schema work that stores them.
// =====================================================================

type FlatField =
  | 'companyName'
  | 'commercialReg'
  | 'authorizedName'
  | 'authorizedId'
  | 'city'
  | 'contactEmail'
  | 'contactPhone';

type Errors = Partial<Record<FlatField, string>>;

type StepDef = {
  key: FlatField[];
  titleKey: string;
  subKey: string;
};

const STEPS: StepDef[] = [
  {
    key: ['companyName', 'commercialReg'],
    titleKey: 'merchant.register.steps.company',
    subKey: 'merchant.register.steps.companySub',
  },
  {
    key: ['authorizedName', 'authorizedId'],
    titleKey: 'merchant.register.steps.authorized',
    subKey: 'merchant.register.steps.authorizedSub',
  },
  {
    key: ['city', 'contactEmail', 'contactPhone'],
    titleKey: 'merchant.register.steps.contact',
    subKey: 'merchant.register.steps.contactSub',
  },
];

export default function MerchantRegister() {
  const t = useT();
  const { dir } = useI18n();
  const navigate = useNavigate();
  const {
    merchantDraft,
    updateMerchantDraft,
    resetMerchantDraft,
    submitMerchantApproval,
  } = useStore();
  const { configured, session, role, status } = useSupabaseAuth();

  // Already-merchant guard. If a merchant tries to "apply" again, send
  // them to their dashboard. This is a no-op for customers and admins
  // (a customer might legitimately be onboarding as a merchant).
  useEffect(() => {
    if (configured && status === 'authenticated' && role === 'merchant') {
      navigate('/merchant/home', { replace: true });
    }
  }, [configured, status, role, navigate]);

  // Auth Hardening Phase 1: sign-in is required BEFORE step 1 — the
  // application row needs auth.uid(), and discovering that only after
  // filling the whole wizard was a dead end. The login page honors
  // `state.from` and returns the applicant here after signing in.
  useEffect(() => {
    if (configured && status === 'anonymous') {
      navigate('/auth/login', {
        replace: true,
        state: { from: '/merchant/register' },
      });
    }
  }, [configured, status, navigate]);

  // A signed-in customer with an application already PENDING is sent
  // to its status page instead of quietly filing a duplicate. RLS
  // scopes the list to the caller's own applications; a failed check
  // never blocks the wizard (the admin queue tolerates duplicates).
  useEffect(() => {
    if (!configured || status !== 'authenticated' || role !== 'customer') return;
    let cancelled = false;
    listMerchantApplications({ status: 'pending', limit: 1 })
      .then((rows) => {
        if (!cancelled && rows.length > 0) {
          navigate('/merchant/pending', { replace: true });
        }
      })
      .catch((err) => {
        logEvent('rpc_failure', 'warn', { op: 'check_pending_application' }, err);
      });
    return () => {
      cancelled = true;
    };
  }, [configured, status, role, navigate]);

  const [values, setValues] = useState<MerchantDraft>(() =>
    merchantDraft.companyName ? merchantDraft : emptyMerchantDraft,
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const current = STEPS[step];
  const totalSteps = STEPS.length;

  const cities = useMemo(
    () => CITY_KEYS.map((c) => ({ key: c, label: t(`register.cities.${c}`) })),
    [t],
  );

  const onFlat =
    (key: FlatField) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
      setValues((v) => ({ ...v, [key]: e.target.value }));
      if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

  const validateFlat = (keys: FlatField[]): Errors => {
    const next: Errors = {};
    const req = t('merchant.register.errors.required');
    for (const k of keys) {
      const v = String(values[k] ?? '').trim();
      if (!v) {
        next[k] = req;
        continue;
      }
      if (k === 'commercialReg' && !/^\d{10}$/.test(v))
        next[k] = t('merchant.register.errors.commercialReg');
      if (k === 'authorizedId' && !/^[12]\d{9}$/.test(v))
        next[k] = t('merchant.register.errors.authorizedId');
      if (k === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        next[k] = t('merchant.register.errors.email');
      if (k === 'contactPhone' && !/^5\d{8}$/.test(v))
        next[k] = t('merchant.register.errors.mobile');
    }
    return next;
  };

  const goNext = async () => {
    const e = validateFlat(current.key);
    if (Object.keys(e).length > 0) {
      setErrors(e);
      return;
    }
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }

    updateMerchantDraft(values);

    // Real submission when Supabase is configured.
    if (configured) {
      if (!session?.user) {
        // Customer account required before applying as a merchant.
        navigate('/auth/login', { replace: true });
        return;
      }
      setSubmitting(true);
      setSubmitError(null);
      try {
        await submitMerchantApplication({
          applicant_user_id: session.user.id,
          company_name: values.companyName,
          commercial_reg_number: values.commercialReg,
          authorized_name: values.authorizedName,
          authorized_national_id: values.authorizedId,
          city: values.city,
          // Constraint audit (Auth Hardening Phase 1): primary_category
          // is `rental_category NOT NULL` and the enum has ONLY concrete
          // verticals (dress|bag|watch|bisht) — no neutral member exists,
          // and adding one is a schema change deferred with the category
          // picker. 'dress' stays as the documented current-phase value:
          // it is the platform's launch vertical, and the admin reviews
          // every application before provisioning.
          primary_category: 'dress',
          contact_email: values.contactEmail || null,
          contact_phone: values.contactPhone || null,
          notes: null,
        });
      } catch (err) {
        logEvent('rpc_failure', 'warn', { op: 'submit_merchant_application' }, err);
        setSubmitError(translateAuthError(err, t));
        setSubmitting(false);
        return;
      }
    }

    submitMerchantApproval();
    navigate('/merchant/pending', { replace: true });
  };

  const goBack = () => {
    if (step === 0) {
      resetMerchantDraft();
      navigate(-1);
      return;
    }
    setStep((s) => s - 1);
  };

  return (
    <>
      <Header
        title={t('merchant.register.title')}
        subtitle={t('merchant.register.step', {
          current: step + 1,
          total: totalSteps,
        })}
        showBack={step === 0}
        leading={
          step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="h-9 w-9 grid place-items-center rounded-full bg-canvas-100 text-ink-700 hover:bg-canvas-200"
              aria-label={t('common.back')}
            >
              <ArrowIcon size={18} className={cn(dir === 'rtl' ? '' : 'rotate-180')} />
            </button>
          ) : undefined
        }
      />

      <div className="px-4 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-ink-900' : 'bg-ink-100',
              )}
            />
          ))}
        </div>
      </div>

      <Screen>
        <div>
          <h1 className="text-[20px] font-bold text-ink-900">{t(current.titleKey)}</h1>
          <p className="mt-1.5 text-[13px] text-ink-500 leading-relaxed">{t(current.subKey)}</p>
        </div>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            goNext();
          }}
          noValidate
        >
          {step === 0 && (
            <>
              <FormField label={t('merchant.register.companyName')} required error={errors.companyName}>
                <Input
                  placeholder={t('merchant.register.companyNamePh')}
                  value={values.companyName}
                  onChange={onFlat('companyName')}
                  invalid={Boolean(errors.companyName)}
                  leading={<BuildingIcon size={16} />}
                />
              </FormField>
              <FormField label={t('merchant.register.commercialReg')} required error={errors.commercialReg}>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={t('merchant.register.commercialRegPh')}
                  value={values.commercialReg}
                  onChange={onFlat('commercialReg')}
                  invalid={Boolean(errors.commercialReg)}
                  className="num"
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormField label={t('merchant.register.authorizedName')} required error={errors.authorizedName}>
                <Input
                  placeholder={t('merchant.register.authorizedNamePh')}
                  value={values.authorizedName}
                  onChange={onFlat('authorizedName')}
                  invalid={Boolean(errors.authorizedName)}
                  autoComplete="name"
                />
              </FormField>
              <FormField label={t('merchant.register.authorizedId')} required error={errors.authorizedId}>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={t('merchant.register.authorizedIdPh')}
                  value={values.authorizedId}
                  onChange={onFlat('authorizedId')}
                  invalid={Boolean(errors.authorizedId)}
                  className="num"
                />
              </FormField>
            </>
          )}

          {step === 2 && (
            <>
              <FormField label={t('merchant.register.city')} required error={errors.city}>
                <Select
                  value={values.city}
                  onChange={onFlat('city')}
                  invalid={Boolean(errors.city)}
                >
                  <option value="" disabled>
                    {t('merchant.register.cityPh')}
                  </option>
                  {cities.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('merchant.register.contactEmail')} required error={errors.contactEmail}>
                <Input
                  type="email"
                  placeholder={t('merchant.register.contactEmailPh')}
                  value={values.contactEmail}
                  onChange={onFlat('contactEmail')}
                  invalid={Boolean(errors.contactEmail)}
                  autoComplete="email"
                />
              </FormField>
              <FormField label={t('merchant.register.contactPhone')} required error={errors.contactPhone}>
                <Input
                  inputMode="tel"
                  maxLength={9}
                  placeholder={t('merchant.register.contactPhonePh')}
                  value={values.contactPhone}
                  onChange={onFlat('contactPhone')}
                  invalid={Boolean(errors.contactPhone)}
                  leading={<span className="text-ink-500 text-[13px] font-medium num">+966</span>}
                />
              </FormField>
            </>
          )}

          {submitError && (
            <div className="rounded-xl2 bg-danger-50 ring-1 ring-danger-500/25 px-3.5 py-2.5 text-[12.5px] text-danger-700 leading-relaxed">
              {submitError}
            </div>
          )}

          <div className="pt-2 space-y-2">
            <Button type="submit" size="lg" block loading={submitting}>
              {step === totalSteps - 1
                ? t('merchant.register.submit')
                : t('common.continue')}
            </Button>
            {step === 0 && (
              <div className="text-center text-[13px] text-ink-500">
                {t('auth.haveAccount')}{' '}
                <Link to="/merchant/login" className="text-gold-700 font-semibold">
                  {t('merchant.entry.login')}
                </Link>
              </div>
            )}
          </div>
        </form>
      </Screen>
    </>
  );
}
