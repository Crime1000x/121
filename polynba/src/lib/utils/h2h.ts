import type { H2HGame, H2HStats } from '@/types';

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

  games.forEach(game => {
    const isAHome = game.home === teamA;
    const scoreA = isAHome ? game.homeScore : game.awayScore;
    const scoreB = isAHome ? game.awayScore : game.homeScore;

    totalScoreA += scoreA;
    totalScoreB += scoreB;

    if (game.winner === teamA) {
      teamAWins++;
      if (isAHome) homeGamesAWins++;
      else awayGamesAWins++;
    } else {
      teamBWins++;
      if (isAHome) awayGamesBWins++;
      else homeGamesBWins++;
    }
  });

  const last5 = games.slice(-5);
  const recentFormA = last5.map(g => (g.winner === teamA ? 'W' : 'L')).join('');
  const recentFormB = last5.map(g => (g.winner === teamB ? 'W' : 'L')).join('');

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
      teamA: recentFormA,
      teamB: recentFormB,
    },
  };
}
