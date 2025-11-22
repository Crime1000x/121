import { NextResponse } from 'next/server';
import redis from '@/lib/db/redis';
import { analyticsService } from '@/lib/services/analytics-service';
import { PredictionRecord } from '@/types/analytics';
import { logger } from '@/lib/utils/logger';

// 设置超时时间 5分钟
export const maxDuration = 300;
// 强制动态渲染
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  // 权限校验
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  logger.info('🔄 Cron Job: 开始结算预测结果...');

  try {
    // 获取所有待结算的预测
    const pendingIds = await redis.smembers('predictions:pending');

    if (pendingIds.length === 0) {
      logger.info('没有待结算的预测');
      return NextResponse.json({ settled: 0, pending: 0 });
    }

    logger.info(`发现 ${pendingIds.length} 个待结算预测`);

    let settledCount = 0;
    const failedIds: string[] = [];

    // 并发处理（每批 5 个）
    const BATCH_SIZE = 5;
    for (let i = 0; i < pendingIds.length; i += BATCH_SIZE) {
      const batch = pendingIds.slice(i, i + BATCH_SIZE);

      const batchPromises = batch.map(async marketId => {
        try {
          const recordStr = await redis.get(`prediction:${marketId}`);
          if (!recordStr) {
            logger.warn(`Prediction not found: ${marketId}`);
            return false;
          }

          const record: PredictionRecord = JSON.parse(recordStr);

          // 检查比赛是否已结束
          const gameResult = await fetchGameResult(record);

          if (!gameResult) {
            // 比赛未结束或获取失败
            return false;
          }

          // 更新结果
          await analyticsService.updateResult(
            marketId,
            gameResult.winner,
            gameResult.scoreA,
            gameResult.scoreB
          );

          return true;
        } catch (error) {
          logger.error(`Failed to settle ${marketId}`, error);
          failedIds.push(marketId);
          return false;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      settledCount += batchResults.filter(r => r === true).length;

      // 礼貌延迟
      await new Promise(r => setTimeout(r, 200));
    }

    const summary = {
      success: true,
      settled: settledCount,
      pending: pendingIds.length - settledCount,
      failed: failedIds.length,
      timestamp: new Date().toISOString(),
    };

    logger.success(`结算完成: ${settledCount}/${pendingIds.length} 个预测已更新`);

    return NextResponse.json(summary);
  } catch (error) {
    logger.error('Cron job fatal error', error);
    return NextResponse.json(
      {
        error: 'Settle failed',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * 获取比赛结果
 */
async function fetchGameResult(
  record: PredictionRecord
): Promise<{ winner: 'teamA' | 'teamB'; scoreA: number; scoreB: number } | null> {
  try {
    // 1. 查找 ESPN eventId
    const { findEspnGame } = await import('@/lib/utils/espn-mapping');
    const eventId = await findEspnGame(record.teamA, record.teamB, record.gameDate);

    if (!eventId) {
      logger.debug(`No ESPN game found for ${record.teamA} vs ${record.teamB}`);
      return null;
    }

    // 2. 获取比赛详情
    const response = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/summary?event=${eventId}`,
      { cache: 'no-store' }
    );

    if (!response.ok) {
      logger.warn(`ESPN API error: ${response.status} for event ${eventId}`);
      return null;
    }

    const data = await response.json();
    const competition = data.header?.competitions?.[0];

    if (!competition) {
      return null;
    }

    // 3. 检查比赛状态
    const status = competition.status?.type?.state;
    if (status !== 'post') {
      // 比赛未结束
      logger.debug(`Game not finished: ${record.teamA} vs ${record.teamB} (status: ${status})`);
      return null;
    }

    // 4. 提取比分
    const competitors = competition.competitors || [];

    const teamAComp = competitors.find((c: any) => c.team?.displayName === record.teamA);

    const teamBComp = competitors.find((c: any) => c.team?.displayName === record.teamB);

    if (!teamAComp || !teamBComp) {
      logger.warn(`Cannot match teams: ${record.teamA} vs ${record.teamB}`);
      return null;
    }

    const scoreA = parseInt(teamAComp.score || '0');
    const scoreB = parseInt(teamBComp.score || '0');
    const winner: 'teamA' | 'teamB' = teamAComp.winner ? 'teamA' : 'teamB';

    logger.debug(`Game result: ${record.teamA} ${scoreA} - ${scoreB} ${record.teamB}`, {
      winner,
    });

    return { winner, scoreA, scoreB };
  } catch (error) {
    logger.error(`Failed to fetch game result for ${record.teamA} vs ${record.teamB}`, error);
    return null;
  }
}