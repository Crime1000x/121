import { H2HGame, H2HStats } from '@/types';

export function calculateH2HStats(games: H2HGame[], teamA: string, teamB: string): H2HStats {
  const totalGames = games.length;
  let teamAWins = 0;
  let teamBWins = 0;
  let homeGamesAWins = 0;
  let homeGamesBWins = 0;
  let awayGamesAWins = 0;
  let awayGamesBWins = 0;
  let totalScoreA = 0;
  let totalScoreB = 0;

  // 辅助函数：检查球队是否参与了这场比赛 (模糊匹配)
  const participates = (game: H2HGame, targetTeam: string) => {
    const target = targetTeam.toLowerCase().trim();
    const home = game.home.toLowerCase().trim();
    const away = game.away.toLowerCase().trim();
    return home.includes(target) || target.includes(home) || away.includes(target) || target.includes(away);
  };

  // 辅助函数：稳健的胜负判断
  const checkWin = (game: H2HGame, targetTeam: string) => {
    if (!participates(game, targetTeam)) return false; // 没参赛当然不算赢

    const target = targetTeam.toLowerCase().trim();
    const home = game.home.toLowerCase().trim();
    const away = game.away.toLowerCase().trim();
    
    // 如果主队名字匹配
    if (home.includes(target) || target.includes(home)) {
      return game.homeScore > game.awayScore;
    }
    // 如果客队名字匹配
    if (away.includes(target) || target.includes(away)) {
      return game.awayScore > game.homeScore;
    }

    // 兜底：通过 winner 字段
    const winner = game.winner ? game.winner.toLowerCase().trim() : '';
    if (winner && (winner === target || winner.includes(target) || target.includes(winner))) {
      return true;
    }

    return false;
  };

  // 1. 统计总览数据 (遍历所有混合比赛)
  games.forEach(game => {
    if (game.homeScore === 0 && game.awayScore === 0) return;

    const isAHome = participates(game, teamA) && (game.home.toLowerCase().includes(teamA.toLowerCase()) || teamA.toLowerCase().includes(game.home.toLowerCase()));
    
    const scoreA = isAHome ? game.homeScore : game.awayScore;
    const scoreB = isAHome ? game.awayScore : game.homeScore;

    totalScoreA += scoreA;
    totalScoreB += scoreB;

    if (checkWin(game, teamA)) {
      teamAWins++;
      if (isAHome) homeGamesAWins++;
      else awayGamesAWins++;
    }
    
    if (checkWin(game, teamB)) {
      teamBWins++;
      if (isAHome) awayGamesBWins++; // 如果 A 是主队，B 赢了，那对 B 来说是客场胜
      else homeGamesBWins++;
    }
  });

  // 2. 🛠️ 核心修复：分别筛选各自参与的比赛，再计算 Form
  // 之前是直接取混合列表的前5场，如果前5场里有对手的比赛，就会被误判为 L
  
  // 筛选 Team A 的最近 5 场
  const recentGamesA = games
    .filter(g => participates(g, teamA))
    .slice(0, 5);
  
  const recentFormA = recentGamesA
    .map(g => (checkWin(g, teamA) ? 'W' : 'L'))
    .join('');

  // 筛选 Team B 的最近 5 场
  const recentGamesB = games
    .filter(g => participates(g, teamB))
    .slice(0, 5);

  const recentFormB = recentGamesB
    .map(g => (checkWin(g, teamB) ? 'W' : 'L'))
    .join('');

  // 这里的 last5Games 依然返回混合列表的前5场，用于可能需要的混合展示
  const last5 = games.slice(0, 5);

  return {
    totalGames,
    teamAWins,
    teamBWins,
    teamAWinRate: totalGames > 0 ? teamAWins / totalGames : 0,
    homeGames: {
      teamAWins: homeGamesAWins,
      teamBWins: homeGamesBWins,
    },
    awayGames: {
      teamAWins: awayGamesAWins,
      teamBWins: awayGamesBWins,
    },
    avgScoreDiff: totalGames > 0 ? (totalScoreA - totalScoreB) / totalGames : 0,
    teamAAvgScore: totalGames > 0 ? totalScoreA / totalGames : 0,
    teamBAvgScore: totalGames > 0 ? totalScoreB / totalGames : 0,
    last5Games: last5,
    recentForm: {
      teamA: recentFormA, // 现在是正确的 A 队战绩
      teamB: recentFormB, // 现在是正确的 B 队战绩
    },
  };
}