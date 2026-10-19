const curai = require('./src/theme/curai.tokens.json');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
    "./index.html"
  ],
  darkMode: 'class', // Включаем поддержку темной темы через класс
  theme: {
    extend: {
      fontFamily: { sans: [curai.type.family, 'ui-sans-serif', 'system-ui', 'sans-serif'] },
      spacing: Object.fromEntries(Object.entries(curai.space).map(([key, value]) => ['curai-' + key, value + 'px'])),
      borderRadius: Object.fromEntries(Object.entries(curai.radius).map(([key, value]) => ['curai-' + key, value + 'px'])),
      fontSize: Object.fromEntries(Object.entries(curai.textStyles).map(([key, value]) => ['curai-' + key, [value.fontSize + 'px', { lineHeight: value.lineHeight + 'px', fontWeight: String(value.fontWeight) }]])),
      width: { 'curai-rail': curai.component.railWidth + 'px', 'curai-menu': curai.component.menuWidth + 'px', 'curai-room': curai.calendar['cabinet-width'] + 'px', 'curai-time': curai.calendar['time-width'] + 'px' },
      height: { 'curai-navbar': curai.component.navbarHeight + 'px', 'curai-slot': curai.calendar['slot-height'] + 'px', 'curai-calendar-header': curai.calendar['header-height'] + 'px' },
      // Дополнительные цвета для темной темы
      colors: {
          curai: Object.fromEntries(Object.keys(curai.color).map(key => [key, 'var(--curai-color-' + key + ')'])),
        dark: {
          50: '#f9fafb',
          100: '#f3f4f6',
          200: '#e5e7eb',
          300: '#d1d5db',
          400: '#9ca3af',
          500: '#6b7280',
          600: '#4b5563',
          700: '#374151',
          800: '#1f2937',
          900: '#111827',
        }
      }
    },
  },
  plugins: [],
};