/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        lavender: {
          DEFAULT: '#d9c8ff',
          50: '#f7f3ff',
          100: '#eee5ff',
          200: '#d9c8ff',
          300: '#c9b4f4',
          400: '#9b86c1',
          500: '#78658f',
        },
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
        },
      },
      boxShadow: {
        soft: '0 18px 45px rgba(15, 23, 42, 0.12)',
      },
    },
  },
  plugins: [],
};
