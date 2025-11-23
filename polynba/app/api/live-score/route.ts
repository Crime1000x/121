/**
 * 实时比分 API
 * 
 * 路径: app/api/live-score/route.ts
 * 
 * 功能：从 ESPN API 获取实时比分
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const eventId = searchParams.get('eventId');

  if (!eventId) {
    return NextResponse.json({ error: 'Missing eventId' }, { status: 400 });
  }

  try {
    // 从 ESPN API 获取实时比分
    const espnUrl = `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`;
    
    const response = await fetch(espnUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      throw new Error('ESPN API request failed');
    }

    const data = await response.json();

    // 解析比赛数据
    const header = data.header;
    const competitions = header?.competitions?.[0];
    
    if (!competitions) {
      return NextResponse.json({
        isInProgress: false,
        isFinal: false,
        message: 'Game not started',
      });
    }

    // 获取比分
    const homeTeam = competitions.competitors?.find((c: any) => c.homeAway === 'home');
    const awayTeam = competitions.competitors?.find((c: any) => c.homeAway === 'away');

    // 获取比赛状态
    const status = competitions.status;
    const isInProgress = status?.type?.state === 'in';
    const isFinal = status?.type?.state === 'post';
    const isHalftime = status?.type?.name === 'STATUS_HALFTIME';

    // 获取当前节数和时间
    const period = status?.period || 0;
    const clock = status?.displayClock || '0:00';

    const liveScore = {
      homeScore: parseInt(homeTeam?.score || '0'),
      awayScore: parseInt(awayTeam?.score || '0'),
      period,
      clock,
      isHalftime,
      isFinal,
      isInProgress,
      homeTeamName: homeTeam?.team?.displayName,
      awayTeamName: awayTeam?.team?.displayName,
      statusDetail: status?.type?.detail,
    };

    return NextResponse.json(liveScore, {
      headers: {
        'Cache-Control': 'no-store, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
      },
    });

  } catch (error) {
    console.error('Live score fetch error:', error);
    return NextResponse.json(
      {
        error: 'Failed to fetch live score',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}