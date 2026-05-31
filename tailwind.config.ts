import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        terminal: {
          black: '#07090c',
          bg: '#07090c',
          panel: '#0f1318',
          elevated: '#151c26',
          border: '#1e2a38',
          muted: '#232d3d',
          subtle: '#1a2232',
          faint: '#0b0e14',
        },
        bloomberg: {
          orange: '#ff6600',
          amber: '#ff9900',
          yellow: '#ffcc00',
          green: '#00cc66',
          emerald: '#00b560',
          red: '#ff3333',
          crimson: '#cc2222',
          blue: '#0099ff',
          cyan: '#00cccc',
          teal: '#009999',
        },
        curve: {
          today: '#00cccc',
          '1d': '#ff9900',
          '1w': '#ff6666',
          '1m': '#9966ff',
          '1y': '#66cc66',
        },
        heat: {
          negative3: '#7a0000',
          negative2: '#bb2222',
          negative1: '#ee5555',
          neutral: '#1a2232',
          positive1: '#006644',
          positive2: '#005533',
          positive3: '#003322',
        },
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['JetBrains Mono', 'Roboto Mono', 'Consolas', 'monospace'],
      },
      fontSize: {
        ticker: ['11px', { lineHeight: '1.4', fontWeight: '500' }],
        data: ['12px', { lineHeight: '1.4', fontWeight: '500' }],
        label: ['10px', { lineHeight: '1.3', fontWeight: '600', letterSpacing: '0.07em' }],
        micro: ['9px', { lineHeight: '1.3', fontWeight: '500', letterSpacing: '0.05em' }],
      },
      borderRadius: {
        terminal: '2px',
        panel: '3px',
      },
      boxShadow: {
        terminal: 'inset 0 0 0 1px rgba(255,255,255,0.04)',
        panel: '0 2px 12px rgba(0,0,0,0.5), inset 0 0 0 1px rgba(255,255,255,0.04)',
        elevated: '0 6px 20px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.06)',
        'glow-cyan': '0 0 16px rgba(0,204,204,0.2)',
        'glow-orange': '0 0 16px rgba(255,102,0,0.2)',
        'glow-green': '0 0 16px rgba(0,204,102,0.2)',
      },
      animation: {
        'fade-in': 'fadeIn 0.15s ease-out',
        'slide-up': 'slideUp 0.15s ease-out',
        'pulse-subtle': 'pulseSub 2.5s ease-in-out infinite',
        'data-flash': 'dataFlash 0.4s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(6px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        pulseSub: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        dataFlash: {
          '0%': { backgroundColor: 'rgba(0,204,204,0.2)' },
          '100%': { backgroundColor: 'transparent' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
