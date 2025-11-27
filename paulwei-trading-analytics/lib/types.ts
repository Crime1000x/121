// ============ Symbol Mapping ============
export const SYMBOL_MAP: Record<string, string> = {
  'XBTUSD': 'BTCUSD',
  'XBTUSDT': 'BTCUSDT',
  'ETHUSD': 'ETHUSD',
  'ETHUSDT': 'ETHUSDT',
};

export function formatSymbol(symbol: string): string {
  return SYMBOL_MAP[symbol] || symbol.replace('XBT', 'BTC');
}

export function toInternalSymbol(displaySymbol: string): string {
  return displaySymbol.replace('BTC', 'XBT');
}

// ============ Base Types ============

// K 线数据接口 (用于 TVChart 和 Replay)
export interface OHLCV {
  time: number; // Unix timestamp (seconds)
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface Execution {
  execID: string;
  orderID: string;
  symbol: string;
  displaySymbol: string;
  side: 'Buy' | 'Sell';
  lastQty: number;
  lastPx: number;
  execType: 'Trade' | 'Funding' | 'Settlement' | 'Canceled' | 'New' | 'Replaced';
  ordType: string;
  ordStatus: string;
  execCost: number;
  execComm: number;
  timestamp: string;
  text: string;
}

export interface Trade {
  id: string;
  datetime: string; // ISO string
  timestamp: number; // Unix timestamp (ms) - 新增：方便图表快速索引
  symbol: string;
  displaySymbol: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  cost: number;
  fee: {
    cost: number;
    currency: string;
  };
  orderID: string;
  execType: string;
  executionCount?: number;
}

export interface Order {
  orderID: string;
  symbol: string;
  displaySymbol: string;
  side: 'Buy' | 'Sell';
  ordType: 'Limit' | 'Market' | 'Stop' | 'StopLimit';
  orderQty: number;
  price: number | null;
  stopPx: number | null;
  avgPx: number | null;
  cumQty: number;
  ordStatus: 'Filled' | 'Canceled' | 'Rejected' | 'New' | 'PartiallyFilled';
  timestamp: string;
  text: string;
}

export interface WalletTransaction {
  transactID: string;
  account: number;
  currency: string;
  transactType: 'RealisedPNL' | 'Funding' | 'Deposit' | 'Withdrawal' | 'UnrealisedPNL' | 'AffiliatePayout' | 'Transfer';
  amount: number;
  fee: number;
  transactStatus: string;
  address: string;
  tx: string;
  text: string;
  timestamp: string;
  walletBalance: number;
  marginBalance: number | null;
}

export interface AccountSummary {
  exportDate: string;
  user: {
    id: number;
    username: string;
    email: string;
  };
  wallet: {
    walletBalance: number | null;
    marginBalance: number;
    availableMargin: number;
    unrealisedPnl: number;
    realisedPnl: number;
  };
  positions: {
    symbol: string;
    displaySymbol: string;
    currentQty: number;
    avgEntryPrice: number;
    unrealisedPnl: number;
    liquidationPrice: number;
  }[];
}

export interface TradingStats {
  totalTrades: number;
  totalOrders: number;
  filledOrders: number;
  canceledOrders: number;
  rejectedOrders: number;
  fillRate: number;
  cancelRate: number;
  limitOrders: number;
  marketOrders: number;
  stopOrders: number;
  limitOrderPercent: number;
  totalRealizedPnl: number;
  totalFunding: number;
  totalFees: number;
  netPnl: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  profitFactor: number;
  fundingPaid: number;
  fundingReceived: number;
  tradingDays: number;
  avgTradesPerDay: number;
  monthlyPnl: { month: string; pnl: number; funding: number; trades: number }[];
}

// ============ Position Session Types (核心升级) ============

export interface PositionSession {
  id: string;
  symbol: string;
  displaySymbol: string;
  side: 'long' | 'short';
  openTime: string;
  closeTime: string | null;
  durationMs: number;
  maxSize: number;
  totalBought: number;
  totalSold: number;
  avgEntryPrice: number;
  avgExitPrice: number;
  realizedPnl: number;
  totalFees: number;
  netPnl: number;
  tradeCount: number;
  trades: Trade[];
  status: 'open' | 'closed';

  // --- 新增：高级风控与策略分析字段 ---
  mae?: number;          // Maximum Adverse Excursion (最大回撤幅度 %)
  mfe?: number;          // Maximum Favorable Excursion (最大浮盈幅度 %)
  efficiency?: number;   // 进场效率评分 (0-1)
  strategyTags?: string[]; // AI 分析的策略标签 (如: "抄底", "追涨", "止损")
}

// ============ Utility Functions ============

export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) {
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}