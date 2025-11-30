import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'POLYNBA | AI-Powered Market Analytics',
  description: 'Advanced sports market analytics combining Polymarket data with deep learning predictions.',
  viewport: 'width=device-width, initial-scale=1, maximum-scale=1',
  themeColor: '#000000',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-black text-slate-200 min-h-screen relative selection:bg-blue-500/30">
        
        {/* --- 全局背景层 (Cyberpunk/Neon Atmosphere) --- */}
        <div className="fixed inset-0 w-full h-full overflow-hidden pointer-events-none z-0">
            {/* 左上角蓝色光晕 */}
            <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] bg-blue-600/10 rounded-full blur-[120px] opacity-60 mix-blend-screen animate-pulse-slow"></div>
            
            {/* 右下角紫色光晕 */}
            <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] bg-purple-600/10 rounded-full blur-[120px] opacity-60 mix-blend-screen animate-pulse-slow" style={{ animationDelay: '2s' }}></div>
            
            {/* 科技感网格背景 */}
            <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:6rem_6rem] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_50%,#000_60%,transparent_100%)]"></div>
            
            {/* 噪点纹理 (可选，增加胶片质感) */}
            <div className="absolute inset-0 opacity-[0.015] pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] brightness-100 contrast-150"></div>
        </div>

        {/* --- 内容层 --- */}
        <div className="relative z-10">
          {children}
        </div>

      </body>
    </html>
  )
}