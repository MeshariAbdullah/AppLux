import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Avatar, Button, Card, SectionHeader, StatusChip } from '@/components/ui';
import { ChevronIcon, GlobeIcon, InfoIcon, ShieldIcon, SupportIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export default function Profile() {
  const t = useT();
  const { locale, setLocale, dir } = useI18n();
  const { session, signOut } = useStore();
  const navigate = useNavigate();

  const onSignOut = () => {
    signOut();
    navigate('/welcome', { replace: true });
  };

  return (
    <>
      <Header title={t('profile.title')} />
      <Screen className="bg-canvas">
        <Card padded>
          <div className="flex items-center gap-4">
            <Avatar name={session?.fullName ?? 'A'} size="lg" tone="gold" />
            <div className="min-w-0">
              <div className="editorial-title text-[17px] text-ink-900 truncate">
                {session?.fullName ?? '—'}
              </div>
              <div className="text-[12.5px] text-ink-400 truncate mt-0.5">{session?.email ?? '—'}</div>
              <div className="mt-2 flex items-center gap-1.5">
                <StatusChip tone="gold" label={t('app.name')} />
                {session?.nafathVerified && (
                  <StatusChip tone="gold" label={t('nafath.verified')} />
                )}
              </div>
            </div>
          </div>
        </Card>

        <div>
          <SectionHeader title={t('profile.language')} />
          <Card padded={false} className="overflow-hidden">
            <div className="grid grid-cols-2">
              <button
                type="button"
                onClick={() => setLocale('ar')}
                className={cn(
                  'py-4 text-[13.5px] font-medium transition-colors tracking-tight',
                  locale === 'ar' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-canvas-100',
                )}
              >
                {t('profile.arabic')}
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={cn(
                  'py-4 text-[13.5px] font-medium transition-colors tracking-tight',
                  locale === 'en' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-canvas-100',
                )}
              >
                {t('profile.english')}
              </button>
            </div>
          </Card>
        </div>

        <Card padded={false} className="overflow-hidden">
          <Row icon={<ShieldIcon size={18} />} label={t('profile.security')} dir={dir} />
          <Divider />
          <Row icon={<GlobeIcon size={18} />} label={t('profile.appearance')} dir={dir} />
          <Divider />
          <Row icon={<SupportIcon size={18} />} label={t('profile.support')} dir={dir} />
          <Divider />
          <Row
            icon={<InfoIcon size={18} />}
            label={t('profile.about')}
            trailing={<span className="text-[12px] text-ink-400">{t('profile.version')} 0.1.0</span>}
            dir={dir}
          />
        </Card>

        <Button variant="secondary" block onClick={onSignOut}>
          {t('profile.signOut')}
        </Button>
      </Screen>
    </>
  );
}

function Divider() {
  return <div className="mx-5 h-px bg-canvas-200/80" />;
}

function Row({
  icon,
  label,
  trailing,
  dir,
}: {
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  dir: 'rtl' | 'ltr';
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3.5 px-5 py-4 text-start hover:bg-canvas-100 transition-colors"
    >
      <span className="h-10 w-10 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center">
        {icon}
      </span>
      <span className="flex-1 text-[14px] font-medium text-ink-800 tracking-tight">{label}</span>
      {trailing}
      <ChevronIcon size={16} className={cn('text-ink-300', dir === 'rtl' && 'rotate-180')} />
    </button>
  );
}
