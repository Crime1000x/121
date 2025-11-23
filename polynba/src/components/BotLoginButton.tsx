// src/components/BotLoginButton.tsx
'use client';

import { useState, useEffect } from 'react';

interface Props {
  returnUrl: string;
}

export default function BotLoginButton({ returnUrl }: Props) {
  const [loginUrl, setLoginUrl] = useState('');
  const [status, setStatus] = useState('idle'); // idle, waiting, success

  useEffect(() => {
    // 1. 生成随机 Token (使用原生 JS，避免引入 nanoid 导致报错)
    const generateToken = () => {
      return Math.random().toString(36).substring(2, 15) + 
             Math.random().toString(36).substring(2, 15);
    };
    
    const token = generateToken();
    
    // ⚠️ 请将此处替换为你真实的机器人用户名 (不带 @)
    const botUsername = "YUCECHECK_bot"; 
    
    // 2. 生成跳转链接
    setLoginUrl(`https://t.me/${botUsername}?start=${token}`);

    // 3. 开始轮询检查登录状态
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/auth/poll?token=${token}`);
        
        // 增加错误处理，防止接口异常导致前端崩溃
        if (!res.ok) return;
        
        const data = await res.json();

        if (data.success) {
          setStatus('success');
          clearInterval(interval);
          
          // 4. 登录成功，跳转回用户原本想访问的页面
          // 使用 decodeURIComponent 防止 URL 编码问题
          window.location.href = decodeURIComponent(returnUrl);
        }
      } catch (e) {
        // 忽略网络错误，继续轮询
        console.error('Polling check failed, retrying...');
      }
    }, 2000); // 每 2 秒查一次

    // 组件卸载时清除定时器
    return () => clearInterval(interval);
  }, [returnUrl]);

  return (
    <div className="flex flex-col items-center gap-4">
      {status === 'success' ? (
        <div className="text-green-400 font-bold text-lg animate-pulse">
          ✅ 验证成功，正在进入...
        </div>
      ) : (
        <>
          <a
            href={loginUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 bg-[#24A1DE] hover:bg-[#208fb7] text-white px-6 py-3 rounded-full font-bold transition-all shadow-lg hover:shadow-blue-500/30 active:scale-95"
          >
            {/* Telegram Logo SVG */}
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
            </svg>
            点击验证群组身份
          </a>
          <p className="text-xs text-slate-500 text-center max-w-xs">
            点击按钮将跳转到 Telegram 机器人，点击 <strong>Start</strong> 即可自动完成验证。
          </p>
        </>
      )}
    </div>
  );
}