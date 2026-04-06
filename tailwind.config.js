/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#16a34a',
          yellow: '#ca8a04',
          red: '#dc2626',
        },
      },
    },
  },
  plugins: [],
}
