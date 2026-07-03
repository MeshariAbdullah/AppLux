/** @type {import('tailwindcss').Config} */
// =====================================================================
// Lend theme (2026 brand refresh)
// =====================================================================
// The palette below encodes the Lend Brand Guidelines V1.0. Existing
// token NAMES from the AppLux era are preserved as aliases so ~1,700
// existing utility-class references across ~78 files repaint
// automatically to the new brand:
//
//   ink-*     → Deep Navy scale (was near-black warm)
//   canvas-*  → Warm Beige scale (was cream/ivory)
//   brand-*   → Deep Navy alias (was blue)
//   gold-*    → Green scale alias (was lavender)
//   lavender-*→ Green scale alias (kept for direct-name callers)
//   success-* → Deep Green / Vibrant Green scale
//   warn-*    → Amber scale
//   danger-*  → Alert Red scale
//
// NEW semantic tokens introduced this pass — prefer these for new code:
//
//   navy-*   → Deep Navy scale, primary
//   green-*  → Vibrant Green + Deep Green scale, verified
//   beige-*  → Warm Beige scale, backgrounds
//
// Brand anchor colors, from the guide:
//   Deep Navy       #1B2951  primary, buttons, key text
//   Vibrant Green   #12A67E  secondary, emphasis, verified states
//   Warm Beige      #F5F5F0  page backgrounds
//   Green Tint      #E1F5EE  verified/success background
//   Navy Tint       #EEF2F9  info background
//   Deep Green      #0F6E56  done / verified
//   Amber           #BA7517  in progress
//   Alert Red       #A32D2D  error / canceled
// =====================================================================

// Canonical ramps built around each brand anchor. All 50→900 stops
// are declared explicitly (no runtime computation) so a linter or
// designer can eyeball each stop.
const navy = {
  50:  '#EEF2F9', // Navy Tint (brand anchor)
  100: '#DDE4F0',
  200: '#BAC8E1',
  300: '#96ACD1',
  400: '#6E88BB',
  500: '#4A67A0',
  600: '#2E4A7E',
  700: '#1B2951', // Deep Navy (brand primary anchor)
  800: '#131E3D',
  900: '#0A1128',
  950: '#050817',
};

const green = {
  50:  '#E1F5EE', // Green Tint (brand anchor)
  100: '#C3EBDC',
  200: '#92DBC0',
  300: '#5FC7A2',
  400: '#2FB289',
  500: '#12A67E', // Vibrant Green (brand secondary anchor)
  600: '#0F8A6A',
  700: '#0F6E56', // Deep Green (done / verified anchor)
  800: '#0B5A46',
  900: '#084537',
};

const beige = {
  50:  '#FBFBF7',
  100: '#F5F5F0', // Warm Beige (brand anchor)
  200: '#E9E9E1',
  300: '#D9D9CD',
};

const amber = {
  50:  '#FDF5E9',
  500: '#DB8E1E',
  600: '#BA7517', // Amber (in-progress anchor)
  700: '#93590E',
};

const alertRed = {
  50:  '#FBE6E6',
  500: '#C43535',
  600: '#A32D2D', // Alert Red (error / canceled anchor)
  700: '#7C2222',
};

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // ---- Semantic new tokens (prefer these in new code) --------
        navy,
        green,
        beige,

        // ---- Legacy aliases — repaint the existing app ------------
        // canvas-* was the page background scale; retargets to beige.
        canvas: beige,

        // ink-* was the near-black text + hero-card scale; retargets
        // to navy so bg-ink-900 becomes Deep-Navy-900 automatically.
        ink: {
          50:  navy[50],
          100: navy[100],
          200: navy[200],
          300: navy[300],
          400: navy[400],
          500: navy[500],
          600: navy[600],
          700: navy[700],
          800: navy[800],
          900: navy[900],
          950: navy[950],
        },

        // brand-* was a blue scale; retargets to navy.
        brand: {
          50:  navy[50],
          100: navy[100],
          200: navy[200],
          300: navy[300],
          400: navy[400],
          500: navy[500],
          600: navy[600],
          700: navy[700],
          800: navy[800],
          900: navy[900],
        },

        // gold-* + lavender-* were the AppLux boutique lavender scale;
        // retargets to green. The names are misleading now but a
        // rename would touch ~1,500 utility-class references across
        // the app — deferred to the next tone/copy pass. Any place
        // that reads "gold" or "lavender" in a class name now paints
        // green.
        gold: {
          50:  green[50],
          100: green[100],
          200: green[200],
          300: green[300],
          400: green[500], // vibrant green as the "400" accent
          500: green[600],
          600: green[700], // deep green as the "600" accent
          700: green[800],
          800: green[900],
        },
        lavender: {
          50:  green[50],
          100: green[100],
          200: green[200],
          300: green[300],
          400: green[500],
          500: green[600],
          600: green[700],
          700: green[800],
          800: green[900],
        },

        // Semantic status colors updated to brand anchors.
        success: {
          50:  green[50],
          500: green[500],
          600: green[600],
          700: green[700],
        },
        warn: {
          50:  amber[50],
          500: amber[500],
          600: amber[600],
          700: amber[700],
        },
        danger: {
          50:  alertRed[50],
          500: alertRed[500],
          600: alertRed[600],
          700: alertRed[700],
        },
      },
      fontFamily: {
        // Latin: Inter (loaded in index.html).
        // Arabic: IBM Plex Sans Arabic (loaded in index.html).
        ar: ['"IBM Plex Sans Arabic"', '"Noto Naskh Arabic"', 'system-ui', 'sans-serif'],
        en: ['"Inter"', 'system-ui', 'sans-serif'],
        // Display family: brand-refresh dropped Playfair Display. The
        // brand explicitly rejects an editorial-serif tone (see the
        // guide: "Not a government app. Not a paper contract."). The
        // display alias now points at Inter Bold so any font-display
        // consumer picks up the correct family with no per-call edits.
        display: [
          '"Inter"',
          '"IBM Plex Sans Arabic"',
          'system-ui',
          'sans-serif',
        ],
      },
      boxShadow: {
        // Cool navy-tinted shadows — replace the AppLux warm-brown
        // shadow palette. Same opacity math, tinted with #131E3D
        // (navy-800) instead of #3C2D14.
        soft: '0 1px 2px rgba(19, 30, 61, 0.05), 0 8px 24px -8px rgba(19, 30, 61, 0.08)',
        card: '0 1px 0 rgba(19, 30, 61, 0.04), 0 10px 28px -10px rgba(19, 30, 61, 0.10)',
        float: '0 20px 44px -18px rgba(10, 17, 40, 0.24)',
        plush: '0 30px 80px -30px rgba(5, 8, 23, 0.30), 0 8px 24px -12px rgba(5, 8, 23, 0.14)',
        hairline: 'inset 0 0 0 1px rgba(19, 30, 61, 0.08)',
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
          '0%': { boxShadow: '0 0 0 0 rgba(18, 166, 126, 0.45)' },
          '100%': { boxShadow: '0 0 0 16px rgba(18, 166, 126, 0)' },
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
