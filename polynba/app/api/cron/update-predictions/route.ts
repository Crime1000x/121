import { NextResponse } from 'next/server';
import redis from '@/lib/db/redis';
import { getTopMarkets } from '@/lib/api/polymarket';
import { findEspnGame, getEspnTeamId } from '@/lib/utils/espn-mapping';
import { generatePrediction } from '@/lib/utils/prediction-engine';
import { calculateH2HStats } from '@/lib/utils/h2h';

// 设置超时时间 5分钟
export const maxDuration = 300;
// 强制动态渲染，避免 Next.js 缓存
export const dynamic = 'force-dynamic';

// 🔧 工具函数：调用本地 API
async function fetchLocalApi(path: string) {
  try {
    // 添加 cache: 'no-store' 确保获取最新数据
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

  console.log('🔄 Cron Job (v2.7 - 包含主场优势): 开始执行深度预测任务...');

  try {
    // 1. 获取市场
    const markets = await getTopMarkets(50);
    let updatedCount = 0;

    // 2. 遍历每个市场
    for (const market of markets) {
      if (!market.teamA?.name || !market.teamB?.name) continue;

      // 礼貌延时 (200ms，防止超时)
      await new Promise((r) => setTimeout(r, 200));

      try {
        // A. 查找 ESPN eventId
        const eventId = await findEspnGame(
          market.teamA.name,
          market.teamB.name,
          market.startTime
        );
        if (!eventId) {
          console.log(`⚠️ No ESPN Game found for ${market.teamA.name} vs ${market.teamB.name}`);
          continue;
        }

        // B. 获取各种统计数据
        const teamAId = getEspnTeamId(market.teamA.name);
        const teamBId = getEspnTeamId(market.teamB.name);

        const [gameData, statsA, statsB, advStatsA, advStatsB] = await Promise.all([
          fetchLocalApi(`/api/game-data?eventId=${eventId}`),
          fetchLocalApi(`/api/team-stats?team=${encodeURIComponent(market.teamA.name)}`),
          fetchLocalApi(`/api/team-stats?team=${encodeURIComponent(market.teamB.name)}`),
          teamAId ? fetchLocalApi(`/api/team-advanced-stats?teamId=${teamAId}`) : null,
          teamBId ? fetchLocalApi(`/api/team-advanced-stats?teamId=${teamBId}`) : null,
        ]);

        // C. 整理 H2H 数据
        let h2hStats = null;
        let recentGames = [];

        if (statsA?.recentGames && statsB?.recentGames) {
          recentGames = [...statsA.recentGames, ...statsB.recentGames]
            .filter(
              (g: any, index: number, self: any[]) =>
                index === self.findIndex((t: any) => t.date === g.date && t.home === g.home)
            )
            .filter((g: any) => g.homeScore + g.awayScore > 0)
            .sort((a: any, b: any) => 
              new Date(b.date).getTime() - new Date(a.date).getTime()
            ); // ✅ 关键修复：按日期倒序排序

          if (recentGames.length > 0) {
            h2hStats = calculateH2HStats(recentGames, market.teamA.name, market.teamB.name);
          }
        }

        // D. 计算休息天数
        const calculateRest = (teamName: string) => {
          const games = recentGames
            .filter((g: any) => g.home === teamName || g.away === teamName)
            .sort(
              (a: any, b: any) =>
                new Date(b.date).getTime() - new Date(a.date).getTime()
            );

          const targetTime = new Date(market.startTime || Date.now()).getTime();
          const pastGames = games.filter(
            (g: any) => new Date(g.date).getTime() < targetTime
          );

          if (pastGames.length === 0) return 3;

          const diff =
            Math.abs(targetTime - new Date(pastGames[0].date).getTime()) /
            (1000 * 3600 * 24);
          return Math.ceil(diff);
        };

        const restA = calculateRest(market.teamA.name);
        const restB = calculateRest(market.teamB.name);

        // ============================================
        // 🆕 核心修复：准确判断主客场
        // ============================================
        let isTeamAHome: boolean | null = null;

        // 优先级 1: 使用 gameData.competitors（最准确）
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

        // 优先级 2: 兜底使用 seasonSeries
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

        // 优先级 3: 最后兜底 - 通过球队名称判断（可选）
        if (isTeamAHome === null) {
            // 可以添加额外的判断逻辑
            // 例如：根据比赛地点、历史主场等
            console.warn(`⚠️ 无法确定 ${market.teamA.name} vs ${market.teamB.name} 的主客场信息`);
        }

        // E. 生成最终预测（✅ 包含主场优势参数）
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
          isTeamAHome // ✅ 关键参数：主场优势
        );

        // F. 写入 Redis 缓存
        if (prediction && prediction.confidence > 0.5) {
          await redis.set(
            `prediction:${market.marketId}`,
            prediction.teamAProbability.toFixed(4),
            'EX',
            7200 // 2小时
          );

          updatedCount++;
          
          // ✅ 改进日志：显示主场信息和胜率
          const homeLabel = isTeamAHome === true ? '🏠 Home' : isTeamAHome === false ? '✈️ Away' : '❓ Unknown';
          console.log(
            `✅ Redis Saved: ${market.teamA.name} vs ${market.teamB.name} ` +
            `| ${homeLabel} | Win%=${(prediction.teamAProbability * 100).toFixed(1)}% ` +
            `| Confidence=${(prediction.confidence * 100).toFixed(0)}%`
          );
        } else {
          console.warn(
            `⚠️ Skipped: ${market.teamA.name} vs ${market.teamB.name} ` +
            `(Confidence too low: ${prediction?.confidence || 0})`
          );
        }
      } catch (err) {
        console.error(`❌ Failed market ${market.marketId}:`, err);
      }
    }

    const summary = {
      success: true,
      count: markets.length,
      updated: updatedCount,
      timestamp: new Date().toISOString(),
      version: '2.7.0'
    };

    console.log(`✅ Cron Job 完成: ${updatedCount}/${markets.length} 个市场已更新`);

    return NextResponse.json(summary);
  } catch (error) {
    console.error('❌ Cron job fatal error:', error);
    return NextResponse.json({ 
      error: 'Update failed', 
      message: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}