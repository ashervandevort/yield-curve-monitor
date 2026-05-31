import type { Metadata } from 'next'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yield.252.capital'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Yield Curve Monitor | Treasury Rates & Hedging',
    template: '%s | Yield Curve Monitor',
  },
  description:
    'Treasury yield curve monitor and DV01 hedge optimizer. FRED-backed curve data, key spreads, scenario P&L, and Treasury futures sizing across ZT–UB.',
  keywords: [
    'yield curve',
    'treasury rates',
    'DV01',
    'key rate duration',
    'rates hedging',
    'treasury futures',
    '2s10s',
    'fixed income',
    'FRED',
    '252 capital',
  ],
  authors: [{ name: '252 Capital' }],
  creator: '252 Capital',
  publisher: '252 Capital',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: siteUrl,
    siteName: 'Yield Curve Monitor',
    title: 'Yield Curve Monitor | Treasury Rates & Hedging',
    description:
      'Live Treasury curve, key spreads, and 7-point DV01 hedge optimizer with Treasury futures.',
    images: [
      {
        url: '/og-image.svg',
        width: 1200,
        height: 630,
        alt: 'Yield Curve Monitor — Treasury rates and DV01 hedging',
        type: 'image/svg+xml',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yield Curve Monitor',
    description: 'Treasury curve intelligence and futures hedge sizing.',
    images: ['/og-image.svg'],
  },
  robots: {
    index: true,
    follow: true,
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
