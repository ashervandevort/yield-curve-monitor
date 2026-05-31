import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Yield Curve Monitor | Treasury Rates & Hedging',
  description: 'Professional Treasury yield curve monitor with hedging optimizer for traders',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    // suppressHydrationWarning prevents false positives from browser extensions
    // that inject attributes onto <html> (e.g. Swiftread, DarkReader, etc.)
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
