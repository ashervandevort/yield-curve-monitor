import type { Metadata } from 'next'
import './globals.css'

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://yield.252.capital'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Yield Curve Monitor | Treasury Rates, Spreads & DV01 Hedging',
    template: '%s | Yield Curve Monitor',
  },
  description:
    'Free Treasury yield curve monitor with FRED daily closes, key rate spreads (2s10s, 5s30s), macro economic calendar (CPI, NFP, FOMC, GDP), curve regime labels, and a 7-point DV01 hedge optimizer with Treasury futures ZT–UB. Built for rates traders, PMs, and fixed income desks.',
  keywords: [
    'yield curve',
    'treasury yield curve',
    'treasury rates',
    'US treasury yields',
    'constant maturity treasury',
    'CMT yields',
    'FRED treasury',
    'DV01',
    'dollar duration',
    'key rate duration',
    'KRD',
    'rates hedging',
    'interest rate hedge',
    'treasury futures',
    'ZT futures',
    'ZF futures',
    'ZN futures',
    'TN futures',
    'ZB futures',
    'UB futures',
    '2s10s spread',
    '2s30s spread',
    '5s30s spread',
    'yield curve inversion',
    'steepener',
    'flattener',
    'fixed income',
    'rates trading',
    'bond portfolio hedging',
    'scenario P&L',
    'parallel shift',
    'key rate shock',
    'macro calendar',
    'FOMC calendar',
    'CPI release date',
    'NFP release date',
    'employment situation',
    'economic calendar',
    'fed meeting dates',
    'treasury curve monitor',
    'live yield curve',
    '252 capital',
  ],
  authors: [{ name: '252 Capital', url: 'https://252.capital' }],
  creator: '252 Capital',
  publisher: '252 Capital',
  applicationName: 'Yield Curve Monitor',
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
    title: 'Yield Curve Monitor | Treasury Rates, Spreads & DV01 Hedging',
    description:
      'Live FRED Treasury curve, key spreads, macro calendar, regime labels, and Treasury futures DV01 hedge optimizer — free for rates desks.',
    images: [
      {
        url: '/opengraph-image',
        width: 1200,
        height: 630,
        alt: 'Yield Curve Monitor — Treasury rates and DV01 hedging dashboard',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Yield Curve Monitor | Treasury Rates & DV01 Hedging',
    description:
      'Live Treasury curve, 2s10s spreads, FOMC/CPI calendar, and ZT–UB futures hedge sizing. Free at yield.252.capital',
    images: ['/opengraph-image'],
    creator: '@252capital',
    site: '@252capital',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icon.svg', type: 'image/svg+xml' }],
  },
  manifest: '/manifest.json',
  alternates: {
    canonical: siteUrl,
  },
  category: 'finance',
}

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Yield Curve Monitor',
  url: siteUrl,
  applicationCategory: 'FinanceApplication',
  operatingSystem: 'Any',
  browserRequirements: 'Requires JavaScript',
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'USD',
  },
  description:
    'Treasury yield curve monitor with FRED data, key spreads, macro release calendar, and DV01 hedge optimizer using Treasury futures.',
  featureList: [
    'Live Treasury constant maturity yield curve',
    'Spot vs Treasury futures curve (ZT–UB)',
    'Key rate spreads with historical charts',
    'Macro calendar: FOMC, CPI, NFP, PPI, GDP',
    '7-point key rate DV01 hedge optimizer',
    'Scenario P&L and PDF export',
  ],
  creator: {
    '@type': 'Organization',
    name: '252 Capital',
    url: 'https://252.capital',
  },
  keywords:
    'yield curve, treasury rates, DV01, key rate duration, treasury futures, 2s10s, FOMC calendar, rates hedging',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
        <meta name="theme-color" content="#ff6600" media="(prefers-color-scheme: dark)" />
        <meta name="theme-color" content="#ff6600" media="(prefers-color-scheme: light)" />
        <link rel="preconnect" href="https://api.stlouisfed.org" />
        <link rel="dns-prefetch" href="https://api.stlouisfed.org" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
