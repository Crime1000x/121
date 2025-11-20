import { NextRequest, NextResponse } from 'next/server';
import { getTeamRecentGames } from '@/lib/api/espn';
import { calculateTeamStats } from '@/lib/api/team-stats';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const teamName = searchParams.get('team');
  const days = parseInt(searchParams.get('days') || '30', 10);

  if (!teamName) {
    return NextResponse.json(
      { error: 'Team name is required' },
      { status: 400 }
    );
  }

  try {
    console.log(`Fetching stats for ${teamName} (last ${days} days)...`);

    const games = await getTeamRecentGames(teamName, days);

    if (games.length === 0) {
      return NextResponse.json({
        teamName,
        recentGames: [],
        wins: 0,
        losses: 0,
        winRate: 0,
        avgScore: 0,
        recentForm: '',
        lastUpdated: Date.now(),
      });
    }

    const stats = calculateTeamStats(teamName, games);

    return NextResponse.json(stats);
  } catch (error) {
    console.error(`Error fetching team stats for ${teamName}:`, error);
    return NextResponse.json(
      { error: 'Failed to fetch team stats' },
      { status: 500 }
    );
  }
}
