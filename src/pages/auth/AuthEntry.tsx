import { Link } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button } from '@/components/ui';
import { useT } from '@/lib/i18n';

export default function AuthEntry() {
  const t = useT();
  return (
    <>
      <Header title={t('welcome.eyebrow')} showBack />
      <Screen>
        <div className="pt-4">
          <h1 className="text-[22px] font-bold text-ink-900">{t('auth.registerEntryTitle')}</h1>
          <p className="mt-2 text-[13.5px] text-ink-500 leading-relaxed">
            {t('auth.registerEntrySubtitle')}
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <Link to="/auth/register">
            <Button size="lg" block>
              {t('welcome.createAccount')}
            </Button>
          </Link>
          <Link to="/auth/login">
            <Button size="lg" variant="secondary" block>
              {t('welcome.signIn')}
            </Button>
          </Link>
        </div>
      </Screen>
    </>
  );
}
