import { Header, Screen } from '@/components/layout';
import {
  Avatar,
  Button,
  Card,
  CardHeader,
  IconButton,
  SectionHeader,
  StatCard,
  StatusChip,
} from '@/components/ui';
import {
  ArrowIcon,
  BellIcon,
  ChartIcon,
  DocIcon,
  PlusIcon,
  UsersIcon,
  WalletIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useStore } from '@/lib/store';

export default function Home() {
  const t = useT();
  const { formatCurrency, dir } = useI18n();
  const { session } = useStore();

  const quickActions = [
    { key: 'newContract', icon: <DocIcon size={20} />, tone: 'bg-brand-50 text-brand-600' },
    { key: 'newNote', icon: <WalletIcon size={20} />, tone: 'bg-[#FBF2DD] text-gold-600' },
    { key: 'customers', icon: <UsersIcon size={20} />, tone: 'bg-success-50 text-success-600' },
    { key: 'reports', icon: <ChartIcon size={20} />, tone: 'bg-ink-100 text-ink-700' },
  ] as const;

  return (
    <>
      <Header
        variant="hero"
        leading={<Avatar name={session?.name ?? 'A'} tone="gold" />}
        title={
          <span className="text-white">
            {t('home.greeting')}
            {session ? `، ${session.name}` : ''}
          </span>
        }
        subtitle={t('home.subtitle')}
        trailing={
          <IconButton variant="glass" label={t('nav.notifications')}>
            <BellIcon size={18} />
          </IconButton>
        }
      />
      <Screen>
        <Card padded className="-mt-10 relative">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-[12px] font-medium text-ink-400 uppercase tracking-wide">
                {t('home.collected')}
              </div>
              <div className="mt-1 text-2xl font-bold text-ink-900 num">
                {formatCurrency(128450)}
              </div>
              <div className="mt-1 flex items-center gap-2">
                <StatusChip tone="success" label="+12.4%" />
                <span className="text-[12px] text-ink-400">{t('home.overview')}</span>
              </div>
            </div>
            <Button size="sm" variant="secondary" trailing={<ArrowIcon size={16} className={dir === 'rtl' ? 'rotate-180' : ''} />}>
              {t('common.viewAll')}
            </Button>
          </div>
        </Card>

        <div>
          <SectionHeader title={t('home.quickActions')} />
          <div className="grid grid-cols-4 gap-2">
            {quickActions.map((a) => (
              <button
                key={a.key}
                type="button"
                className="flex flex-col items-center gap-2 rounded-xl2 bg-white p-3 ring-1 ring-ink-100 hover:shadow-soft active:scale-[0.98] transition"
              >
                <span className={`h-11 w-11 rounded-xl grid place-items-center ${a.tone}`}>
                  {a.icon}
                </span>
                <span className="text-[11.5px] font-medium text-ink-700 leading-tight text-center">
                  {t(`home.${a.key}`)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StatCard
            tone="brand"
            label={t('home.activeContracts')}
            value="24"
            hint="—"
            icon={<DocIcon size={18} />}
          />
          <StatCard
            tone="warn"
            label={t('home.dueSoon')}
            value="6"
            hint="—"
            icon={<WalletIcon size={18} />}
          />
        </div>

        <Card padded>
          <CardHeader
            title={t('contracts.title')}
            subtitle="—"
            action={
              <IconButton variant="subtle" label={t('home.newContract')}>
                <PlusIcon size={18} />
              </IconButton>
            }
          />
          <div className="mt-3 space-y-2">
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name="م ح" tone="brand" size="sm" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-ink-900 truncate">—</div>
                  <div className="text-[12px] text-ink-400">—</div>
                </div>
              </div>
              <StatusChip tone="success" label={t('common.active')} />
            </div>
            <div className="h-px bg-ink-100" />
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-3 min-w-0">
                <Avatar name="ع ف" tone="ink" size="sm" />
                <div className="min-w-0">
                  <div className="text-[13.5px] font-medium text-ink-900 truncate">—</div>
                  <div className="text-[12px] text-ink-400">—</div>
                </div>
              </div>
              <StatusChip tone="warn" label={t('common.pending')} />
            </div>
          </div>
        </Card>
      </Screen>
    </>
  );
}
