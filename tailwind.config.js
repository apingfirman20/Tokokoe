/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          green: '#d4af37', // Gold color matching the logo
          orange: '#f97316',
          dark: '#0f172a', // Navy blue matching the logo background
          light: '#f8fafc',
        }
      }
    },
  },
  plugins: [],
}
