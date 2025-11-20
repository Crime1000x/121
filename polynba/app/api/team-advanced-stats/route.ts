import { NextRequest, NextResponse } from 'next/server';
import type { AdvancedTeamStats, StatCategory, TeamStat } from '@/types';

export const dynamic = 'force-dynamic';

const ESPN_TEAM_STATS_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba/teams';

// Fetch advanced team statistics from ESPN API
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const teamId = searchParams.get('teamId');

    if (!teamId) {
      return NextResponse.json(
        { error: 'Team ID is required' },
        { status: 400 }
      );
    }

    // Fetch team statistics
    const statsUrl = `${ESPN_TEAM_STATS_BASE}/${teamId}/statistics`;
    const response = await fetch(statsUrl);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();

    if (data.status !== 'success' || !data.results?.stats) {
      throw new Error('Invalid response from ESPN API');
    }

    const statsData = data.results.stats;
    const categories = statsData.categories || [];

    // Extract key stats
    const advancedStats: AdvancedTeamStats = {
      teamId,
      teamName: '', // Will be filled from the categories data
      gamesPlayed: 0,
      allStats: {
        offensive: { name: 'Offensive', stats: [] },
        defensive: { name: 'Defensive', stats: [] },
        general: { name: 'General', stats: [] },
      },
    };

    // Parse categories
    for (const category of categories) {
      const categoryName = category.name;
      const stats: TeamStat[] = (category.stats || []).map((stat: any) => ({
        name: stat.name,
        displayName: stat.displayName,
        shortDisplayName: stat.shortDisplayName,
        description: stat.description,
        abbreviation: stat.abbreviation,
        value: stat.value,
        displayValue: stat.displayValue,
        rank: stat.rank,
        rankDisplayValue: stat.rankDisplayValue,
        perGameValue: stat.perGameValue,
        perGameDisplayValue: stat.perGameDisplayValue,
      }));

      if (categoryName === 'offensive') {
        advancedStats.allStats!.offensive.stats = stats;

        // Extract specific offensive stats
        const fgPct = stats.find(s => s.name === 'fieldGoalPct');
        const threePct = stats.find(s => s.name === 'threePointPct');
        const ftPct = stats.find(s => s.name === 'freeThrowPct');
        const effFgPct = stats.find(s => s.name === 'effectiveFGPct');
        const assists = stats.find(s => s.name === 'avgAssists');
        const turnovers = stats.find(s => s.name === 'avgTurnovers');
        const points = stats.find(s => s.name === 'avgPoints');

        if (fgPct) advancedStats.fieldGoalPct = fgPct.value;
        if (threePct) advancedStats.threePointPct = threePct.value;
        if (ftPct) advancedStats.freeThrowPct = ftPct.value;
        if (effFgPct) advancedStats.effectiveFGPct = effFgPct.value;
        if (assists) advancedStats.avgAssists = assists.value;
        if (turnovers) advancedStats.avgTurnovers = turnovers.value;
        if (points) advancedStats.avgPoints = points.value;
      } else if (categoryName === 'defensive') {
        advancedStats.allStats!.defensive.stats = stats;

        // Extract specific defensive stats
        const defReb = stats.find(s => s.name === 'avgDefensiveRebounds');
        const steals = stats.find(s => s.name === 'avgSteals');
        const blocks = stats.find(s => s.name === 'avgBlocks');

        if (defReb) advancedStats.avgDefensiveRebounds = defReb.value;
        if (steals) advancedStats.avgSteals = steals.value;
        if (blocks) advancedStats.avgBlocks = blocks.value;
      } else if (categoryName === 'general') {
        advancedStats.allStats!.general.stats = stats;

        // Extract specific general stats
        const gp = stats.find(s => s.name === 'gamesPlayed');
        const rebounds = stats.find(s => s.name === 'avgRebounds');
        const rebRate = stats.find(s => s.name === 'reboundRate');
        const astToRatio = stats.find(s => s.name === 'assistTurnoverRatio');
        const plusMinus = stats.find(s => s.name === 'plusMinus');
        const nbaRating = stats.find(s => s.name === 'NBARating');

        if (gp) advancedStats.gamesPlayed = gp.value;
        if (rebounds) advancedStats.avgRebounds = rebounds.value;
        if (rebRate) {
          advancedStats.reboundRate = rebRate.value;
          advancedStats.reboundRateRank = rebRate.rankDisplayValue;
        }
        if (astToRatio) {
          advancedStats.assistTurnoverRatio = astToRatio.value;
          advancedStats.assistTurnoverRatioRank = astToRatio.rankDisplayValue;
        }
        if (plusMinus) advancedStats.plusMinus = plusMinus.value;
        if (nbaRating) {
          advancedStats.nbaRating = nbaRating.value;
          advancedStats.nbaRatingRank = nbaRating.rankDisplayValue;
        }
      }
    }

    return NextResponse.json(advancedStats);
  } catch (error) {
    console.error('Error fetching team advanced stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team advanced statistics' },
      { status: 500 }
    );
  }
}
