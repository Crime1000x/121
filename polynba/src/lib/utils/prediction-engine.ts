/**
 * 胜率计算 - 基于真实数据综合分析比赛胜负 (V2.5 优化版)
 */

import type { H2HStats, AdvancedTeamStats, TeamInjuries } from '@/types';

export interface PredictionFactor {
  name: string;
  score: number; // -100 to 100, 正数有利于 teamA
  weight: number; // 0-1, 权重
  description: string;
  icon: string;
}

export interface PredictionResult {
  teamAProbability: number; // 0-1
  teamBProbability: number; // 0-1
  confidence: number; // 0-1, 数据完整度
  factors: PredictionFactor[];
  recommendation: 'STRONG_A' | 'LEAN_A' | 'NEUTRAL' | 'LEAN_B' | 'STRONG_B';
  marketValue: 'OVERVALUED_A' | 'FAIR' | 'OVERVALUED_B' | 'VALUE_A' | 'VALUE_B';
  reasoning: string[];
}

/**
 * 综合数据计算胜率 (优化算法)
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
  restDaysA: number = 3, // 默认休息充分
  restDaysB: number = 3,
  isTeamAHome: boolean | null // <-- 新增参数：Team A 是否是主队
): PredictionResult {
  const factors: PredictionFactor[] = [];

  // 因素 1: 球队硬实力 (NBA Rating / Net Rating) - 权重 0.30
  if (advancedStatsA && advancedStatsB && advancedStatsA.nbaRating && advancedStatsB.nbaRating) {
    const ratingDiff = advancedStatsA.nbaRating - advancedStatsB.nbaRating;
    // Net Rating 差 10 分通常意味着巨大的实力差距
    const ratingScore = Math.max(-100, Math.min(100, ratingDiff * 8)); 
    factors.push({
      name: '球队实力评分',
      score: ratingScore,
      weight: 0.30, // 权重：0.35 -> 0.30
      description: `${teamA} Rating ${advancedStatsA.nbaRating} vs ${teamB} ${advancedStatsB.nbaRating}`,
      icon: '⭐',
    });
  }

  // 因素 2: 近期状态 (Form) - 权重 0.15
  if (h2hStats) {
    const formA = analyzeRecentForm(h2hStats.recentForm.teamA);
    const formB = analyzeRecentForm(h2hStats.recentForm.teamB);
    const formScore = (formA - formB) * 40; 
    factors.push({
      name: '近期状态',
      score: formScore,
      description: `${teamA} 近5场 ${formA.toFixed(1)}胜, ${teamB} 近5场 ${formB.toFixed(1)}胜`,
      weight: 0.15, // 权重：0.15
      icon: '📈',
    });
  }

  // 因素 3: 伤病影响 (Injury) - 权重 0.20
  const injuryImpact = calculateInjuryImpact(injuriesA, injuriesB);
  if (injuryImpact.score !== 0) {
    factors.push({
      name: '伤病影响',
      score: injuryImpact.score,
      weight: 0.20, // 权重：0.20
      description: injuryImpact.description,
      icon: '🏥',
    });
  }

  // 因素 4: 历史交锋 (H2H) - 权重 0.05
  if (h2hStats) {
    const h2hScore = (h2hStats.teamAWinRate - 0.5) * 150;
    factors.push({
      name: '历史交锋',
      score: h2hScore,
      weight: 0.05, // 权重：0.10 -> 0.05
      description: `过去 ${h2hStats.totalGames} 场交手 ${teamA} 胜率 ${(h2hStats.teamAWinRate * 100).toFixed(0)}%`,
      icon: '📊',
    });
  }

  // 因素 5: 进攻火力 (Offense) - 权重 0.10
  if (advancedStatsA && advancedStatsB && advancedStatsA.effectiveFGPct && advancedStatsB.effectiveFGPct) {
    const offenseDiff = (advancedStatsA.effectiveFGPct - advancedStatsB.effectiveFGPct) * 4; // 放大差异
    const offenseScore = Math.max(-100, Math.min(100, offenseDiff));
    factors.push({
      name: '进攻火力',
      score: offenseScore,
      weight: 0.10, // 权重：0.10
      description: `eFG%: ${teamA} ${advancedStatsA.effectiveFGPct.toFixed(1)}% vs ${teamB} ${advancedStatsB.effectiveFGPct.toFixed(1)}%`,
      icon: '🎯',
    });
  }

  // 因素 6: 体能与赛程 (Fatigue) - 权重 0.10
  const fatigueScore = calculateFatigueScore(restDaysA, restDaysB);
  factors.push({
    name: '体能优势',
    score: fatigueScore.score,
    weight: 0.10, // 权重：0.10
    description: fatigueScore.description,
    icon: '🔋',
  });
  
  // 因素 7: 主场优势 (Home/Away) - 权重 0.10 (新增)
  const homeAdvantageScore = calculateHomeAdvantageScore(isTeamAHome);
  if (homeAdvantageScore.score !== 0) {
      factors.push({
        name: '主场优势',
        score: homeAdvantageScore.score,
        weight: 0.10, // 权重：0.10 (新增)
        description: homeAdvantageScore.description,
        icon: '🏠',
      });
  }

  // 计算加权总分 (总权重为 1.0)
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce((sum, f) => sum + (f.score * f.weight), 0) / totalWeight;

  // 转换为概率 (使用 sigmoid 函数，保持 K 值不变，但由于权重分布更均匀，结果会相对保守)
  const kValue = 35; 
  const teamAProbability = 1 / (1 + Math.exp(-weightedScore / kValue));
  const teamBProbability = 1 - teamAProbability;

  // 计算可信度
  const confidence = calculateConfidence(factors, h2hStats, advancedStatsA);

  // 生成推荐
  const recommendation = generateRecommendation(teamAProbability, confidence);

  // 市场价值分析
  const marketValue = analyzeMarketValue(teamAProbability, polymarketOdds.yes);

  // 生成推理说明
  const reasoning = generateReasoning(factors, teamA, teamB, teamAProbability, marketValue, polymarketOdds);

  return {
    teamAProbability,
    teamBProbability,
    confidence,
    factors: factors.sort((a, b) => Math.abs(b.score * b.weight) - Math.abs(a.score * a.weight)), // 按影响力排序
    recommendation,
    marketValue,
    reasoning,
  };
}

// --- NEW HELPER FUNCTION ---
function calculateHomeAdvantageScore(isTeamAHome: boolean | null): { score: number, description: string } {
    if (isTeamAHome === null) {
        return { score: 0, description: '主客场信息未知' };
    }
    
    // NBA 传统主场优势约为 3-4 分，将其转化为一个分数激励值。
    const HOME_ADVANTAGE_POINTS = 15; // 转换为预测引擎的内部得分
    
    if (isTeamAHome) {
        return { 
            score: HOME_ADVANTAGE_POINTS, 
            description: '主队享有主场优势，得分激励 +15' 
        };
    } else {
        return { 
            score: -HOME_ADVANTAGE_POINTS, // 客队没有主场优势，相当于主队多得 15 分
            description: '客队没有主场优势，主队得分激励 -15' 
        };
    }
}

// --- Rest of the Helper Functions (unchanged) ---

function analyzeRecentForm(form: string): number {
// ... (unchanged)
  let score = 0;
  // 加权近期状态，越近的比赛权重越高
  const weights = [1, 1, 1.2, 1.5, 2]; // 过去第5场 -> 最近1场
  const games = form.split('');
  
  // 如果数据不足5场，补足
  while (games.length < 5) games.unshift('L'); // 假设缺失数据为负面

  for (let i = 0; i < Math.min(games.length, 5); i++) {
    // 倒序读取，最近的比赛在最后
    const isWin = games[games.length - 1 - i] === 'W';
    if (isWin) {
        score += 1;
    }
  }
  // 简单返回胜场数用于显示，内部计算用更复杂的逻辑没什么必要展示给用户
  return form.split('').filter(c => c === 'W').length;
}

function calculateFatigueScore(restA: number, restB: number): { score: number, description: string } {
    // 休息天数：1 = 背靠背, 2 = 休息1天, 3+ = 休息充足
    let score = 0;
    
    // 简单的体能模型
    // 背靠背 (-15分), 休息1天 (标准), 休息2天 (+5分), 休息3天+ (+8分)
    const getRestValue = (days: number) => {
        if (days <= 1) return -15;
        if (days === 2) return 0;
        if (days === 3) return 5;
        return 8; // 休息太久也可能手感生疏，所以封顶
    };

    const valA = getRestValue(restA);
    const valB = getRestValue(restB);

    score = (valA - valB) * 2; // 放大差异
    
    let desc = '双方体能状况相当';
    if (restA <= 1 && restB > 1) desc = `主队 (${restA} 天) 背靠背作战，体能劣势`;
    else if (restB <= 1 && restA > 1) desc = `客队 (${restB} 天) 背靠背作战，体能劣势`;
    else if (restA > restB + 1) desc = `主队 (${restA} 天) 获得更多休息时间`;
    else if (restB > restA + 1) desc = `客队 (${restB} 天) 获得更多休息时间`;

    // 限制分数范围
    score = Math.max(-100, Math.min(100, score));
    return { score, description: desc };
}

function calculateInjuryImpact(
  injuriesA: TeamInjuries | null,
  injuriesB: TeamInjuries | null
): { score: number; description: string } {
// ... (unchanged)
  let scoreA = 0;
  let scoreB = 0;
  
  // 优化伤病扣分逻辑
  const calculateTeamInjuryScore = (injuries: TeamInjuries | null) => {
      if (!injuries) return 0;
      let s = 0;
      injuries.injuries.forEach(inj => {
          const status = typeof inj.status === 'string' ? inj.status.toLowerCase() : '';
          // 根据状态严重程度扣分
          if (status.includes('out')) s -= 25; // 缺席
          else if (status.includes('doubtful')) s -= 15; // 存疑 (大概率不打)
          else if (status.includes('questionable')) s -= 8; // 出战成疑 (50/50)
          else if (status.includes('day-to-day')) s -= 3; // 每日观察
      });
      return s;
  };

  scoreA = calculateTeamInjuryScore(injuriesA);
  scoreB = calculateTeamInjuryScore(injuriesB);

  const score = scoreA - scoreB; // A 的分 - B 的分。如果 A 伤病多 (负分多)，Score 为负，利好 B。
  
  let desc = '伤病影响较小';
  if (Math.abs(score) > 15) {
      const advantaged = score > 0 ? injuriesA?.teamName : injuriesB?.teamName; // 分数高的一方有优势（扣分少）
      // 修正逻辑：score > 0 意味着 A 扣分少 (-10) - (-50) = 40 -> 利好 A
      const betterTeam = score > 0 ? '主队' : '客队'; // 简化显示，实际 UI 会配 Icon
      desc = score > 0 ? '主队阵容更完整' : '客队阵容更完整';
      
      // 尝试获取队名
      if (injuriesA && injuriesB) {
          desc = score > 0 ? `${injuriesA.teamName} 阵容较完整` : `${injuriesB.teamName} 阵容较完整`;
      }
  }

  return { score, description: desc };
}

function calculateConfidence(factors: PredictionFactor[], h2h: H2HStats | null, advanced: AdvancedTeamStats | null): number {
// ... (unchanged)
  let confidence = 0.6; // 基础置信度

  // 数据源完整性检查
  if (h2h) confidence += 0.1;
  if (advanced) confidence += 0.15;

  // 因子一致性检查
  // 如果大部分因子都指向同一个方向（同正或同负），置信度增加
  let positiveCount = 0;
  let negativeCount = 0;
  
  factors.forEach(f => {
      if (f.score > 10) positiveCount++;
      if (f.score < -10) negativeCount++;
  });

  if (positiveCount > 0 && negativeCount === 0) confidence += 0.1;
  if (negativeCount > 0 && positiveCount === 0) confidence += 0.1;

  return Math.min(0.98, confidence);
}

function generateRecommendation(prob: number, conf: number): PredictionResult['recommendation'] {
// ... (unchanged)
  // 结合置信度和胜率
  if (conf < 0.7) return 'NEUTRAL'; // 数据不足，不推荐

  if (prob > 0.65) return 'STRONG_A';
  if (prob > 0.55) return 'LEAN_A';
  if (prob < 0.35) return 'STRONG_B';
  if (prob < 0.45) return 'LEAN_B';
  return 'NEUTRAL';
}

function analyzeMarketValue(predictedProb: number, marketProb: number): PredictionResult['marketValue'] {
// ... (unchanged)
  const diff = predictedProb - marketProb;
  // 只有当差异超过 5% 且方向一致时才认为有价值
  if (diff > 0.05) return 'VALUE_A';
  if (diff < -0.05) return 'VALUE_B';
  
  // 如果差异很大但方向相反（极少见），或者差异很小
  return 'FAIR';
}

function generateReasoning(
  factors: PredictionFactor[],
  teamA: string,
  teamB: string,
  prob: number,
  value: string,
  odds: { yes: number, no: number }
): string[] {
// ... (unchanged)
  const reasons: string[] = [];
  
  const favoredTeam = prob > 0.5 ? teamA : teamB;
  const winRate = prob > 0.5 ? prob : 1 - prob;
  
  reasons.push(`模型预测 ${favoredTeam} 胜率为 ${(winRate * 100).toFixed(1)}%，${value.includes('VALUE') ? '存在显著市场价值' : '与市场预期接近'}。`);

  // 提取前两个关键因素
  const topFactors = factors.filter(f => Math.abs(f.score) > 20).slice(0, 2);
  topFactors.forEach(f => {
      const team = f.score > 0 ? teamA : teamB;
      reasons.push(`${f.name}: ${team} 占据优势 (${f.description})`);
  });

  if (value === 'VALUE_A') {
      reasons.push(`💰 投资建议: 市场低估了 ${teamA}，建议买入 Yes。`);
  } else if (value === 'VALUE_B') {
      reasons.push(`💰 投资建议: 市场低估了 ${teamB}，建议买入 No (即看好 ${teamB})。`);
  }

  return reasons;
}