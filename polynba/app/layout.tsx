import './globals.css'

export const metadata = {
  title: 'PolyNBA - Sports Market Analytics',
  description: 'Polymarket sports betting analysis with H2H stats',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* 修改背景色为深色 bg-slate-950 */}
      <body className="bg-slate-950 text-slate-200" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}