import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Header, Screen } from '@/components/layout';
import { Button, Card } from '@/components/ui';
import { ChartIcon, ClockIcon, ShieldIcon } from '@/components/icons';
import { useT } from '@/lib/i18n';

const MODULE_KEYS = [
  'merchants',
  'users',
  'limits',
  'cases',
  'overdue',
  'reports',
  'audit',
  'support',
] as const;
type ModuleKey = (typeof MODULE_KEYS)[number];

export default function AdminModulePlaceholder() {
  const t = useT();
  const navigate = useNavigate();
  const location = useLocation();
  const slug = (location.pathname.split('/').filter(Boolean)[1] ?? '') as string;
  const moduleKey: ModuleKey | 'generic' = (MODULE_KEYS as readonly string[]).includes(slug)
    ? (slug as ModuleKey)
    : 'generic';
  const title =
    moduleKey === 'generic'
      ? t('admin.modules.generic.title')
      : t(`admin.home.modules.${moduleKey}`);

  return (
    <>
      <Header title={title} showBack />
      <Screen padded={false} className="bg-ink-50">
        <div className="px-4 pt-6 pb-8 space-y-4 flex flex-col min-h-full">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-6 shadow-float text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 start-1/2 -translate-x-1/2 h-48 w-48 rounded-full bg-gold-500/20 blur-3xl"
            />
            <div className="relative mx-auto h-14 w-14 rounded-2xl bg-white/10 ring-1 ring-white/15 grid place-items-center">
              <ChartIcon size={22} />
            </div>
            <h1 className="relative mt-4 text-[18px] font-bold">
              {t('admin.modules.generic.soonTitle')}
            </h1>
            <p className="relative mt-2 text-[13px] text-white/70 leading-relaxed max-w-[36ch] mx-auto">
              {t('admin.modules.generic.soonSubtitle')}
            </p>
          </div>

          <Card padded className="flex items-start gap-3">
            <span className="h-10 w-10 shrink-0 rounded-xl bg-brand-50 text-brand-600 grid place-items-center">
              <ShieldIcon size={18} />
            </span>
            <div className="min-w-0 text-[12.5px] text-ink-600 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-0.5 text-[13px]">
                {t('admin.modules.generic.scopeTitle')}
              </div>
              {t('admin.modules.generic.scopeHint')}
            </div>
          </Card>

          <Card padded className="flex items-start gap-3">
            <span className="h-10 w-10 shrink-0 rounded-xl bg-[#FBF2DD] text-gold-600 grid place-items-center">
              <ClockIcon size={18} />
            </span>
            <div className="min-w-0 text-[12.5px] text-ink-600 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-0.5 text-[13px]">
                {t('admin.modules.generic.roadmapTitle')}
              </div>
              {t('admin.modules.generic.roadmapHint')}
            </div>
          </Card>

          <div className="mt-auto space-y-2.5 pt-4">
            <Button
              size="lg"
              block
              onClick={() => navigate('/admin/home')}
            >
              {t('admin.modules.generic.backToHome')}
            </Button>
            <Link to="/welcome" className="block text-center text-[12px] text-ink-500">
              {t('admin.modules.generic.exit')}
            </Link>
          </div>
        </div>
      </Screen>
    </>
  );
}
