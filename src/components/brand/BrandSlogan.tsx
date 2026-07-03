import { useT } from '@/lib/i18n';
import { cn } from '@/lib/cn';

// =====================================================================
// BrandSlogan — official Lend core slogan, rendered per brand guide
// spec: two lines, keyword ("right" / "حقك") in Vibrant Green.
//
// Both language versions are surfaced via the same `t()` block; the
// active locale picks the correct one automatically. Do NOT translate
// literally — the Arabic and English versions are locked forms.
// =====================================================================

type BrandSloganProps = {
  size?: 'sm' | 'md' | 'lg';
  tone?: 'light' | 'dark';
  className?: string;
};

const sizeClass: Record<NonNullable<BrandSloganProps['size']>, string> = {
  sm: 'text-[15px] leading-snug',
  md: 'text-[20px] leading-snug',
  lg: 'text-[26px] leading-tight',
};

export function BrandSlogan({
  size = 'md',
  tone = 'light',
  className,
}: BrandSloganProps) {
  const t = useT();
  const line1 = t('brand.slogan.line1');
  const prefix = t('brand.slogan.line2Prefix');
  const keyword = t('brand.slogan.line2Keyword');
  const suffix = t('brand.slogan.line2Suffix');
  return (
    <p
      className={cn(
        'font-semibold tracking-tight',
        sizeClass[size],
        tone === 'dark' ? 'text-white' : 'text-navy-700',
        className,
      )}
    >
      <span className="block">{line1}</span>
      <span className="block">
        {prefix}
        <span className="text-green-500">{keyword}</span>
        {suffix}
      </span>
    </p>
  );
}
