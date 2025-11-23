/**
 * 大户持仓分析组件 - 完整优化版 v2.1
 * * 更新日志 v2.1:
 * - 优化圆环图图例 (Legend) 布局，使用 Grid 网格代替 Flex，解决挤压问题
 * - 增加图例的美观度，添加背景容器和光晕效果
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';

// 🆕 引入高级决策算法（可选）
import { generateInvestmentSignal, SIGNAL_STRENGTH_MAP } from '@/lib/decision-matrix';

// ==================== 类型定义 ====================

interface Holder {
  proxyWallet: string;
  pseudonym?: string;
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
  autoRefresh?: boolean; // 是否自动刷新
  refreshInterval?: number; // 刷新间隔（毫秒）
}

// ==================== 配置常量 ====================

const CONFIG = {
  AUTO_REFRESH_INTERVAL: 60000, // 默认 60 秒自动刷新
  MAX_RETRY_COUNT: 3,           // 最大重试次数
  RETRY_DELAY: 2000,            // 重试延迟（毫秒）
};

// ==================== 主组件 ====================

export default function WhaleHolders({
  conditionId,
  teamA,
  teamB,
  currentPrice,
  aiPrediction,
  autoRefresh = false,
  refreshInterval = CONFIG.AUTO_REFRESH_INTERVAL,
}: WhaleHoldersProps) {
  // ==================== State 管理 ====================
  
  const [holdersData, setHoldersData] = useState<MarketHoldersData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null);

  // ==================== 数据加载逻辑 ====================

  const loadHoldersData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // 15秒超时

      const res = await fetch(
        `/api/market-holders?conditionId=${conditionId}&limit=10`,
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
        setRetryCount(0); // 重置重试计数
      } else {
        throw new Error(json.error || 'Invalid response format');
      }
    } catch (err) {
      console.error('Failed to load holders data:', err);
      
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      
      // 自动重试逻辑
      if (retryCount < CONFIG.MAX_RETRY_COUNT) {
        console.log(`Retrying... (${retryCount + 1}/${CONFIG.MAX_RETRY_COUNT})`);
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

  // ==================== 生命周期 ====================

  // 初始加载
  useEffect(() => {
    loadHoldersData();
  }, [conditionId]);

  // 自动刷新
  useEffect(() => {
    if (!autoRefresh || !holdersData) return;

    const intervalId = setInterval(() => {
      console.log('🔄 Auto-refreshing holders data...');
      loadHoldersData();
    }, refreshInterval);

    return () => clearInterval(intervalId);
  }, [autoRefresh, refreshInterval, holdersData, loadHoldersData]);

  // ==================== 手动刷新 ====================

  const handleRefresh = useCallback(() => {
    setRetryCount(0);
    loadHoldersData();
  }, [loadHoldersData]);

  // ==================== 计算衍生数据 ====================

  const derivedData = useMemo(() => {
    if (!holdersData) return null;

    const {
      yesHolders,
      noHolders,
      yesTotalAmount,
      noTotalAmount,
      whaleConcentration,
      smartMoneyDirection,
      top10Concentration,
    } = holdersData;

    // 计算当前价值
    const yesTotalValue = yesTotalAmount * currentPrice.yes;
    const noTotalValue = noTotalAmount * currentPrice.no;
    const totalValue = yesTotalValue + noTotalValue;

    // 准备饼图数据
    const pieData = [
      { name: `${teamA} (Yes)`, value: yesTotalAmount, color: '#3b82f6' },
      { name: `${teamB} (No)`, value: noTotalAmount, color: '#ef4444' },
    ];

    // 计算占比
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
    };
  }, [holdersData, currentPrice, teamA, teamB]);

  // ==================== 生成投资建议（集成 decision-matrix.ts）====================

  const adviceList = useMemo(() => {
    if (!holdersData) return [];

    const { smartMoneyDirection, whaleConcentration } = holdersData;

    // 🚀 使用高级决策算法
    if (typeof generateInvestmentSignal === 'function' &&aiPrediction) {
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

        // 1. 信号和置信度
        advice.push(
          `${meta.emoji} **${meta.label}** - 置信度: ${decision.confidence}%`
        );

        // 2. 详细推理
        advice.push(decision.reasoning);

        // 3. 集中度风险提示
        if (whaleConcentration > 50) {
          advice.push(
            `⚠️ 高度集中：前3名大户控制 ${whaleConcentration.toFixed(1)}% 的筹码，市场容易被操纵`
          );
        } else if (whaleConcentration > 30) {
          advice.push(
            `📈 中度集中：前3名大户持有 ${whaleConcentration.toFixed(1)}% 筹码，需关注大户动向`
          );
        } else {
          advice.push(
            `🌊 分散持仓：市场参与者众多，筹码分散，价格发现较为有效`
          );
        }
      } catch (err) {
        console.error('Decision matrix error:', err);
        return generateSimpleAdvice(
          smartMoneyDirection,
          whaleConcentration,
          aiPrediction,
          teamA,
          teamB
        );
      }

      return advice;
    }

    return generateSimpleAdvice(
      smartMoneyDirection,
      whaleConcentration,
      aiPrediction,
      teamA,
      teamB
    );
  }, [holdersData, aiPrediction, teamA, teamB]);

  // ==================== 简化版建议生成 ====================

  function generateSimpleAdvice(
    smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL',
    whaleConcentration: number,
    aiPrediction: number | undefined,
    teamA: string,
    teamB: string
  ): string[] {
    const advice: string[] = [];

    // 1. 大户方向分析
    if (smartMoneyDirection === 'YES') {
      advice.push(`🐋 大户偏好：前10名大户明显看好 **${teamA}**，聪明钱流向一致`);
    } else if (smartMoneyDirection === 'NO') {
      advice.push(`🐋 大户偏好：前10名大户明显看好 **${teamB}**，聪明钱流向一致`);
    } else {
      advice.push(`🐋 大户偏好：大户持仓分散，市场存在分歧`);
    }

    // 2. AI 预测对比
    if (aiPrediction) {
      const aiWinner = aiPrediction > 0.5 ? teamA : teamB;
      const aiConfidence = Math.abs(aiPrediction - 0.5) * 200;

      if (
        (smartMoneyDirection === 'YES' && aiPrediction > 0.55) ||
        (smartMoneyDirection === 'NO' && aiPrediction < 0.45)
      ) {
        advice.push(
          `✅ **AI + 大户一致**：AI 模型和聪明钱都看好 ${aiWinner}，信号强烈 (置信度: ${aiConfidence.toFixed(0)}%)`
        );
      } else if (
        (smartMoneyDirection === 'YES' && aiPrediction < 0.45) ||
        (smartMoneyDirection === 'NO' && aiPrediction > 0.55)
      ) {
        advice.push(
          `⚠️ **AI + 大户分歧**：AI 看好 ${aiWinner}，但大户持仓倾向相反，谨慎决策`
        );
      } else {
        advice.push(
          `📊 市场均衡：AI 预测和大户持仓都显示接近 50/50，可能是高度竞争的比赛`
        );
      }
    }

    // 3. 集中度分析
    if (whaleConcentration > 50) {
      advice.push(
        `⚡ **高度集中**：前3名大户控制 ${whaleConcentration.toFixed(1)}% 的筹码，市场容易被操纵`
      );
    } else if (whaleConcentration > 30) {
      advice.push(
        `📈 中度集中：前3名大户持有 ${whaleConcentration.toFixed(1)}% 筹码，需关注大户动向`
      );
    } else {
      advice.push(
        `🌊 分散持仓：市场参与者众多，筹码分散，价格发现较为有效`
      );
    }

    return advice;
  }

  // ==================== 渲染逻辑 ====================

  // 加载状态
  if (loading && !holdersData) {
    return <LoadingSkeleton />;
  }

  // 错误状态
  if (error && !holdersData) {
    return (
      <ErrorState 
        error={error} 
        onRetry={handleRefresh}
        retryCount={retryCount}
        maxRetries={CONFIG.MAX_RETRY_COUNT}
      />
    );
  }

  // 无数据状态
  if (!holdersData || !derivedData) {
    return <EmptyState onRefresh={handleRefresh} />;
  }

  const {
    yesHolders,
    noHolders,
    yesTotalAmount,
    noTotalAmount,
    whaleConcentration,
    smartMoneyDirection,
  } = holdersData;

  const {
    yesTotalValue,
    noTotalValue,
    totalValue,
    pieData,
    yesPercentage,
    noPercentage,
  } = derivedData;

  // ==================== 主UI渲染 ====================

  return (
    <div className="bg-gradient-to-br from-slate-900 to-slate-950 rounded-2xl border border-slate-800 p-6 shadow-2xl relative overflow-hidden">
      {/* 背景装饰 */}
      <div className="absolute inset-0 bg-[url('/noise.png')] opacity-[0.02] mix-blend-overlay pointer-events-none"></div>
      
      {/* 标题栏 */}
      <div className="flex items-center justify-between mb-6 relative z-10">
        <h3 className="font-bold text-white text-lg flex items-center gap-2">
          <span className="text-2xl">🐋</span> 
          <span>大户持仓分析</span>
          {autoRefresh && (
            <span className="text-xs text-green-400 bg-green-400/10 px-2 py-1 rounded-full border border-green-400/20 animate-pulse">
              实时
            </span>
          )}
        </h3>
        
        <div className="flex items-center gap-3">
          {lastUpdateTime && (
            <span className="text-xs text-slate-500 hidden sm:block">
              更新于 {lastUpdateTime.toLocaleTimeString('zh-CN')}
            </span>
          )}
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="text-xs px-3 py-1.5 bg-slate-800 hover:bg-slate-700 disabled:bg-slate-800/50 text-slate-300 rounded-lg border border-slate-700 transition-all active:scale-95 disabled:cursor-not-allowed"
          >
            {loading ? '⏳ 加载中...' : '🔄 刷新'}
          </button>
        </div>
      </div>

      {/* 核心指标卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6 relative z-10">
        {/* 聪明钱方向 */}
        <MetricCard
          title="聪明钱方向"
          value={
            smartMoneyDirection === 'YES'
              ? `${teamA} ↑`
              : smartMoneyDirection === 'NO'
              ? `${teamB} ↑`
              : '分歧 ↔'
          }
          subtitle="前10名大户"
          color={
            smartMoneyDirection === 'YES'
              ? 'blue'
              : smartMoneyDirection === 'NO'
              ? 'red'
              : 'yellow'
          }
        />

        {/* 大户集中度 */}
        <MetricCard
          title="大户集中度"
          value={`${whaleConcentration.toFixed(1)}%`}
          subtitle="前3名占比"
          color={
            whaleConcentration > 50
              ? 'red'
              : whaleConcentration > 30
              ? 'yellow'
              : 'green'
          }
        />

        {/* 总持仓价值 */}
        <MetricCard
          title="总持仓价值"
          value={`$${(totalValue / 1000).toFixed(1)}K`}
          subtitle="USDC"
          color="purple"
        />
      </div>

      {/* 持仓分布饼图 */}
      <div className="mb-6 relative z-10">
        <div className="text-sm font-bold text-slate-300 mb-4 text-center">
          持仓分布
        </div>
        
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              innerRadius={60}
              outerRadius={80}
              paddingAngle={5}
              dataKey="value"
              label={(entry) => `${((entry.value / (yesTotalAmount + noTotalAmount)) * 100).toFixed(1)}%`}
            >
              {pieData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} stroke="rgba(0,0,0,0.2)" />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: '#0f172a',
                borderColor: '#1e293b',
                borderRadius: '8px',
                color: '#fff',
                fontSize: '12px',
                boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
              }}
              formatter={(value: number) => [
                value.toLocaleString(),
                '持仓量'
              ]}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* ✅ 自定义美化版图例 (替代原有的 Recharts Legend) */}
        <div className="mt-4 flex justify-center">
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 bg-slate-950/30 p-3 rounded-xl border border-slate-800/50 backdrop-blur-sm">
            {pieData.map((entry, index) => (
              <div key={index} className="flex items-center gap-3">
                {/* 颜色圆点，带光晕效果 */}
                <div 
                  className="w-3 h-3 rounded-full shadow-sm shrink-0" 
                  style={{ 
                    backgroundColor: entry.color,
                    boxShadow: `0 0 8px ${entry.color}40` 
                  }} 
                />
                <div className="flex flex-col">
                  {/* 球队名称 */}
                  <span className="text-xs font-bold text-slate-200 leading-tight">
                    {entry.name.split(' (')[0]}
                  </span>
                  {/* Yes/No 标签 */}
                  <span className={`text-[10px] font-mono font-bold ${
                    entry.name.includes('Yes') ? 'text-blue-400' : 'text-red-400'
                  }`}>
                    {entry.name.includes('Yes') ? 'YES' : 'NO'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 数值统计 */}
        <div className="grid grid-cols-2 gap-3 mt-4">
          <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
            <div className="text-xs text-slate-500 mb-1">{teamA} (Yes)</div>
            <div className="text-lg font-bold text-blue-400">
              {yesTotalAmount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-600">
              ${yesTotalValue.toFixed(0)} · {yesPercentage.toFixed(1)}%
            </div>
          </div>
          
          <div className="bg-slate-950/50 rounded-lg p-3 border border-slate-800">
            <div className="text-xs text-slate-500 mb-1">{teamB} (No)</div>
            <div className="text-lg font-bold text-red-400">
              {noTotalAmount.toLocaleString()}
            </div>
            <div className="text-xs text-slate-600">
              ${noTotalValue.toFixed(0)} · {noPercentage.toFixed(1)}%
            </div>
          </div>
        </div>
      </div>

      {/* 前5名大户排行 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 relative z-10">
        {/* Yes 方向 */}
        <HoldersList
          title={`${teamA} (Yes) - Top 5`}
          holders={yesHolders.slice(0, 5)}
          currentPrice={currentPrice.yes}
          color="blue"
        />

        {/* No 方向 */}
        <HoldersList
          title={`${teamB} (No) - Top 5`}
          holders={noHolders.slice(0, 5)}
          currentPrice={currentPrice.no}
          color="red"
        />
      </div>

      {/* 综合投资建议 */}
      <div className="bg-gradient-to-r from-purple-500/10 to-blue-500/10 rounded-xl p-5 border border-purple-500/20 relative z-10">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xl">💡</span>
          <h4 className="font-bold text-white">综合投资建议</h4>
        </div>

        <div className="space-y-3">
          {adviceList.map((advice, i) => {
            const hasBold = advice.includes('**');
            
            return (
              <div
                key={i}
                className={`flex gap-3 text-sm leading-relaxed p-3 rounded-lg transition-all hover:bg-slate-950/30 ${
                  i === 0 
                    ? 'bg-slate-950/80 border border-purple-500/30' 
                    : 'bg-slate-950/50'
                }`}
              >
                <span className="text-purple-400 mt-0.5 shrink-0">•</span>
                <span 
                  className={hasBold ? 'text-white' : 'text-slate-300'}
                  dangerouslySetInnerHTML={{
                    __html: advice.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold">$1</strong>')
                  }}
                />
              </div>
            );
          })}
        </div>

        <div className="mt-4 pt-4 border-t border-slate-800 text-xs text-slate-500">
          <span className="font-bold">⚠️ 风险提示：</span> 
          大户持仓仅供参考，不构成投资建议。钱包地址多为代理地址，真实持有人身份无法确认。
          请结合多方信息独立决策。
        </div>
      </div>
    </div>
  );
}

// ==================== 子组件 ====================

/**
 * 指标卡片组件
 */
function MetricCard({
  title,
  value,
  subtitle,
  color,
}: {
  title: string;
  value: string;
  subtitle: string;
  color: 'blue' | 'red' | 'yellow' | 'green' | 'purple';
}) {
  const colorMap = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30 text-blue-400',
    red: 'from-red-500/20 to-red-600/5 border-red-500/30 text-red-400',
    yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/30 text-yellow-400',
    green: 'from-green-500/20 to-green-600/5 border-green-500/30 text-green-400',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30 text-purple-400',
  };

  const colors = colorMap[color].split(' ');
  const bgGradient = `${colors[0]} ${colors[1]}`;
  const borderColor = colors[2];
  const textColor = colors[3];

  return (
    <div
      className={`bg-gradient-to-br ${bgGradient} rounded-xl border ${borderColor} p-4 hover:scale-105 transition-transform`}
    >
      <div className="text-xs text-slate-500 uppercase font-bold mb-2">{title}</div>
      <div className={`text-2xl font-black mb-1 ${textColor}`}>{value}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </div>
  );
}

/**
 * 大户排行榜组件
 */
function HoldersList({
  title,
  holders,
  currentPrice,
  color,
}: {
  title: string;
  holders: Holder[];
  currentPrice: number;
  color: 'blue' | 'red';
}) {
  const colorClass = color === 'blue' ? 'text-blue-400' : 'text-red-400';

  return (
    <div className="bg-slate-950 rounded-xl p-4 border border-slate-800">
      <div className={`text-xs font-bold ${colorClass} mb-3 flex items-center gap-2`}>
        <span>{color === 'blue' ? '📈' : '📉'}</span> {title}
      </div>
      
      <div className="space-y-2">
        {holders.length === 0 ? (
          <div className="text-center text-slate-600 py-4 text-xs">暂无持仓</div>
        ) : (
          holders.map((holder, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-xs py-2 border-b border-slate-800/50 last:border-0 hover:bg-slate-900/50 transition-colors rounded px-2"
            >
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className="text-slate-600 font-bold shrink-0 w-6">#{i + 1}</span>
                <span className="font-mono text-slate-400 truncate text-[11px]">
                  {holder.proxyWallet.slice(0, 6)}...{holder.proxyWallet.slice(-4)}
                </span>
                {holder.pseudonym && (
                  <span className={`${colorClass} text-[10px] truncate`}>
                    ({holder.pseudonym})
                  </span>
                )}
              </div>
              
              <div className="text-right shrink-0 ml-2">
                <div className="font-bold text-white">
                  {holder.amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                <div className="text-slate-600 text-[10px]">
                  ${(holder.amount * currentPrice).toFixed(0)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * 加载骨架屏
 */
function LoadingSkeleton() {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
      <div className="flex items-center justify-between mb-6">
        <div className="h-6 w-40 bg-slate-800 rounded animate-pulse"></div>
        <div className="h-8 w-20 bg-slate-800 rounded animate-pulse"></div>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-slate-800 rounded-xl animate-pulse"></div>
        ))}
      </div>

      <div className="h-64 bg-slate-800 rounded-xl animate-pulse mb-6"></div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {[1, 2].map((i) => (
          <div key={i} className="h-48 bg-slate-800 rounded-xl animate-pulse"></div>
        ))}
      </div>

      <div className="h-32 bg-slate-800 rounded-xl animate-pulse"></div>
    </div>
  );
}

/**
 * 错误状态组件
 */
function ErrorState({
  error,
  onRetry,
  retryCount,
  maxRetries,
}: {
  error: string;
  onRetry: () => void;
  retryCount: number;
  maxRetries: number;
}) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
      <div className="text-center py-8">
        <div className="text-6xl mb-4">⚠️</div>
        <div className="text-red-500 font-bold mb-2">加载失败</div>
        <div className="text-slate-500 text-sm mb-4 max-w-md mx-auto">
          {error}
        </div>
        
        {retryCount > 0 && (
          <div className="text-xs text-slate-600 mb-4">
            已重试 {retryCount}/{maxRetries} 次
          </div>
        )}
        
        <button
          onClick={onRetry}
          className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors active:scale-95"
        >
          🔄 重试
        </button>
      </div>
    </div>
  );
}

/**
 * 空数据状态组件
 */
function EmptyState({ onRefresh }: { onRefresh: () => void }) {
  return (
    <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-lg">
      <div className="text-center py-8">
        <div className="text-6xl mb-4">📊</div>
        <div className="text-slate-400 font-bold mb-2">暂无持仓数据</div>
        <div className="text-slate-500 text-sm mb-4">
          该市场可能太新或暂无交易活动
        </div>
        <button
          onClick={onRefresh}
          className="px-6 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-sm transition-colors active:scale-95"
        >
          🔄 刷新
        </button>
      </div>
    </div>
  );
}