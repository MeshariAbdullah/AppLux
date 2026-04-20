/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
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
        gold: {
          400: '#E8C27A',
          500: '#D4A855',
          600: '#B88A3A',
        },
        success: {
          50: '#E8F7EE',
          500: '#16A34A',
          600: '#0F7A37',
        },
        warn: {
          50: '#FFF6E5',
          500: '#F59E0B',
          600: '#B45309',
        },
        danger: {
          50: '#FEECEC',
          500: '#DC2626',
          600: '#991B1B',
        },
      },
      fontFamily: {
        ar: ['"IBM Plex Sans Arabic"', '"Noto Naskh Arabic"', 'system-ui', 'sans-serif'],
        en: ['"Inter"', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        soft: '0 1px 2px rgba(13,18,36,0.04), 0 6px 20px rgba(13,18,36,0.06)',
        card: '0 1px 0 rgba(13,18,36,0.04), 0 8px 24px -6px rgba(13,18,36,0.10)',
        float: '0 18px 40px -12px rgba(13,18,36,0.25)',
      },
      borderRadius: {
        xl2: '1.25rem',
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
          '0%': { boxShadow: '0 0 0 0 rgba(46,110,240,0.5)' },
          '100%': { boxShadow: '0 0 0 16px rgba(46,110,240,0)' },
        },
      },
      animation: {
        'slide-up': 'slideUp 260ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
        'pulse-ring': 'pulseRing 1.6s ease-out infinite',
      },
    },
  },
  plugins: [],
};
