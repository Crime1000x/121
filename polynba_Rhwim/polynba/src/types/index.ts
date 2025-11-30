// Polymarket Types
export interface PolymarketEvent {
  id: string;
  title: string;
  slug: string;
  category?: string;
  series?: string; // NBA, NFL, etc
  tags?: string[];
  markets: PolymarketMarket[];
  startDate?: string;
  endDate?: string;
}

export interface PolymarketMarket {
  id: string;
  question: string;
  slug: string;
  volume: number;
  liquidity?: number;
  outcomes: string[];
  outcomePrices?: number[];
  startDate?: string;
  endDate?: string;
  closed: boolean;
}

export interface PolymarketTeam {
  id: string;
  name: string;
  league: string;
  record?: string;
  logo?: string;
  abbreviation?: string;
  color?: string;
}

// ESPN Types
export interface ESPNGame {
  id: string;
  name: string;
  date: string;
  competitions: ESPNCompetition[];
}

export interface ESPNCompetition {
  id: string;
  date: string;
  attendance?: number;
  venue?: {
    fullName: string;
  };
  competitors: ESPNCompetitor[];
  status: {
    type: {
      name: string; // STATUS_FINAL, etc
    };
  };
}

export interface ESPNCompetitor {
  id: string;
  homeAway: 'home' | 'away';
  winner: boolean;
  score: string;
  team: {
    id: string;
    name: string;
    displayName: string;
    abbreviation: string;
    logo?: string;
  };
}

// Application Types
export interface ArenaMarket {
  marketId: string;
  eventId?: string;
  eventSlug?: string;
  marketSlug?: string;
  title: string;
  sport: 'NBA' | 'NFL' | 'Soccer' | string;
  startTime?: string;
  conditionId?: string | null;
  volume: number;
  liquidity?: number;
  prices: {
    yes: number;
    no: number;
  };
  teamA?: TeamInfo;
  teamB?: TeamInfo;
}

export interface TeamInfo {
  id?: string;
  name: string;
  abbr?: string;
  logo?: string;
  record?: string;
}

// H2H Types
export interface H2HGame {
  date: string;
  home: string;
  away: string;
  homeScore: number;
  awayScore: number;
  winner: string;
  venue?: string;
  attendance?: number;
}

export interface H2HStats {
  totalGames: number;
  teamAWins: number;
  teamBWins: number;
  teamAWinRate: number;

  // 主客场
  homeGames: {
    teamAWins: number;
    teamBWins: number;
  };
  awayGames: {
    teamAWins: number;
    teamBWins: number;
  };

  // 得分统计
  avgScoreDiff: number;
  teamAAvgScore: number;
  teamBAvgScore: number;

  // 趋势
  last5Games: H2HGame[];
  recentForm: {
    teamA: string; // "WWLWL"
    teamB: string;
  };
  currentStreak?: {
    team: string;
    count: number;
    type: 'W' | 'L';
  };

  // 按赛季
  bySeasonStats?: Array<{
    season: string;
    teamAWins: number;
    teamBWins: number;
  }>;
}

export interface H2HIndex {
  [pairKey: string]: H2HGame[];
}

// Chart Data Types
export interface ChartDataPoint {
  date: string;
  teamAScore: number;
  teamBScore: number;
  winner: string;
}

export interface WinRateData {
  team: string;
  wins: number;
  losses: number;
  winRate: number;
}

// New Enhanced ESPN Data Types

// Odds & Betting Lines
export interface GameOdds {
  moneyline?: {
    home: { odds: string; favorite: boolean };
    away: { odds: string; favorite: boolean };
  };
  pointSpread?: {
    home: { line: string; odds: string };
    away: { line: string; odds: string };
  };
  total?: {
    over: { line: string; odds: string };
    under: { line: string; odds: string };
  };
  details?: string; // e.g., "HOU -6.5"
  overUnder?: number;
  spread?: number;
}

// Injury Report
export interface PlayerInjury {
  athleteId: string;
  athleteName: string;
  position?: string;
  jersey?: string;
  status: string; // "Out", "Doubtful", "Questionable"
  date?: string;
  details?: string;
  headshot?: string;
}

export interface TeamInjuries {
  teamId: string;
  teamName: string;
  injuries: PlayerInjury[];
}

// Win Probability
export interface WinProbabilityPoint {
  homeWinPercentage: number;
  tiePercentage: number;
  playId: string;
  sequence?: number;
}

// Advanced Team Statistics
export interface AdvancedTeamStats {
  teamId: string;
  teamName: string;
  gamesPlayed: number;

  // Offensive
  avgPoints?: number;
  fieldGoalPct?: number;
  threePointPct?: number;
  freeThrowPct?: number;
  effectiveFGPct?: number;
  avgAssists?: number;
  avgTurnovers?: number;

  // Defensive
  avgPointsAllowed?: number;
  avgDefensiveRebounds?: number;
  avgSteals?: number;
  avgBlocks?: number;

  // General
  avgRebounds?: number;
  reboundRate?: number;
  reboundRateRank?: string;
  assistTurnoverRatio?: number;
  assistTurnoverRatioRank?: string;
  plusMinus?: number;
  nbaRating?: number;
  nbaRatingRank?: string;

  // Full stats object for detailed view
  allStats?: {
    offensive: StatCategory;
    defensive: StatCategory;
    general: StatCategory;
  };
}

export interface StatCategory {
  name: string;
  stats: TeamStat[];
}

export interface TeamStat {
  name: string;
  displayName: string;
  shortDisplayName?: string;
  description?: string;
  abbreviation: string;
  value: number;
  displayValue: string;
  rank?: number;
  rankDisplayValue?: string;
  perGameValue?: number;
  perGameDisplayValue?: string;
}

// Season Series
export interface SeasonSeries {
  type: string;
  title: string;
  summary: string; // e.g., "Series tied 1-1"
  shortSummary?: string;
  completed: boolean;
  totalCompetitions: number;
  seriesScore?: string;
  events: SeasonSeriesGame[];
}

export interface SeasonSeriesGame {
  id: string;
  date: string;
  status: string;
  competitors: {
    homeAway: 'home' | 'away';
    winner: boolean;
    team: {
      id: string;
      displayName: string;
      abbreviation: string;
      logo: string;
    };
    score: string;
  }[];
}

// Enhanced Game Summary (all data combined)
export interface EnhancedGameData {
  gameId: string;
  odds?: GameOdds;
  injuries?: TeamInjuries[];
  winProbability?: WinProbabilityPoint[];
  seasonSeries?: SeasonSeries[];
  againstTheSpread?: any[]; // ATS records
  // NEW: Added competitors for accurate home/away detection
  competitors?: any[]; 
}

// Prediction Engine Types
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