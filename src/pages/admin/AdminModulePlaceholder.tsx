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
      <Screen padded={false} className="bg-canvas">
        <div className="px-5 pt-6 pb-10 space-y-5 flex flex-col min-h-full">
          <div className="relative overflow-hidden rounded-xl3 bg-gradient-to-br from-ink-900 via-ink-800 to-ink-900 text-white p-8 shadow-plush text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -top-14 start-1/2 -translate-x-1/2 h-56 w-56 rounded-full bg-gold-400/22 blur-[100px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0 pattern-dots opacity-20"
            />
            <span className="relative inline-flex items-center gap-1.5 rounded-full bg-gold-400/15 ring-1 ring-gold-400/30 px-2.5 py-1 text-[11px] font-semibold text-gold-200">
              <ClockIcon size={12} />
              {t('admin.modules.generic.roadmapTitle')}
            </span>
            <div className="relative mx-auto mt-6 h-16 w-16 rounded-2xl bg-white/8 ring-1 ring-white/12 text-gold-300 grid place-items-center">
              <ChartIcon size={24} />
            </div>
            <h1 className="relative mt-5 editorial-title text-[24px] leading-tight text-white">
              {t('admin.modules.generic.soonTitle')}
            </h1>
            <p className="relative mt-3 text-[13px] text-white/65 leading-relaxed max-w-[36ch] mx-auto">
              {t('admin.modules.generic.soonSubtitle')}
            </p>
          </div>

          <Card padded className="flex items-start gap-3.5">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-canvas-100 text-ink-700 grid place-items-center">
              <ShieldIcon size={18} />
            </span>
            <div className="min-w-0 text-[12.5px] text-ink-500 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-1 text-[13px] tracking-tight">
                {t('admin.modules.generic.scopeTitle')}
              </div>
              {t('admin.modules.generic.scopeHint')}
            </div>
          </Card>

          <Card padded className="flex items-start gap-3.5">
            <span className="h-10 w-10 shrink-0 rounded-2xl bg-gold-50 text-gold-700 grid place-items-center">
              <ClockIcon size={18} />
            </span>
            <div className="min-w-0 text-[12.5px] text-ink-500 leading-relaxed">
              <div className="text-ink-900 font-semibold mb-1 text-[13px] tracking-tight">
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
