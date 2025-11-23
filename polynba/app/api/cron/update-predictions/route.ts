import { NextResponse } from 'next/server';
import redis from '@/lib/db/redis';
import { getTopMarkets } from '@/lib/api/polymarket';
import { findEspnGame, getEspnTeamId } from '@/lib/utils/espn-mapping';
import { generatePrediction } from '@/lib/utils/prediction-engine-v3';
import { calculateH2HStats } from '@/lib/utils/h2h';
import { analyticsService } from '@/lib/services/analytics-service';
import { PredictionRecord } from '@/types/analytics';
import { MODEL_VERSION } from '@/lib/constants/prediction-constants';

// 设置超时时间 5分钟
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

// 工具函数：调用本地 API
async function fetchLocalApi(path: string) {
  try {
    const res = await fetch(`http://127.0.0.1:3000${path}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch (e) {
    console.error(`Fetch local api ${path} failed:`, e);
    return null;
  }
}

export async function GET(request: Request) {
  // 权限校验
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  console.log('🔄 Cron Job (v3.1): 开始执行深度预测任务 (带去重)...');
  console.log(`📅 执行时间: ${new Date().toISOString()}`);

  try {
    // 1. 获取市场数据 (多获取一些以备过滤)
    const markets = await getTopMarkets(100);
    console.log(`📊 原始获取到 ${markets.length} 个市场`);

    // ✨ 新增：去重逻辑
    // 过滤掉同一场比赛的重复盘口（如胜负盘、大小分等），只保留排名最靠前的一个
    const seenGames = new Set<string>();
    const uniqueMarkets = markets.filter(market => {
        if (!market.teamA?.name || !market.teamB?.name || !market.startTime) return false;
        
        // 生成唯一键：日期-队A-队B (排序后确保 A vs B 和 B vs A 视为同一场)
        const dateStr = market.startTime.split('T')[0];
        const teams = [market.teamA.name, market.teamB.name].sort().join('-');
        const uniqueKey = `${dateStr}-${teams}`;

        if (seenGames.has(uniqueKey)) {
            return false; // 已存在，跳过
        }
        seenGames.add(uniqueKey);
        return true;
    });

    console.log(`🧹 去重后剩余: ${uniqueMarkets.length} 个唯一比赛`);

    let updatedCount = 0;
    let savedRecords = 0;

    // 2. 遍历去重后的市场
    for (const market of uniqueMarkets) {
      if (!market.teamA?.name || !market.teamB?.name) {
        console.log(`⚠️ 跳过：缺少队伍名称 - ${market.marketId}`);
        continue;
      }

      // 限流：每个市场间隔 200ms
      await new Promise((r) => setTimeout(r, 200));

      try {
        // 3. 查找 ESPN 比赛
        const eventId = await findEspnGame(
          market.teamA.name,
          market.teamB.name,
          market.startTime
        );

        if (!eventId) {
          console.log(`⚠️ 未找到 ESPN 比赛: ${market.teamA.name} vs ${market.teamB.name}`);
          continue;
        }

        // 4. 获取队伍 ID
        const teamAId = getEspnTeamId(market.teamA.name);
        const teamBId = getEspnTeamId(market.teamB.name);

        // 5. 并行获取所有数据
        const [gameData, statsA, statsB, advStatsA, advStatsB] = await Promise.all([
          fetchLocalApi(`/api/game-data?eventId=${eventId}`),
          fetchLocalApi(`/api/team-stats?team=${encodeURIComponent(market.teamA.name)}`),
          fetchLocalApi(`/api/team-stats?team=${encodeURIComponent(market.teamB.name)}`),
          teamAId ? fetchLocalApi(`/api/team-advanced-stats?teamId=${teamAId}`) : null,
          teamBId ? fetchLocalApi(`/api/team-advanced-stats?teamId=${teamBId}`) : null,
        ]);

        // 6. 计算 H2H 统计
        let h2hStats = null;
        let recentGames: any[] = [];

        if (statsA?.recentGames && statsB?.recentGames) {
          // 合并并去重
          recentGames = [...statsA.recentGames, ...statsB.recentGames]
            .filter(
              (g: any, index: number, self: any[]) =>
                index === self.findIndex((t: any) => t.date === g.date && t.home === g.home)
            )
            .filter((g: any) => g.homeScore + g.awayScore > 0)
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

          if (recentGames.length > 0) {
            h2hStats = calculateH2HStats(recentGames, market.teamA.name, market.teamB.name);
          }
        }

        // 7. 计算休息天数
        const calculateRest = (teamName: string): number => {
          // 获取该队的所有比赛，按时间倒序
          const teamGames = recentGames
            .filter((g: any) => g.home === teamName || g.away === teamName)
            .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

          if (teamGames.length === 0) {
            console.log(`⚠️ ${teamName}: 没有历史比赛数据，默认3天休息`);
            return 3;
          }

          // 目标比赛时间
          const targetTime = new Date(market.startTime || Date.now()).getTime();

          // 找到上一场已结束的比赛
          const pastGames = teamGames.filter((g: any) => {
            const gameTime = new Date(g.date).getTime();
            return gameTime < targetTime;
          });

          if (pastGames.length === 0) {
            console.log(`⚠️ ${teamName}: 没有过去的比赛，默认7天休息（赛季初）`);
            return 7;
          }

          // 计算日期差（只看日期，不看具体时间）
          const lastGameDate = new Date(pastGames[0].date);
          const targetDate = new Date(market.startTime || Date.now());

          // 归零时分秒，只比较日期
          lastGameDate.setHours(0, 0, 0, 0);
          targetDate.setHours(0, 0, 0, 0);

          const daysDiff = Math.floor(
            (targetDate.getTime() - lastGameDate.getTime()) / (1000 * 3600 * 24)
          );

          // 确保至少返回1（背靠背的情况）
          const restDays = Math.max(1, daysDiff);

          console.log(
            `📅 ${teamName}: 上场比赛 ${pastGames[0].date}, 休息 ${restDays} 天`
          );

          return restDays;
        };

        const restA = calculateRest(market.teamA.name);
        const restB = calculateRest(market.teamB.name);

        // 8. 判断主客场
        let isTeamAHome: boolean | null = null;

        // 方法1: 从 gameData.competitors 获取
        if (gameData?.competitors && Array.isArray(gameData.competitors)) {
          const competitorA = gameData.competitors.find(
            (c: any) => c.team?.displayName === market.teamA.name
          );

          if (competitorA) {
            if (competitorA.homeAway === 'home') {
              isTeamAHome = true;
            } else if (competitorA.homeAway === 'away') {
              isTeamAHome = false;
            }
          }
        }

        // 方法2: 从 seasonSeries 获取
        if (isTeamAHome === null && gameData?.seasonSeries?.[0]?.events?.[0]) {
          const seasonEvent = gameData.seasonSeries[0].events[0];
          const competitorA = seasonEvent.competitors?.find(
            (c: any) => c.team?.displayName === market.teamA.name
          );

          if (competitorA?.homeAway === 'home') {
            isTeamAHome = true;
          } else if (competitorA?.homeAway === 'away') {
            isTeamAHome = false;
          }
        }

        if (isTeamAHome === null) {
          console.warn(
            `⚠️ 无法确定主客场: ${market.teamA.name} vs ${market.teamB.name}`
          );
        }

        const homeLabel =
          isTeamAHome === true ? '🏠 Home' : isTeamAHome === false ? '✈️ Away' : '❓ Unknown';

        console.log(
          `🏀 ${market.teamA.name} (${homeLabel}, 休息${restA}天) vs ${market.teamB.name} (休息${restB}天)`
        );

        // 9. 生成预测
        const prediction = generatePrediction(
          market.teamA.name,
          market.teamB.name,
          h2hStats,
          advStatsA,
          advStatsB,
          gameData?.injuries?.find((i: any) => i.teamName === market.teamA?.name) || null,
          gameData?.injuries?.find((i: any) => i.teamName === market.teamB?.name) || null,
          market.prices,
          restA,
          restB,
          isTeamAHome
        );

        // 10. 只保存高置信度预测
        if (prediction && prediction.confidence > 0.5) {
          // 保存到 Redis（用于前端显示）
          await redis.set(
            `prediction:${market.marketId}`,
            prediction.teamAProbability.toFixed(4),
            'EX',
            7200 // 2小时过期
          );

          // 保存到 Analytics（用于追踪准确率）
          const record: PredictionRecord = {
            id: `${market.marketId}-${Date.now()}`,
            marketId: market.marketId,
            timestamp: Date.now(),
            teamA: market.teamA.name,
            teamB: market.teamB.name,
            gameDate: market.startTime || new Date().toISOString(),
            isTeamAHome,
            predictedProbabilityA: prediction.teamAProbability,
            confidence: prediction.confidence,
            factors: prediction.factors,
            modelVersion: MODEL_VERSION,
            marketOddsA: market.prices.yes,
            marketOddsB: market.prices.no,
            volumeUSD: market.volume,
          };

          await analyticsService.savePrediction(record);

          updatedCount++;
          savedRecords++;

          console.log(
            `✅ [${updatedCount}/${uniqueMarkets.length}] ${market.teamA.name} vs ${market.teamB.name} | ${homeLabel} | Win%=${(prediction.teamAProbability * 100).toFixed(1)}% | Confidence=${(prediction.confidence * 100).toFixed(0)}%`
          );
        } else {
          console.log(
            `⚠️ 跳过低置信度预测: ${market.teamA.name} vs ${market.teamB.name} | Confidence=${prediction?.confidence ? (prediction.confidence * 100).toFixed(0) : 'N/A'}%`
          );
        }
      } catch (err) {
        console.error(`❌ 处理市场失败 ${market.marketId}:`, err);
        // 继续处理下一个市场
        continue;
      }
    }

    // 11. 返回汇总
    const summary = {
      success: true,
      count: uniqueMarkets.length,
      updated: updatedCount,
      savedRecords,
      timestamp: new Date().toISOString(),
      version: 'v3.1',
    };

    console.log('✅ Cron Job 完成!');
    console.log(`📊 总市场数 (原始/去重): ${markets.length} / ${uniqueMarkets.length}`);
    console.log(`📈 已更新: ${updatedCount}`);
    console.log(`💾 已保存记录: ${savedRecords}`);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('❌ Cron job 致命错误:', error);

    return NextResponse.json(
      {
        error: 'Update failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}