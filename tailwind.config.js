/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // LayerLabs Industrial Editorial Palette
        ivory: {
          DEFAULT: '#F5F3EE',
          light: '#FAF9F6',
          dark: '#EBE7DE',
        },
        stone: {
          DEFAULT: '#E5E2DA',
          light: '#ECEAE3',
          dark: '#D5D1C5',
          border: '#DCD8CE',
        },
        graphite: {
          DEFAULT: '#242722',
          light: '#3A3E37',
          muted: '#5F645A',
          faint: '#8E9388',
        },
        burnt: {
          DEFAULT: '#E76B3C',
          hover: '#D3582A',
          subtle: '#FAF0EB',
          border: '#F4CBB9',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'Menlo', 'monospace'],
      },
      animation: {
        'marquee': 'marquee 30s linear infinite',
      },
      keyframes: {
        marquee: {
          '0%': { transform: 'translateX(0%)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(36, 39, 34, 0.04)',
        'elevated': '0 4px 12px 0 rgba(36, 39, 34, 0.06)',
      }
    },
  },
  plugins: [],
}
