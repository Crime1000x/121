// src/components/BotLoginButton.tsx
'use client';

import { useState, useEffect } from 'react';

interface Props {
  returnUrl: string;
}

export default function BotLoginButton({ returnUrl }: Props) {
  const [loginUrl, setLoginUrl] = useState('');
  const [status, setStatus] = useState('idle'); 

  useEffect(() => {
    const generateToken = () => {
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    };
    
    const token = generateToken();
    const botUsername = "YUCECHECK_bot"; 
    
    setLoginUrl(`https://t.me/${botUsername}?start=${token}`);

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/poll?token=${token}`);
        if (!res.ok) return;
        const data = await res.json();

        if (data.success) {
          setStatus('success');
          clearInterval(interval);
          window.location.href = decodeURIComponent(returnUrl);
        }
      } catch (e) {
        console.error('Polling check failed, retrying...');
      }
    }, 2000); 

    return () => clearInterval(interval);
  }, [returnUrl]);

  return (
    <div className="flex flex-col items-center gap-6">
      {status === 'success' ? (
        <div className="flex items-center gap-3 text-emerald-400 font-bold text-lg animate-pulse">
          <div className="w-5 h-5 rounded-full bg-emerald-500 flex items-center justify-center text-black text-xs">✓</div>
          验证成功，正在跳转...
        </div>
      ) : (
        <>
          <a
            href={loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative inline-flex items-center justify-center gap-3 bg-[#24A1DE] hover:bg-[#208fb7] text-white px-8 py-4 rounded-2xl font-bold transition-all shadow-[0_0_20px_-5px_rgba(36,161,222,0.4)] hover:shadow-[0_0_30px_-5px_rgba(36,161,222,0.6)] hover:-translate-y-0.5 active:translate-y-0 overflow-hidden"
          >
            {/* Glass Shine Effect */}
            <div className="absolute inset-0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] bg-gradient-to-r from-transparent via-white/20 to-transparent z-0"></div>
            
            <svg className="w-6 h-6 relative z-10" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            <span className="relative z-10">通过 Telegram 验证</span>
          </a>
          <p className="text-xs text-white/40 text-center max-w-xs leading-relaxed font-light">
            点击按钮唤起机器人，然后点击 <strong className="text-white font-bold">Start</strong> 即可快速完成身份验证。
          </p>
        </>
      )}
    </div>
  );
}