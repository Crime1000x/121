/**
 * 预测引擎常量配置
 * V3.0 - 优化版
 */

export const PREDICTION_CONSTANTS = {
  // Sigmoid 函数参数
  SIGMOID: {
    BASE_K_VALUE: 35, // 基础敏感度
    MIN_K: 25, // 最敏感（数据完整）
    MAX_K: 50, // 最保守（数据不足）
  },
  
  // 分数边界
  SCORE_BOUNDS: {
    MIN: -100,
    MAX: 100,
  },
  
  // 因素权重（总和为 1.0）
  WEIGHTS: {
    TEAM_STRENGTH: 0.30, // 球队实力
    RECENT_FORM: 0.15,   // 近期状态
    INJURY_IMPACT: 0.20, // 伤病影响
    HEAD_TO_HEAD: 0.05,  // 历史交锋
    OFFENSE_POWER: 0.10, // 进攻火力
    FATIGUE: 0.10,       // 体能优势
    HOME_ADVANTAGE: 0.10, // 主场优势
  },
  
  // 各因素评分放大系数
  MULTIPLIERS: {
    RATING: 8,       // NBA Rating 差值放大
    FORM: 40,        // 近期状态差值放大
    OFFENSE: 4,      // eFG% 差值放大
  },
  
  // 伤病影响评分
  INJURY_WEIGHTS: {
    OUT: -25,        // 确定缺席
    DOUBTFUL: -15,   // 大概率缺席
    QUESTIONABLE: -8, // 出战成疑
    DAY_TO_DAY: -3,  // 每日观察
  },
  
  // 主场优势
  HOME_ADVANTAGE_POINTS: 15,
  
  // 体能评分
  REST_VALUES: {
    BACK_TO_BACK: -15, // 背靠背
    ONE_DAY: 0,        // 休息1天
    TWO_DAYS: 5,       // 休息2天
    THREE_PLUS: 8,     // 休息3天以上
  },
  
  // 协同效应加成
  SYNERGY: {
    HOME_PLUS_RESTED: 10,     // 主场 + 充足休息
    INJURY_PLUS_TIRED: -15,   // 伤病 + 疲劳（负面叠加）
  },
  
  // 贝叶斯更新权重
  BAYESIAN: {
    PRIOR_WEIGHT_BASE: 0.3,   // 市场先验权重
    MODEL_WEIGHT_BASE: 0.7,   // 模型权重
    H2H_WEIGHT: 0.2,          // H2H 历史权重
  },
  
  // 概率边界
  PROBABILITY: {
    MIN: 0.01,
    MAX: 0.99,
  },
  
  // 推荐阈值
  RECOMMENDATION: {
    STRONG_A: 0.65,
    LEAN_A: 0.55,
    LEAN_B: 0.45,
    STRONG_B: 0.35,
  },
  
  // 市场价值阈值
  VALUE_THRESHOLD: {
    STRONG: 0.10, // 10% 差异
    MODERATE: 0.05, // 5% 差异
  },
} as const;

/**
 * 模型版本
 */
export const MODEL_VERSION = 'v3.0';