import type { H2HGame } from '@/types';

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
  const recentFormGames = games.slice(0, 5);
  const form: string[] = [];

  for (const game of games) {
    const isHome = game.home === teamName;
    const isWinner = game.winner === teamName;
    const teamScore = isHome ? game.homeScore : game.awayScore;

    if (isWinner) {
      wins++;
    } else {
      losses++;
    }

    totalScore += teamScore;
  }

  // Calculate form for last 5 games
  for (const game of recentFormGames) {
    const isWinner = game.winner === teamName;
    form.push(isWinner ? 'W' : 'L');
  }

  const totalGames = wins + losses;
  const winRate = totalGames > 0 ? wins / totalGames : 0;
  const avgScore = totalGames > 0 ? totalScore / totalGames : 0;

  return {
    teamName,
    recentGames: games,
    wins,
    losses,
    winRate,
    avgScore,
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
        console.log(`✅ Using cached stats for ${teamName}`);
        return stats;
      }
    }

    // Fetch fresh data from server API with retry logic
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        console.log(`🔄 Fetching stats for ${teamName}... (attempt ${attempt + 1}/${retries + 1})`);
        const response = await fetchWithTimeout(
          `/api/team-stats?team=${encodeURIComponent(teamName)}&days=30`,
          30000 // 30 second timeout
        );

        if (!response.ok) {
          if (response.status === 404 && attempt < retries) {
            // Retry on 404 (might be temporary)
            console.warn(`⚠️ 404 error for ${teamName}, retrying in 1s...`);
            await new Promise(resolve => setTimeout(resolve, 1000));
            continue;
          }
          throw new Error(`API error: ${response.status}`);
        }

        const stats: TeamStats = await response.json();

        // Cache the result
        localStorage.setItem(cacheKey, JSON.stringify(stats));

        console.log(`✅ Successfully loaded stats for ${teamName}`);
        return stats;
      } catch (error) {
        if (attempt === retries) {
          throw error; // Last attempt failed, throw error
        }
        console.warn(`⚠️ Error fetching ${teamName}, retrying...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return null;
  } catch (error) {
    console.error(`❌ Failed to fetch stats for ${teamName} after ${retries + 1} attempts`);
    return null;
  }
}

// Prefetch stats for multiple teams in parallel
export async function prefetchTeamStats(teamNames: string[]): Promise<Map<string, TeamStats>> {
  const uniqueTeams = Array.from(new Set(teamNames));
  const statsMap = new Map<string, TeamStats>();

  console.log(`🔄 Prefetching stats for ${uniqueTeams.length} teams...`);

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

  console.log(`✅ Prefetched stats for ${statsMap.size} teams`);

  return statsMap;
}
