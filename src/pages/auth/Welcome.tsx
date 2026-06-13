import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui';
import { LangToggle } from '@/components/auth/LangToggle';
import {
  ArrowIcon,
  BadgeCheckIcon,
  CheckIcon,
  ChevronIcon,
  ClockIcon,
  SearchIcon,
  ShieldIcon,
} from '@/components/icons';
import { useI18n, useT } from '@/lib/i18n';
import { listMerchants, useSupabaseAuth } from '@/lib/supabase';
import type { LocalizedJson, MerchantRow } from '@/lib/supabase';
import { cn } from '@/lib/cn';

// =====================================================================
// Public entry / welcome screen — enterprise-restrained.
//
// Composition (top → bottom):
//   1. minimal top bar (lang toggle only)
//   2. brand: small Lend wordmark
//   3. hero: eyebrow + two-line display headline (line 2 lavender)
//      + role-aware subtitle (customer or merchant)
//   4. audience toggle — a compact two-segment pill above the
//      workflow card. Customer ↔ Merchant. Persisted in
//      localStorage as `lend.welcomeAudience` so a returning
//      visitor opens to their last choice.
//   5. workflow snapshot card — one elegant card with four rows
//      reflecting the actual product flow (verify → review →
//      contract → track). The step labels + meta lines adapt to
//      the selected audience.
//   6. trust strip — three value points as a single quiet row
//   7. partners strip — typographic row of live merchant
//      wordmarks (no logos, no cards). Graceful editorial line
//      when no real merchants are available — the section stays
//      visible either way so the page rhythm is stable.
//   8. CTA stack — primary solid navy, secondary outlined,
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

type Audience = 'customer' | 'merchant';
const AUDIENCE_STORAGE_KEY = 'lend.welcomeAudience';

export default function Welcome() {
  const t = useT();
  const { dir } = useI18n();
  const { configured } = useSupabaseAuth();
  const [audience, setAudienceState] = useState<Audience>(() => {
    if (typeof window === 'undefined') return 'customer';
    const v = window.localStorage.getItem(AUDIENCE_STORAGE_KEY);
    return v === 'merchant' ? 'merchant' : 'customer';
  });
  const setAudience = (next: Audience) => {
    setAudienceState(next);
    try {
      window.localStorage.setItem(AUDIENCE_STORAGE_KEY, next);
    } catch {
      /* ignore quota / disabled storage */
    }
  };

  // Real merchants for the partners strip + partner-discovery sheet.
  // Fetched once at the Welcome level so both surfaces share the same
  // data — no duplicate network round-trip.
  const [partners, setPartners] = useState<MerchantRow[] | null>(null);
  useEffect(() => {
    if (!configured) {
      setPartners(null);
      return;
    }
    let cancelled = false;
    listMerchants({ limit: 50 })
      .then((rows) => {
        if (!cancelled) setPartners(rows);
      })
      .catch(() => {
        if (!cancelled) setPartners([]);
      });
    return () => {
      cancelled = true;
    };
  }, [configured]);

  // Partner discovery sheet — bottom-anchored, in-page modal.
  const [partnersSheetOpen, setPartnersSheetOpen] = useState(false);

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
            {t(
              audience === 'merchant'
                ? 'welcome.subtitleMerchant'
                : 'welcome.subtitle',
            )}
          </p>
        </header>

        {/* ======== AUDIENCE TOGGLE ========
            Sits between the hero subtitle and the workflow card so
            the user's role selection arrives at the card visually.
            Persisted in localStorage; defaults to customer. */}
        <AudienceToggle
          value={audience}
          onChange={setAudience}
          t={t}
        />

        {/* ======== WORKFLOW SNAPSHOT CARD ======== */}
        <WorkflowCard t={t} audience={audience} />

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

        {/* ======== PARTNERS STRIP ========
            Typographic row of real merchant wordmarks. Never auto-
            hides — when no real merchants are available (demo mode,
            empty production list, or transient error) the strip
            shows a graceful editorial line so the page rhythm
            stays stable. */}
        <TrustedPartnersStrip
          partners={partners}
          onOpenSheet={() => setPartnersSheetOpen(true)}
          t={t}
        />

        {/* ======== CTA STACK ========
            mt-auto absorbs the freed vertical space — CTAs stay
            bottom-anchored; the partners strip floats above them
            at a natural reading height. No filler card by design. */}
        <div className="mt-auto pt-9 space-y-2.5">
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

      {/* ======== PARTNER DISCOVERY SHEET ========
          Mounted at the page-root level so it overlays the entire
          screen. Visibility is purely state-driven; the strip above
          is the trigger. */}
      <PartnerDiscoverySheet
        open={partnersSheetOpen}
        onClose={() => setPartnersSheetOpen(false)}
        partners={partners}
        t={t}
        dir={dir}
      />
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
  audience,
}: {
  t: (k: string, vars?: Record<string, string | number>) => string;
  audience: Audience;
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
                {t(`welcome.workflow.steps.${audience}.${s.key}.title`)}
              </div>
              <div
                className={cn(
                  'mt-0.5 text-[11.5px] leading-snug',
                  s.done ? 'text-ink-500' : 'text-lavender-700 font-medium',
                )}
              >
                {t(`welcome.workflow.steps.${audience}.${s.key}.meta`)}
              </div>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Audience toggle — a compact two-segment pill that switches the
 * workflow card + hero subtitle between the customer and merchant
 * perspectives. Default = customer; persisted in localStorage via
 * the `lend.welcomeAudience` key so a returning visitor opens to
 * their last choice.
 *
 * Visual:
 *   * outlined pill, white surface, hairline canvas ring
 *   * an ink-900 navy knob that slides under the active segment
 *     (180ms ease-plush)
 *   * RTL-aware: uses logical `start-*` positioning so the knob
 *     glides correctly in both directions
 *
 * Accessibility: implemented as a role="tablist" with two
 * role="tab" buttons. The hero subtitle and workflow card are
 * controlled regions; aria-controls wires them up.
 */
function AudienceToggle({
  value,
  onChange,
  t,
}: {
  value: Audience;
  onChange: (next: Audience) => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const isCustomer = value === 'customer';
  return (
    <div className="mt-7 flex justify-center" role="tablist" aria-label="Audience">
      <div className="relative h-10 w-full max-w-[280px] rounded-full bg-white ring-1 ring-canvas-200 shadow-soft p-1">
        {/* Sliding knob — logical positioning so RTL flips naturally. */}
        <span
          aria-hidden
          className={cn(
            'absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full bg-ink-900',
            // transition-all so the start-* swap animates regardless
            // of Tailwind's default transition property list.
            'transition-all duration-200 ease-plush',
            isCustomer ? 'start-1' : 'start-[50%]',
          )}
        />
        <button
          type="button"
          role="tab"
          aria-selected={isCustomer}
          onClick={() => onChange('customer')}
          className={cn(
            'relative z-10 w-1/2 h-full rounded-full text-[12.5px] font-semibold tracking-tight transition-colors duration-150',
            isCustomer ? 'text-white' : 'text-ink-700 hover:text-ink-900',
          )}
        >
          {t('welcome.audience.customer')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={!isCustomer}
          onClick={() => onChange('merchant')}
          className={cn(
            'relative z-10 w-1/2 h-full rounded-full text-[12.5px] font-semibold tracking-tight transition-colors duration-150',
            !isCustomer ? 'text-white' : 'text-ink-700 hover:text-ink-900',
          )}
        >
          {t('welcome.audience.merchant')}
        </button>
      </div>
    </div>
  );
}

/**
 * Trusted partners strip — a quiet typographic row of real merchant
 * wordmarks, never a logo grid. Behaviour:
 *
 *   * configured + listMerchants returns ≥ 1 row → render the names
 *     (up to 6) in small-caps separated by hairline dots. Verified
 *     merchants take precedence, then the most recently approved
 *     ones; we pick the localised display_name for the current
 *     locale.
 *   * configured + 0 rows / fetch error → render the editorial
 *     fallback line. The strip stays visible so the page rhythm is
 *     stable.
 *   * !configured (demo mode) → render the editorial fallback line.
 *     We never invent partner names just to fill the strip.
 *
 * The eyebrow row ("Selected Lend partners" / "نخبة من شركاء Lend")
 * with thin lavender accents stays constant, regardless of body
 * state — that's what makes the section feel intentional even when
 * the live list is short or empty.
 */
function TrustedPartnersStrip({
  partners,
  onOpenSheet,
  t,
}: {
  partners: MerchantRow[] | null;
  onOpenSheet: () => void;
  t: (k: string, vars?: Record<string, string | number>) => string;
}) {
  const { locale } = useI18n();

  // Display sorting: verified first, then by rating, trim to 6 so the
  // strip stays one comfortable line on phones. Data is read straight
  // from the lifted Welcome state — no per-strip fetch.
  const names = useMemo(() => {
    if (!partners || partners.length === 0) return [];
    return [...partners]
      .sort((a, b) => {
        if (a.verified !== b.verified) return a.verified ? -1 : 1;
        return Number(b.rating ?? 0) - Number(a.rating ?? 0);
      })
      .map((r) => pickLocalized(r.display_name, locale))
      .filter((s): s is string => Boolean(s && s.trim().length > 0))
      .slice(0, 6);
  }, [partners, locale]);

  const hasNames = names.length > 0;

  // The whole strip is the trigger — a single <button> so screen
  // readers announce one actionable region with a meaningful label.
  // Visual change vs the static version is tiny: a small chevron at
  // the end and a subtle hover tone shift on the body. The eyebrow
  // row keeps its constant typographic frame.
  return (
    <section className="mt-9">
      <button
        type="button"
        onClick={onOpenSheet}
        aria-label={t('welcome.partners.browse')}
        className="group block w-full text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-lavender-300 focus-visible:ring-offset-2 focus-visible:ring-offset-canvas-50 rounded-xl"
      >
        <div className="flex items-center justify-center gap-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-500">
          <span aria-hidden className="h-px w-6 bg-lavender-300" />
          {t('welcome.partners.eyebrow')}
          <span aria-hidden className="h-px w-6 bg-lavender-300" />
        </div>

        <div className="mt-3 transition-colors group-hover:text-ink-900">
          {hasNames ? (
            <ul className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1.5">
              {names.map((n, i) => (
                <li key={`${i}-${n}`} className="inline-flex items-center">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-ink-700 group-hover:text-ink-900">
                    {n}
                  </span>
                  {i < names.length - 1 && (
                    <span
                      aria-hidden
                      className="text-ink-300 ps-2 text-[10px]"
                    >
                      ·
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11.5px] text-ink-500 leading-relaxed max-w-[40ch] mx-auto">
              {t('welcome.partners.fallback')}
            </p>
          )}
        </div>

        <div className="mt-2 inline-flex items-center gap-1 text-[10.5px] font-semibold text-lavender-700 group-hover:text-lavender-800">
          {t('welcome.partners.browse')}
          <ChevronIcon
            size={11}
            className="transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5"
          />
        </div>
      </button>
    </section>
  );
}

/**
 * Partner discovery sheet — a bottom-anchored, in-page modal that
 * rises from the trusted partners strip. Stays restrained on
 * purpose:
 *
 *   * One editorial header (title + tiny eyebrow + close X).
 *   * One single search input (no filters, no sort, no categories).
 *   * One typographic list of partners. Each row: editorial name,
 *     a thin meta line under it with city, and a small "Verified"
 *     pill at the end when verified=true. No logos, no prices, no
 *     ratings, no per-row "Open" CTA.
 *   * One bottom CTA → /auth/register. Closes the sheet on tap.
 *
 * Behaviour:
 *   * Backdrop ink-900/40 + backdrop-blur-sm. Tap to close.
 *   * Esc key closes.
 *   * Body scroll is locked while open.
 *   * Search input is autofocused on open; substring match against
 *     the localised display_name + the city slug. Results capped at
 *     24 to keep the sheet readable.
 *   * Empty state: graceful editorial line, either "no match" or
 *     "more partners joining" depending on whether the query is
 *     empty.
 */
function PartnerDiscoverySheet({
  open,
  onClose,
  partners,
  t,
  dir,
}: {
  open: boolean;
  onClose: () => void;
  partners: MerchantRow[] | null;
  t: (k: string, vars?: Record<string, string | number>) => string;
  dir: 'ltr' | 'rtl';
}) {
  const navigate = useNavigate();
  const { locale } = useI18n();
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Reset the query whenever the sheet re-opens so a stale value
  // doesn't ambush the next visitor.
  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  // Body scroll lock + autofocus the search field when the sheet
  // mounts in the open state. Esc closes.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer focus a frame so the slide-up doesn't fight the focus
    // ring's reveal.
    const focusId = window.setTimeout(() => inputRef.current?.focus(), 220);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(focusId);
    };
  }, [open, onClose]);

  const normalisedQuery = query.trim().toLowerCase();
  const results = useMemo(() => {
    const source = partners ?? [];
    const sorted = [...source].sort((a, b) => {
      if (a.verified !== b.verified) return a.verified ? -1 : 1;
      return Number(b.rating ?? 0) - Number(a.rating ?? 0);
    });
    if (!normalisedQuery) return sorted.slice(0, 24);
    return sorted
      .filter((m) => {
        const name = pickLocalized(m.display_name, locale).toLowerCase();
        const city = (m.city ?? '').toLowerCase();
        return name.includes(normalisedQuery) || city.includes(normalisedQuery);
      })
      .slice(0, 24);
  }, [partners, locale, normalisedQuery]);

  if (!open) return null;

  const hasAnyPartner = (partners ?? []).length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-label={t('welcome.partners.sheetTitle')}
    >
      {/* Backdrop — quiet ink overlay with light blur. Tap dismisses. */}
      <button
        type="button"
        onClick={onClose}
        aria-label={t('welcome.partners.close')}
        className="absolute inset-0 bg-ink-900/45 backdrop-blur-sm transition-opacity duration-200 animate-fade-in"
      />

      {/* Sheet — pinned to the viewport bottom, rounded top corners,
          slides up. Caps height so a long list scrolls inside. */}
      <div
        className={cn(
          'relative w-full max-w-[480px] bg-canvas-50 rounded-t-3xl shadow-plush',
          'ring-1 ring-canvas-200',
          'flex flex-col max-h-[88vh]',
          'animate-slide-up-soft',
        )}
        // Avoid the safe-area when the device has a home-indicator strip.
        style={{
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* Drag handle */}
        <div className="pt-2.5 pb-1 flex justify-center">
          <span aria-hidden className="h-1 w-10 rounded-full bg-canvas-300" />
        </div>

        {/* Header */}
        <div className="px-5 pb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-lavender-700">
              {t('welcome.partners.sheetEyebrow')}
            </div>
            <h2 className="mt-1 editorial-title text-[22px] leading-tight text-ink-900">
              {t('welcome.partners.sheetTitle')}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('welcome.partners.close')}
            className="shrink-0 h-8 w-8 rounded-full bg-canvas-100 text-ink-700 hover:bg-canvas-200 grid place-items-center"
          >
            <span aria-hidden className="text-[15px] leading-none">
              ×
            </span>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3">
          <label className="sr-only" htmlFor="lend-partners-search">
            {t('welcome.partners.searchLabel')}
          </label>
          <div className="relative">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 start-3 grid place-items-center text-lavender-600"
            >
              <SearchIcon size={14} />
            </span>
            <input
              id="lend-partners-search"
              ref={inputRef}
              type="search"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('welcome.partners.searchPlaceholder')}
              disabled={!hasAnyPartner}
              className={cn(
                'h-10 w-full rounded-xl2 bg-white ring-1 ring-canvas-200 ps-9 pe-3',
                'text-[13px] text-ink-900 placeholder:text-ink-400',
                'focus:outline-none focus:ring-2 focus:ring-lavender-300',
                'disabled:bg-canvas-100 disabled:text-ink-400 disabled:cursor-not-allowed',
                dir === 'rtl' ? 'text-right' : 'text-left',
              )}
            />
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-5 pb-3">
          {!hasAnyPartner ? (
            <EmptySheetLine text={t('welcome.partners.fallback')} />
          ) : results.length === 0 ? (
            <EmptySheetLine
              text={
                normalisedQuery
                  ? t('welcome.partners.emptyMatch', { query: query.trim() })
                  : t('welcome.partners.emptyAll')
              }
            />
          ) : (
            <ul className="divide-y divide-canvas-200/80">
              {results.map((m) => {
                const name = pickLocalized(m.display_name, locale);
                const cityLabel = m.city
                  ? t(`register.cities.${m.city}`)
                  : '';
                return (
                  <li key={m.id} className="py-3.5 first:pt-2">
                    <div className="flex items-start gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="editorial-title text-[14.5px] leading-tight text-ink-900 truncate">
                          {name}
                        </div>
                        {cityLabel && (
                          <div className="mt-0.5 text-[11px] text-ink-500 leading-snug tracking-tight">
                            {cityLabel}
                          </div>
                        )}
                      </div>
                      {m.verified && (
                        <span className="inline-flex items-center gap-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-lavender-700 bg-lavender-50 ring-1 ring-lavender-100 rounded-full px-1.5 py-0.5 shrink-0">
                          <BadgeCheckIcon size={9} />
                          {t('welcome.partners.verified')}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Single bottom CTA */}
        <div className="px-5 pt-3 pb-4 border-t border-canvas-200/70 bg-canvas-50/80 backdrop-blur">
          <button
            type="button"
            onClick={() => {
              onClose();
              navigate('/auth/register');
            }}
            className={cn(
              'group h-12 w-full rounded-xl2 bg-ink-900 text-white font-semibold text-[14px] tracking-tight',
              'hover:bg-ink-800 active:bg-ink-800 transition-[background-color,transform] duration-200 active:scale-[0.985]',
              'inline-flex items-center justify-center gap-2',
            )}
          >
            {t('welcome.partners.ctaSignUp')}
            <ArrowIcon
              size={14}
              className={cn(
                'transition-transform group-hover:translate-x-0.5',
                dir === 'rtl' ? 'rotate-180 group-hover:-translate-x-0.5' : '',
              )}
            />
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptySheetLine({ text }: { text: string }) {
  return (
    <p className="text-center text-[12.5px] text-ink-500 leading-relaxed max-w-[36ch] mx-auto py-8">
      {text}
    </p>
  );
}

function pickLocalized(
  json: LocalizedJson | null | undefined,
  locale: 'ar' | 'en',
): string {
  if (!json) return '';
  return json[locale] || json.ar || json.en || '';
}
