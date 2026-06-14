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
import { useSupabaseAuth } from '@/lib/supabase';
import { cn } from '@/lib/cn';

export default function AuthEntry() {
  const t = useT();
  const { dir } = useI18n();
  const { configured } = useSupabaseAuth();
  return (
    <>
      <Header title={t('welcome.eyebrow')} showBack />
      <Screen className="bg-canvas">
        <div className="space-y-6">
          <div className="pt-1">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-50 px-3 py-1 text-[11px] font-semibold text-gold-700">
              <ShieldIcon size={12} />
              {t('auth.entry.eyebrow')}
            </span>
            <h1 className="mt-4 editorial-title text-[26px] text-ink-900 leading-tight">
              {t('auth.entry.title')}
            </h1>
            <p className="mt-2.5 text-[14px] text-ink-500 leading-relaxed">
              {t('auth.entry.subtitle')}
            </p>
          </div>

          <div className="space-y-3">
            <RoleCard
              to="/auth/register"
              tone="gold"
              icon={<UserIcon size={20} />}
              title={t('auth.entry.role.customer.title')}
              description={t('auth.entry.role.customer.desc')}
              dir={dir}
            />
            <RoleCard
              to="/merchant/welcome"
              tone="ink"
              icon={<BuildingIcon size={20} />}
              title={t('auth.entry.role.merchant.title')}
              description={t('auth.entry.role.merchant.desc')}
              dir={dir}
            />
            {/* Demo-only entrypoint. In configured mode RequireRole
                would just bounce non-admin visitors back to /welcome,
                so we hide the card to avoid the confusing round-trip. */}
            {!configured && (
              <RoleCard
                to="/admin/home"
                tone="muted"
                icon={<ShieldIcon size={20} />}
                title={t('auth.entry.role.admin.title')}
                description={t('auth.entry.role.admin.desc')}
                demo
                demoLabel={t('auth.entry.role.admin.demoPill')}
                dir={dir}
              />
            )}
          </div>

          <div className="flex items-center gap-3 text-[11px] text-ink-400">
            <span className="h-px flex-1 bg-canvas-200" />
            <span className="tracking-tight">{t('auth.entry.haveAccount')}</span>
            <span className="h-px flex-1 bg-canvas-200" />
          </div>

          <Link
            to="/auth/login"
            className={cn(
              'flex items-center justify-center gap-2 h-13 w-full rounded-xl2 px-5',
              'bg-white text-ink-900 ring-1 ring-inset ring-lavender-200',
              'font-semibold text-[15px] tracking-tight select-none',
              'hover:bg-lavender-50 active:bg-lavender-100',
              'transition-[background-color,transform] duration-200 ease-plush active:scale-[0.985]',
              'focus:outline-none',
            )}
          >
            {t('welcome.signIn')}
          </Link>

          <Card padded className="flex items-start gap-3.5">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-gold-50 text-gold-700 grid place-items-center">
              <BadgeCheckIcon size={17} />
            </span>
            <div className="min-w-0 text-[12.5px] text-ink-500 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-1 text-[13px] tracking-tight">
                {t('auth.entry.trust.title')}
              </div>
              <div>{t('auth.entry.trust.hint')}</div>
            </div>
          </Card>

          <p className="text-center text-[11px] text-ink-400 leading-relaxed inline-flex items-center gap-1.5 justify-center w-full">
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
  demo,
  demoLabel,
  dir,
}: {
  to: string;
  tone: 'gold' | 'ink' | 'muted';
  icon: React.ReactNode;
  title: React.ReactNode;
  description: React.ReactNode;
  demo?: boolean;
  demoLabel?: React.ReactNode;
  dir: 'rtl' | 'ltr';
}) {
  const iconClass =
    tone === 'gold'
      ? 'bg-gold-50 text-gold-700'
      : tone === 'ink'
        ? 'bg-ink-900 text-white'
        : 'bg-canvas-100 text-ink-700';
  return (
    <Link to={to} className="block">
      <Card
        padded
        interactive
        className="flex items-center gap-4"
      >
        <span
          className={cn(
            'h-13 w-13 shrink-0 rounded-2xl grid place-items-center',
            iconClass,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="editorial-title text-[16px] text-ink-900 truncate">
              {title}
            </div>
            {demo && (
              <span className="text-[9.5px] font-bold tracking-wide uppercase bg-canvas-100 text-ink-500 rounded-full px-1.5 py-0.5">
                {demoLabel}
              </span>
            )}
          </div>
          <div className="mt-1 text-[12.5px] text-ink-500 leading-relaxed">
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
