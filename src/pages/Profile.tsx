import { useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Avatar, Card, SectionHeader, StatusChip } from '@/components/ui';
import {
  ChevronIcon,
  GlobeIcon,
  HistoryIcon,
  InfoIcon,
  ShieldIcon,
  SupportIcon,
  UserIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';
import { useSupabaseAuth } from '@/lib/supabase';
import { cn } from '@/lib/cn';
import type { ReactNode } from 'react';

export default function Profile() {
  const t = useT();
  const { locale, setLocale, dir } = useI18n();
  const { session: demoSession, signOut: demoSignOut } = useStore();
  const {
    configured,
    profile,
    session: realSession,
    signOut: supabaseSignOut,
  } = useSupabaseAuth();
  const navigate = useNavigate();

  // Real profile when configured + loaded; otherwise demo session.
  const fullName = configured
    ? profile?.full_name ?? realSession?.user?.email ?? '—'
    : demoSession?.fullName ?? '—';
  const email = configured
    ? profile?.email ?? realSession?.user?.email ?? '—'
    : demoSession?.email ?? '—';
  // Identity gate is the new source of truth (Phase 8e). Customers
  // sign up unverified; the flag flips inside the rental flow via
  // record_identity_verification. Legacy live profiles that only have
  // nafath_verified_at populated still surface as verified.
  const identityVerified = configured
    ? profile?.identity_verified === true ||
      Boolean(profile?.nafath_verified_at)
    : Boolean(demoSession?.nafathVerified);

  const onSignOut = async () => {
    if (configured) {
      try {
        await supabaseSignOut();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[applux] signOut failed', err);
      }
    } else {
      demoSignOut();
    }
    navigate('/welcome', { replace: true });
  };

  return (
    <>
      <Header title={t('profile.title')} />
      <Screen className="bg-canvas">
        {/* Identity card */}
        <Card padded>
          <div className="flex items-center gap-4">
            <Avatar name={fullName !== '—' ? fullName : 'A'} size="lg" tone="gold" />
            <div className="min-w-0">
              <div className="editorial-title text-[17px] text-ink-900 truncate">
                {fullName}
              </div>
              <div className="text-[12.5px] text-ink-400 truncate mt-0.5">{email}</div>
              <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                <StatusChip tone="gold" label={t('app.name')} />
                {identityVerified ? (
                  <StatusChip tone="gold" label={t('identity.chip.verified')} />
                ) : (
                  <StatusChip tone="neutral" label={t('identity.chip.notVerified')} />
                )}
              </div>
              {!identityVerified && (
                <p className="mt-2 text-[11.5px] text-ink-500 leading-relaxed">
                  {t('identity.chip.notVerifiedHint')}
                </p>
              )}
            </div>
          </div>
        </Card>

        {/* Account list */}
        <div>
          <SectionHeader title={t('profile.accountSection')} />
          <Card padded={false} className="overflow-hidden">
            <Row
              icon={<UserIcon size={18} />}
              tone="lavender"
              label={t('profile.accountEntry')}
              dir={dir}
            />
            <Divider />
            <Row
              icon={<HistoryIcon size={18} />}
              tone="canvas"
              label={t('profile.historyEntry')}
              dir={dir}
            />
          </Card>
        </div>

        {/* Language toggle */}
        <div>
          <SectionHeader title={t('profile.language')} />
          <Card padded={false} className="overflow-hidden">
            <div className="grid grid-cols-2">
              <button
                type="button"
                onClick={() => setLocale('ar')}
                className={cn(
                  'py-4 text-[13.5px] font-medium transition-colors tracking-tight',
                  locale === 'ar'
                    ? 'bg-lavender-400 text-white'
                    : 'text-ink-700 hover:bg-lavender-50',
                )}
              >
                {t('profile.arabic')}
              </button>
              <button
                type="button"
                onClick={() => setLocale('en')}
                className={cn(
                  'py-4 text-[13.5px] font-medium transition-colors tracking-tight',
                  locale === 'en'
                    ? 'bg-lavender-400 text-white'
                    : 'text-ink-700 hover:bg-lavender-50',
                )}
              >
                {t('profile.english')}
              </button>
            </div>
          </Card>
        </div>

        {/* Settings list */}
        <div>
          <SectionHeader title={t('profile.appearance')} />
          <Card padded={false} className="overflow-hidden">
            <Row icon={<ShieldIcon size={18} />} tone="lavender" label={t('profile.security')} dir={dir} />
            <Divider />
            <Row icon={<GlobeIcon size={18} />} tone="canvas" label={t('profile.language')} dir={dir} />
          </Card>
        </div>

        {/* Support list */}
        <div>
          <SectionHeader title={t('profile.support')} />
          <Card padded={false} className="overflow-hidden">
            <Row icon={<SupportIcon size={18} />} tone="lavender" label={t('profile.support')} dir={dir} />
            <Divider />
            <Row
              icon={<InfoIcon size={18} />}
              tone="canvas"
              label={t('profile.about')}
              trailing={
                <span className="text-[12px] text-ink-400 num">{t('profile.version')} 0.1.0</span>
              }
              dir={dir}
            />
          </Card>
        </div>

        {/* Sign out — soft lavender outline */}
        <button
          type="button"
          onClick={onSignOut}
          className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-xl2 bg-lavender-50 text-lavender-700 font-semibold ring-1 ring-inset ring-lavender-200 hover:bg-lavender-100 transition-colors"
        >
          {t('profile.signOut')}
        </button>

        <p className="text-center text-[11px] text-ink-400 num">
          Lend v0.1.0
        </p>
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
  tone = 'canvas',
}: {
  icon: ReactNode;
  label: ReactNode;
  trailing?: ReactNode;
  dir: 'rtl' | 'ltr';
  tone?: 'lavender' | 'canvas';
}) {
  return (
    <button
      type="button"
      className="flex w-full items-center gap-3.5 px-5 py-4 text-start hover:bg-lavender-50 transition-colors"
    >
      <span
        className={cn(
          'h-10 w-10 rounded-2xl grid place-items-center',
          tone === 'lavender'
            ? 'bg-lavender-50 text-lavender-600'
            : 'bg-canvas-100 text-ink-700',
        )}
      >
        {icon}
      </span>
      <span className="flex-1 text-[14px] font-medium text-ink-800 tracking-tight">{label}</span>
      {trailing}
      <ChevronIcon size={16} className={cn('text-ink-300', dir === 'rtl' && 'rotate-180')} />
    </button>
  );
}
