// =====================================================================
// LendLogo — official brand mark, from the approved brand guidelines.
// =====================================================================
// GEOMETRY SOURCE OF TRUTH: lend-logo-mark-primary.svg /
// lend-logo-mark-on-dark.svg, extracted directly from the approved
// brand guidelines PDF. The mark is a continuous ring drawn as two
// cubic-bezier halves plus a center dot, in a 100×100 design box
// (scale = size / 100):
//
//   top half:    M 15 50  C 15 26.667, 26.667 15, 50 15
//                         C 73.333 15, 85 26.667, 85 50
//   bottom half: M 85 50  C 85 73.333, 73.333 85, 50 85
//                         C 26.667 85, 15 73.333, 15 50
//   stroke width 12.5, round line caps, no fill
//   center dot:  circle (50, 50) r 10
//
// Color variants:
//   primary — top #1B2951, bottom #12A67E, dot #1B2951 (light surfaces)
//   onDark  — top + dot #FFFFFF, bottom #12A67E (dark navy surfaces)
//   mono    — everything #1B2951
//
// BRAND RULES (enforced here):
//   * Proportions are fixed — one `size` scales the whole mark; there
//     is no independent width/height and no way to distort it.
//   * Minimum size 24 (clamped; a dev-build warning flags violations).
//   * Clear space around the mark = half the dot's diameter = 10 units
//     (0.1 × size). The 100-box edge sits 8.75 units outside the
//     stroke, so keep at least CLEAR_SPACE_RATIO × size of empty
//     layout around the rendered box.
//
// NOTE: the Claude Design project's Design System still carries the
// OLD mark (side-gapped arcs, larger dot) — do not copy geometry from
// there; only the SVG spec above is authoritative.
//
// Wordmark: "LEND", Inter Bold, letter-spacing 0.35em (tracking =
// 0.35 × font size), Deep Navy on light / white on dark.
// =====================================================================

import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';

export const LEND_NAVY = '#1B2951';
export const LEND_GREEN = '#12A67E';

/** Clear space required around the mark, as a fraction of `size`. */
export const LEND_MARK_CLEAR_SPACE_RATIO = 0.1;
/** Brand minimum rendered size for the mark. */
export const LEND_MARK_MIN_SIZE = 24;

// Exact path data from the approved SVGs (100×100 design box).
export const LEND_MARK_TOP_PATH =
  'M 15 50 C 15 26.667 26.667 15 50 15 C 73.333 15 85 26.667 85 50';
export const LEND_MARK_BOTTOM_PATH =
  'M 85 50 C 85 73.333 73.333 85 50 85 C 26.667 85 15 73.333 15 50';
export const LEND_MARK_STROKE = 12.5;
export const LEND_MARK_DOT_RADIUS = 10;

export type LogoVariant = 'mark' | 'wordmark' | 'lockup';
/** Brand color variants. `light`/`dark` are legacy aliases kept so the
 *  existing call sites keep working: light → primary, dark → onDark. */
export type LogoTheme = 'light' | 'dark' | 'mono' | 'primary' | 'onDark';

type MarkColors = { top: string; bottom: string; dot: string };

function markColors(theme: LogoTheme): MarkColors {
  switch (theme) {
    case 'dark':
    case 'onDark':
      return { top: '#FFFFFF', bottom: LEND_GREEN, dot: '#FFFFFF' };
    case 'mono':
      return { top: LEND_NAVY, bottom: LEND_NAVY, dot: LEND_NAVY };
    default: // 'light' | 'primary'
      return { top: LEND_NAVY, bottom: LEND_GREEN, dot: LEND_NAVY };
  }
}

function brandSize(requested: number): number {
  if (requested < LEND_MARK_MIN_SIZE) {
    if (import.meta.env.DEV) {
      console.warn(
        `[lend] LendLogo size ${requested} is below the brand minimum ` +
          `${LEND_MARK_MIN_SIZE}; clamping.`,
      );
    }
    return LEND_MARK_MIN_SIZE;
  }
  return requested;
}

type LogoProps = {
  variant?: LogoVariant;
  theme?: LogoTheme;
  /** Size in pixels of the LONGER axis. Default 40. Brand minimum 24. */
  size?: number;
  /** Optional accessible label. If omitted the SVG is aria-hidden. */
  label?: string;
  className?: string;
};

export function LendLogo({
  variant = 'lockup',
  theme = 'light',
  size = 40,
  label,
  className,
}: LogoProps) {
  const commonProps = accessibilityProps(label);
  const px = brandSize(size);
  if (variant === 'mark') {
    return <Mark {...commonProps} theme={theme} height={px} className={className} />;
  }
  if (variant === 'wordmark') {
    return (
      <Wordmark {...commonProps} theme={theme} height={px} className={className} />
    );
  }
  return <Lockup {...commonProps} theme={theme} height={px} className={className} />;
}

// ---------------------------------------------------------------------
// Mark — the geometric symbol, exactly the approved SVG geometry
// ---------------------------------------------------------------------
// The paths render inside the untransformed 100×100 viewBox and the
// svg is always square, so the proportions cannot be changed by
// callers. The stroke's outer edge reaches 8.75 units from the box
// edge; required clear space is 10 units (see the header).
function Mark({
  theme,
  height,
  className,
  ...rest
}: {
  theme: LogoTheme;
  height: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const c = markColors(theme);
  return (
    <svg
      viewBox="0 0 100 100"
      width={height}
      height={height}
      fill="none"
      className={className}
      {...rest}
    >
      <path
        d={LEND_MARK_TOP_PATH}
        stroke={c.top}
        strokeWidth={LEND_MARK_STROKE}
        strokeLinecap="round"
      />
      <path
        d={LEND_MARK_BOTTOM_PATH}
        stroke={c.bottom}
        strokeWidth={LEND_MARK_STROKE}
        strokeLinecap="round"
      />
      <circle cx={50} cy={50} r={LEND_MARK_DOT_RADIUS} fill={c.dot} />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Wordmark — "LEND", Inter Bold, 0.35em letter-spacing
// ---------------------------------------------------------------------
function Wordmark({
  theme,
  height,
  className,
  ...rest
}: {
  theme: LogoTheme;
  height: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const fill =
    theme === 'dark' || theme === 'onDark' ? '#FFFFFF' : LEND_NAVY;
  // font-size 22 → tracking 0.35 × 22 = 7.7 units. SVG letter-spacing
  // also trails the last glyph, so the anchor shifts start-ward by
  // half the trailing space to keep the word optically centred.
  const width = Math.round((height * 120) / 32);
  return (
    <svg
      viewBox="0 0 120 32"
      width={width}
      height={height}
      className={className}
      {...rest}
    >
      <text
        x="56.15"
        y="23"
        textAnchor="middle"
        fill={fill}
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight={700}
        fontSize={22}
        letterSpacing="7.7"
      >
        LEND
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------
// Lockup — mark above wordmark
// ---------------------------------------------------------------------
// Gap between mark box and wordmark = the mark's clear space (10 units
// of the mark's 100-box). viewBox: 100 (mark) + 10 (clear space) + 22
// (wordmark row) = 132 tall; 120 wide to fit the tracked wordmark.
function Lockup({
  theme,
  height,
  className,
  ...rest
}: {
  theme: LogoTheme;
  height: number;
  className?: string;
} & Omit<SVGProps<SVGSVGElement>, 'width' | 'height'>) {
  const c = markColors(theme);
  const wordmarkFill =
    theme === 'dark' || theme === 'onDark' ? '#FFFFFF' : LEND_NAVY;
  const width = Math.round((height * 120) / 132);
  return (
    <svg
      viewBox="0 0 120 132"
      width={width}
      height={height}
      fill="none"
      className={className}
      {...rest}
    >
      <g transform="translate(10 0)">
        <path
          d={LEND_MARK_TOP_PATH}
          stroke={c.top}
          strokeWidth={LEND_MARK_STROKE}
          strokeLinecap="round"
        />
        <path
          d={LEND_MARK_BOTTOM_PATH}
          stroke={c.bottom}
          strokeWidth={LEND_MARK_STROKE}
          strokeLinecap="round"
        />
        <circle cx={50} cy={50} r={LEND_MARK_DOT_RADIUS} fill={c.dot} />
      </g>
      <text
        x="56.15"
        y="127"
        textAnchor="middle"
        fill={wordmarkFill}
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight={700}
        fontSize={22}
        letterSpacing="7.7"
      >
        LEND
      </text>
    </svg>
  );
}

function accessibilityProps(label: string | undefined) {
  if (!label) return { 'aria-hidden': true } as SVGProps<SVGSVGElement>;
  return { role: 'img', 'aria-label': label } as SVGProps<SVGSVGElement>;
}

// Inline convenience — mark only, at the brand-minimum default size.
export function LogoMarkInline({
  size = LEND_MARK_MIN_SIZE,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <LendLogo
      variant="mark"
      theme="light"
      size={size}
      className={cn('inline-block align-middle', className)}
    />
  );
}
