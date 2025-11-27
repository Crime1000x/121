'use client';

import React, { useMemo } from 'react';
import { ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Scatter, Legend } from 'recharts';
import { Trade } from '@/lib/types';

interface PerformanceChartProps {
    trades: Trade[];
    ohlcv: any[];
}

export function PerformanceChart({ trades, ohlcv }: PerformanceChartProps) {
    const chartData = useMemo(() => {
        if (!ohlcv || ohlcv.length === 0) return [];
        
        // 确保数据按时间排序
        return [...ohlcv].sort((a, b) => a.timestamp - b.timestamp).map(candle => {
            // 查找该时间点的交易
            const tradeAtPoint = trades.find(t => 
                Math.abs(new Date(t.datetime).getTime() - candle.timestamp) < 60000 // 1分钟容差
            );

            return {
                date: new Date(candle.timestamp).toLocaleDateString(),
                price: candle.close,
                // 如果有交易，打上标记点
                buy: tradeAtPoint?.side === 'buy' ? tradeAtPoint.price : null,
                sell: tradeAtPoint?.side === 'sell' ? tradeAtPoint.price : null,
                tradeInfo: tradeAtPoint // 用于 Tooltip 展示详情
            };
        });
    }, [ohlcv, trades]);

    return (
        <div className="h-[500px] w-full glass-panel p-6 rounded-xl">
            <h3 className="text-lg font-bold mb-6 flex items-center gap-2 text-gray-200">
                <span className="w-1 h-6 bg-indigo-500 rounded-full"></span>
                价格走势与成交分布
            </h3>
            
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                    
                    <XAxis
                        dataKey="date"
                        stroke="#6b7280"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        minTickGap={50}
                    />
                    
                    <YAxis
                        yAxisId="left"
                        stroke="#6b7280"
                        tick={{ fontSize: 11, fill: '#9ca3af' }}
                        tickLine={false}
                        axisLine={false}
                        domain={['auto', 'auto']}
                        tickFormatter={(val) => `$${val}`}
                    />
                    
                    <Tooltip
                        contentStyle={{ 
                            backgroundColor: 'rgba(20, 25, 35, 0.9)', 
                            border: '1px solid rgba(255,255,255,0.1)', 
                            borderRadius: '12px', 
                            color: '#f3f4f6',
                            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                            backdropFilter: 'blur(8px)'
                        }}
                        itemStyle={{ fontSize: '12px', padding: '2px 0' }}
                        labelStyle={{ color: '#9ca3af', marginBottom: '8px', fontSize: '12px' }}
                        formatter={(value: any, name: string) => {
                            if (name === 'Buy') return [`$${value} (买入)`, '成交价'];
                            if (name === 'Sell') return [`$${value} (卖出)`, '成交价'];
                            return [`$${value}`, '收盘价'];
                        }}
                    />
                    
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }}/>

                    {/* 价格线 */}
                    <Line
                        yAxisId="left"
                        type="monotone"
                        dataKey="price"
                        stroke="#6366f1" // Indigo
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 0 }}
                        name="收盘价 (Close)"
                    />

                    {/* 买入点标记 (绿色三角形) */}
                    <Scatter
                        yAxisId="left"
                        name="买入 (Buy)"
                        dataKey="buy"
                        fill="#10b981" // Emerald
                        shape="triangle"
                    />

                    {/* 卖出点标记 (红色倒三角/星形) */}
                    <Scatter
                        yAxisId="left"
                        name="卖出 (Sell)"
                        dataKey="sell"
                        fill="#ef4444" // Rose
                        shape="wye"
                    />

                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}