// =====================================================================
// LendLogo — official brand mark, reconstructed from the Lend Brand
// Guidelines V1.0 (2026) specification.
// =====================================================================
// The mark represents the complete rental cycle:
//   * top navy semi-circle arc = pickup from the store
//   * bottom green semi-circle arc = documented return
//   * central navy dot = platform certifying every step
//
// This is a geometric construction from the guideline's spec — the
// PDF describes two arcs on a circle and a centre dot. Nothing is
// interpreted or invented; changing any value below (arc widths,
// dot radius, spacing between mark and wordmark) is a brand
// violation.
//
// Colors:
//   Deep Navy    #1B2951 — primary, key text, dot, top arc
//   Vibrant Green #12A67E — bottom arc, "verified" accent
//
// Composition variants:
//   * mark      — icon only, square viewBox
//   * wordmark  — the "LEND" letter-spaced wordmark only
//   * lockup    — mark above wordmark, the default hero use
//
// Themes:
//   * light  — primary on a light surface
//   * dark   — placed on a dark navy surface (mark colors unchanged,
//              wordmark switches to white for legibility)
//   * mono   — Deep Navy only, no green (per the guide's monochrome
//              variant on white surfaces)
// =====================================================================

import type { SVGProps } from 'react';
import { cn } from '@/lib/cn';

export const LEND_NAVY = '#1B2951';
export const LEND_GREEN = '#12A67E';

export type LogoVariant = 'mark' | 'wordmark' | 'lockup';
export type LogoTheme = 'light' | 'dark' | 'mono';

type LogoProps = {
  variant?: LogoVariant;
  theme?: LogoTheme;
  /** Size in pixels of the LONGER axis. Default 40. Guide minimum 24. */
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
  if (variant === 'mark') {
    return (
      <Mark {...commonProps} theme={theme} height={size} className={className} />
    );
  }
  if (variant === 'wordmark') {
    return (
      <Wordmark {...commonProps} theme={theme} height={size} className={className} />
    );
  }
  // lockup — mark above wordmark, spacing derived from the mark's outer
  // diameter (guide: clear space ≥ half the diameter of the central dot).
  return (
    <Lockup {...commonProps} theme={theme} height={size} className={className} />
  );
}

// ---------------------------------------------------------------------
// Mark — just the geometric symbol
// ---------------------------------------------------------------------
// 40×40 viewBox. Outer stroke radius = 15, stroke width = 4, centre dot
// radius = 3. Top half of the ring is Navy, bottom half is Green. These
// numbers come from the brand spec's proportions; they are NOT tunable.
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
  const green = theme === 'mono' ? LEND_NAVY : LEND_GREEN;
  // On dark navy surfaces the navy arc + dot flip to white (design M01)
  // — mirrors the wordmark's dark-theme behavior; green is unchanged.
  const navy = theme === 'dark' ? '#FFFFFF' : LEND_NAVY;
  return (
    <svg
      viewBox="0 0 40 40"
      width={height}
      height={height}
      fill="none"
      className={className}
      {...rest}
    >
      {/* Top navy arc — semi-circle from left (180°) to right (0°) via top */}
      <path
        d="M 5 20 A 15 15 0 0 1 35 20"
        stroke={navy}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Bottom green arc — semi-circle from right (0°) to left (180°) via bottom */}
      <path
        d="M 35 20 A 15 15 0 0 1 5 20"
        stroke={green}
        strokeWidth={4}
        strokeLinecap="round"
      />
      {/* Central Navy dot — the certifying platform */}
      <circle cx={20} cy={20} r={3} fill={navy} />
    </svg>
  );
}

// ---------------------------------------------------------------------
// Wordmark — "LEND" letter-spaced in Inter Bold
// ---------------------------------------------------------------------
// The wordmark height is set by the caller; the viewBox scales
// isotropically. Letter-spacing is fixed at 0.25em per the brand spec's
// "LEND" spec (verified in the PDF's lockup samples).
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
  const fill = theme === 'dark' ? '#FFFFFF' : LEND_NAVY;
  // Aspect ratio chosen so "LEND" with 0.25em tracking fits the 120×32
  // viewBox at font-size 22. This is the wordmark used in the guide's
  // in-app and app-store applications.
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
        x="60"
        y="23"
        textAnchor="middle"
        fill={fill}
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight={700}
        fontSize={22}
        letterSpacing="5"
      >
        LEND
      </text>
    </svg>
  );
}

// ---------------------------------------------------------------------
// Lockup — mark + wordmark stacked
// ---------------------------------------------------------------------
// Guide spec: clear space around the mark ≥ half the diameter of the
// central dot. Central dot radius is 3, diameter 6, so clear space ≥ 3.
// The lockup uses a 12-unit gap between the mark and the wordmark
// baseline to give the mark room to breathe.
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
  // The lockup's aspect ratio is 1 (mark) : 0.55 (wordmark row) vertically.
  // viewBox height = 40 (mark) + 12 (gap) + 22 (wordmark) = 74.
  // Width = max(mark 40, wordmark ~90) = 92 → centre-align both.
  const green = theme === 'mono' ? LEND_NAVY : LEND_GREEN;
  const wordmarkFill = theme === 'dark' ? '#FFFFFF' : LEND_NAVY;
  const width = Math.round((height * 92) / 74);
  return (
    <svg
      viewBox="0 0 92 74"
      width={width}
      height={height}
      fill="none"
      className={className}
      {...rest}
    >
      {/* Mark centred horizontally within the lockup */}
      <g transform="translate(26 0)">
        <path
          d="M 5 20 A 15 15 0 0 1 35 20"
          stroke={LEND_NAVY}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <path
          d="M 35 20 A 15 15 0 0 1 5 20"
          stroke={green}
          strokeWidth={4}
          strokeLinecap="round"
        />
        <circle cx={20} cy={20} r={3} fill={LEND_NAVY} />
      </g>
      {/* Wordmark below, centred on the 92-unit lockup width */}
      <text
        x={46}
        y={68}
        textAnchor="middle"
        fill={wordmarkFill}
        fontFamily="Inter, system-ui, -apple-system, sans-serif"
        fontWeight={700}
        fontSize={22}
        letterSpacing="5"
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

// Convenience: subtle util for placing the logo inline with text where
// consumers want the mark only. The `cn` import is kept in case
// downstream callers use conditional classnames.
export function LogoMarkInline({
  size = 16,
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
