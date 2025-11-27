'use client';
import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType } from 'lightweight-charts';
import { Play, Pause, Rewind, FastForward } from 'lucide-react';

export const TVChartReplay = ({ data: rawData, trades: rawTrades }: any) => {
  const data = rawData || [];
  const trades = rawTrades || [];
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const seriesRef = useRef<any>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(200);

  // 初始化图表
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#9CA3AF' },
      grid: { vertLines: { color: 'rgba(255,255,255,0.05)' }, horzLines: { color: 'rgba(255,255,255,0.05)' } },
      width: chartContainerRef.current.clientWidth,
      height: 500,
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' }
    });

    seriesRef.current = chart.addCandlestickSeries({
      upColor: '#10B981', downColor: '#EF4444',
      borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#EF4444',
    });

    // 默认显示前 10% 的数据作为开局，或者从第一笔交易开始
    if (trades.length > 0 && data.length > 0) {
      const firstTradeTime = new Date(trades[0].datetime).getTime() / 1000;
      const startIndex = data.findIndex((c: any) => c.time >= firstTradeTime);
      // 回退 50 个单位以便观察进场前走势
      setCurrentIndex(Math.max(0, startIndex - 50));
    } else {
      setCurrentIndex(Math.floor(data.length * 0.1) || 0);
    }

    const handleResize = () => chart.applyOptions({ width: chartContainerRef.current!.clientWidth });
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [data, trades]);

  // 更新 K 线和标记
  useEffect(() => {
    if (!seriesRef.current || !data.length) return;

    // 渲染 K 线
    seriesRef.current.setData(data.slice(0, currentIndex + 1));

    // 渲染买卖点
    const currentTs = data[currentIndex].time;
    const markers = trades
      .filter((t: any) => {
        const tradeTime = t.timestamp ? t.timestamp / 1000 : new Date(t.datetime).getTime() / 1000;
        return tradeTime <= currentTs;
      })
      .map((t: any) => {
        const tradeTime = t.timestamp ? t.timestamp / 1000 : new Date(t.datetime).getTime() / 1000;
        const isBuy = t.side.toLowerCase() === 'buy';
        return {
          time: tradeTime,
          position: isBuy ? 'belowBar' : 'aboveBar',
          color: isBuy ? '#10B981' : '#EF4444',
          shape: isBuy ? 'arrowUp' : 'arrowDown',
          text: isBuy ? '买入' : '卖出',
        };
      });
    seriesRef.current.setMarkers(markers);
  }, [currentIndex, data, trades]);

  // 播放逻辑
  useEffect(() => {
    let interval: any;
    if (isPlaying && data && data.length > 0) {
      interval = setInterval(() => {
        setCurrentIndex(p => (p < data.length - 1 ? p + 1 : p));
      }, speed);
    }
    return () => clearInterval(interval);
  }, [isPlaying, speed, data?.length]);

  return (
    <div className="space-y-4">
      {/* 图表容器 */}
      <div className="glass-panel relative rounded-xl h-[500px] overflow-hidden group">
        <div ref={chartContainerRef} className="w-full h-full" />
        <div className="absolute top-4 left-4 bg-red-500/10 border border-red-500/20 text-red-400 px-3 py-1 rounded text-xs flex items-center gap-2 backdrop-blur-md">
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /> 实盘回放模式 (REPLAY)
        </div>
      </div>

      {/* 控制条 */}
      <div className="glass-panel p-4 rounded-xl flex items-center gap-6">
        <div className="flex items-center gap-2">
          <button onClick={() => setCurrentIndex(Math.max(0, currentIndex - 20))} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><Rewind size={20} /></button>
          <button onClick={() => setIsPlaying(!isPlaying)} className={`w-12 h-12 rounded-full flex items-center justify-center text-white shadow-lg transition-all ${isPlaying ? 'bg-amber-500 hover:bg-amber-400' : 'bg-blue-600 hover:bg-blue-500'}`}>
            {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" className="ml-1" />}
          </button>
          <button onClick={() => setCurrentIndex(Math.min(data.length - 1, currentIndex + 20))} className="p-2 text-gray-400 hover:text-white hover:bg-white/10 rounded-lg"><FastForward size={20} /></button>
        </div>

        <div className="flex-1 flex flex-col justify-center">
          <div className="flex justify-between text-[10px] text-gray-500 uppercase font-bold tracking-wider mb-1">
            <span>Timeline Progress</span>
            <span>{Math.round((currentIndex / (data.length || 1)) * 100)}%</span>
          </div>
          <input type="range" min="0" max={data.length - 1} value={currentIndex} onChange={e => setCurrentIndex(+e.target.value)} className="w-full h-2 rounded-lg cursor-pointer accent-blue-500" />
        </div>

        <div className="flex gap-1 bg-black/30 p-1 rounded-lg">
          {[1000, 200, 50].map(s => (
            <button key={s} onClick={() => setSpeed(s)} className={`px-3 py-1 text-xs rounded transition-all ${speed === s ? 'bg-gray-700 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}>
              {s === 1000 ? '1x' : s === 200 ? '5x' : '20x'}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};