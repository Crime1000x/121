import { PredictionFactor } from './index';

/**
 * 预测记录 - 用于追踪和分析
 */
export interface PredictionRecord {
  id: string;
  marketId: string;
  timestamp: number;
  
  // 比赛信息
  teamA: string;
  teamB: string;
  gameDate: string;
  isTeamAHome: boolean | null;
  
  // 预测数据
  predictedProbabilityA: number;
  confidence: number;
  factors: PredictionFactor[];
  modelVersion: string; // "v2.7", "v3.0"
  
  // 市场数据
  marketOddsA: number;
  marketOddsB: number;
  volumeUSD: number;
  
  // 实际结果（赛后填充）
  actualWinner?: 'teamA' | 'teamB';
  actualScoreA?: number;
  actualScoreB?: number;
  resultUpdatedAt?: number;
  
  // 计算指标
  predictionCorrect?: boolean;
  brierScore?: number; // (predicted - actual)^2
  logLoss?: number; // -log(predicted_prob_of_actual_outcome)
  expectedValue?: number; // EV = prob * odds - 1
}

/**
 * 模型整体表现指标
 */
export interface ModelPerformance {
  totalPredictions: number;
  accuracy: number; // % correct
  avgBrierScore: number; // Lower is better (0-1)
  avgLogLoss: number; // Lower is better
  calibrationScore: number; // How well calibrated (0-1, higher is better)
  
  // 按置信度分组
  byConfidence: {
    high: { accuracy: number; count: number }; // >0.8
    medium: { accuracy: number; count: number }; // 0.6-0.8
    low: { accuracy: number; count: number }; // <0.6
  };
  
  // 按市场价值分组
  byValue: {
    strongValue: { roi: number; count: number }; // >10% EV
    value: { roi: number; count: number }; // 5-10% EV
    fair: { roi: number; count: number }; // <5% EV
  };
  
  // 时间趋势
  last7Days: { date: string; accuracy: number; count: number }[];
  last30Days: { date: string; accuracy: number; count: number }[];
}

/**
 * 校准数据 - 用于调整预测概率
 */
export interface CalibrationData {
  predictedRange: [number, number]; // 如 [0.5, 0.6]
  actualWinRate: number; // 实际胜率
  sampleSize: number; // 样本量
}