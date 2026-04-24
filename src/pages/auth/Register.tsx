import { useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, FormField, Input, Select, Textarea } from '@/components/ui';
import { useI18n, useT } from '@/lib/i18n';
import { useStore, emptyRegistration, type RegistrationDraft } from '@/lib/store';
import { cn } from '@/lib/cn';
import { ArrowIcon, ShieldIcon } from '@/components/icons';

const CITY_KEYS = [
  'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'tabuk',
  'abha', 'taif', 'qassim', 'hail', 'najran', 'jazan', 'baha', 'yanbu',
] as const;

const PROFESSION_KEYS = [
  'private', 'government', 'freelance', 'business', 'retired', 'student', 'other',
] as const;

type FieldKey = keyof RegistrationDraft;
type Errors = Partial<Record<FieldKey, string>>;

const STEPS: { key: FieldKey[]; titleKey: string; subKey: string }[] = [
  { key: ['fullName', 'nationalId', 'dob'], titleKey: 'register.step1', subKey: 'register.step1Sub' },
  { key: ['mobile', 'email', 'city', 'address'], titleKey: 'register.step2', subKey: 'register.step2Sub' },
  { key: ['profession', 'employer', 'income'], titleKey: 'register.step3', subKey: 'register.step3Sub' },
];

export default function Register() {
  const t = useT();
  const { dir } = useI18n();
  const navigate = useNavigate();
  const { draft, updateDraft, resetDraft } = useStore();

  const [values, setValues] = useState<RegistrationDraft>(() =>
    draft.fullName || draft.mobile ? draft : emptyRegistration,
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});

  const current = STEPS[step];
  const totalSteps = STEPS.length;
  const progress = ((step + 1) / totalSteps) * 100;

  const onChange = (key: FieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  };

  const validate = (keys: FieldKey[]): Errors => {
    const next: Errors = {};
    const req = t('register.errors.required');
    for (const k of keys) {
      const v = values[k].trim();
      if (!v) {
        next[k] = req;
        continue;
      }
      if (k === 'nationalId' && !/^[12]\d{9}$/.test(v)) next[k] = t('register.errors.nationalId');
      if (k === 'mobile' && !/^5\d{8}$/.test(v)) next[k] = t('register.errors.mobile');
      if (k === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) next[k] = t('register.errors.email');
      if (k === 'income' && !(Number(v) > 0)) next[k] = t('register.errors.income');
    }
    return next;
  };

  const goNext = () => {
    const e = validate(current.key);
    if (Object.keys(e).length) {
      setErrors(e);
      return;
    }
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }
    updateDraft(values);
    navigate('/auth/nafath');
  };

  const goBack = () => {
    if (step === 0) {
      resetDraft();
      navigate(-1);
      return;
    }
    setStep((s) => s - 1);
  };

  const cities = useMemo(
    () => CITY_KEYS.map((c) => ({ key: c, label: t(`register.cities.${c}`) })),
    [t],
  );
  const professions = useMemo(
    () => PROFESSION_KEYS.map((p) => ({ key: p, label: t(`register.professions.${p}`) })),
    [t],
  );

  return (
    <>
      <Header
        title={t('register.title')}
        subtitle={t('register.step', { current: step + 1, total: totalSteps })}
        showBack={step === 0}
        leading={
          step > 0 ? (
            <button
              type="button"
              onClick={goBack}
              className="h-10 w-10 grid place-items-center rounded-full bg-white text-ink-800 hairline hover:bg-canvas-100 transition-colors"
              aria-label={t('common.back')}
            >
              <ArrowIcon size={18} className={cn(dir === 'rtl' ? '' : 'rotate-180')} />
            </button>
          ) : undefined
        }
      />

      <div className="px-5 pt-3">
        <div className="flex gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={cn(
                'h-1 flex-1 rounded-full transition-colors',
                i <= step ? 'bg-gold-400' : 'bg-canvas-200',
              )}
            />
          ))}
        </div>
        <div className="sr-only">{Math.round(progress)}%</div>
      </div>

      <Screen className="bg-canvas">
        <div>
          <h1 className="editorial-title text-[24px] text-ink-900 leading-tight">{t(current.titleKey)}</h1>
          <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">{t(current.subKey)}</p>
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
              <FormField label={t('register.fullName')} required error={errors.fullName}>
                <Input
                  placeholder={t('register.fullNamePh')}
                  value={values.fullName}
                  onChange={onChange('fullName')}
                  invalid={Boolean(errors.fullName)}
                  autoComplete="name"
                />
              </FormField>
              <FormField label={t('register.nationalId')} required error={errors.nationalId}>
                <Input
                  inputMode="numeric"
                  maxLength={10}
                  placeholder={t('register.nationalIdPh')}
                  value={values.nationalId}
                  onChange={onChange('nationalId')}
                  invalid={Boolean(errors.nationalId)}
                  className="num"
                />
              </FormField>
              <FormField label={t('register.dob')} required error={errors.dob}>
                <Input
                  type="date"
                  value={values.dob}
                  onChange={onChange('dob')}
                  invalid={Boolean(errors.dob)}
                />
              </FormField>
            </>
          )}

          {step === 1 && (
            <>
              <FormField label={t('register.mobile')} required error={errors.mobile}>
                <Input
                  inputMode="tel"
                  maxLength={9}
                  placeholder={t('register.mobilePh')}
                  value={values.mobile}
                  onChange={onChange('mobile')}
                  invalid={Boolean(errors.mobile)}
                  leading={<span className="text-ink-500 text-[13px] font-medium num">+966</span>}
                />
              </FormField>
              <FormField label={t('register.email')} required error={errors.email}>
                <Input
                  type="email"
                  placeholder={t('register.emailPh')}
                  value={values.email}
                  onChange={onChange('email')}
                  invalid={Boolean(errors.email)}
                  autoComplete="email"
                />
              </FormField>
              <FormField label={t('register.city')} required error={errors.city}>
                <Select
                  value={values.city}
                  onChange={onChange('city')}
                  invalid={Boolean(errors.city)}
                >
                  <option value="" disabled>
                    {t('register.cityPh')}
                  </option>
                  {cities.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('register.address')} required error={errors.address}>
                <Textarea
                  placeholder={t('register.addressPh')}
                  rows={3}
                  value={values.address}
                  onChange={onChange('address')}
                  invalid={Boolean(errors.address)}
                />
              </FormField>
            </>
          )}

          {step === 2 && (
            <>
              <FormField label={t('register.profession')} required error={errors.profession}>
                <Select
                  value={values.profession}
                  onChange={onChange('profession')}
                  invalid={Boolean(errors.profession)}
                >
                  <option value="" disabled>
                    {t('register.professionPh')}
                  </option>
                  {professions.map((p) => (
                    <option key={p.key} value={p.key}>
                      {p.label}
                    </option>
                  ))}
                </Select>
              </FormField>
              <FormField label={t('register.employer')} required error={errors.employer}>
                <Input
                  placeholder={t('register.employerPh')}
                  value={values.employer}
                  onChange={onChange('employer')}
                  invalid={Boolean(errors.employer)}
                />
              </FormField>
              <FormField label={t('register.income')} required error={errors.income}>
                <Input
                  inputMode="numeric"
                  placeholder={t('register.incomePh')}
                  value={values.income}
                  onChange={onChange('income')}
                  invalid={Boolean(errors.income)}
                  className="num"
                  trailing={
                    <span className="text-ink-400 text-[12.5px] font-medium">
                      {t('common.sar')}
                    </span>
                  }
                />
              </FormField>

              <div className="rounded-xl3 bg-gold-50 p-4 flex items-start gap-3.5">
                <span className="h-10 w-10 shrink-0 rounded-2xl bg-white text-gold-700 grid place-items-center hairline">
                  <ShieldIcon size={18} />
                </span>
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-brand-900">
                    {t('nafath.pill')}
                  </div>
                  <div className="mt-0.5 text-[12px] text-brand-800/80 leading-relaxed">
                    {t('nafath.subtitle')}
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="pt-2 space-y-2">
            <Button type="submit" size="lg" block>
              {step === totalSteps - 1 ? t('register.submit') : t('common.continue')}
            </Button>
            {step === 0 && (
              <div className="text-center text-[13px] text-ink-500">
                {t('auth.haveAccount')}{' '}
                <Link to="/auth/login" className="text-brand-600 font-semibold">
                  {t('auth.login')}
                </Link>
              </div>
            )}
          </div>
        </form>
      </Screen>
    </>
  );
}
