import { Header, Screen } from '@/components/layout';
import { Avatar, Card, SectionHeader, StatusChip } from '@/components/ui';
import { ChevronIcon, GlobeIcon, InfoIcon, ShieldIcon, SupportIcon } from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export default function Profile() {
  const t = useT();
  const { locale, setLocale, dir } = useI18n();
  const { session } = useStore();

  return (
    <>
      <Header title={t('profile.title')} />
      <Screen>
        <Card padded>
          <div className="flex items-center gap-3">
            <Avatar name={session?.name ?? 'A'} size="lg" tone="gold" />
            <div className="min-w-0">
              <div className="text-[15px] font-semibold text-ink-900 truncate">
                {session?.name ?? '—'}
              </div>
              <div className="text-[12.5px] text-ink-400 truncate">{session?.company ?? '—'}</div>
              <div className="mt-1.5">
                <StatusChip tone="gold" label={t('app.name')} />
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
                  'py-3.5 text-[13.5px] font-medium transition-colors',
                  locale === 'ar' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-50',
                )}
              >
                {t('profile.arabic')}
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={cn(
                  'py-3.5 text-[13.5px] font-medium transition-colors',
                  locale === 'en' ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-ink-50',
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
      </Screen>
    </>
  );
}

function Divider() {
  return <div className="mx-4 h-px bg-ink-100" />;
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
      className="flex w-full items-center gap-3 px-4 py-3.5 text-start hover:bg-ink-50 transition-colors"
    >
      <span className="h-9 w-9 rounded-xl bg-ink-50 text-ink-700 grid place-items-center">
        {icon}
      </span>
      <span className="flex-1 text-[13.5px] font-medium text-ink-800">{label}</span>
      {trailing}
      <ChevronIcon size={16} className={cn('text-ink-300', dir === 'rtl' && 'rotate-180')} />
    </button>
  );
}
