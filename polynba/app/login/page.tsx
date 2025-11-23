// app/login/page.tsx
import BotLoginButton from '@/components/BotLoginButton';

// 接收 searchParams 参数
export default function LoginPage({
  searchParams,
}: {
  searchParams: { returnUrl?: string };
}) {
  // 如果没有参数，默认回首页 '/'
  const returnUrl = searchParams.returnUrl || '/';

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full text-center">
        <div className="mb-6 text-4xl">🔒</div>
        <h1 className="text-2xl font-bold text-white mb-2">访问受限</h1>
        <p className="text-slate-400 mb-8 text-sm">
          本站仅限内部群组成员访问。请先验证您的身份。
        </p>
        
        <div className="bg-slate-950/50 p-6 rounded-xl border border-slate-800/50">
          {/* ⚠️ 把 returnUrl 传给组件 */}
          <BotLoginButton returnUrl={returnUrl} />
        </div>

        <div className="mt-6 text-xs text-slate-600">
          未加入群组？
          <a 
            href="https://t.me/Cr1me_1" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="text-blue-500 hover:underline"
          >
            点击这里申请
          </a>
        </div>
      </div>
    </div>
  );
}