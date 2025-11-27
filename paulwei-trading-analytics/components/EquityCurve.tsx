'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, Time } from 'lightweight-charts';

interface EquityData {
    time: number;
    balance: number;
}

interface EquityCurveProps {
    data: EquityData[];
}

export function EquityCurve({ data }: EquityCurveProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current || data.length === 0) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: 'transparent' },
                textColor: '#9ca3af',
            },
            width: chartContainerRef.current.clientWidth,
            height: 250,
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: {
                    top: 0.2,
                    bottom: 0.2,
                },
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
                timeVisible: true,
            },
            handleScale: {
                mouseWheel: false,
            },
        });

        chartRef.current = chart;

        // 创建面积图系列
        const areaSeries = chart.addAreaSeries({
            lineColor: '#3b82f6',
            topColor: 'rgba(59, 130, 246, 0.4)',
            bottomColor: 'rgba(59, 130, 246, 0.0)',
            lineWidth: 2,
            priceFormat: {
                type: 'custom',
                formatter: (price: number) => price.toFixed(4) + ' BTC',
            },
        });

        // 转换数据格式
        const chartData = data.map(d => ({
            time: d.time as Time,
            value: d.balance,
        }));

        areaSeries.setData(chartData);
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

    // 计算统计数据
    const startBalance = data.length > 0 ? data[0].balance : 0;
    const endBalance = data.length > 0 ? data[data.length - 1].balance : 0;
    const change = endBalance - startBalance;
    const changePercent = startBalance > 0 ? (change / startBalance) * 100 : 0;

    // 计算峰值和回撤
    let peak = -Infinity;
    let maxDrawdown = 0;

    if (data.length > 0) {
        peak = data[0].balance;
        data.forEach(d => {
            if (d.balance > peak) peak = d.balance;
            const drawdown = peak > 0 ? (peak - d.balance) / peak : 0;
            if (drawdown > maxDrawdown) maxDrawdown = drawdown;
        });
    } else {
        peak = 0;
    }

    return (
        <div className="w-full">
            {/* 头部摘要 */}
            <div className="flex justify-between items-start mb-4">
                <div>
                    <p className="text-sm text-gray-500 font-medium">
                        账户净值走势 (Net Equity)
                    </p>
                </div>
                <div className="text-right">
                    <p className="text-xl font-mono font-bold tracking-tight text-gray-200">
                        {endBalance.toFixed(4)} <span className="text-sm text-gray-500">BTC</span>
                    </p>
                    <p className={`text-sm font-mono font-medium ${change >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {change >= 0 ? '+' : ''}{change.toFixed(4)} ({changePercent.toFixed(2)}%)
                    </p>
                </div>
            </div>

            {/* 图表容器 */}
            <div ref={chartContainerRef} className="w-full h-[250px]" />

            {/* 底部统计栏 */}
            <div className="grid grid-cols-3 gap-4 mt-4 pt-4 border-t border-white/5">
                <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-bold">初始资金</p>
                    <p className="font-mono font-bold text-gray-300">{startBalance.toFixed(4)}</p>
                </div>
                <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-bold">资产峰值</p>
                    <p className="font-mono font-bold text-emerald-400">{peak.toFixed(4)}</p>
                </div>
                <div className="text-center">
                    <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wider font-bold">最大回撤</p>
                    <p className="font-mono font-bold text-rose-400">{(maxDrawdown * 100).toFixed(2)}%</p>
                </div>
            </div>
        </div>
    );
}