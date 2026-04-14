/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          gold: '#C9A84C',
          'gold-light': '#E8D08A',
          dark: '#0d0d0d',
          'dark-light': '#1a1a1a',
          green: '#16a34a',
          yellow: '#ca8a04',
          red: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}
