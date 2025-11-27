import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

// --- 配置路径 ---
const TRADES_FILE = path.join(process.cwd(), 'bitmex_trades.csv');
// 注意：确保 data/ohlcv/ 目录下有对应的 K 线文件，如果没有请改为你实际存在的文件名
const OHLCV_FILE = path.join(process.cwd(), 'data/ohlcv/XBTUSD_1m.csv'); 
const OUTPUT_FILE = path.join(process.cwd(), 'public/enriched_positions.json');

console.log('🚀 开始全量数据分析任务...');

// 辅助函数：读取 CSV
const readCsv = (filePath: string) => {
  if (!fs.existsSync(filePath)) {
    console.warn(`⚠️ Warning: 文件不存在 ${filePath}`);
    return [];
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return parse(content, { columns: true, skip_empty_lines: true });
};

// 1. 读取数据
const rawTrades = readCsv(TRADES_FILE);
const rawCandles = readCsv(OHLCV_FILE);

console.log(`📊 读取到 ${rawTrades.length} 条交易记录`);
console.log(`📈 读取到 ${rawCandles.length} 根 K 线数据`);

if (rawTrades.length === 0) {
    console.error('❌ 错误: 没有交易数据，请检查 bitmex_trades.csv 是否在根目录');
    process.exit(1);
}

// 转换 K 线数据以便快速查找
const candles = rawCandles.map((c: any) => ({
  time: new Date(c.timestamp).getTime(),
  high: parseFloat(c.high),
  low: parseFloat(c.low),
  close: parseFloat(c.close),
})).sort((a: any, b: any) => a.time - b.time);

// 2. 简易仓位合成逻辑 (用于生成演示数据)
// 实际生产中应复用 lib/position_calculator.ts，这里为了脚本独立性做简化处理
let positions: any[] = [];
let currentPos: any = null;

// 按时间排序
rawTrades.sort((a: any, b: any) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

rawTrades.forEach((trade: any, index: number) => {
  const size = parseFloat(trade.size || trade.amount); // 兼容不同 CSV 头部
  const price = parseFloat(trade.price);
  const side = trade.side; // Buy or Sell
  const time = new Date(trade.timestamp).getTime();

  if (!currentPos) {
    currentPos = {
      id: `POS-${String(index).padStart(5, '0')}`,
      symbol: trade.symbol || 'XBTUSD',
      side: side === 'Buy' ? 'Long' : 'Short',
      avgEntryPrice: price,
      qty: size,
      maxQty: size,
      entryTime: time,
      trades: [trade],
      status: 'Open'
    };
  } else {
    const isClosing = (currentPos.side === 'Long' && side === 'Sell') || (currentPos.side === 'Short' && side === 'Buy');
    
    if (isClosing) {
      currentPos.qty -= size;
      currentPos.trades.push(trade);
      if (currentPos.qty <= 0) {
        // 平仓
        currentPos.closeTime = time;
        currentPos.avgExitPrice = price;
        currentPos.status = 'Closed';
        
        // 计算 PnL (简化)
        const entryVal = currentPos.avgEntryPrice * currentPos.maxQty;
        const exitVal = currentPos.avgExitPrice * currentPos.maxQty;
        currentPos.pnl = currentPos.side === 'Long' ? (exitVal - entryVal) : (entryVal - exitVal);
        
        positions.push(currentPos);
        currentPos = null;
      }
    } else {
      // 加仓
      const totalVal = (currentPos.avgEntryPrice * currentPos.qty) + (price * size);
      currentPos.qty += size;
      currentPos.maxQty = Math.max(currentPos.maxQty, currentPos.qty);
      currentPos.avgEntryPrice = totalVal / currentPos.qty;
      currentPos.trades.push(trade);
    }
  }
});

console.log(`✅ 合成了 ${positions.length} 个历史仓位`);

// 3. 核心计算：MAE / MFE & AI Tags
console.log('🧠 正在计算 MAE/MFE 风控指标...');

const enrichedPositions = positions.map(pos => {
  if (pos.status !== 'Closed') return pos;
  
  // 获取持仓期间的 K 线
  const periodCandles = candles.filter((c: any) => c.time >= pos.entryTime && c.time <= pos.closeTime);
  
  // 如果找不到对应 K 线 (可能是数据缺失)，给默认值
  if (periodCandles.length === 0) {
      return { ...pos, mae: 0, mfe: 0, efficiency: 0.5, strategyTags: [] };
  }

  const maxPrice = Math.max(...periodCandles.map((c: any) => c.high));
  const minPrice = Math.min(...periodCandles.map((c: any) => c.low));
  const entry = pos.avgEntryPrice;

  let mae = 0; // 不利方向最大偏差
  let mfe = 0; // 有利方向最大偏差

  if (pos.side === 'Long') {
    mae = (entry - minPrice) / entry * 100;
    mfe = (maxPrice - entry) / entry * 100;
  } else {
    mae = (maxPrice - entry) / entry * 100;
    mfe = (entry - minPrice) / entry * 100;
  }

  // 进场效率 (0-1)
  const efficiency = (mae + mfe) === 0 ? 0 : mfe / (mae + mfe);

  // AI 规则打标
  const tags = [];
  if (Math.abs(mae) < 0.3 && mfe > 2) tags.push('🎯 神级切入');
  if (mae > 3 && pos.pnl > 0) tags.push('😅 扛单反杀');
  if (mfe > 5 && pos.pnl < 0) tags.push('📉 过山车');
  if (mfe > 10) tags.push('🚀 趋势大单');
  if (pos.duration < 60 * 1000 * 5) tags.push('⚡ 超短线');

  return {
    ...pos,
    mae,
    mfe,
    efficiency,
    strategyTags: tags
  };
});

// 4. 保存结果
// 确保 public 目录存在
if (!fs.existsSync(path.join(process.cwd(), 'public'))) {
    fs.mkdirSync(path.join(process.cwd(), 'public'));
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(enrichedPositions, null, 2));
console.log(`🎉 分析完成！数据已保存至: ${OUTPUT_FILE}`);
console.log('👉 现在你可以运行 npm run dev 启动网站了');