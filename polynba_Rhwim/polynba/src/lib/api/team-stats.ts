import { H2HGame } from '@/types';

export interface TeamStats {
  teamName: string;
  recentGames: H2HGame[];
  wins: number;
  losses: number;
  winRate: number;
  avgScore: number;
  recentForm: string; // e.g., "WWLWW"
  lastUpdated: number;
}

// Calculate stats from games
export function calculateTeamStats(teamName: string, games: H2HGame[]): TeamStats {
  let wins = 0;
  let losses = 0;
  let totalScore = 0;
  
  // 1. 确保按时间倒序排列 (最新的在前)
  const sortedGames = [...games].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  
  // 2. 过滤出【已结束】且【确实参与】的比赛
  // 首页的数据源有时会包含未开始的比赛(比分为0)，需要过滤
  const validGames = sortedGames.filter(g => g.homeScore > 0 || g.awayScore > 0);

  const form: string[] = [];

  // 辅助函数：稳健的胜负判断 (与 h2h.ts 保持一致)
  const checkWin = (game: H2HGame, targetTeam: string) => {
    const target = targetTeam.toLowerCase().trim();
    const home = game.home.toLowerCase().trim();
    const away = game.away.toLowerCase().trim();

    // 1. 通过比分判断 (最准确)
    // 如果主队名字匹配
    if (home === target || home.includes(target) || target.includes(home)) {
      return game.homeScore > game.awayScore;
    }
    // 如果客队名字匹配
    if (away === target || away.includes(target) || target.includes(away)) {
      return game.awayScore > game.homeScore;
    }
    
    // 2. 兜底：通过 winner 字段
    if (game.winner) {
      const winner = game.winner.toLowerCase();
      return winner.includes(target) || target.includes(winner);
    }
    
    return false;
  };

  // 统计所有有效比赛
  for (const game of validGames) {
    const target = teamName.toLowerCase().trim();
    const home = game.home.toLowerCase().trim();
    // 判断是否为主队
    const isHome = home.includes(target) || target.includes(home);
    
    const teamScore = isHome ? game.homeScore : game.awayScore;
    const isWinner = checkWin(game, teamName);

    if (isWinner) {
      wins++;
    } else {
      losses++;
    }

    totalScore += teamScore;
  }

  // 统计最近 5 场状态
  // 取最新的 5 场有效比赛
  const recentFormGames = validGames.slice(0, 5);
  
  for (const game of recentFormGames) {
    const isWinner = checkWin(game, teamName);
    form.push(isWinner ? 'W' : 'L');
  }

  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? wins / totalGames : 0;
  const avgScore = totalGames > 0 ? totalScore / totalGames : 0;

  return {
    teamName,
    recentGames: sortedGames,
    wins,
    losses,
    winRate,
    avgScore,
    // 第一个字符是最新一场
    recentForm: form.join(''), 
    lastUpdated: Date.now(),
  };
}

// Helper function to fetch with timeout
async function fetchWithTimeout(url: string, timeoutMs: number = 30000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    return response;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

// Get or fetch team stats (with caching, timeout, and retry)
export async function getOrFetchTeamStats(teamName: string, retries: number = 2): Promise<TeamStats | null> {
  // Only use localStorage in browser
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    // Check cache first
    const cacheKey = `team_stats_${teamName}`;
    const cached = localStorage.getItem(cacheKey);

    if (cached) {
      const stats: TeamStats = JSON.parse(cached);
      const age = Date.now() - stats.lastUpdated;
      // Cache valid for 1 hour
      if (age < 60 * 60 * 1000) {
        return stats;
      }
    }

    // Fetch fresh data from server API with retry logic
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetchWithTimeout(
          `/api/team-stats?team=${encodeURIComponent(teamName)}&days=30`,
          30000 // 30 second timeout
        );

        if (!response.ok) {
          if (response.status === 404 && attempt < retries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error(`API error: ${response.status}`);
        }

        const stats: TeamStats = await response.json();

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify(stats));

        return stats;
      } catch (error) {
        if (attempt === retries) {
          throw error; 
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return null;
  } catch (error) {
    console.error(`❌ Failed to fetch stats for ${teamName}`);
    return null;
  }
}

// Prefetch stats for multiple teams in parallel
export async function prefetchTeamStats(teamNames: string[]): Promise<Map<string, TeamStats>> {
  const uniqueTeams = Array.from(new Set(teamNames));
  const statsMap = new Map<string, TeamStats>();

  // Fetch all teams in parallel
  const results = await Promise.allSettled(
    uniqueTeams.map(async (teamName) => {
      const stats = await getOrFetchTeamStats(teamName);
      return { teamName, stats };
    })
  );

  // Collect successful results
  for (const result of results) {
    if (result.status === 'fulfilled' && result.value.stats) {
      statsMap.set(result.value.teamName, result.value.stats);
    }
  }

  return statsMap;
}