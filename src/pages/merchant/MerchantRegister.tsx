import { useMemo, useState, type ChangeEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import {
  Button,
  Card,
  FormField,
  Input,
  Select,
  Textarea,
} from '@/components/ui';
import { useI18n, useT } from '@/lib/i18n';
import {
  useStore,
  emptyMerchantDraft,
  type MerchantBranchDraft,
  type MerchantDraft,
} from '@/lib/store';
import { cn } from '@/lib/cn';
import {
  ArrowIcon,
  BuildingIcon,
  PlusIcon,
  ShieldIcon,
} from '@/components/icons';

const CITY_KEYS = [
  'riyadh', 'jeddah', 'makkah', 'madinah', 'dammam', 'khobar', 'tabuk',
  'abha', 'taif', 'qassim', 'hail', 'najran', 'jazan', 'baha', 'yanbu',
] as const;

type FlatField =
  | 'companyName'
  | 'commercialReg'
  | 'authorizedName'
  | 'authorizedId'
  | 'iban'
  | 'city'
  | 'address'
  | 'contactEmail'
  | 'contactPhone';

type BranchErrors = Partial<Record<keyof MerchantBranchDraft, string>>;
type Errors = Partial<Record<FlatField, string>> & {
  branches?: Record<string, BranchErrors>;
};

type StepDef = {
  key: FlatField[] | 'branches';
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
    key: ['iban'],
    titleKey: 'merchant.register.steps.banking',
    subKey: 'merchant.register.steps.bankingSub',
  },
  {
    key: ['city', 'address', 'contactEmail', 'contactPhone'],
    titleKey: 'merchant.register.steps.contact',
    subKey: 'merchant.register.steps.contactSub',
  },
  {
    key: 'branches',
    titleKey: 'merchant.register.steps.branches',
    subKey: 'merchant.register.steps.branchesSub',
  },
];

function newBranch(): MerchantBranchDraft {
  return {
    id: `BR-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
    name: '',
    city: '',
    address: '',
    phone: '',
  };
}

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

  const [values, setValues] = useState<MerchantDraft>(() =>
    merchantDraft.companyName ? merchantDraft : emptyMerchantDraft,
  );
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Errors>({});

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

  const patchBranch = (id: string, patch: Partial<MerchantBranchDraft>) => {
    setValues((v) => ({
      ...v,
      branches: v.branches.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    }));
    if (errors.branches?.[id]) {
      setErrors((prev) => {
        const nextBranches = { ...(prev.branches ?? {}) };
        delete nextBranches[id];
        return { ...prev, branches: nextBranches };
      });
    }
  };

  const addBranch = () => {
    setValues((v) => ({ ...v, branches: [...v.branches, newBranch()] }));
  };

  const removeBranch = (id: string) => {
    setValues((v) => ({ ...v, branches: v.branches.filter((b) => b.id !== id) }));
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
      if (k === 'iban' && !/^SA\d{22}$/.test(v.toUpperCase().replace(/\s+/g, '')))
        next[k] = t('merchant.register.errors.iban');
      if (k === 'contactEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
        next[k] = t('merchant.register.errors.email');
      if (k === 'contactPhone' && !/^5\d{8}$/.test(v))
        next[k] = t('merchant.register.errors.mobile');
    }
    return next;
  };

  const validateBranches = (): Errors => {
    const next: Errors = {};
    const req = t('merchant.register.errors.required');
    const branchErrs: Record<string, BranchErrors> = {};
    for (const b of values.branches) {
      const be: BranchErrors = {};
      if (!b.name.trim()) be.name = req;
      if (!b.city.trim()) be.city = req;
      if (!b.address.trim()) be.address = req;
      if (!b.phone.trim()) be.phone = req;
      else if (!/^5\d{8}$/.test(b.phone.trim()))
        be.phone = t('merchant.register.errors.mobile');
      if (Object.keys(be).length) branchErrs[b.id] = be;
    }
    if (Object.keys(branchErrs).length) next.branches = branchErrs;
    return next;
  };

  const goNext = () => {
    const e: Errors =
      current.key === 'branches' ? validateBranches() : validateFlat(current.key);
    const hasErrors =
      (current.key === 'branches' ? Boolean(e.branches) : false) ||
      Object.keys(e).some((k) => k !== 'branches' && Boolean(e[k as FlatField]));
    if (hasErrors) {
      setErrors(e);
      return;
    }
    if (step < totalSteps - 1) {
      setStep((s) => s + 1);
      return;
    }
    updateMerchantDraft(values);
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
              className="h-9 w-9 grid place-items-center rounded-full bg-canvas-100 text-ink-700 hover:bg-ink-100"
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
              <FormField
                label={t('merchant.register.iban')}
                required
                error={errors.iban}
                hint={!errors.iban ? t('merchant.register.ibanHint') : undefined}
              >
                <Input
                  placeholder={t('merchant.register.ibanPh')}
                  value={values.iban}
                  onChange={onFlat('iban')}
                  invalid={Boolean(errors.iban)}
                  maxLength={24}
                  className="num uppercase"
                />
              </FormField>
              <div className="rounded-xl2 bg-brand-50/70 ring-1 hairline p-3.5 flex items-start gap-3">
                <span className="h-9 w-9 shrink-0 rounded-xl bg-white text-gold-700 grid place-items-center ring-1 hairline">
                  <ShieldIcon size={18} />
                </span>
                <div className="min-w-0 text-[12px] text-brand-800/80 leading-relaxed">
                  {t('merchant.register.ibanHint')}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
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
              <FormField label={t('merchant.register.address')} required error={errors.address}>
                <Textarea
                  placeholder={t('merchant.register.addressPh')}
                  rows={3}
                  value={values.address}
                  onChange={onFlat('address')}
                  invalid={Boolean(errors.address)}
                />
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

          {step === 4 && (
            <>
              {values.branches.length === 0 ? (
                <Card padded className="text-center space-y-2">
                  <div className="mx-auto h-11 w-11 rounded-xl bg-canvas-100 text-ink-500 grid place-items-center">
                    <BuildingIcon size={20} />
                  </div>
                  <div className="text-[14px] font-semibold text-ink-900">
                    {t('merchant.register.noBranches')}
                  </div>
                  <div className="text-[12.5px] text-ink-400 leading-relaxed">
                    {t('merchant.register.noBranchesHint')}
                  </div>
                </Card>
              ) : (
                <div className="space-y-4">
                  {values.branches.map((b, idx) => {
                    const be: BranchErrors = errors.branches?.[b.id] ?? {};
                    return (
                      <Card key={b.id} padded className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[13.5px] font-semibold text-ink-900">
                            {t('merchant.register.branchTitle', { index: idx + 1 })}
                          </div>
                          <button
                            type="button"
                            onClick={() => removeBranch(b.id)}
                            className="text-[12px] font-medium text-danger-600 hover:underline"
                          >
                            {t('merchant.register.removeBranch')}
                          </button>
                        </div>
                        <FormField label={t('merchant.register.branchName')} required error={be.name}>
                          <Input
                            placeholder={t('merchant.register.branchNamePh')}
                            value={b.name}
                            onChange={(e) => patchBranch(b.id, { name: e.target.value })}
                            invalid={Boolean(be.name)}
                          />
                        </FormField>
                        <FormField label={t('merchant.register.branchCity')} required error={be.city}>
                          <Select
                            value={b.city}
                            onChange={(e) => patchBranch(b.id, { city: e.target.value })}
                            invalid={Boolean(be.city)}
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
                        <FormField label={t('merchant.register.branchAddress')} required error={be.address}>
                          <Textarea
                            rows={2}
                            placeholder={t('merchant.register.addressPh')}
                            value={b.address}
                            onChange={(e) => patchBranch(b.id, { address: e.target.value })}
                            invalid={Boolean(be.address)}
                          />
                        </FormField>
                        <FormField label={t('merchant.register.branchPhone')} required error={be.phone}>
                          <Input
                            inputMode="tel"
                            maxLength={9}
                            placeholder={t('merchant.register.contactPhonePh')}
                            value={b.phone}
                            onChange={(e) => patchBranch(b.id, { phone: e.target.value })}
                            invalid={Boolean(be.phone)}
                            leading={
                              <span className="text-ink-500 text-[13px] font-medium num">+966</span>
                            }
                          />
                        </FormField>
                      </Card>
                    );
                  })}
                </div>
              )}

              <Button
                type="button"
                variant="secondary"
                block
                leading={<PlusIcon size={16} />}
                onClick={addBranch}
              >
                {t('merchant.register.addBranch')}
              </Button>
            </>
          )}

          <div className="pt-2 space-y-2">
            <Button type="submit" size="lg" block>
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
