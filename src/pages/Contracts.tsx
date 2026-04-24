import { Header, Screen } from '@/components/layout';
import { Button, EmptyState, IconButton, Input } from '@/components/ui';
import { DocIcon, FilterIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';

export default function Contracts() {
  const t = useT();
  return (
    <>
      <Header
        title={t('contracts.title')}
        trailing={
          <>
            <IconButton variant="subtle" label={t('common.filter')}>
              <FilterIcon size={18} />
            </IconButton>
            <IconButton label={t('home.newContract')}>
              <PlusIcon size={18} />
            </IconButton>
          </>
        }
      />
      <Screen className="bg-canvas">
        <Input
          placeholder={t('contracts.searchPlaceholder')}
          leading={<SearchIcon size={18} />}
        />
        <EmptyState
          icon={<DocIcon size={22} />}
          title={t('common.empty')}
          description={t('app.tagline')}
          action={
            <Button size="sm" leading={<PlusIcon size={16} />}>
              {t('home.newContract')}
            </Button>
          }
        />
      </Screen>
    </>
  );
}
