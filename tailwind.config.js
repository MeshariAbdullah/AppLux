/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Warm cream/ivory canvas — the editorial boutique background.
        canvas: {
          50: '#FDFBF6',
          100: '#FAF6EE',
          200: '#F2ECDE',
          300: '#E6DDC8',
        },
        ink: {
          950: '#080B1A',
          900: '#0D1224',
          800: '#141A33',
          700: '#1D2545',
          600: '#2A345C',
          500: '#4A557A',
          400: '#6B7597',
          300: '#A0A8C2',
          200: '#D5D9E6',
          100: '#EEF0F7',
          50: '#F7F8FC',
        },
        brand: {
          50: '#EBF3FF',
          100: '#D6E6FF',
          200: '#AECDFF',
          300: '#7FAEFF',
          400: '#4E8CFB',
          500: '#2E6EF0',
          600: '#1C53D1',
          700: '#1742A8',
          800: '#133782',
          900: '#102C63',
        },
        // Expanded champagne-gold palette — luxury accent.
        gold: {
          50: '#FBF5E8',
          100: '#F5E9CD',
          200: '#EDD9A7',
          300: '#E8C27A',
          400: '#D4A855',
          500: '#B88A3A',
          600: '#8A6625',
          700: '#5E4418',
          800: '#3B2B0F',
        },
        success: {
          50: '#E8F7EE',
          500: '#16A34A',
          600: '#0F7A37',
          700: '#0A5A2A',
        },
        warn: {
          50: '#FFF6E5',
          500: '#F59E0B',
          600: '#B45309',
          700: '#7A3B0A',
        },
        danger: {
          50: '#FEECEC',
          500: '#DC2626',
          600: '#991B1B',
          700: '#6B1313',
        },
      },
      fontFamily: {
        ar: ['"IBM Plex Sans Arabic"', '"Noto Naskh Arabic"', 'system-ui', 'sans-serif'],
        en: ['"Inter"', 'system-ui', 'sans-serif'],
        display: [
          '"Playfair Display"',
          '"IBM Plex Sans Arabic"',
          'Georgia',
          'serif',
        ],
      },
      boxShadow: {
        // Tightened, warmer-tinted shadows for a plush boutique feel.
        soft: '0 1px 2px rgba(60, 45, 20, 0.04), 0 8px 24px -8px rgba(60, 45, 20, 0.06)',
        card: '0 1px 0 rgba(60, 45, 20, 0.03), 0 10px 28px -10px rgba(60, 45, 20, 0.08)',
        float: '0 20px 44px -18px rgba(40, 30, 15, 0.22)',
        plush: '0 30px 80px -30px rgba(20, 14, 6, 0.28), 0 8px 24px -12px rgba(20, 14, 6, 0.10)',
        // Warm inner edge used on calm surfaces.
        hairline: 'inset 0 0 0 1px rgba(60, 45, 20, 0.06)',
      },
      borderRadius: {
        xl2: '1.25rem',
        xl3: '1.5rem',
        xl4: '2rem',
      },
      keyframes: {
        slideUp: {
          '0%': { transform: 'translateY(16px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseRing: {
          '0%': { boxShadow: '0 0 0 0 rgba(212, 168, 85, 0.5)' },
          '100%': { boxShadow: '0 0 0 16px rgba(212, 168, 85, 0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
      },
      animation: {
        'slide-up': 'slideUp 320ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fadeIn 240ms ease-out',
        'pulse-ring': 'pulseRing 1.8s ease-out infinite',
        shimmer: 'shimmer 1.4s infinite',
      },
      spacing: {
        13: '3.25rem',
        15: '3.75rem',
        18: '4.5rem',
      },
      transitionTimingFunction: {
        plush: 'cubic-bezier(0.22, 1, 0.36, 1)',
      },
    },
  },
  plugins: [],
};
