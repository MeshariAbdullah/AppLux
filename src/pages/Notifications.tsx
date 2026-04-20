import { Header, Screen } from '@/components/layout';
import { EmptyState } from '@/components/ui';
import { BellIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';

export default function Notifications() {
  const t = useT();
  return (
    <>
      <Header title={t('notifications.title')} />
      <Screen>
        <EmptyState
          icon={<BellIcon size={22} />}
          title={t('notifications.empty')}
          description={t('app.tagline')}
        />
      </Screen>
    </>
  );
}
