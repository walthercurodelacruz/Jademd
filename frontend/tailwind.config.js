/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        jade: {
          50: '#f0fdf4',
          100: '#dcfce7',
          200: '#bbf7d0',
          300: '#86efac',
          400: '#4ade80',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
          800: '#166534',
          900: '#14532d',
          950: '#052e16',
        },
        obsidian: {
          bg: '#18181b',
          sidebar: '#121214',
          card: '#202024',
          border: '#27272a',
          hover: '#2d2d32',
          active: '#38383e',
          text: '#f4f4f5',
          muted: '#a1a1aa',
        }
      },
    },
  },
  plugins: [],
};
