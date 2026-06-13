import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ShieldIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useSupabaseAuth } from '@/lib/supabase';
import { SECTORS } from '@/lib/sectors';
import { cn } from '@/lib/cn';

// =====================================================================
// Public entry / welcome screen.
//
// Premium-leaning brand-first hero anchored on the Lend wordmark, then
// a tight three-beat composition: brand → product → entry. Evolves on
// the previous version (lang toggle, configured-mode admin gate,
// SECTORS source, CTA destinations all preserved).
// =====================================================================

export default function Welcome() {
  const t = useT();
  const { dir } = useI18n();
  const { configured } = useSupabaseAuth();

  return (
    <div className="relative flex flex-col min-h-full bg-canvas-50 text-ink-900 overflow-hidden">
      {/* Lavender glow anchored top-end + warm canvas fade at the
          bottom-start. The composition reads as a single elevated
          surface rather than a stack of cards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 end-[-30%] h-[28rem] w-[28rem] rounded-full bg-lavender-300/40 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 start-[-30%] h-80 w-80 rounded-full bg-lavender-100/70 blur-[110px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 inset-x-0 h-56 bg-gradient-to-t from-canvas-100 via-canvas-50/40 to-transparent"
      />

      {/* Top bar — small lang toggle only. The hero block carries the
          brand mark; we don't double up. */}
      <div className="relative flex items-center justify-end px-5 pt-[calc(env(safe-area-inset-top)+18px)]">
        <LangToggle tone="dark" />
      </div>

      <div className="relative flex-1 px-6 pt-6 pb-8 flex flex-col">
        {/* ====================================================== */}
        {/* HERO — Lend wordmark + eyebrow + two-line display       */}
        {/* headline (line 2 in lavender) + supporting subtitle.    */}
        {/* ====================================================== */}
        <header className="text-center">
          <LendWordmark
            latin={t('welcome.brandLatin')}
            arabic={t('welcome.brandArabic')}
          />

          <div className="mt-7 inline-flex items-center gap-1.5 rounded-full bg-white/85 backdrop-blur ring-1 ring-lavender-200 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-lavender-700">
            <BadgeCheckIcon size={12} />
            {t('welcome.heroEyebrow')}
          </div>

          <h1 className="mt-5 editorial-title text-[34px] leading-[1.08] text-ink-900 max-w-[18ch] mx-auto">
            <span className="block">{t('welcome.headline.line1')}</span>
            <span className="block text-lavender-500">
              {t('welcome.headline.line2')}
            </span>
          </h1>

          <p className="mt-5 text-[13.5px] leading-relaxed text-ink-500 max-w-[36ch] mx-auto">
            {t('welcome.subtitle')}
          </p>
        </header>

        {/* ====================================================== */}
        {/* TRUST STRIP — three short statements, restrained chips. */}
        {/* Renders horizontally on roomy phones, stacks gracefully */}
        {/* otherwise.                                              */}
        {/* ====================================================== */}
        <ul
          className="mt-7 grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-2.5"
          aria-label={t('welcome.heroEyebrow')}
        >
          {(
            [
              { key: 'secure', label: t('welcome.trustPillars.secure') },
              {
                key: 'documented',
                label: t('welcome.trustPillars.documented'),
              },
              {
                key: 'protected',
                label: t('welcome.trustPillars.protected'),
              },
            ] as const
          ).map((p) => (
            <li
              key={p.key}
              className="flex items-center gap-2 rounded-2xl bg-white/85 backdrop-blur ring-1 ring-lavender-100 px-3 py-2.5 shadow-soft"
            >
              <span className="h-7 w-7 rounded-xl bg-lavender-50 text-lavender-600 grid place-items-center shrink-0">
                <CheckIcon size={13} strokeWidth={2.8} />
              </span>
              <span className="text-[12.5px] font-medium tracking-tight text-ink-800 leading-snug">
                {p.label}
              </span>
            </li>
          ))}
        </ul>

        {/* ====================================================== */}
        {/* SECTORS — refined cards, ink-900 numeral, editorial     */}
        {/* sector name, sub-categories rendered as tagline pills. */}
        {/* ====================================================== */}
        <section className="mt-10">
          <div className="flex items-end justify-between gap-3 mb-3.5">
            <div>
              <h2 className="editorial-title text-[18px] text-ink-900 leading-tight">
                {t('welcome.sectors.title')}
              </h2>
              <p className="mt-1 text-[11.5px] text-ink-500 leading-relaxed max-w-[36ch]">
                {t('welcome.sectors.subtitle')}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {SECTORS.map((sector, i) => (
              <SectorCard
                key={sector.key}
                index={i + 1}
                name={t(sector.i18nName)}
                tags={t(sector.i18nSub)}
              />
            ))}
          </div>
        </section>

        {/* ====================================================== */}
        {/* CTA STACK — clear hierarchy. Primary filled lavender,   */}
        {/* secondary outlined navy, tertiary text-link to merchant */}
        {/* portal. Demo-admin link stays gated on !configured.     */}
        {/* ====================================================== */}
        <div className="mt-auto pt-10 space-y-2.5">
          <Link to="/auth/register" className="block">
            <Button size="lg" block variant="primary">
              {t('welcome.createAccount')}
            </Button>
          </Link>
          <Link to="/auth/login" className="block">
            <Button size="lg" block variant="secondary">
              {t('welcome.signIn')}
            </Button>
          </Link>

          <Link
            to="/merchant/welcome"
            className="group mt-1 flex items-center justify-center gap-1.5 text-[12.5px] font-semibold text-lavender-700 hover:text-lavender-800 pt-1.5"
          >
            {t('welcome.merchantCta')}
            <ArrowIcon
              size={13}
              className={cn(
                'transition-transform group-hover:translate-x-0.5',
                dir === 'rtl' ? 'rotate-180 group-hover:-translate-x-0.5' : '',
              )}
            />
          </Link>

          {/* Demo-only shortcut to the admin area. In configured mode
              RequireRole would just bounce non-admins back to /welcome,
              so we hide it entirely to avoid the confusing round-trip. */}
          {!configured && (
            <Link
              to="/admin/home"
              className="mt-0.5 flex items-center justify-center gap-1.5 text-[11.5px] text-ink-400 hover:text-ink-700"
            >
              <ShieldIcon size={11} />
              {t('welcome.adminDemo.label')}
              <span className="text-[9.5px] font-bold tracking-wide uppercase bg-lavender-50 text-lavender-700 rounded-full px-1.5 py-0.5">
                {t('welcome.adminDemo.pill')}
              </span>
            </Link>
          )}

          <p className="text-center text-[11px] text-ink-400 leading-relaxed px-6 pt-2">
            {t('welcome.terms')}
          </p>
        </div>
      </div>
    </div>
  );
}

/**
 * Typographic Lend wordmark — mirrors the brand logo: serif Roman
 * "LEND" sitting above a short lavender rule with the Arabic "ليند"
 * on either side. Renders entirely in CSS so it scales cleanly
 * without bundling an image asset.
 */
function LendWordmark({ latin, arabic }: { latin: string; arabic: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-2 select-none">
      <span className="editorial-title text-[46px] sm:text-[52px] leading-none tracking-[0.08em] text-ink-900">
        {latin}
      </span>
      <span
        aria-hidden
        className="flex items-center gap-3 text-lavender-500"
      >
        <span className="h-px w-10 bg-current" />
        <span className="editorial-title text-[15px] leading-none text-ink-900">
          {arabic}
        </span>
        <span className="h-px w-10 bg-current" />
      </span>
    </div>
  );
}

/**
 * One sector card. Premium-leaning: editorial display name, quiet
 * ink-900 numeral, sub-categories pulled apart on the bullet
 * delimiter and rendered as inline pills so the platform layer
 * reads as structured rather than a one-line caption.
 */
function SectorCard({
  index,
  name,
  tags,
}: {
  index: number;
  name: string;
  tags: string;
}) {
  // The i18n value for the sub-category line uses " · " as the
  // visual delimiter; split on it to render each sub-category as
  // its own pill. Falls back to the raw string when the delimiter
  // isn't present.
  const parts = tags
    .split(/\s+·\s+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return (
    <div className="rounded-2xl bg-white/95 backdrop-blur ring-1 ring-lavender-100 shadow-soft p-3.5">
      <div className="flex items-center gap-3">
        <span className="h-9 w-9 rounded-xl bg-ink-900 text-white grid place-items-center editorial-title text-[14px] leading-none">
          {index}
        </span>
        <div className="min-w-0 flex-1">
          <div className="editorial-title text-[15.5px] text-ink-900 leading-tight truncate">
            {name}
          </div>
          {parts.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {parts.map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center text-[10.5px] font-medium tracking-tight text-lavender-700 bg-lavender-50 ring-1 ring-lavender-100 rounded-full px-2 py-0.5"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
