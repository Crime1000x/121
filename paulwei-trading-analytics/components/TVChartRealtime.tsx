'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, CandlestickData } from 'lightweight-charts';
import { Loader2 } from 'lucide-react';

interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface MarkerData {
    time: number;
    position: 'aboveBar' | 'belowBar' | 'inBar';
    color: string;
    shape: 'circle' | 'square' | 'arrowUp' | 'arrowDown';
    text: string;
}

interface TVChartRealtimeProps {
    data: CandleData[];
    markers?: MarkerData[];
    loading?: boolean;
    visibleRange?: {
        from: number;
        to: number;
    } | null;
    // 实时更新
    realtimeCandle?: CandleData | null;
    realtimeTrade?: {
        time: number;
        side: 'buy' | 'sell';
        price: number;
        amount: number;
    } | null;
    // 样式
    colors?: {
        backgroundColor?: string;
        textColor?: string;
    };
}

export function TVChartRealtime({
    data,
    markers = [],
    loading = false,
    visibleRange = null,
    realtimeCandle = null,
    realtimeTrade = null,
    colors: {
        backgroundColor = 'transparent',
        textColor = '#9ca3af',
    } = {},
}: TVChartRealtimeProps) {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const markersRef = useRef<MarkerData[]>([]);

    // 记录最后一条数据的时间，防止更新旧数据导致 crash
    const lastTimeRef = useRef<number>(0);

    // 初始化图表
    useEffect(() => {
        if (!chartContainerRef.current || loading) return;

        // ... (existing cleanup code)
        if (chartRef.current) {
            chartRef.current.remove();
            chartRef.current = null;
            candleSeriesRef.current = null;
        }

        const handleResize = () => {
            chartRef.current?.applyOptions({ width: chartContainerRef.current!.clientWidth });
        };

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: backgroundColor },
                textColor,
            },
            width: chartContainerRef.current.clientWidth,
            height: 500,
            grid: {
                vertLines: { color: 'rgba(51, 65, 85, 0.5)' },
                horzLines: { color: 'rgba(51, 65, 85, 0.5)' },
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#334155',
                rightOffset: 5,
            },
            rightPriceScale: {
                borderColor: '#334155',
            },
            crosshair: {
                vertLine: {
                    color: 'rgba(59, 130, 246, 0.5)',
                    width: 1,
                    style: 2,
                },
                horzLine: {
                    color: 'rgba(59, 130, 246, 0.5)',
                    width: 1,
                    style: 2,
                },
            },
        });

        chartRef.current = chart;

        const candlestickSeries = chart.addCandlestickSeries({
            upColor: '#10b981',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#10b981',
            wickDownColor: '#ef4444',
        });

        candleSeriesRef.current = candlestickSeries;

        // 设置初始数据
        if (data && data.length > 0) {
            const formattedData = data
                .filter(d => d && d.time && d.open && d.high && d.low && d.close)
                .map(d => ({
                    time: d.time as Time,
                    open: d.open,
                    high: d.high,
                    low: d.low,
                    close: d.close,
                }));

            if (formattedData.length > 0) {
                candlestickSeries.setData(formattedData);
                // 更新最后时间
                lastTimeRef.current = formattedData[formattedData.length - 1].time as number;
            }
        }

        // ... (existing markers code)
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

            if (formattedMarkers.length > 0) {
                candlestickSeries.setMarkers(formattedMarkers);
                markersRef.current = markers;
            }
        }

        // ... (existing visibleRange code)
        if (visibleRange) {
            chart.timeScale().setVisibleRange({
                from: visibleRange.from as Time,
                to: visibleRange.to as Time,
            });
        } else {
            chart.timeScale().fitContent();
        }

        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            if (chartRef.current) {
                chartRef.current.remove();
                chartRef.current = null;
                candleSeriesRef.current = null;
            }
        };
    }, [data, loading, visibleRange, backgroundColor, textColor]);

    // ... (existing markers update effect)
    useEffect(() => {
        if (!candleSeriesRef.current || !markers) return;

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

        candleSeriesRef.current.setMarkers(formattedMarkers);
        markersRef.current = markers;
    }, [markers]);

    // 实时更新 K 线
    useEffect(() => {
        if (!candleSeriesRef.current || !realtimeCandle) return;

        const candleTime = realtimeCandle.time as number;

        // 防止更新旧数据 (例如切换周期时，实时数据可能是旧周期的)
        if (lastTimeRef.current && candleTime < lastTimeRef.current) {
            // console.warn('[Chart] Skipping old candle update:', candleTime, '<', lastTimeRef.current);
            return;
        }

        const candleUpdate: CandlestickData = {
            time: candleTime as Time,
            open: realtimeCandle.open,
            high: realtimeCandle.high,
            low: realtimeCandle.low,
            close: realtimeCandle.close,
        };

        try {
            // 使用 update 方法实时更新最后一根 K 线
            candleSeriesRef.current.update(candleUpdate);
            lastTimeRef.current = candleTime;
            console.log('[Chart] Realtime candle update (v2):', candleUpdate);
        } catch (err) {
            console.error('[Chart] Update failed:', err);
        }
    }, [realtimeCandle]);

    // 实时添加交易标记
    useEffect(() => {
        if (!candleSeriesRef.current || !realtimeTrade) return;

        // 添加新的交易标记
        const newMarker: MarkerData = {
            time: realtimeTrade.time,
            position: realtimeTrade.side === 'buy' ? 'belowBar' : 'aboveBar',
            color: realtimeTrade.side === 'buy' ? '#10b981' : '#ef4444',
            shape: realtimeTrade.side === 'buy' ? 'arrowUp' : 'arrowDown',
            text: `${realtimeTrade.side.toUpperCase()} ${realtimeTrade.amount.toLocaleString()} @ $${realtimeTrade.price.toLocaleString()}`,
        };

        // 合并现有标记和新标记
        const updatedMarkers = [...markersRef.current, newMarker]
            .sort((a, b) => a.time - b.time);

        const formattedMarkers = updatedMarkers.map(m => ({
            time: m.time as Time,
            position: m.position,
            color: m.color,
            shape: m.shape,
            text: m.text,
        }));

        candleSeriesRef.current.setMarkers(formattedMarkers);
        markersRef.current = updatedMarkers;

        console.log('[Chart] New trade marker:', newMarker);
    }, [realtimeTrade]);

    if (loading) {
        return (
            <div className="w-full h-[500px] flex items-center justify-center bg-secondary/20 rounded-lg">
                <div className="flex flex-col items-center gap-3">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    <span className="text-sm text-muted-foreground">Loading chart data...</span>
                </div>
            </div>
        );
    }

    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[500px] flex items-center justify-center bg-secondary/20 rounded-lg">
                <span className="text-sm text-muted-foreground">No chart data available</span>
            </div>
        );
    }

    return (
        <div ref={chartContainerRef} className="w-full h-[500px]" />
    );
}

// 导出原始 TVChart 作为别名，保持向后兼容
export { TVChartRealtime as TVChart };
