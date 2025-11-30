/**
 * 大户持仓分析组件 - 霓虹/玻璃拟态重构版 (中文适配)
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { generateInvestmentSignal, SIGNAL_STRENGTH_MAP } from '@/lib/decision-matrix';

// ==================== 类型定义 ====================

interface Holder {
  proxyWallet: string;
  pseudonym?: string;
  profileImage?: string;
  amount: number;
  outcomeIndex: number;
}

interface MarketHoldersData {
  yesHolders: Holder[];
  noHolders: Holder[];
  yesTotalAmount: number;
  noTotalAmount: number;
  whaleConcentration: number;
  smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL';
  top10Concentration: number;
}

interface WhaleHoldersProps {
  conditionId: string;
  teamA: string;
  teamB: string;
  currentPrice: { yes: number; no: number };
  aiPrediction?: number; // AI 预测 Team A 获胜概率（0-1）
  autoRefresh?: boolean; 
  refreshInterval?: number;
}

const CONFIG = {
  AUTO_REFRESH_INTERVAL: 60000,
  MAX_RETRY_COUNT: 3,
  RETRY_DELAY: 2000,
};

export default function WhaleHolders({
  conditionId,
  teamA,
  teamB,
  currentPrice,
  aiPrediction,
  autoRefresh = false,
  refreshInterval = CONFIG.AUTO_REFRESH_INTERVAL,
}: WhaleHoldersProps) {
  
  const [holdersData, setHoldersData] = useState<MarketHoldersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  const loadHoldersData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); 

      const res = await fetch(
        `/api/market-holders?conditionId=${conditionId}&limit=20`,
        { signal: controller.signal }
      );
      
      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error(`API error: ${res.status} ${res.statusText}`);
      }

      const json = await res.json();
      
      if (json.success && json.data) {
        setHoldersData(json.data);
        setLastUpdateTime(new Date());
        setRetryCount(0); 
      } else {
        throw new Error(json.error || '无效的响应格式');
      }
    } catch (err) {
      console.error('Failed to load holders data:', err);
      
      const errorMessage = err instanceof Error ? err.message : '未知错误';
      
      if (retryCount < CONFIG.MAX_RETRY_COUNT) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          loadHoldersData();
        }, CONFIG.RETRY_DELAY);
      } else {
        setError(errorMessage);
      }
    } finally {
      setLoading(false);
    }
  }, [conditionId, retryCount]);

  useEffect(() => {
    loadHoldersData();
  }, [conditionId]);

  useEffect(() => {
    if (!autoRefresh || !holdersData) return;

    const intervalId = setInterval(() => {
      loadHoldersData();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, holdersData, loadHoldersData]);

  const handleRefresh = useCallback(() => {
    setRetryCount(0);
    loadHoldersData();
  }, [loadHoldersData]);

  const derivedData = useMemo(() => {
    if (!holdersData) return null;

    const {
      yesHolders,
      noHolders,
      yesTotalAmount,
      noTotalAmount,
    } = holdersData;

    const top10YesShares = yesHolders.slice(0, 10).reduce((sum, h) => sum + h.amount, 0);
    const top10NoShares = noHolders.slice(0, 10).reduce((sum, h) => sum + h.amount, 0);
    
    const top10YesValue = top10YesShares * currentPrice.yes;
    const top10NoValue = top10NoShares * currentPrice.no;

    let realSmartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL' = 'NEUTRAL';
    if (top10YesValue > top10NoValue * 1.3) {
      realSmartMoneyDirection = 'YES';
    } else if (top10NoValue > top10YesValue * 1.3) {
      realSmartMoneyDirection = 'NO';
    }

    const yesTotalValue = yesTotalAmount * currentPrice.yes;
    const noTotalValue = noTotalAmount * currentPrice.no;
    const totalValue = yesTotalValue + noTotalValue;

    const pieData = [
      { name: `${teamA} (Yes)`, value: yesTotalAmount, color: '#3b82f6' }, // Blue-500
      { name: `${teamB} (No)`, value: noTotalAmount, color: '#ef4444' }, // Red-500
    ];

    const totalAmount = yesTotalAmount + noTotalAmount;
    const yesPercentage = totalAmount > 0 ? (yesTotalAmount / totalAmount) * 100 : 0;
    const noPercentage = totalAmount > 0 ? (noTotalAmount / totalAmount) * 100 : 0;

    return {
      yesTotalValue,
      noTotalValue,
      totalValue,
      pieData,
      yesPercentage,
      noPercentage,
      realSmartMoneyDirection,
    };
  }, [holdersData, currentPrice, teamA, teamB]);

  const adviceList = useMemo(() => {
    if (!holdersData || !derivedData) return [];

    const { whaleConcentration } = holdersData;
    const smartMoneyDirection = derivedData.realSmartMoneyDirection;

    if (typeof generateInvestmentSignal === 'function' && aiPrediction) {
      const advice: string[] = [];

      try {
        const decision = generateInvestmentSignal(
          aiPrediction,
          smartMoneyDirection,
          whaleConcentration,
          teamA,
          teamB
        );

        const meta = SIGNAL_STRENGTH_MAP[decision.signal];
        // 这里的 meta.label 应该在 decision-matrix 中被翻译，如果未翻译，这里保留英文或需额外处理
        advice.push(`${meta.emoji} **${meta.label}** - 置信度: ${decision.confidence}%`);
        advice.push(decision.reasoning);

        if (whaleConcentration > 50) {
          advice.push(`⚠️ 高度集中：前3名大户控制 ${whaleConcentration.toFixed(1)}% 的筹码，市场容易被操纵`);
        } else if (whaleConcentration > 30) {
          advice.push(`📈 中度集中：前3名大户持有 ${whaleConcentration.toFixed(1)}% 筹码，需关注大户动向`);
        } else {
          advice.push(`🌊 分散持仓：市场参与者众多，筹码分散，价格发现较为有效`);
        }
      } catch (err) {
        console.error('Decision matrix error:', err);
        return generateSimpleAdvice(smartMoneyDirection, whaleConcentration, aiPrediction, teamA, teamB);
      }

      return advice;
    }

    return generateSimpleAdvice(smartMoneyDirection, whaleConcentration, aiPrediction, teamA, teamB);
  }, [holdersData, derivedData, aiPrediction, teamA, teamB]);

  function generateSimpleAdvice(
    smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL',
    whaleConcentration: number,
    aiPrediction: number | undefined,
    teamA: string,
    teamB: string
  ): string[] {
    const advice: string[] = [];
    if (smartMoneyDirection === 'YES') advice.push(`🐋 大户偏好：前10名大户资金明显流向 **${teamA}**`);
    else if (smartMoneyDirection === 'NO') advice.push(`🐋 大户偏好：前10名大户资金明显流向 **${teamB}**`);
    else advice.push(`🐋 大户偏好：大户资金分布较为均衡，市场存在分歧`);

    if (aiPrediction) {
      const aiWinner = aiPrediction > 0.5 ? teamA : teamB;
      const aiConfidence = Math.abs(aiPrediction - 0.5) * 200;
      if ((smartMoneyDirection === 'YES' && aiPrediction > 0.55) || (smartMoneyDirection === 'NO' && aiPrediction < 0.45)) {
        advice.push(`✅ **AI + 大户一致**：AI 模型和聪明钱都看好 ${aiWinner}，信号强烈 (置信度: ${aiConfidence.toFixed(0)}%)`);
      } else if ((smartMoneyDirection === 'YES' && aiPrediction < 0.45) || (smartMoneyDirection === 'NO' && aiPrediction > 0.55)) {
        advice.push(`⚠️ **AI + 大户分歧**：AI 看好 ${aiWinner}，但大户真金白银倾向相反，谨慎决策`);
      } else {
        advice.push(`📊 市场均衡：AI 预测和大户持仓都显示接近 50/50`);
      }
    }

    if (whaleConcentration > 50) advice.push(`⚡ **高度集中**：前3名大户控制 ${whaleConcentration.toFixed(1)}% 筹码`);
    else if (whaleConcentration > 30) advice.push(`📈 中度集中：前3名大户持有 ${whaleConcentration.toFixed(1)}% 筹码`);
    else advice.push(`🌊 分散持仓：市场筹码分散`);

    return advice;
  }

  if (loading && !holdersData) return <LoadingSkeleton />;
  if (error && !holdersData) return <ErrorState error={error} onRetry={handleRefresh} retryCount={retryCount} maxRetries={CONFIG.MAX_RETRY_COUNT} />;
  if (!holdersData || !derivedData) return <EmptyState onRefresh={handleRefresh} />;

  const { yesHolders, noHolders, yesTotalAmount, noTotalAmount, whaleConcentration } = holdersData;
  const { yesTotalValue, noTotalValue, totalValue, pieData, yesPercentage, noPercentage, realSmartMoneyDirection } = derivedData;

  return (
    <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg relative overflow-hidden group">
      
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-8 relative z-10">
        <h3 className="font-bold text-white text-sm uppercase tracking-widest flex items-center gap-3">
          <span className="w-1 h-4 bg-teal-500 rounded-full"></span>
          大户持仓分析
          {autoRefresh && (
            <span className="text-[9px] text-teal-400 bg-teal-500/10 px-2 py-0.5 rounded-full border border-teal-500/20 animate-pulse font-bold">
              实时
            </span>
          )}
        </h3>
        
        <div className="flex items-center gap-4">
          {lastUpdateTime && <span className="text-[10px] font-mono text-white/30 hidden sm:block">更新时间: {lastUpdateTime.toLocaleTimeString('zh-CN')}</span>}
          <button 
            onClick={handleRefresh} 
            disabled={loading} 
            className="w-8 h-8 flex items-center justify-center rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all text-white/50 hover:text-white disabled:opacity-50"
          >
            {loading ? <span className="animate-spin text-xs">⟳</span> : <span className="text-xs">⟳</span>}
          </button>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8 relative z-10">
        <MetricCard 
          title="主力流向" 
          value={realSmartMoneyDirection === 'YES' ? `${teamA}` : realSmartMoneyDirection === 'NO' ? `${teamB}` : '中立'} 
          subtitle="前10大户持仓量" 
          color={realSmartMoneyDirection === 'YES' ? 'blue' : realSmartMoneyDirection === 'NO' ? 'red' : 'yellow'} 
          icon={realSmartMoneyDirection === 'YES' ? '↗' : realSmartMoneyDirection === 'NO' ? '↘' : '↔'}
        />
        <MetricCard 
          title="筹码集中度" 
          value={`${whaleConcentration.toFixed(1)}%`} 
          subtitle="前3大户占比" 
          color={whaleConcentration > 50 ? 'red' : whaleConcentration > 30 ? 'yellow' : 'green'}
          icon="📊" 
        />
        <MetricCard 
          title="持仓总市值" 
          value={`$${(totalValue / 1000).toFixed(1)}k`} 
          subtitle="USDC 锁仓量" 
          color="purple" 
          icon="💰"
        />
      </div>

      {/* 持仓分布饼图 */}
      <div className="mb-8 relative z-10 bg-white/[0.02] rounded-2xl p-6 border border-white/5">
        <div className="text-[10px] font-black text-white/30 uppercase tracking-[0.2em] mb-6 text-center">筹码分布</div>
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie 
              data={pieData} 
              innerRadius={60} 
              outerRadius={80} 
              paddingAngle={5} 
              dataKey="value" 
              stroke="none"
            >
              {pieData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.color} 
                  style={{ filter: `drop-shadow(0px 0px 10px ${entry.color}40)` }} 
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#000',
                borderColor: '#333',
                borderRadius: '12px',
                color: '#fff',
                fontSize: '12px',
                boxShadow: '0 10px 30px -10px rgba(0,0,0,0.5)',
              }}
              itemStyle={{ color: '#fff' }}
              formatter={(value: number) => [
                value.toLocaleString(),
                '份'
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        
        {/* 自定义图例 */}
        <div className="mt-6 flex justify-center">
          <div className="flex gap-8">
            {pieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-full border border-white/5">
                <div className="w-2 h-2 rounded-full shadow-[0_0_8px_currentColor]" style={{ color: entry.color, backgroundColor: entry.color }} />
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-white/60 uppercase tracking-wider">{entry.name.includes('Yes') ? 'YES' : 'NO'}</span>
                  <span className="text-xs font-bold text-white">{entry.name.includes('Yes') ? yesPercentage.toFixed(1) : noPercentage.toFixed(1)}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 前5名大户排行 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
        <HoldersList title={`${teamA} (Yes)`} holders={yesHolders.slice(0, 5)} currentPrice={currentPrice.yes} color="blue" />
        <HoldersList title={`${teamB} (No)`} holders={noHolders.slice(0, 5)} currentPrice={currentPrice.no} color="red" />
      </div>

      {/* 综合投资建议 */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-2xl p-6 border border-purple-500/20 relative z-10 backdrop-blur-sm">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-purple-500 to-blue-500 flex items-center justify-center shadow-lg shadow-purple-500/20">
             <span className="text-white text-sm">✦</span>
          </div>
          <h4 className="font-bold text-white text-sm uppercase tracking-wide">策略洞察</h4>
        </div>
        <div className="space-y-3">
          {adviceList.map((advice, i) => (
            <div key={i} className={`flex gap-4 text-sm leading-relaxed p-4 rounded-xl transition-all border ${i === 0 ? 'bg-white/[0.05] border-white/10' : 'bg-transparent border-transparent hover:bg-white/[0.02]'}`}>
              <span className="text-purple-400 font-bold mt-0.5">•</span>
              <span className="text-slate-300 font-light" dangerouslySetInnerHTML={{ __html: advice.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-bold">$1</strong>') }} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 子组件 ====================

function MetricCard({ title, value, subtitle, color, icon }: { title: string; value: string; subtitle: string; color: string; icon: string }) {
  const getStyle = (c: string) => {
    switch(c) {
      case 'blue': return 'border-blue-500/20 shadow-[0_0_20px_-5px_rgba(59,130,246,0.3)]';
      case 'red': return 'border-red-500/20 shadow-[0_0_20px_-5px_rgba(239,68,68,0.3)]';
      case 'yellow': return 'border-yellow-500/20 shadow-[0_0_20px_-5px_rgba(234,179,8,0.3)]';
      case 'green': return 'border-emerald-500/20 shadow-[0_0_20px_-5px_rgba(16,185,129,0.3)]';
      case 'purple': return 'border-purple-500/20 shadow-[0_0_20px_-5px_rgba(168,85,247,0.3)]';
      default: return 'border-white/10';
    }
  };

  const getTextColor = (c: string) => {
    switch(c) {
      case 'blue': return 'text-blue-400';
      case 'red': return 'text-red-400';
      case 'yellow': return 'text-yellow-400';
      case 'green': return 'text-emerald-400';
      case 'purple': return 'text-purple-400';
      default: return 'text-white';
    }
  };

  return (
    <div className={`bg-white/[0.03] backdrop-blur-sm rounded-2xl p-5 border transition-all hover:-translate-y-1 ${getStyle(color)}`}>
      <div className="flex justify-between items-start mb-2">
         <span className="text-[10px] text-white/40 uppercase font-black tracking-widest">{title}</span>
         <span className="text-base opacity-80">{icon}</span>
      </div>
      <div className={`text-xl font-black mb-1 ${getTextColor(color)}`}>{value}</div>
      <div className="text-[10px] text-white/30 font-mono">{subtitle}</div>
    </div>
  );
}

function HoldersList({ title, holders, currentPrice, color }: { title: string; holders: Holder[]; currentPrice: number; color: 'blue' | 'red' }) {
  const isBlue = color === 'blue';
  
  return (
    <div className="bg-white/[0.02] rounded-2xl border border-white/5 overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-white/5 bg-white/[0.01] flex justify-between items-center">
        <div className={`text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isBlue ? 'text-blue-400' : 'text-red-400'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${isBlue ? 'bg-blue-500 shadow-[0_0_5px_currentColor]' : 'bg-red-500 shadow-[0_0_5px_currentColor]'}`}></span>
          {title}
        </div>
        <div className="text-[10px] text-white/20 font-mono">当前价格: ${(currentPrice * 100).toFixed(1)}¢</div>
      </div>

      <div className="flex items-center px-5 py-2 border-b border-white/5 bg-black/20 text-[9px] text-white/30 font-black uppercase tracking-widest">
        <div className="w-8 shrink-0">排名</div>
        <div className="flex-1 min-w-0">持有者</div>
        <div className="text-right">价值 (USD)</div>
      </div>
      
      <div className="divide-y divide-white/5">
        {holders.length === 0 ? (
          <div className="text-center text-white/20 py-8 text-xs font-mono">暂无数据</div>
        ) : (
          holders.map((holder, i) => {
            const valueUSD = holder.amount * currentPrice;
            return (
              <div key={i} className="flex items-center text-xs py-3 px-5 transition-colors hover:bg-white/[0.03] group">
                <div className={`font-mono font-bold w-8 shrink-0 ${i < 3 ? 'text-yellow-500 drop-shadow-sm' : 'text-white/20'}`}>{i + 1}</div>
                
                <div className="flex-1 min-w-0 flex items-center gap-3">
                  {holder.profileImage ? (
                    <img src={holder.profileImage} alt="" className="w-6 h-6 rounded-full object-cover bg-white/5 border border-white/10" />
                  ) : (
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-white/10 to-transparent border border-white/5 flex items-center justify-center text-[8px] text-white/30 font-bold">
                       {holder.pseudonym ? holder.pseudonym[0] : '?'}
                    </div>
                  )}
                  <div className="flex flex-col min-w-0">
                      <span className={`truncate font-bold ${holder.pseudonym ? 'text-white' : 'text-white/40'}`}>
                        {holder.pseudonym || '匿名用户'}
                      </span>
                      <span className="text-[9px] font-mono text-white/20 truncate group-hover:text-white/40 transition-colors">
                        {holder.proxyWallet.slice(0, 6)}...{holder.proxyWallet.slice(-4)}
                      </span>
                  </div>
                </div>
                
                <div className="text-right shrink-0">
                  <div className={`text-[10px] font-mono font-bold ${valueUSD > 10000 ? 'text-emerald-400' : 'text-white/60'}`}>
                    ${valueUSD.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </div>
                  <div className="text-[9px] font-mono text-white/20">{holder.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })} 份</div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg h-[600px] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-2 border-white/10 border-t-white/50 rounded-full animate-spin"></div>
            <div className="text-xs font-mono text-white/30 animate-pulse">正在分析大户数据...</div>
        </div>
    </div>
  );
}

function ErrorState({ error, onRetry }: { error: string; onRetry: () => void; retryCount: number; maxRetries: number }) {
  return (
    <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-red-500/20 p-8 shadow-lg text-center py-12">
      <div className="text-4xl mb-4 opacity-50">⚠️</div>
      <div className="text-red-400 font-bold mb-2">加载失败</div>
      <div className="text-white/40 text-xs mb-6 font-mono">{error}</div>
      <button onClick={onRetry} className="px-6 py-2 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition-all border border-white/10">重试连接</button>
    </div>
  );
}

function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="bg-[#0a0a0a]/60 backdrop-blur-xl rounded-[24px] border border-white/5 p-8 shadow-lg text-center py-12">
      <div className="text-4xl mb-4 grayscale opacity-20">📊</div>
      <div className="text-white/40 font-bold mb-2 text-sm">暂无可用数据</div>
      <button onClick={onRefresh} className="px-6 py-2 bg-white/5 hover:bg-white/10 text-white/60 rounded-full text-xs font-bold transition-all border border-white/5">刷新</button>
    </div>
  );
}