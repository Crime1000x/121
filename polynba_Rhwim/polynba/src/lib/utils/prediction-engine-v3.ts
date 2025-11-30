/**
 * 预测引擎 V3.0 - 优化版
 * 
 * 核心改进：
 * 1. 动态 K 值（根据数据质量调整）
 * 2. 因素交互效应（协同加成）
 * 3. 历史校准（使用实际数据修正）
 * 4. 贝叶斯更新（结合市场智慧）
 */

// ==================== 导入类型（从类型文件导入，不在这里定义） ====================
import { H2HStats, AdvancedTeamStats, TeamInjuries, PredictionFactor, PredictionResult } from '@/types';
import { CalibrationData } from '@/types/analytics';
import { PREDICTION_CONSTANTS, MODEL_VERSION } from '@/lib/constants/prediction-constants';

// ==================== 校准数据表 ====================
// 这个表需要定期用历史数据更新
const CALIBRATION_TABLE: CalibrationData[] = [
  { predictedRange: [0.0, 0.4], actualWinRate: 0.35, sampleSize: 50 },
  { predictedRange: [0.4, 0.5], actualWinRate: 0.45, sampleSize: 80 },
  { predictedRange: [0.5, 0.6], actualWinRate: 0.55, sampleSize: 100 },
  { predictedRange: [0.6, 0.7], actualWinRate: 0.65, sampleSize: 90 },
  { predictedRange: [0.7, 1.0], actualWinRate: 0.75, sampleSize: 60 },
];

/**
 * 主预测函数
 */
export function generatePrediction(
  teamA: string,
  teamB: string,
  h2hStats: H2HStats | null,
  advancedStatsA: AdvancedTeamStats | null,
  advancedStatsB: AdvancedTeamStats | null,
  injuriesA: TeamInjuries | null,
  injuriesB: TeamInjuries | null,
  polymarketOdds: { yes: number; no: number },
  restDaysA: number = 3,
  restDaysB: number = 3,
  isTeamAHome: boolean | null = null
): PredictionResult {
  console.log(`🔮 [V3.0] Generating prediction for ${teamA} vs ${teamB}`);

  const factors: PredictionFactor[] = [];

  // ============ 因素 1: 球队实力 ============
  if (advancedStatsA?.nbaRating && advancedStatsB?.nbaRating) {
    const ratingDiff = advancedStatsA.nbaRating - advancedStatsB.nbaRating;
    const ratingScore = clampScore(ratingDiff * PREDICTION_CONSTANTS.MULTIPLIERS.RATING);

    factors.push({
      name: '球队实力评分',
      score: ratingScore,
      weight: PREDICTION_CONSTANTS.WEIGHTS.TEAM_STRENGTH,
      description: `${teamA} Rating ${advancedStatsA.nbaRating.toFixed(1)} vs ${teamB} ${advancedStatsB.nbaRating.toFixed(1)}`,
      icon: '⭐',
    });
  }

  // ============ 因素 2: 近期状态 ============
  if (h2hStats?.recentForm) {
    const formA = analyzeRecentForm(h2hStats.recentForm.teamA);
    const formB = analyzeRecentForm(h2hStats.recentForm.teamB);
    const formScore = (formA - formB) * PREDICTION_CONSTANTS.MULTIPLIERS.FORM;

    factors.push({
      name: '近期状态',
      score: formScore,
      weight: PREDICTION_CONSTANTS.WEIGHTS.RECENT_FORM,
      description: `${teamA} 近5场 ${formA.toFixed(1)}胜, ${teamB} 近5场 ${formB.toFixed(1)}胜`,
      icon: '📈',
    });
  }

  // ============ 因素 3: 伤病影响 ============
  const injuryImpact = calculateInjuryImpact(injuriesA, injuriesB);
  if (injuryImpact.score !== 0) {
    factors.push({
      name: '伤病影响',
      score: injuryImpact.score,
      weight: PREDICTION_CONSTANTS.WEIGHTS.INJURY_IMPACT,
      description: injuryImpact.description,
      icon: '🏥',
    });
  }

  // ============ 因素 4: 历史交锋 ============
  if (h2hStats && h2hStats.totalGames > 0) {
    const h2hScore = (h2hStats.teamAWinRate - 0.5) * 150;
    factors.push({
      name: '历史交锋',
      score: clampScore(h2hScore),
      weight: PREDICTION_CONSTANTS.WEIGHTS.HEAD_TO_HEAD,
      description: `过去 ${h2hStats.totalGames} 场交手 ${teamA} 胜率 ${(h2hStats.teamAWinRate * 100).toFixed(0)}%`,
      icon: '📊',
    });
  }

  // ============ 因素 5: 进攻火力 ============
  if (advancedStatsA?.effectiveFGPct && advancedStatsB?.effectiveFGPct) {
    const offenseDiff = (advancedStatsA.effectiveFGPct - advancedStatsB.effectiveFGPct) * PREDICTION_CONSTANTS.MULTIPLIERS.OFFENSE;
    const offenseScore = clampScore(offenseDiff);

    factors.push({
      name: '进攻火力',
      score: offenseScore,
      weight: PREDICTION_CONSTANTS.WEIGHTS.OFFENSE_POWER,
      description: `eFG%: ${teamA} ${advancedStatsA.effectiveFGPct.toFixed(1)}% vs ${teamB} ${advancedStatsB.effectiveFGPct.toFixed(1)}%`,
      icon: '🎯',
    });
  }

  // ============ 因素 6: 体能优势 ============
  const fatigueScore = calculateFatigueScore(restDaysA, restDaysB);
  factors.push({
    name: '体能优势',
    score: fatigueScore.score,
    weight: PREDICTION_CONSTANTS.WEIGHTS.FATIGUE,
    description: fatigueScore.description,
    icon: '🔋',
  });

  // ============ 因素 7: 主场优势 ============
  const homeAdvantageScore = calculateHomeAdvantageScore(isTeamAHome);
  if (homeAdvantageScore.score !== 0) {
    factors.push({
      name: '主场优势',
      score: homeAdvantageScore.score,
      weight: PREDICTION_CONSTANTS.WEIGHTS.HOME_ADVANTAGE,
      description: homeAdvantageScore.description,
      icon: '🏠',
    });
  }

  // ============ 计算加权总分 ============
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce((sum, f) => sum + f.score * f.weight, 0) / totalWeight;

  // ============ 协同效应加成 ============
  const synergyBonus = calculateSynergyBonus(factors, isTeamAHome, restDaysA, restDaysB);
  const finalScore = weightedScore + synergyBonus;

  console.log(`📊 Scores - Weighted: ${weightedScore.toFixed(2)}, Synergy: ${synergyBonus.toFixed(2)}, Final: ${finalScore.toFixed(2)}`);

  // ============ 计算置信度 ============
  const confidence = calculateConfidence(factors, h2hStats, advancedStatsA);

  // ============ 动态 K 值 ============
  const kValue = calculateDynamicK(confidence, factors.length);

  // ============ Sigmoid 转换 ============
  const rawProbability = sigmoid(finalScore, kValue);

  // ============ 历史校准 ============
  const calibratedProbability = calibrateProbability(rawProbability);

  // ============ 贝叶斯更新 ============
  const finalProbability = bayesianUpdate(
    calibratedProbability,
    polymarketOdds.yes,
    h2hStats?.teamAWinRate || null,
    confidence
  );

  const teamAProbability = clampProbability(finalProbability);
  const teamBProbability = 1 - teamAProbability;

  // ============ 生成推荐 ============
  const recommendation = generateRecommendation(teamAProbability, confidence);
  const marketValue = analyzeMarketValue(teamAProbability, polymarketOdds.yes);
  const reasoning = generateReasoning(
    factors,
    teamA,
    teamB,
    teamAProbability,
    marketValue,
    polymarketOdds,
    synergyBonus
  );

  console.log(`✅ [V3.0] Prediction: ${teamA} ${(teamAProbability * 100).toFixed(1)}% | Confidence: ${(confidence * 100).toFixed(0)}% | ${recommendation}`);

  return {
    teamAProbability,
    teamBProbability,
    confidence,
    factors: factors.sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)),
    recommendation,
    marketValue,
    reasoning,
    modelVersion: MODEL_VERSION,
  };
}

// ==================== 辅助函数 ====================

/**
 * 限制分数范围
 */
function clampScore(score: number): number {
  return Math.max(
    PREDICTION_CONSTANTS.SCORE_BOUNDS.MIN,
    Math.min(PREDICTION_CONSTANTS.SCORE_BOUNDS.MAX, score)
  );
}

/**
 * 限制概率范围
 */
function clampProbability(prob: number): number {
  return Math.max(0.05, Math.min(0.95, prob));
}

/**
 * Sigmoid 函数
 */
function sigmoid(x: number, k: number): number {
  return 1 / (1 + Math.exp(-x / k));
}

/**
 * 分析近期状态
 */
function analyzeRecentForm(form: string): number {
  if (!form) return 2.5; // 默认中等状态
  const wins = form.split('').filter(c => c === 'W').length;
  return wins;
}

/**
 * 计算伤病影响
 */
function calculateInjuryImpact(
  injuriesA: TeamInjuries | null,
  injuriesB: TeamInjuries | null
): { score: number; description: string } {
  const scoreA = calculateTeamInjuryScore(injuriesA);
  const scoreB = calculateTeamInjuryScore(injuriesB);
  const score = scoreA - scoreB;

  let desc = '伤病影响较小';
  if (Math.abs(score) > 15) {
    const betterTeam = score > 0 ? injuriesA?.teamName : injuriesB?.teamName;
    desc = `${betterTeam} 阵容更完整`;
  }

  return { score: clampScore(score), description: desc };
}

function calculateTeamInjuryScore(injuries: TeamInjuries | null): number {
  if (!injuries || injuries.injuries.length === 0) return 0;

  let score = 0;
  injuries.injuries.forEach(inj => {
    const status = typeof inj.status === 'string' ? inj.status.toLowerCase() : '';

    if (status.includes('out')) {
      score += PREDICTION_CONSTANTS.INJURY_WEIGHTS.OUT;
    } else if (status.includes('doubtful')) {
      score += PREDICTION_CONSTANTS.INJURY_WEIGHTS.DOUBTFUL;
    } else if (status.includes('questionable')) {
      score += PREDICTION_CONSTANTS.INJURY_WEIGHTS.QUESTIONABLE;
    } else if (status.includes('day-to-day')) {
      score += PREDICTION_CONSTANTS.INJURY_WEIGHTS.DAY_TO_DAY;
    }
  });

  return score;
}

/**
 * 计算体能优势
 */
function calculateFatigueScore(
  restA: number,
  restB: number
): { score: number; description: string } {
  const getRestValue = (days: number) => {
    if (days <= 1) return PREDICTION_CONSTANTS.REST_VALUES.BACK_TO_BACK;
    if (days === 2) return PREDICTION_CONSTANTS.REST_VALUES.ONE_DAY;
    if (days === 3) return PREDICTION_CONSTANTS.REST_VALUES.TWO_DAYS;
    return PREDICTION_CONSTANTS.REST_VALUES.THREE_PLUS;
  };

  const valA = getRestValue(restA);
  const valB = getRestValue(restB);
  const score = clampScore((valA - valB) * 2);

  let desc = '双方体能状况相当';
  if (restA <= 1 && restB > 1) desc = `背靠背作战，体能劣势`;
  else if (restB <= 1 && restA > 1) desc = `对手背靠背，体能优势`;
  else if (restA > restB + 1) desc = `获得更多休息时间`;
  else if (restB > restA + 1) desc = `对手获得更多休息时间`;

  return { score, description: desc };
}

/**
 * 计算主场优势
 */
function calculateHomeAdvantageScore(
  isTeamAHome: boolean | null
): { score: number; description: string } {
  if (isTeamAHome === null) {
    return { score: 0, description: '主客场信息未知' };
  }

  const score = isTeamAHome
    ? PREDICTION_CONSTANTS.HOME_ADVANTAGE_POINTS
    : -PREDICTION_CONSTANTS.HOME_ADVANTAGE_POINTS;

  const desc = isTeamAHome
    ? '享有主场优势'
    : '客场作战，无主场优势';

  return { score, description: desc };
}

/**
 * 计算协同效应
 */
function calculateSynergyBonus(
  factors: PredictionFactor[],
  isTeamAHome: boolean | null,
  restA: number,
  restB: number
): number {
  let bonus = 0;

  // 主场 + 充足休息
  if (isTeamAHome === true && restA >= 3 && restB <= 1) {
    bonus += PREDICTION_CONSTANTS.SYNERGY.HOME_PLUS_RESTED;
    console.log('⚡ Synergy: Home + Rested', { bonus });
  } else if (isTeamAHome === false && restB >= 3 && restA <= 1) {
    bonus -= PREDICTION_CONSTANTS.SYNERGY.HOME_PLUS_RESTED;
    console.log('⚡ Synergy: Away + Opponent Rested', { bonus });
  }

  // 伤病 + 疲劳（负面叠加）
  const injuryFactor = factors.find(f => f.name === '伤病影响');
  if (injuryFactor && injuryFactor.score < -20) {
    if (restA <= 1) {
      bonus += PREDICTION_CONSTANTS.SYNERGY.INJURY_PLUS_TIRED;
      console.log('⚡ Negative synergy: Injury + Tired', { bonus });
    } else if (restB <= 1) {
      bonus -= PREDICTION_CONSTANTS.SYNERGY.INJURY_PLUS_TIRED;
      console.log('⚡ Negative synergy: Opponent Injury + Tired', { bonus });
    }
  }

  return bonus;
}

/**
 * 动态 K 值
 */
function calculateDynamicK(confidence: number, factorCount: number): number {
  const confidenceMultiplier = 0.7 + 0.6 * (1 - confidence);
  const factorMultiplier = Math.max(0.8, 1 - (factorCount - 5) * 0.05);

  const kValue =
    PREDICTION_CONSTANTS.SIGMOID.BASE_K_VALUE *
    confidenceMultiplier *
    factorMultiplier;

  return Math.max(
    PREDICTION_CONSTANTS.SIGMOID.MIN_K,
    Math.min(PREDICTION_CONSTANTS.SIGMOID.MAX_K, kValue)
  );
}

/**
 * 历史校准
 */
function calibrateProbability(rawProb: number): number {
  const calibration = CALIBRATION_TABLE.find(
    c => rawProb >= c.predictedRange[0] && rawProb < c.predictedRange[1]
  );

  if (!calibration || calibration.sampleSize < 30) {
    return rawProb;
  }

  const [min, max] = calibration.predictedRange;
  const adjustment = calibration.actualWinRate - (min + max) / 2;

  return clampProbability(rawProb + adjustment);
}

/**
 * 贝叶斯更新
 */
function bayesianUpdate(
  modelPrediction: number,
  marketOdds: number,
  historicalH2H: number | null,
  confidence: number
): number {
  const priorWeight = PREDICTION_CONSTANTS.BAYESIAN.PRIOR_WEIGHT_BASE * (1 - confidence);
  const modelWeight = PREDICTION_CONSTANTS.BAYESIAN.MODEL_WEIGHT_BASE * confidence;
  const h2hWeight = historicalH2H ? PREDICTION_CONSTANTS.BAYESIAN.H2H_WEIGHT : 0;

  const totalWeight = priorWeight + modelWeight + h2hWeight;

  const posterior =
    (marketOdds * priorWeight +
      modelPrediction * modelWeight +
      (historicalH2H || 0.5) * h2hWeight) /
    totalWeight;

  return clampProbability(posterior);
}

/**
 * 计算置信度
 */
function calculateConfidence(
  factors: PredictionFactor[],
  h2h: H2HStats | null,
  advanced: AdvancedTeamStats | null
): number {
  let confidence = 0.6;

  if (h2h) confidence += 0.1;
  if (advanced) confidence += 0.15;

  // 因子一致性
  let positiveCount = 0;
  let negativeCount = 0;

  factors.forEach(f => {
    if (f.score > 10) positiveCount++;
    if (f.score < -10) negativeCount++;
  });

  if ((positiveCount > 0 && negativeCount === 0) || (negativeCount > 0 && positiveCount === 0)) {
    confidence += 0.1;
  }

  return Math.min(0.98, confidence);
}

/**
 * 生成推荐
 */
function generateRecommendation(
  prob: number,
  conf: number
): PredictionResult['recommendation'] {
  if (conf < 0.7) return 'NEUTRAL';

  if (prob > PREDICTION_CONSTANTS.RECOMMENDATION.STRONG_A) return 'STRONG_A';
  if (prob > PREDICTION_CONSTANTS.RECOMMENDATION.LEAN_A) return 'LEAN_A';
  if (prob < PREDICTION_CONSTANTS.RECOMMENDATION.STRONG_B) return 'STRONG_B';
  if (prob < PREDICTION_CONSTANTS.RECOMMENDATION.LEAN_B) return 'LEAN_B';

  return 'NEUTRAL';
}

/**
 * 分析市场价值
 */
function analyzeMarketValue(
  predictedProb: number,
  marketProb: number
): PredictionResult['marketValue'] {
  const diff = predictedProb - marketProb;

  if (diff > PREDICTION_CONSTANTS.VALUE_THRESHOLD.MODERATE) return 'VALUE_A';
  if (diff < -PREDICTION_CONSTANTS.VALUE_THRESHOLD.MODERATE) return 'VALUE_B';

  return 'FAIR';
}

/**
 * 生成推理说明
 */
function generateReasoning(
  factors: PredictionFactor[],
  teamA: string,
  teamB: string,
  prob: number,
  value: string,
  odds: { yes: number; no: number },
  synergyBonus: number
): string[] {
  const reasons: string[] = [];

  const favoredTeam = prob > 0.5 ? teamA : teamB;
  const winRate = prob > 0.5 ? prob : 1 - prob;

  reasons.push(
    `模型预测 ${favoredTeam} 胜率为 ${(winRate * 100).toFixed(1)}%，${
      value.includes('VALUE') ? '存在显著市场价值' : '与市场预期接近'
    }。`
  );

  // 关键因素
  const topFactors = factors.filter(f => Math.abs(f.score) > 20).slice(0, 2);
  topFactors.forEach(f => {
    const team = f.score > 0 ? teamA : teamB;
    reasons.push(`${f.icon} ${f.name}: ${team} 占据优势 (${f.description})`);
  });

  // 协同效应
  if (Math.abs(synergyBonus) > 5) {
    reasons.push(
      `⚡ 协同效应: ${synergyBonus > 0 ? `${teamA} 获得额外加成` : `${teamB} 获得额外加成`} (+${Math.abs(synergyBonus).toFixed(0)} 分)`
    );
  }

  // 投资建议
  if (value === 'VALUE_A') {
    reasons.push(`💰 投资建议: 市场低估了 ${teamA}，建议买入 Yes。`);
  } else if (value === 'VALUE_B') {
    reasons.push(`💰 投资建议: 市场低估了 ${teamB}，建议买入 No (即看好 ${teamB})。`);
  }

  return reasons;
}