import { NextRequest, NextResponse } from 'next/server';
import {
  EnhancedGameData,
  GameOdds,
  TeamInjuries,
  PlayerInjury,
  WinProbabilityPoint,
  SeasonSeries
} from '@/types';

export const dynamic = 'force-dynamic';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

// Fetch enhanced game data from ESPN API
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventId = searchParams.get('eventId');

    if (!eventId) {
      return NextResponse.json(
        { error: 'Event ID is required' },
        { status: 400 }
      );
    }

    // Fetch game summary (contains odds, injuries, win probability, season series)
    const summaryUrl = `${ESPN_BASE}/summary?event=${eventId}`;
    const response = await fetch(summaryUrl);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();

    // Extract odds
    const odds = extractOdds(data);

    // Extract injuries
    const injuries = extractInjuries(data);

    // Extract win probability
    const winProbability = extractWinProbability(data);

    // Extract season series
    const seasonSeries = extractSeasonSeries(data);

    // Extract against the spread
    const againstTheSpread = data.againstTheSpread || [];

    // NEW: Extract competitors info for accurate Home/Away detection
    const competitors = data.header?.competitions?.[0]?.competitors || [];

    const enhancedData: EnhancedGameData = {
      gameId: eventId,
      odds,
      injuries,
      winProbability,
      seasonSeries,
      againstTheSpread,
      competitors, // Include this field
    };

    return NextResponse.json(enhancedData);
  } catch (error) {
    console.error('Error fetching enhanced game data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch enhanced game data' },
      { status: 500 }
    );
  }
}

// Extract odds from ESPN data
function extractOdds(data: any): GameOdds | undefined {
  try {
    const pickcenter = data.pickcenter?.[0];
    if (!pickcenter) return undefined;

    const odds: GameOdds = {
      details: pickcenter.details,
      overUnder: pickcenter.overUnder,
      spread: pickcenter.spread,
    };

    // Extract moneyline
    if (pickcenter.awayTeamOdds && pickcenter.homeTeamOdds) {
      odds.moneyline = {
        home: {
          odds: pickcenter.homeTeamOdds.moneyLine?.toString() || '',
          favorite: pickcenter.homeTeamOdds.favorite || false,
        },
        away: {
          odds: pickcenter.awayTeamOdds.moneyLine?.toString() || '',
          favorite: pickcenter.awayTeamOdds.favorite || false,
        },
      };
    }

    // Extract from odds array if available
    const oddsData = data.odds?.[0];
    if (oddsData) {
      // Point spread
      if (oddsData.pointSpread) {
        odds.pointSpread = {
          home: {
            line: oddsData.pointSpread.home?.close?.line || '',
            odds: oddsData.pointSpread.home?.close?.odds || '',
          },
          away: {
            line: oddsData.pointSpread.away?.close?.line || '',
            odds: oddsData.pointSpread.away?.close?.odds || '',
          },
        };
      }

      // Total (over/under)
      if (oddsData.total) {
        odds.total = {
          over: {
            line: oddsData.total.over?.close?.line || '',
            odds: oddsData.total.over?.close?.odds || '',
          },
          under: {
            line: oddsData.total.under?.close?.line || '',
            odds: oddsData.total.under?.close?.odds || '',
          },
        };
      }
    }

    return odds;
  } catch (error) {
    console.error('Error extracting odds:', error);
    return undefined;
  }
}

// Extract injuries from ESPN data
function extractInjuries(data: any): TeamInjuries[] {
  try {
    const injuriesData = data.injuries || [];
    const teamInjuries: TeamInjuries[] = [];

    for (const teamInjuryData of injuriesData) {
      const team: TeamInjuries = {
        teamId: teamInjuryData.team?.id || '',
        teamName: teamInjuryData.team?.displayName || '',
        injuries: [],
      };

      if (teamInjuryData.injuries && Array.isArray(teamInjuryData.injuries)) {
        for (const injury of teamInjuryData.injuries) {
          const playerInjury: PlayerInjury = {
            athleteId: injury.athlete?.id || '',
            athleteName: injury.athlete?.fullName || injury.athlete?.displayName || '',
            position: injury.athlete?.position?.abbreviation,
            jersey: injury.athlete?.jersey,
            status: injury.status || 'Unknown',
            date: injury.date,
            details: injury.details,
            headshot: injury.athlete?.headshot?.href,
          };
          team.injuries.push(playerInjury);
        }
      }

      teamInjuries.push(team);
    }

    return teamInjuries;
  } catch (error) {
    console.error('Error extracting injuries:', error);
    return [];
  }
}

// Extract win probability from ESPN data
function extractWinProbability(data: any): WinProbabilityPoint[] {
  try {
    const wpData = data.winprobability || [];
    return wpData.map((wp: any, index: number) => ({
      homeWinPercentage: wp.homeWinPercentage || 0,
      tiePercentage: wp.tiePercentage || 0,
      playId: wp.playId || '',
      sequence: index,
    }));
  } catch (error) {
    console.error('Error extracting win probability:', error);
    return [];
  }
}

// Extract season series from ESPN data
function extractSeasonSeries(data: any): SeasonSeries[] {
  try {
    const seriesData = data.seasonseries || [];
    return seriesData.map((series: any) => ({
      type: series.type || '',
      title: series.title || '',
      summary: series.summary || '',
      shortSummary: series.shortSummary,
      completed: series.completed || false,
      totalCompetitions: series.totalCompetitions || 0,
      seriesScore: series.seriesScore,
      events: (series.events || []).map((event: any) => ({
        id: event.id || '',
        date: event.date || '',
        status: event.status || '',
        competitors: (event.competitors || []).map((comp: any) => ({
          homeAway: comp.homeAway,
          winner: comp.winner || false,
          team: {
            id: comp.team?.id || '',
            displayName: comp.team?.displayName || '',
            abbreviation: comp.team?.abbreviation || '',
            logo: comp.team?.logo || '',
          },
          score: comp.score || '0',
        })),
      })),
    }));
  } catch (error) {
    console.error('Error extracting season series:', error);
    return [];
  }
}