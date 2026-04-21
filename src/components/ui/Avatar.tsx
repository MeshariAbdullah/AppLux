import { cn } from '@/lib/cn';

type AvatarProps = {
  name: string;
  src?: string;
  size?: 'sm' | 'md' | 'lg';
  tone?: 'brand' | 'gold' | 'ink';
  className?: string;
};

const sizeClass = {
  sm: 'h-8 w-8 text-[11px]',
  md: 'h-10 w-10 text-[13px]',
  lg: 'h-14 w-14 text-[16px]',
};

const toneClass = {
  brand: 'bg-brand-50 text-brand-700 ring-brand-500/15',
  gold: 'bg-[#FBF2DD] text-gold-700 ring-gold-500/25',
  ink: 'bg-ink-100 text-ink-700 ring-ink-300/40',
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0] ?? '')
    .join('')
    .toUpperCase();
}

export function Avatar({ name, src, size = 'md', tone = 'brand', className }: AvatarProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center justify-center rounded-full font-bold overflow-hidden shrink-0 select-none ring-1 ring-inset',
        sizeClass[size],
        toneClass[tone],
        className,
      )}
      aria-label={name}
    >
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : (
        <span className="leading-none">{initials(name)}</span>
      )}
    </div>
  );
}
