import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const ESPN_BASE = 'https://site.api.espn.com/apis/site/v2/sports/basketball/nba';

/**
 * 获取实时比赛数据
 * GET /api/live-games
 * Query params:
 *   - eventIds: comma-separated list of ESPN event IDs
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const eventIdsParam = searchParams.get('eventIds');

    if (!eventIdsParam) {
      // 如果没有提供 eventIds，返回今日所有比赛
      return await getTodayGames();
    }

    // 批量获取指定比赛的实时数据
    const eventIds = eventIdsParam.split(',');
    const liveDataPromises = eventIds.map(async (eventId) => {
      try {
        const data = await fetchGameLiveData(eventId.trim());
        return data;
      } catch (error) {
        console.error(`Failed to fetch data for event ${eventId}:`, error);
        return null;
      }
    });

    const results = await Promise.all(liveDataPromises);
    const validResults = results.filter(r => r !== null);

    return NextResponse.json({
      success: true,
      count: validResults.length,
      games: validResults,
    });

  } catch (error) {
    console.error('Live games API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch live game data' },
      { status: 500 }
    );
  }
}

/**
 * 获取今日所有比赛
 */
async function getTodayGames() {
  try {
    const response = await fetch(`${ESPN_BASE}/scoreboard`);
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    const events = data.events || [];

    const gamesData = events.map((event: any) => {
      const competition = event.competitions?.[0];
      if (!competition) return null;

      const status = competition.status;
      const competitors = competition.competitors || [];
      
      const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
      const awayTeam = competitors.find((c: any) => c.homeAway === 'away');

      if (!homeTeam || !awayTeam) return null;

      // 判断比赛状态
      let gameStatus = 'upcoming';
      if (status.type.state === 'in') {
        gameStatus = 'live';
      } else if (status.type.state === 'post') {
        gameStatus = 'final';
      }

      return {
        eventId: event.id,
        status: gameStatus,
        clock: status.displayClock || '',
        period: status.period || 0,
        periodLabel: status.type.shortDetail || '',
        homeTeam: {
          id: homeTeam.team.id,
          name: homeTeam.team.displayName,
          abbreviation: homeTeam.team.abbreviation,
          logo: homeTeam.team.logo,
          score: parseInt(homeTeam.score || '0'),
          record: homeTeam.records?.[0]?.summary || '',
          winner: homeTeam.winner || false,
        },
        awayTeam: {
          id: awayTeam.team.id,
          name: awayTeam.team.displayName,
          abbreviation: awayTeam.team.abbreviation,
          logo: awayTeam.team.logo,
          score: parseInt(awayTeam.score || '0'),
          record: awayTeam.records?.[0]?.summary || '',
          winner: awayTeam.winner || false,
        },
        venue: competition.venue?.fullName || '',
        attendance: competition.attendance,
        lastUpdate: Date.now(),
      };
    }).filter((game: any) => game !== null);

    return NextResponse.json({
      success: true,
      count: gamesData.length,
      games: gamesData,
      lastUpdate: Date.now(),
    });

  } catch (error) {
    console.error('Error fetching today games:', error);
    return NextResponse.json(
      { error: 'Failed to fetch today games' },
      { status: 500 }
    );
  }
}

/**
 * 获取单场比赛的实时数据
 */
async function fetchGameLiveData(eventId: string) {
  try {
    const response = await fetch(`${ESPN_BASE}/summary?event=${eventId}`);
    
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    const header = data.header;
    const competition = header?.competitions?.[0];
    
    if (!competition) {
      return null;
    }

    const status = competition.status;
    const competitors = competition.competitors || [];
    
    const homeTeam = competitors.find((c: any) => c.homeAway === 'home');
    const awayTeam = competitors.find((c: any) => c.homeAway === 'away');

    if (!homeTeam || !awayTeam) {
      return null;
    }

    // 判断比赛状态
    let gameStatus = 'upcoming';
    if (status.type.state === 'in') {
      gameStatus = 'live';
    } else if (status.type.state === 'post') {
      gameStatus = 'final';
    }

    // 🆕 提取更多实时数据
    const scoringPlays = data.scoringPlays || [];
    const leaders = data.leaders || [];
    const broadcasts = data.broadcasts || [];

    return {
      eventId,
      status: gameStatus,
      clock: status.displayClock || '',
      period: status.period || 0,
      periodLabel: status.type.shortDetail || '',
      homeTeam: {
        id: homeTeam.team.id,
        name: homeTeam.team.displayName,
        abbreviation: homeTeam.team.abbreviation,
        logo: homeTeam.team.logo,
        score: parseInt(homeTeam.score || '0'),
        record: homeTeam.records?.[0]?.summary || '',
        winner: homeTeam.winner || false,
        // 🆕 统计数据
        statistics: homeTeam.statistics || [],
      },
      awayTeam: {
        id: awayTeam.team.id,
        name: awayTeam.team.displayName,
        abbreviation: awayTeam.team.abbreviation,
        logo: awayTeam.team.logo,
        score: parseInt(awayTeam.score || '0'),
        record: awayTeam.records?.[0]?.summary || '',
        winner: awayTeam.winner || false,
        // 🆕 统计数据
        statistics: awayTeam.statistics || [],
      },
      venue: competition.venue?.fullName || '',
      attendance: competition.attendance,
      // 🆕 额外数据
      scoringPlays: scoringPlays.slice(0, 5), // 最近5次得分
      leaders: leaders, // 球队领袖数据
      broadcasts: broadcasts, // 直播信息
      lastUpdate: Date.now(),
    };

  } catch (error) {
    console.error(`Error fetching game ${eventId}:`, error);
    return null;
  }
}