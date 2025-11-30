'use client';

import { useState } from 'react';

interface Props {
  teamA: string;
  teamB: string;
  contextData: string; 
}

export default function GrokPrediction({ teamA, teamB, contextData }: Props) {
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handlePredict = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/ai-predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contextData }),
      });

      if (!res.ok) throw new Error('Request failed');

      const data = await res.json();
      setAnalysis(data.result);
    } catch (err) {
      setError('神经连接不稳定，请稍后重试。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-black/80 backdrop-blur-2xl rounded-[24px] border border-white/10 p-1 relative overflow-hidden shadow-2xl group">
      {/* 动态光边 */}
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_2s_infinite] pointer-events-none z-0"></div>

      <div className="bg-[#050505] rounded-[20px] p-6 relative z-10 h-full">
        <div className="absolute top-0 right-0 p-6 opacity-5 pointer-events-none select-none grayscale">
            {/* Grok Logo Placeholder */}
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-24 h-24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/></svg>
        </div>

        <div className="flex justify-between items-center mb-6 relative z-10">
          <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-white text-black flex items-center justify-center font-bold font-serif">
                  G
              </div>
              <div>
                  <h3 className="font-bold text-white text-sm tracking-tight">Grok 3 (Beta)</h3>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest">深度推理引擎</p>
              </div>
          </div>
          
          {!analysis && !loading && (
            <button
              onClick={handlePredict}
              className="group/btn relative overflow-hidden bg-white text-black hover:bg-white/90 px-5 py-2 rounded-full text-xs font-bold transition-all shadow-[0_0_15px_rgba(255,255,255,0.3)] hover:shadow-[0_0_25px_rgba(255,255,255,0.5)]"
            >
              <span className="relative z-10 flex items-center gap-2">
                 生成 AI 洞察 <span className="group-hover/btn:translate-x-0.5 transition-transform">→</span>
              </span>
            </button>
          )}
        </div>

        <div className="relative z-10 min-h-[80px]">
          {loading && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <div className="relative w-12 h-12">
                  <div className="absolute inset-0 rounded-full border-2 border-white/10"></div>
                  <div className="absolute inset-0 rounded-full border-2 border-white/80 border-t-transparent animate-spin"></div>
              </div>
              <p className="text-white/40 text-xs font-mono animate-pulse uppercase tracking-widest">
                正在分析 {teamA} vs {teamB}...
              </p>
            </div>
          )}

          {error && (
            <div className="text-red-400 bg-red-500/10 p-4 rounded-xl border border-red-500/20 text-xs font-mono text-center">
              {error}
            </div>
          )}

          {!loading && !analysis && !error && (
            <div className="text-white/30 text-xs font-light leading-relaxed text-center py-4 border border-dashed border-white/5 rounded-xl">
              解锁由 xAI Grok 模型驱动的深度预测分析。<br/>
              实时整合伤病报告、历史对决数据以及市场情绪。
            </div>
          )}

          {analysis && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="prose prose-invert prose-sm max-w-none">
                <div className="whitespace-pre-wrap text-slate-300 text-sm font-light leading-relaxed bg-white/[0.03] p-6 rounded-xl border border-white/5 shadow-inner">
                  {analysis}
                </div>
                <div className="mt-4 flex justify-end">
                  <button 
                    onClick={() => setAnalysis('')} 
                    className="text-[10px] text-white/30 hover:text-white uppercase tracking-widest transition-colors flex items-center gap-1"
                  >
                    <span className="text-lg">↺</span> 重置分析
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}