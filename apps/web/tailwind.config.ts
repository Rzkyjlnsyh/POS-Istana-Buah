import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: {
      sm: '640px',
      md: '768px',
      lg: '1024px',
      xl: '1280px',
    },
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
      },
      colors: {
        primary: {
          50: 'var(--color-primary-50)',
          100: 'var(--color-primary-100)',
          500: 'var(--color-primary-500)',
          600: 'var(--color-primary-600)',
          700: 'var(--color-primary-700)',
          800: 'var(--color-primary-800)',
          900: 'var(--color-primary-900)',
        },
        surface: {
          canvas: 'var(--surface-canvas)',
          panel: 'var(--surface-panel)',
          subtle: 'var(--surface-subtle)',
        },
        border: {
          subtle: 'var(--border-subtle)',
          strong: 'var(--border-strong)',
        },
        ink: {
          primary: 'var(--ink-primary)',
          secondary: 'var(--ink-secondary)',
          muted: 'var(--ink-muted)',
        },
        semantic: {
          success: 'var(--color-success)',
          'success-ink': 'var(--color-success-ink)',
          'success-bg': 'var(--color-success-bg)',
          'success-border': 'var(--color-success-border)',
          warning: 'var(--color-warning)',
          'warning-ink': 'var(--color-warning-ink)',
          'warning-bg': 'var(--color-warning-bg)',
          'warning-border': 'var(--color-warning-border)',
          danger: 'var(--color-danger)',
          'danger-ink': 'var(--color-danger-ink)',
          'danger-bg': 'var(--color-danger-bg)',
          'danger-border': 'var(--color-danger-border)',
          info: 'var(--color-info)',
          'info-ink': 'var(--color-info-ink)',
          'info-bg': 'var(--color-info-bg)',
          'info-border': 'var(--color-info-border)',
        },
      },
      maxWidth: {
        container: '1280px',
      },
      boxShadow: {
        panel: '0 10px 28px -12px rgba(20, 83, 45, 0.14), 0 2px 6px -2px rgba(16, 36, 24, 0.06)',
        elevated: '0 18px 40px -16px rgba(20, 83, 45, 0.2), 0 4px 12px -4px rgba(16, 36, 24, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
