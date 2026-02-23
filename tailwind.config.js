/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,jsx}'
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'sans-serif'],
        syne: ['Syne', 'sans-serif'],
        mono: ['"SF Mono"', '"Fira Code"', 'monospace'],
      },
      colors: {
        bg: '#080c14',
        surface: '#0e1520',
        card: '#131d2e',
        accent: '#3b82f6',
        indigo: '#6366f1',
        green: '#22c55e',
        red: '#ef4444',
        amber: '#f59e0b',
        t1: '#f0f4ff',
        t2: '#8896b0',
        t3: '#3d4f6b',
      },
      borderRadius: {
        DEFAULT: '16px',
        sm: '10px',
        lg: '20px',
      },
      boxShadow: {
        base: '0 4px 24px rgba(0,0,0,0.4)',
        accent: '0 4px 20px rgba(59,130,246,0.28)',
      },
    },
  },
  plugins: [],
}
