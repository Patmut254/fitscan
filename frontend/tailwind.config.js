/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: { DEFAULT: '#1B2A41', soft: '#46556B', faint: '#8693A5' },
        paper: { DEFAULT: '#F4F6F8', raised: '#FFFFFF' },
        grid: '#D8DFE7',
        tape: { DEFAULT: '#F2C230', deep: '#C99A0E', light: '#FBEBB4' },
        chalk: { DEFAULT: '#B8432F', light: '#F6E1DC' },
        sage: { DEFAULT: '#2F6F4E', light: '#DCEDE3' },
      },
      fontFamily: { sans: ['Google Sans Variable', 'Google Sans', 'Roboto', 'system-ui', 'sans-serif'] },
      borderRadius: { xl: '14px' },
    },
  },
  plugins: [],
};
