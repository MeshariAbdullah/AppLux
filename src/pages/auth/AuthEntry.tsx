import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import {
  BadgeCheckIcon,
  BuildingIcon,
  ChevronIcon,
  LockIcon,
  ShieldIcon,
  UserIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

export default function AuthEntry() {
  const t = useT();
  const { dir } = useI18n();
  return (
    <>
      <Header title={t('welcome.eyebrow')} showBack />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-4 pb-8 space-y-5">
          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 ring-1 ring-brand-100 px-2.5 py-1 text-[11.5px] font-semibold text-brand-700">
              <ShieldIcon size={13} />
              {t('auth.entry.eyebrow')}
            </span>
            <h1 className="mt-3 text-[22px] font-bold text-ink-900 leading-tight">
              {t('auth.entry.title')}
            </h1>
            <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">
              {t('auth.entry.subtitle')}
            </p>
          </div>

          <div className="space-y-2.5">
            <RoleCard
              to="/auth/register"
              tone="brand"
              icon={<UserIcon size={20} />}
              title={t('auth.entry.role.customer.title')}
              description={t('auth.entry.role.customer.desc')}
              dir={dir}
            />
            <RoleCard
              to="/merchant/welcome"
              tone="gold"
              icon={<BuildingIcon size={20} />}
              title={t('auth.entry.role.merchant.title')}
              description={t('auth.entry.role.merchant.desc')}
              dir={dir}
            />
          </div>

          <div className="flex items-center gap-2 text-[11.5px] text-ink-400">
            <span className="h-px flex-1 bg-ink-100" />
            {t('auth.entry.haveAccount')}
            <span className="h-px flex-1 bg-ink-100" />
          </div>

          <Link to="/auth/login" className="block">
            <Button size="lg" variant="secondary" block>
              {t('welcome.signIn')}
            </Button>
          </Link>

          <Card padded className="flex items-start gap-3 bg-white">
            <span className="h-9 w-9 shrink-0 rounded-xl bg-success-50 text-success-600 grid place-items-center ring-1 ring-success-500/15">
              <BadgeCheckIcon size={16} />
            </span>
            <div className="min-w-0 text-[12px] text-ink-600 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-0.5 text-[12.5px]">
                {t('auth.entry.trust.title')}
              </div>
              <div>{t('auth.entry.trust.hint')}</div>
            </div>
          </Card>

          <p className="text-center text-[11px] text-ink-400 leading-relaxed inline-flex items-center gap-1 justify-center w-full">
            <LockIcon size={11} />
            {t('auth.entry.encrypted')}
          </p>
        </div>
      </Screen>
    </>
  );
}

function RoleCard({
  to,
  tone,
  icon,
  title,
  description,
  dir,
}: {
  to: string;
  tone: 'brand' | 'gold';
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  dir: 'rtl' | 'ltr';
}) {
  const iconClass =
    tone === 'brand'
      ? 'bg-brand-50 text-brand-600 ring-brand-500/15'
      : 'bg-[#FBF2DD] text-gold-600 ring-gold-400/30';
  return (
    <Link to={to} className="block">
      <Card
        padded
        interactive
        className="flex items-center gap-3 active:scale-[0.995]"
      >
        <span
          className={cn(
            'h-12 w-12 shrink-0 rounded-2xl grid place-items-center ring-1 ring-inset',
            iconClass,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-semibold text-ink-900 truncate">
            {title}
          </div>
          <div className="mt-0.5 text-[12px] text-ink-500 leading-relaxed">
            {description}
          </div>
        </div>
        <ChevronIcon
          size={16}
          className={cn('text-ink-300 shrink-0', dir === 'rtl' ? '' : 'rotate-180')}
        />
      </Card>
    </Link>
  );
}
