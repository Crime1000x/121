import type { ESPNGame, H2HGame } from '@/types';

const ESPN_BASE = process.env.NEXT_PUBLIC_ESPN_API || 'https://site.api.espn.com/apis/site/v2/sports';

// Format date to YYYYMMDD
function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

// Fetch games by date for NBA
export async function fetchNBAGamesByDate(dateStr: string): Promise<ESPNGame[]> {
  try {
    const url = `${ESPN_BASE}/basketball/nba/scoreboard?dates=${dateStr}`;
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    return data.events || [];
  } catch (error) {
    console.error('Error fetching ESPN games:', error);
    return [];
  }
}

// Get H2H games for a date range
export async function getH2HGamesFromESPN(
  teamA: string,
  teamB: string,
  startDate: Date,
  endDate: Date,
  onProgress?: (current: number, total: number) => void
): Promise<H2HGame[]> {
  const games: H2HGame[] = [];
  const currentDate = new Date(startDate);

  // Calculate total days to scan
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
  let daysScanned = 0;

  while (currentDate <= endDate) {
    // Skip off-season months (July, August, September)
    const month = currentDate.getMonth();
    if (month >= 6 && month <= 8) {
      currentDate.setMonth(9); // Jump to October
      currentDate.setDate(1);
      continue;
    }

    const dateStr = formatDate(currentDate);
    const dayGames = await fetchNBAGamesByDate(dateStr);

    // Filter games that include both teams
    for (const game of dayGames) {
      if (!game.competitions || game.competitions.length === 0) continue;

      const competition = game.competitions[0];
      const competitors = competition.competitors;

      if (competitors.length !== 2) continue;

      const team1 = competitors[0].team.displayName;
      const team2 = competitors[1].team.displayName;

      // Check if this game involves both teams
      if (
        (team1 === teamA && team2 === teamB) ||
        (team1 === teamB && team2 === teamA)
      ) {
        const homeTeam = competitors.find(c => c.homeAway === 'home')!;
        const awayTeam = competitors.find(c => c.homeAway === 'away')!;

        games.push({
          date: competition.date.split('T')[0],
          home: homeTeam.team.displayName,
          away: awayTeam.team.displayName,
          homeScore: parseInt(homeTeam.score) || 0,
          awayScore: parseInt(awayTeam.score) || 0,
          winner: homeTeam.winner ? homeTeam.team.displayName : awayTeam.team.displayName,
          venue: competition.venue?.fullName,
          attendance: competition.attendance,
        });

        // If we found a game, we can report progress
        console.log(`✅ Found game: ${teamA} vs ${teamB} on ${competition.date.split('T')[0]}`);
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
    daysScanned++;

    // Report progress every 10 days
    if (onProgress && daysScanned % 10 === 0) {
      onProgress(daysScanned, totalDays);
    }

    // Reduce delay to speed up scanning
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return games;
}

// Get all games for a single team (not just H2H)
export async function getTeamRecentGames(
  teamName: string,
  days: number = 30
): Promise<H2HGame[]> {
  const games: H2HGame[] = [];
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const currentDate = new Date(startDate);

  console.log(`Fetching recent games for ${teamName}...`);

  while (currentDate <= endDate) {
    // Skip off-season months
    const month = currentDate.getMonth();
    if (month >= 6 && month <= 8) {
      currentDate.setMonth(9);
      currentDate.setDate(1);
      continue;
    }

    const dateStr = formatDate(currentDate);
    const dayGames = await fetchNBAGamesByDate(dateStr);

    for (const game of dayGames) {
      if (!game.competitions || game.competitions.length === 0) continue;

      const competition = game.competitions[0];
      const competitors = competition.competitors;

      if (competitors.length !== 2) continue;

      const team1 = competitors[0].team.displayName;
      const team2 = competitors[1].team.displayName;

      // Check if this game involves the team
      if (team1 === teamName || team2 === teamName) {
        const homeTeam = competitors.find(c => c.homeAway === 'home')!;
        const awayTeam = competitors.find(c => c.homeAway === 'away')!;

        games.push({
          date: competition.date.split('T')[0],
          home: homeTeam.team.displayName,
          away: awayTeam.team.displayName,
          homeScore: parseInt(homeTeam.score) || 0,
          awayScore: parseInt(awayTeam.score) || 0,
          winner: homeTeam.winner ? homeTeam.team.displayName : awayTeam.team.displayName,
          venue: competition.venue?.fullName,
          attendance: competition.attendance,
        });
      }
    }

    currentDate.setDate(currentDate.getDate() + 1);
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  console.log(`Found ${games.length} games for ${teamName}`);
  return games.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

// Get recent games (last N days) - H2H only
export async function getRecentGames(
  teamA: string,
  teamB: string,
  days: number = 90
): Promise<H2HGame[]> {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  return getH2HGamesFromESPN(teamA, teamB, startDate, endDate);
}

// Get current season games
export async function getCurrentSeasonGames(
  teamA: string,
  teamB: string
): Promise<H2HGame[]> {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  // NBA season starts in October
  const seasonStart = month >= 9 ? new Date(year, 9, 1) : new Date(year - 1, 9, 1);

  return getH2HGamesFromESPN(teamA, teamB, seasonStart, now);
}
