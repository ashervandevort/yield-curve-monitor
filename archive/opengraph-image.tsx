import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'Yield Curve Monitor — Treasury rates, spreads, macro calendar, and DV01 hedge optimizer'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: 'linear-gradient(135deg, #0f1318 0%, #07090c 100%)',
          padding: 56,
          fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: '#ff6600',
            }}
          />
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 22, letterSpacing: 4 }}>
            252.CAPITAL
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div style={{ fontSize: 64, fontWeight: 700, color: '#ffffff', lineHeight: 1.05 }}>
            Yield Curve Monitor
          </div>
          <div style={{ fontSize: 28, color: 'rgba(255,255,255,0.72)', maxWidth: 900, lineHeight: 1.4 }}>
            Live Treasury curve · Key spreads · Macro calendar · DV01 hedge optimizer (ZT–UB)
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {['FRED', '2s10s', 'FOMC', 'DV01', 'PDF'].map((tag) => (
              <span
                key={tag}
                style={{
                  padding: '8px 16px',
                  border: '1px solid rgba(255,102,0,0.35)',
                  borderRadius: 4,
                  color: '#ff9900',
                  fontSize: 18,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
          <span style={{ color: '#ff6600', fontSize: 24, fontWeight: 600 }}>yield.252.capital</span>
        </div>

        {/* stylized curve line */}
        <div
          style={{
            position: 'absolute',
            right: 56,
            top: 180,
            width: 420,
            height: 220,
            opacity: 0.35,
          }}
        >
          <svg width="420" height="220" viewBox="0 0 420 220">
            <polyline
              fill="none"
              stroke="#ff6600"
              strokeWidth="5"
              strokeLinecap="round"
              points="0,180 70,150 140,120 210,95 280,70 350,50 420,35"
            />
          </svg>
        </div>
      </div>
    ),
    { ...size },
  )
}
