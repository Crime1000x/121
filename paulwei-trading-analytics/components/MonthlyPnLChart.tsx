'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { Calendar, TrendingUp, TrendingDown } from 'lucide-react';

interface MonthlyData {
    month: string;
    pnl: number;
    funding: number;
    trades: number;
}

interface MonthlyPnLChartProps {
    data: MonthlyData[];
}

export function MonthlyPnLChart({ data }: MonthlyPnLChartProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current || data.length === 0) return;

        // 1. 初始化图表
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#9ca3af',
                fontFamily: "'Inter', sans-serif",
            },
            width: chartContainerRef.current.clientWidth,
            height: 250,
            grid: {
                vertLines: { visible: false },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: {
                    top: 0.1,
                    bottom: 0.1,
                },
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: false,
            },
            handleScale: {
                mouseWheel: false,
            },
        });

        chartRef.current = chart;

        // 2. 创建盈亏柱状图
        const histogramSeries = chart.addHistogramSeries({
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => price.toFixed(4) + ' BTC',
            },
        });

        // 转换数据格式
        const chartData = data.map((d) => {
            const [year, month] = d.month.split('-');
            const date = new Date(parseInt(year), parseInt(month) - 1, 1);
            // Lightweight Charts 需要时间戳或 YYYY-MM-DD 字符串
            return {
                time: Math.floor(date.getTime() / 1000) as any,
                value: d.pnl,
                color: d.pnl >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)', // Emerald / Rose
            };
        });

        histogramSeries.setData(chartData);
        chart.timeScale().fitContent();

        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [data]);

    // 计算统计摘要
    const totalPnl = data.reduce((sum, d) => sum + d.pnl, 0);
    const profitableMonths = data.filter(d => d.pnl > 0).length;
    const winRate = data.length > 0 ? (profitableMonths / data.length) * 100 : 0;

    return (
        <div className="w-full">
            {/* 头部统计 */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-2">
                        <Calendar className="w-3 h-3" /> 统计范围
                    </p>
                    <p className="text-lg font-bold text-gray-200 mt-0.5">
                        过去 {data.length} 个月
                    </p>
                </div>
                <div className="text-right">
                    <p className={`text-xl font-mono font-bold tracking-tight ${totalPnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(4)} <span className="text-sm text-gray-500">BTC</span>
                    </p>
                    <div className="flex items-center justify-end gap-2 text-xs font-medium text-gray-500 mt-1">
                        <span className={winRate >= 50 ? 'text-emerald-500' : 'text-amber-500'}>
                            {profitableMonths} 盈利
                        </span>
                        <span>/</span>
                        <span>{data.length - profitableMonths} 亏损</span>
                    </div>
                </div>
            </div>

            {/* 图表区域 */}
            <div ref={chartContainerRef} className="w-full h-[250px]" />

            {/* 月度数据表格 */}
            <div className="mt-6">
                <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 px-2">详细数据 (Top 12)</h4>
                <div className="max-h-[240px] overflow-y-auto custom-scrollbar rounded-xl border border-white/5 bg-black/20">
                    <table className="w-full text-sm text-left">
                        <thead className="text-xs text-gray-500 bg-white/5 sticky top-0 backdrop-blur-sm z-10">
                            <tr>
                                <th className="px-4 py-3 font-medium">月份</th>
                                <th className="px-4 py-3 text-right font-medium">净盈亏 (PnL)</th>
                                <th className="px-4 py-3 text-right font-medium">资金费</th>
                                <th className="px-4 py-3 text-right font-medium">交易数</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {[...data].reverse().slice(0, 12).map((d) => (
                                <tr key={d.month} className="hover:bg-white/5 transition-colors">
                                    <td className="px-4 py-3 font-mono text-gray-300">{d.month}</td>
                                    <td className={`px-4 py-3 text-right font-mono font-bold ${d.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {d.pnl >= 0 ? '+' : ''}{d.pnl.toFixed(4)}
                                    </td>
                                    <td className={`px-4 py-3 text-right font-mono ${d.funding >= 0 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {d.funding >= 0 ? '+' : ''}{d.funding.toFixed(4)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-gray-500">{d.trades.toLocaleString()}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}