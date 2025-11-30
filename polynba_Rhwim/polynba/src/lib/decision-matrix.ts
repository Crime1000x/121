/**
 * AI 预测 vs 大户持仓 - 决策矩阵
 * 
 * 这个文件展示了如何根据 AI 预测和大户持仓的组合，
 * 生成不同的投资建议
 */

export type InvestmentSignal = 
  | 'STRONG_BUY_A'
  | 'MODERATE_BUY_A'
  | 'WEAK_BUY_A'
  | 'NEUTRAL'
  | 'WEAK_BUY_B'
  | 'MODERATE_BUY_B'
  | 'STRONG_BUY_B'
  | 'CONFLICT_WARNING';

export interface DecisionMatrix {
  aiPrediction: number;        // 0-1
  smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL';
  whaleConcentration: number;  // 0-100%
  signal: InvestmentSignal;
  confidence: number;          // 0-100%
  reasoning: string;
}

/**
 * 决策矩阵算法
 */
export function generateInvestmentSignal(
  aiPredictionA: number,
  smartMoneyDirection: 'YES' | 'NO' | 'NEUTRAL',
  whaleConcentration: number,
  teamAName: string,
  teamBName: string
): DecisionMatrix {
  
  // 1. 计算 AI 偏好强度
  const aiStrength = Math.abs(aiPredictionA - 0.5) * 2; // 0-1
  const aiDirection = aiPredictionA > 0.5 ? 'YES' : 'NO';
  
  // 2. 判断一致性
  const isConsistent = 
    (aiDirection === 'YES' && smartMoneyDirection === 'YES') ||
    (aiDirection === 'NO' && smartMoneyDirection === 'NO');
  
  const isConflict = 
    (aiDirection === 'YES' && smartMoneyDirection === 'NO') ||
    (aiDirection === 'NO' && smartMoneyDirection === 'YES');
  
  // 3. 决策逻辑
  let signal: InvestmentSignal = 'NEUTRAL';
  let confidence = 50;
  let reasoning = '';
  
  // 情况 1: AI + 大户一致，且 AI 强度高
  if (isConsistent && aiStrength > 0.3) {
    if (aiDirection === 'YES') {
      signal = aiStrength > 0.5 ? 'STRONG_BUY_A' : 'MODERATE_BUY_A';
      confidence = 70 + aiStrength * 30;
      reasoning = `AI 和聪明钱一致看好 ${teamAName}，胜率预测 ${(aiPredictionA * 100).toFixed(1)}%`;
    } else {
      signal = aiStrength > 0.5 ? 'STRONG_BUY_B' : 'MODERATE_BUY_B';
      confidence = 70 + aiStrength * 30;
      reasoning = `AI 和聪明钱一致看好 ${teamBName}，胜率预测 ${((1 - aiPredictionA) * 100).toFixed(1)}%`;
    }
  }
  
  // 情况 2: AI + 大户冲突
  else if (isConflict) {
    signal = 'CONFLICT_WARNING';
    confidence = 30;
    
    if (whaleConcentration > 50) {
      reasoning = `⚠️ 警告：AI 看好 ${aiDirection === 'YES' ? teamAName : teamBName}，但大户持仓相反。且市场高度集中（${whaleConcentration.toFixed(1)}%），可能存在内幕信息或操纵风险。建议观望。`;
    } else {
      reasoning = `⚠️ 分歧：AI 看好 ${aiDirection === 'YES' ? teamAName : teamBName}，但大户持仓偏好 ${smartMoneyDirection === 'YES' ? teamAName : teamBName}。建议谨慎决策或小额尝试。`;
    }
  }
  
  // 情况 3: 大户中立，依赖 AI
  else if (smartMoneyDirection === 'NEUTRAL') {
    if (aiStrength > 0.4) {
      signal = aiDirection === 'YES' ? 'MODERATE_BUY_A' : 'MODERATE_BUY_B';
      confidence = 55 + aiStrength * 20;
      reasoning = `大户持仓分散，主要依据 AI 预测。模型看好 ${aiDirection === 'YES' ? teamAName : teamBName}。`;
    } else {
      signal = 'NEUTRAL';
      confidence = 50;
      reasoning = `AI 和大户都显示均衡，可能是高度竞争的比赛。建议观望或对冲。`;
    }
  }
  
  // 情况 4: AI 弱信号，大户有方向
  else if (aiStrength < 0.2) {
    if (smartMoneyDirection === 'YES') {
      signal = whaleConcentration > 40 ? 'MODERATE_BUY_A' : 'WEAK_BUY_A';
      confidence = 55 + (whaleConcentration / 100) * 20;
      reasoning = `AI 信号弱，但聪明钱明显偏好 ${teamAName}。集中度 ${whaleConcentration.toFixed(1)}%。`;
    } else {
      signal = whaleConcentration > 40 ? 'MODERATE_BUY_B' : 'WEAK_BUY_B';
      confidence = 55 + (whaleConcentration / 100) * 20;
      reasoning = `AI 信号弱，但聪明钱明显偏好 ${teamBName}。集中度 ${whaleConcentration.toFixed(1)}%。`;
    }
  }
  
  return {
    aiPrediction: aiPredictionA,
    smartMoneyDirection,
    whaleConcentration,
    signal,
    confidence,
    reasoning,
  };
}

/**
 * 信号强度映射
 */
export const SIGNAL_STRENGTH_MAP: Record<InvestmentSignal, {
  level: number;
  color: string;
  label: string;
  emoji: string;
}> = {
  'STRONG_BUY_A': {
    level: 5,
    color: 'text-green-400',
    label: '强烈买入 (Team A)',
    emoji: '🚀',
  },
  'MODERATE_BUY_A': {
    level: 4,
    color: 'text-green-500',
    label: '适度买入 (Team A)',
    emoji: '📈',
  },
  'WEAK_BUY_A': {
    level: 3,
    color: 'text-blue-400',
    label: '谨慎买入 (Team A)',
    emoji: '💡',
  },
  'NEUTRAL': {
    level: 2,
    color: 'text-yellow-400',
    label: '中立/观望',
    emoji: '⚖️',
  },
  'WEAK_BUY_B': {
    level: 3,
    color: 'text-blue-400',
    label: '谨慎买入 (Team B)',
    emoji: '💡',
  },
  'MODERATE_BUY_B': {
    level: 4,
    color: 'text-red-500',
    label: '适度买入 (Team B)',
    emoji: '📉',
  },
  'STRONG_BUY_B': {
    level: 5,
    color: 'text-red-400',
    label: '强烈买入 (Team B)',
    emoji: '🔻',
  },
  'CONFLICT_WARNING': {
    level: 1,
    color: 'text-orange-400',
    label: '⚠️ 信号冲突',
    emoji: '⚠️',
  },
};

/**
 * 使用示例
 */
export function exampleUsage() {
  const decision = generateInvestmentSignal(
    0.72,     // AI 预测 Lakers 72% 胜率
    'YES',    // 大户也看好 Lakers
    45.5,     // 前3名大户控制 45.5% 筹码
    'Lakers',
    'Warriors'
  );
  
  console.log('投资信号:', decision.signal);
  console.log('置信度:', decision.confidence);
  console.log('推理:', decision.reasoning);
  
  const meta = SIGNAL_STRENGTH_MAP[decision.signal];
  console.log('标签:', meta.label, meta.emoji);
}

/**
 * 决策矩阵可视化
 */
export const DECISION_MATRIX_TABLE = `
┌────────────────────────────────────────────────────────────────────────────┐
│                      AI vs 大户 - 决策矩阵                                 │
├────────────────────────┬────────────────────────┬─────────────────────────┤
│    AI 预测强度         │    聪明钱方向          │    推荐信号             │
├────────────────────────┼────────────────────────┼─────────────────────────┤
│ 强 (>65%)              │ 一致                   │ 🚀 强烈买入             │
│ 强 (>65%)              │ 冲突                   │ ⚠️ 信号冲突 (观望)     │
│ 强 (>65%)              │ 中立                   │ 📈 适度买入             │
├────────────────────────┼────────────────────────┼─────────────────────────┤
│ 中 (55-65%)            │ 一致                   │ 📈 适度买入             │
│ 中 (55-65%)            │ 冲突                   │ ⚠️ 信号冲突 (小额)     │
│ 中 (55-65%)            │ 中立                   │ 💡 谨慎买入             │
├────────────────────────┼────────────────────────┼─────────────────────────┤
│ 弱 (<55%)              │ 一致                   │ 💡 谨慎买入             │
│ 弱 (<55%)              │ 冲突                   │ ⚖️ 中立 (观望)         │
│ 弱 (<55%)              │ 中立                   │ ⚖️ 中立 (观望)         │
└────────────────────────┴────────────────────────┴─────────────────────────┘

特殊情况：
- 集中度 > 50%：降低信号强度，增加风险提示
- 集中度 < 20%：提高信号可靠性
`;

/**
 * 实战案例分析
 */
export const CASE_STUDIES = [
  {
    scenario: '完美一致',
    aiPrediction: 0.75,
    smartMoney: 'YES' as const,
    concentration: 35,
    result: {
      signal: 'STRONG_BUY_A' as InvestmentSignal,
      confidence: 85,
      action: '大额买入 Team A',
    },
  },
  {
    scenario: '严重冲突 + 高集中',
    aiPrediction: 0.70,
    smartMoney: 'NO' as const,
    concentration: 65,
    result: {
      signal: 'CONFLICT_WARNING' as InvestmentSignal,
      confidence: 25,
      action: '观望，可能有内幕',
    },
  },
  {
    scenario: 'AI 弱 + 大户明确',
    aiPrediction: 0.52,
    smartMoney: 'YES' as const,
    concentration: 45,
    result: {
      signal: 'MODERATE_BUY_A' as InvestmentSignal,
      confidence: 60,
      action: '跟随聪明钱',
    },
  },
  {
    scenario: '双方均衡',
    aiPrediction: 0.51,
    smartMoney: 'NEUTRAL' as const,
    concentration: 25,
    result: {
      signal: 'NEUTRAL' as InvestmentSignal,
      confidence: 50,
      action: '高度竞争，对冲或观望',
    },
  },
];