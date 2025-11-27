'use client';

import React, { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, Time, CrosshairMode } from 'lightweight-charts';
import { Loader2 } from 'lucide-react';

interface TVChartProps {
    data: {
        time: number;
        open: number;
        high: number;
        low: number;
        close: number;
    }[];
    markers?: {
        time: number;
        position: 'aboveBar' | 'belowBar' | 'inBar';
        color: string;
        shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
        text: string;
    }[];
    loading?: boolean;
    visibleRange?: {
        from: number;
        to: number;
    } | null;
    colors?: {
        backgroundColor?: string;
        lineColor?: string;
        textColor?: string;
    };
}

export const TVChart = ({ 
    data, 
    markers = [], 
    loading = false,
    visibleRange = null,
    colors: {
        backgroundColor = 'transparent', // 默认透明以适配玻璃背景
        textColor = '#9ca3af', // 适配深色模式的文字颜色
    } = {} 
}: TVChartProps) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<any>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // 1. 初始化图表
        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: backgroundColor },
                textColor,
                fontFamily: "'Inter', sans-serif",
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.03)' }, // 极淡的网格
                horzLines: { color: 'rgba(255, 255, 255, 0.03)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            crosshair: {
                mode: CrosshairMode.Normal,
                vertLine: {
                    color: 'rgba(59, 130, 246, 0.5)',
                    width: 1,
                    style: 3, // Dashed
                    labelBackgroundColor: '#3b82f6',
                },
                horzLine: {
                    color: 'rgba(59, 130, 246, 0.5)',
                    width: 1,
                    style: 3,
                    labelBackgroundColor: '#3b82f6',
                },
            },
        });

        chartRef.current = chart;

        // 2. 添加 K 线 Series
        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#10b981',        // 涨：翠绿
            downColor: '#ef4444',      // 跌：玫瑰红
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });
        seriesRef.current = candlestickSeries;

        // 3. 响应式调整大小
        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
            chartRef.current = null;
        };
    }, [backgroundColor, textColor]);

    // 4. 数据更新与标记 (分离 Effect 以优化性能)
    useEffect(() => {
        if (!chartRef.current || !seriesRef.current) return;

        // 设置数据
        if (data && data.length > 0) {
            const formattedData = data
                .filter(d => d && d.time)
                .map(d => ({
                    time: d.time as Time,
                    open: d.open,
                    high: d.high,
                    low: d.low,
                    close: d.close,
                }))
                // 必须按时间排序，Lightweight Charts 要求
                .sort((a, b) => (a.time as number) - (b.time as number));
            
            if (formattedData.length > 0) {
                seriesRef.current.setData(formattedData);
            }
        }

        // 设置买卖标记
        if (markers && markers.length > 0) {
            const formattedMarkers = markers
                .filter(m => m && m.time)
                .map(m => ({
                    time: m.time as Time,
                    position: m.position,
                    color: m.color,
                    shape: m.shape,
                    text: m.text,
                }))
                .sort((a, b) => (a.time as number) - (b.time as number));

            seriesRef.current.setMarkers(formattedMarkers);
        }

        // 设置可视范围 (如果提供了)
        if (visibleRange && visibleRange.from && visibleRange.to) {
            chartRef.current.timeScale().setVisibleRange({
                from: visibleRange.from as Time,
                to: visibleRange.to as Time,
            });
        } else if (data && data.length > 0 && !loading) {
            // 默认适配内容
            chartRef.current.timeScale().fitContent();
        }

    }, [data, markers, visibleRange, loading]);

    // 5. 加载与空状态处理
    if (loading) {
        return (
            <div className="w-full h-[500px] flex flex-col items-center justify-center bg-white/5 rounded-xl border border-white/5 backdrop-blur-sm">
                <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-2" />
                <span className="text-sm text-gray-400 font-medium">正在加载图表数据...</span>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[500px] flex items-center justify-center bg-white/5 rounded-xl border border-white/5 border-dashed">
                <span className="text-sm text-gray-500">暂无 K 线数据</span>
            </div>
        );
    }

    return (
        <div className="relative w-full h-[500px]">
            <div ref={chartContainerRef} className="w-full h-full rounded-xl overflow-hidden" />
            {/* 水印 (可选) */}
            <div className="absolute top-4 left-4 pointer-events-none opacity-20 text-[10px] font-bold tracking-widest text-white">
                PAULWEI TRADING
            </div>
        </div>
    );
};