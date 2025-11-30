'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import type { ModelPerformance } from '@/types/analytics';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

export default function AnalyticsPage() {
  const [performance, setPerformance] = useState<ModelPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(30);

  useEffect(() => {
    loadAnalytics();
  }, [days]);

  async function loadAnalytics() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics?days=${days}`);
      if (!res.ok) {
        throw new Error(`API error: ${res.status}`);
      }
      const data = await res.json();
      if (data.success) {
        setPerformance(data.data);
      } else {
        throw new Error('Failed to load analytics');
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          <div className="text-slate-400 text-sm">加载分析数据...</div>
        </div>
      </div>
    );
  }

  if (error || !performance) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4">📊</div>
          <div className="text-red-500 mb-2">加载失败</div>
          <div className="text-slate-500 text-sm mb-4">{error || '暂无数据'}</div>
          <button
            onClick={loadAnalytics}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
          >
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 pb-20 font-sans">
      {/* Header */}
      <div className="bg-slate-900 border-b border-slate-800 sticky top-0 z-40 backdrop-blur-md bg-opacity-90">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="text-slate-400 hover:text-white flex items-center gap-2 text-sm font-medium transition-colors"
            >
              ← 返回首页
            </Link>
            <div className="h-6 w-px bg-slate-800"></div>
            <h1 className="text-2xl font-bold">📊 模型表现分析</h1>
          </div>

          <div className="flex items-center gap-4">
            <select
              value={days}
              onChange={e => setDays(parseInt(e.target.value))}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg border border-slate-700 text-sm font-medium hover:border-slate-600 transition-colors focus:outline-none focus:border-blue-500"
            >
              <option value={7}>过去 7 天</option>
              <option value={30}>过去 30 天</option>
              <option value={90}>过去 90 天</option>
            </select>

            <button
              onClick={loadAnalytics}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-bold transition-colors"
            >
              🔄 刷新
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
        {/* 核心指标卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <MetricCard
            title="预测准确率"
            value={`${(performance.accuracy * 100).toFixed(1)}%`}
            subtitle={`${performance.totalPredictions} 场比赛`}
            icon="🎯"
            color="blue"
            change={
              performance.accuracy > 0.55
                ? { value: '+Good', positive: true }
                : performance.accuracy < 0.45
                ? { value: 'Poor', positive: false }
                : undefined
            }
          />

          <MetricCard
            title="Brier Score"
            value={performance.avgBrierScore.toFixed(3)}
            subtitle="越低越好 (0-1)"
            icon="📈"
            color="green"
            change={
              performance.avgBrierScore < 0.2
                ? { value: 'Excellent', positive: true }
                : performance.avgBrierScore > 0.3
                ? { value: 'Needs Work', positive: false }
                : undefined
            }
          />

          <MetricCard
            title="校准分数"
            value={`${(performance.calibrationScore * 100).toFixed(0)}%`}
            subtitle="预测一致性"
            icon="🎚️"
            color="purple"
            change={
              performance.calibrationScore > 0.8
                ? { value: 'Well Calibrated', positive: true }
                : undefined
            }
          />

          <MetricCard
            title="Log Loss"
            value={performance.avgLogLoss.toFixed(3)}
            subtitle="概率质量"
            icon="📊"
            color="orange"
          />
        </div>

        {/* 按置信度分组 */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span>🎯</span> 按置信度分组表现
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <ConfidenceCard
              label="高置信度"
              range=">80%"
              accuracy={performance.byConfidence.high.accuracy}
              count={performance.byConfidence.high.count}
              color="green"
            />
            <ConfidenceCard
              label="中置信度"
              range="60-80%"
              accuracy={performance.byConfidence.medium.accuracy}
              count={performance.byConfidence.medium.count}
              color="yellow"
            />
            <ConfidenceCard
              label="低置信度"
              range="<60%"
              accuracy={performance.byConfidence.low.accuracy}
              count={performance.byConfidence.low.count}
              color="red"
            />
          </div>

          {/* 置信度分布图 */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={[
                  {
                    name: '高',
                    accuracy: performance.byConfidence.high.accuracy * 100,
                    count: performance.byConfidence.high.count,
                  },
                  {
                    name: '中',
                    accuracy: performance.byConfidence.medium.accuracy * 100,
                    count: performance.byConfidence.medium.count,
                  },
                  {
                    name: '低',
                    accuracy: performance.byConfidence.low.accuracy * 100,
                    count: performance.byConfidence.low.count,
                  },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="name" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                  }}
                />
                <Bar dataKey="accuracy" fill="#3b82f6" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 市场价值 ROI 分析 */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span>💰</span> 市场价值表现 (ROI)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <ValueCard
              label="强价值"
              range=">10% EV"
              roi={performance.byValue.strongValue.roi}
              count={performance.byValue.strongValue.count}
            />
            <ValueCard
              label="价值"
              range="5-10% EV"
              roi={performance.byValue.value.roi}
              count={performance.byValue.value.count}
            />
            <ValueCard
              label="公平定价"
              range="<5% EV"
              roi={performance.byValue.fair.roi}
              count={performance.byValue.fair.count}
            />
          </div>

          <div className="mt-6 p-4 bg-slate-950 rounded-xl border border-slate-800">
            <div className="text-xs text-slate-500 mb-2 uppercase font-bold">
              💡 ROI 解读
            </div>
            <div className="text-sm text-slate-400 leading-relaxed">
              {performance.byValue.strongValue.roi > 10 ? (
                <span className="text-green-400 font-medium">
                  ✅ 强价值预测 ROI 为正，模型在识别被低估的市场上表现良好！
                </span>
              ) : performance.byValue.strongValue.roi < -10 ? (
                <span className="text-red-400 font-medium">
                  ⚠️ 强价值预测 ROI 为负，需要优化模型或降低置信度阈值。
                </span>
              ) : (
                <span className="text-yellow-400 font-medium">
                  ⚡ 强价值预测 ROI 接近 0，市场效率较高或样本量不足。
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 时间趋势 */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
            <span>📈</span> 准确率时间趋势
          </h3>

          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={days === 7 ? performance.last7Days : performance.last30Days}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  tickFormatter={val => {
                    const date = new Date(val);
                    return `${date.getMonth() + 1}/${date.getDate()}`;
                  }}
                />
                <YAxis
                  stroke="#64748b"
                  tick={{ fontSize: 12 }}
                  domain={[0, 1]}
                  tickFormatter={val => `${(val * 100).toFixed(0)}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#1e293b',
                    borderRadius: '8px',
                  }}
                  formatter={(value: any, name: string, props: any) => [
                    `${(value * 100).toFixed(1)}%`,
                    `准确率 (${props.payload.count} 场)`,
                  ]}
                  labelFormatter={val => {
                    const date = new Date(val);
                    return date.toLocaleDateString('zh-CN');
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="accuracy"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
                {/* 50% 基准线 */}
                <Line
                  type="monotone"
                  dataKey={() => 0.5}
                  stroke="#64748b"
                  strokeWidth={1}
                  strokeDasharray="5 5"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="mt-4 text-center text-xs text-slate-500">
            虚线表示 50% 基准线（随机猜测）
          </div>
        </div>

        {/* 模型信息 */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6 shadow-xl">
          <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
            <span>ℹ️</span> 关于这些指标
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InfoCard
              title="Brier Score"
              description="衡量预测概率与实际结果的差异，0 为完美，1 为最差。公式: (predicted - actual)²"
              example="预测 70% 但实际输了 → (0.7 - 0)² = 0.49"
            />
            <InfoCard
              title="Log Loss"
              description="衡量概率预测的质量，惩罚过度自信的错误预测。值越小越好。"
              example="预测 90% 但实际输了 → -log(0.1) = 2.3（很差）"
            />
            <InfoCard
              title="校准分数"
              description="预测 60% 的比赛，实际应该赢约 60%。校准分数衡量这种一致性。"
              example="预测 60-70% 的比赛，实际赢 65% → 校准良好"
            />
            <InfoCard
              title="ROI (投资回报率)"
              description="如果按模型建议下注，预期的投资回报率。正值表示盈利。"
              example="10 场比赛，赢 6 场亏 4 场 → ROI = 20%"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ==================== 子组件 ====================

function MetricCard({
  title,
  value,
  subtitle,
  icon,
  color,
  change,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: string;
  color: 'blue' | 'green' | 'purple' | 'orange';
  change?: { value: string; positive: boolean };
}) {
  const colorMap = {
    blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/30',
    green: 'from-green-500/20 to-green-600/5 border-green-500/30',
    purple: 'from-purple-500/20 to-purple-600/5 border-purple-500/30',
    orange: 'from-orange-500/20 to-orange-600/5 border-orange-500/30',
  };

  return (
    <div
      className={`bg-gradient-to-br ${colorMap[color]} rounded-xl border p-6 hover:scale-105 transition-transform`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-3xl">{icon}</span>
        {change && (
          <span
            className={`text-xs font-bold px-2 py-1 rounded ${
              change.positive
                ? 'bg-green-500/20 text-green-400'
                : 'bg-red-500/20 text-red-400'
            }`}
          >
            {change.value}
          </span>
        )}
      </div>
      <div className="text-xs text-slate-500 uppercase font-bold mb-2">{title}</div>
      <div className="text-4xl font-black mb-2">{value}</div>
      <div className="text-xs text-slate-500">{subtitle}</div>
    </div>
  );
}

function ConfidenceCard({
  label,
  range,
  accuracy,
  count,
  color,
}: {
  label: string;
  range: string;
  accuracy: number;
  count: number;
  color: 'green' | 'yellow' | 'red';
}) {
  const colorMap = {
    green: 'text-green-400 bg-green-500/10 border-green-500/30',
    yellow: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
    red: 'text-red-400 bg-red-500/10 border-red-500/30',
  };

  return (
    <div className={`${colorMap[color]} border rounded-xl p-5 hover:scale-105 transition-transform`}>
      <div className="text-sm font-bold mb-1">{label}</div>
      <div className="text-xs text-slate-500 mb-4">{range}</div>
      <div className="text-5xl font-black mb-3">{(accuracy * 100).toFixed(1)}%</div>
      <div className="text-xs opacity-70">{count} 场比赛</div>
      <div className="mt-3 h-2 w-full bg-slate-900 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            color === 'green' ? 'bg-green-500' : color === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
          }`}
          style={{ width: `${accuracy * 100}%` }}
        ></div>
      </div>
    </div>
  );
}

function ValueCard({
  label,
  range,
  roi,
  count,
}: {
  label: string;
  range: string;
  roi: number;
  count: number;
}) {
  const isPositive = roi > 0;
  const isNeutral = Math.abs(roi) < 5;

  return (
    <div
      className={`border rounded-xl p-5 transition-all ${
        isNeutral
          ? 'bg-slate-800/50 border-slate-700'
          : isPositive
          ? 'bg-green-500/10 border-green-500/30 hover:scale-105'
          : 'bg-red-500/10 border-red-500/30 hover:scale-105'
      }`}
    >
      <div className="text-sm font-bold mb-1">{label}</div>
      <div className="text-xs text-slate-500 mb-4">{range}</div>
      <div
        className={`text-5xl font-black mb-3 ${
          isNeutral ? 'text-slate-400' : isPositive ? 'text-green-400' : 'text-red-400'
        }`}
      >
        {roi > 0 ? '+' : ''}
        {roi.toFixed(1)}%
      </div>
      <div className="text-xs opacity-70">{count} 场比赛</div>
    </div>
  );
}

function InfoCard({
  title,
  description,
  example,
}: {
  title: string;
  description: string;
  example: string;
}) {
  return (
    <div className="bg-slate-950 rounded-xl p-5 border border-slate-800 hover:border-slate-700 transition-colors">
      <div className="text-sm font-bold text-white mb-2">{title}</div>
      <div className="text-xs text-slate-400 leading-relaxed mb-3">{description}</div>
      <div className="text-xs text-slate-500 bg-slate-900 p-2 rounded border border-slate-800">
        <span className="text-slate-600">示例:</span> {example}
      </div>
    </div>
  );
}