/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Deeper dark surface
        slate: {
          950: '#020817',
        },
        // Per-product accent (see styles/app-theme.css)
        brand: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)', soft: 'var(--accent-soft)', border: 'var(--accent-border)', chart: 'var(--accent-chart)' },
        app: { bg: '#F6F7F4', card: '#FFFFFF', border: '#E7E9E4', hover: '#F0F2ED', sidebar: '#FBFCF9', dark: '#17202B', text: '#17191C', text2: '#6B7280', muted: '#9298A2' },
        // Anuvadini palette: cobalt replaces emerald/teal, lime replaces green
        emerald: { 50: '#EEF3FF', 100: '#DDE6FF', 200: '#BFD0FF', 300: '#93AEFB', 400: '#6F8DF0', 500: '#4A74F0', 600: '#315CE8', 700: '#2748C4', 800: '#1F3A9E', 900: '#172B73', 950: '#0F1C4D' },
        teal: { 50: '#EEF3FF', 100: '#DDE6FF', 200: '#BFD0FF', 300: '#93AEFB', 400: '#6F8DF0', 500: '#4A74F0', 600: '#315CE8', 700: '#2748C4', 800: '#1F3A9E', 900: '#172B73', 950: '#0F1C4D' },
        green: { 50: '#F6FDE8', 100: '#EAFAC8', 200: '#D8F4A0', 300: '#C5EE7C', 400: '#B9F36A', 500: '#8FD13C', 600: '#6AA51F', 700: '#4F7F18', 800: '#1B2A5C', 900: '#131E45', 950: '#0B1220' },
        lime: { 50: '#F6FDE8', 100: '#EAFAC8', 200: '#D8F4A0', 300: '#C5EE7C', 400: '#B9F36A', 500: '#8FD13C', 600: '#6AA51F', 700: '#4F7F18', 800: '#1B2A5C', 900: '#131E45', 950: '#0B1220' },
        // SAACMS brand primary — teal (§7.1 brand tokens)
        primary: { 50: '#EEF3FF', 100: '#DDE6FF', 200: '#BFD0FF', 300: '#93AEFB', 400: '#6F8DF0', 500: '#4A74F0', 600: '#315CE8', 700: '#2748C4', 800: '#1F3A9E', 900: '#172B73', 950: '#0F1C4D' },
        // Neutrals — slate
        secondary: {
          50: '#F8FAFC',
          100: '#F1F5F9',
          200: '#E2E8F0',
          300: '#CBD5E1',
          400: '#94A3B8',
          500: '#64748B',
          600: '#475569',
          700: '#334155',
          800: '#1E293B',
          900: '#0F172A',
        },
        // Accent — CTAs ONLY, use sparingly
        accent: {
          DEFAULT: '#FF6B35',
          50: '#FFF3EE',
          100: '#FFE1D5',
          200: '#FFC3AB',
          300: '#FFA585',
          400: '#FF8557',
          500: '#FF6B35',
          600: '#EA5520',
          700: '#C44317',
          800: '#9C3513',
          900: '#7C2B10',
        },
        // Semantic: success #16A34A at 600
        success: {
          50: '#F0FDF4',
          100: '#DCFCE7',
          200: '#BBF7D0',
          300: '#86EFAC',
          400: '#4ADE80',
          500: '#22C55E',
          600: '#16A34A',
          700: '#15803D',
          800: '#166534',
          900: '#14532D',
        },
        // Semantic: warning #F59E0B at 500
        warning: {
          50: '#FFFBEB',
          100: '#FEF3C7',
          200: '#FDE68A',
          300: '#FCD34D',
          400: '#FBBF24',
          500: '#F59E0B',
          600: '#D97706',
          700: '#B45309',
          800: '#92400E',
          900: '#78350F',
        },
        // Semantic: danger #DC2626 at 600
        danger: {
          50: '#FEF2F2',
          100: '#FEE2E2',
          200: '#FECACA',
          300: '#FCA5A5',
          400: '#F87171',
          500: '#EF4444',
          600: '#DC2626',
          700: '#B91C1C',
          800: '#991B1B',
          900: '#7F1D1D',
        },
        // Semantic: info #0284C7 at 600
        info: {
          50: '#F0F9FF',
          100: '#E0F2FE',
          200: '#BAE6FD',
          300: '#7DD3FC',
          400: '#38BDF8',
          500: '#0EA5E9',
          600: '#0284C7',
          700: '#0369A1',
          800: '#075985',
          900: '#0C4A6E',
        },
        // Semantic surface roles (light + dark)
        surface: {
          DEFAULT: '#FFFFFF',
          alt: '#F1F5F9',
          dark: '#1E293B',
          'dark-alt': '#334155',
        },
      },
      // Brand radii: sm 8 / md 12 / lg 16 / xl 24 / pill 9999
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
        pill: '9999px',
      },
      // Brand type scale: 11/12/13/14/16/20/24/32 with matching line heights
      fontSize: {
        '2xs': ['11px', { lineHeight: '16px' }],
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        lg: ['16px', { lineHeight: '24px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['32px', { lineHeight: '40px' }],
      },
      // Elevation presets (+ dark variants, apply via dark:shadow-elevation-N-dark)
      boxShadow: {
        'elevation-1': '0 1px 2px rgba(15, 23, 42, 0.06)',
        'elevation-2': '0 2px 8px rgba(15, 23, 42, 0.08)',
        'elevation-3': '0 8px 24px rgba(15, 23, 42, 0.12)',
        'elevation-4': '0 16px 48px rgba(15, 23, 42, 0.16)',
        'elevation-1-dark': '0 1px 2px rgba(0, 0, 0, 0.40)',
        'elevation-2-dark': '0 2px 8px rgba(0, 0, 0, 0.45)',
        'elevation-3-dark': '0 8px 24px rgba(0, 0, 0, 0.50)',
        'elevation-4-dark': '0 16px 48px rgba(0, 0, 0, 0.55)',
      },
      fontFamily: {
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      spacing: {
        '4.5': '18px',
        '18': '72px',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-in': 'slideIn 0.3s ease-out',
        'bounce-in': 'bounceIn 0.6s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0.3)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '70%': { transform: 'scale(0.9)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
