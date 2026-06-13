import { Link } from 'react-router-dom';
import { Button } from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  ArrowIcon,
  CheckIcon,
  ClockIcon,
  ShieldIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { useSupabaseAuth } from '@/lib/supabase';
import { cn } from '@/lib/cn';

// =====================================================================
// Public entry / welcome screen — enterprise-restrained.
//
// Composition (top → bottom):
//   1. minimal top bar (lang toggle only)
//   2. brand: small Lend wordmark
//   3. hero: eyebrow + two-line display headline (line 2 lavender)
//      + subtitle
//   4. workflow snapshot card — one elegant card with four rows
//      reflecting the actual product flow (verify → review →
//      contract → track). System snapshot, not a literal screen
//      capture.
//   5. trust strip — three value points as a single quiet row
//   6. CTA stack — primary solid navy, secondary outlined,
//      tertiary merchant text link
//
// Sectors are intentionally NOT on this screen. The platform's
// sector taxonomy lives at /stores; surfacing it on the public
// entry diluted the editorial focus on the hero → workflow →
// trust → CTA arc. The src/lib/sectors.ts source-of-truth still
// drives /stores and any other consumer.
//
// Scaffolding preserved verbatim:
//   * LangToggle
//   * `configured`-gated demo-admin link
//   * CTA destinations
//   * terms footer
// =====================================================================

export default function Welcome() {
  const t = useT();
  const { dir } = useI18n();
  const { configured } = useSupabaseAuth();

  return (
    <div className="relative flex flex-col min-h-full bg-canvas-50 text-ink-900 overflow-hidden">
      {/* Restrained surface — one quiet lavender wash at the top end,
          one warm canvas fade at the bottom. The previous large
          gradient blurs are pulled back so the composition reads as
          an editorial sheet, not a decorated hero. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 end-[-18%] h-72 w-72 rounded-full bg-lavender-200/40 blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 inset-x-0 h-64 bg-gradient-to-t from-canvas-100 via-canvas-50/30 to-transparent"
      />

      <div className="relative flex items-center justify-end px-5 pt-[calc(env(safe-area-inset-top)+18px)]">
        <LangToggle tone="dark" />
      </div>

      <div className="relative flex-1 px-6 pt-3 pb-8 flex flex-col">
        {/* ======== BRAND ======== */}
        <div className="flex justify-center pt-2">
          <LendWordmark
            latin={t('welcome.brandLatin')}
            arabic={t('welcome.brandArabic')}
          />
        </div>

        {/* ======== HERO ======== */}
        <header className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.18em] text-lavender-700">
            <span className="h-px w-5 bg-lavender-400" />
            {t('welcome.heroEyebrow')}
            <span className="h-px w-5 bg-lavender-400" />
          </div>

          <h1 className="mt-5 editorial-title text-[34px] leading-[1.08] text-ink-900 max-w-[18ch] mx-auto">
            <span className="block">{t('welcome.headline.line1')}</span>
            <span className="block text-lavender-500">
              {t('welcome.headline.line2')}
            </span>
          </h1>

          <p className="mt-5 text-[13.5px] leading-relaxed text-ink-500 max-w-[40ch] mx-auto">
            {t('welcome.subtitle')}
          </p>
        </header>

        {/* ======== WORKFLOW SNAPSHOT CARD ======== */}
        <WorkflowCard t={t} />

        {/* ======== TRUST STRIP — single quiet row.
            Sits closer to the workflow card now that the sectors
            block below has been removed; otherwise the eye would
            search for a missing section between them. */}
        <ul
          className="mt-7 flex items-center justify-center flex-wrap gap-x-3 gap-y-2 text-[12px] font-medium text-ink-700"
          aria-label={t('welcome.heroEyebrow')}
        >
          {(
            [
              t('welcome.trustPillars.secure'),
              t('welcome.trustPillars.documented'),
              t('welcome.trustPillars.protected'),
            ]
          ).map((label, i, arr) => (
            <li key={i} className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-lavender-500" />
              <span className="tracking-tight">{label}</span>
              {i < arr.length - 1 && (
                <span aria-hidden className="text-ink-300 ps-3">
                  ·
                </span>
              )}
            </li>
          ))}
        </ul>

        {/* ======== CTA STACK ========
            mt-auto absorbs the freed vertical space from the removed
            sectors block — the CTAs stay bottom-anchored, and the
            trust strip floats at a natural reading height above
            them. No filler card is added in the gap by design. */}
        <div className="mt-auto pt-10 space-y-2.5">
          {/* Primary — solid dark navy. Styled inline so the global
              Button primary (lavender) is unchanged for the rest of
              the app. Matches Button size=lg proportions. */}
          <Link
            to="/auth/register"
            className={cn(
              'group relative flex items-center justify-center h-13 w-full rounded-xl2',
              'bg-ink-900 text-white font-semibold text-[15px] tracking-tight',
              'shadow-plush hover:bg-ink-800 active:bg-ink-800',
              'transition-[background-color,box-shadow,transform] duration-200',
              'active:scale-[0.985]',
            )}
          >
            {t('welcome.createAccount')}
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
 * "LEND" sitting above a short lavender rule with Arabic "ليند"
 * inline between two thin rules. Renders entirely in CSS so it
 * scales cleanly without a bundled image asset.
 */
function LendWordmark({ latin, arabic }: { latin: string; arabic: string }) {
  return (
    <div className="inline-flex flex-col items-center gap-1.5 select-none">
      <span className="editorial-title text-[34px] leading-none tracking-[0.18em] text-ink-900">
        {latin}
      </span>
      <span
        aria-hidden
        className="flex items-center gap-2.5 text-lavender-500"
      >
        <span className="h-px w-7 bg-current" />
        <span className="editorial-title text-[12.5px] leading-none text-ink-900">
          {arabic}
        </span>
        <span className="h-px w-7 bg-current" />
      </span>
    </div>
  );
}

/**
 * Workflow snapshot card — one elegant card with four quiet rows
 * showing the actual Lend product flow: verify → review → contract
 * → track. Each row has a small status glyph (check for completed
 * steps, clock for the in-progress one), an editorial label, and a
 * tiny meta line. The "Preview / نموذج" badge in the corner makes
 * clear this is a system snapshot, not a literal screen capture.
 */
function WorkflowCard({
  t,
}: {
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const steps = [
    {
      key: 'verify',
      done: true,
    },
    {
      key: 'review',
      done: true,
    },
    {
      key: 'contract',
      done: true,
    },
    {
      key: 'track',
      done: false,
    },
  ] as const;

  return (
    <div className="mt-9 rounded-2xl bg-white/95 backdrop-blur ring-1 ring-canvas-200 shadow-plush p-5">
      <div className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-ink-500">
          <span className="h-1.5 w-1.5 rounded-full bg-lavender-500" />
          {t('welcome.workflow.label')}
        </div>
        <span className="inline-flex items-center text-[9.5px] font-bold uppercase tracking-[0.16em] text-lavender-700 bg-lavender-50 ring-1 ring-lavender-100 rounded-full px-1.5 py-0.5">
          {t('welcome.workflow.badge')}
        </span>
      </div>

      <ol className="mt-4 space-y-3.5">
        {steps.map((s) => (
          <li key={s.key} className="flex items-start gap-3">
            <span
              className={cn(
                'h-7 w-7 rounded-full grid place-items-center shrink-0 ring-1',
                s.done
                  ? 'bg-ink-900 text-white ring-ink-900'
                  : 'bg-lavender-50 text-lavender-700 ring-lavender-200',
              )}
              aria-hidden
            >
              {s.done ? (
                <CheckIcon size={13} strokeWidth={2.8} />
              ) : (
                <ClockIcon size={13} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold text-ink-900 leading-tight">
                {t(`welcome.workflow.steps.${s.key}.title`)}
              </div>
              <div
                className={cn(
                  'mt-0.5 text-[11.5px] leading-snug',
                  s.done ? 'text-ink-500' : 'text-lavender-700 font-medium',
                )}
              >
                {t(`welcome.workflow.steps.${s.key}.meta`)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
