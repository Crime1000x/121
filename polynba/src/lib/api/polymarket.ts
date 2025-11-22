import { ArenaMarket } from '@/types';

// NBA team name to Polymarket code mapping
const NBA_TEAM_CODES: Record<string, string> = {
  'Atlanta Hawks': 'atl',
  'Boston Celtics': 'bos',
  'Brooklyn Nets': 'bkn',
  'Charlotte Hornets': 'cha',
  'Chicago Bulls': 'chi',
  'Cleveland Cavaliers': 'cle',
  'Dallas Mavericks': 'dal',
  'Denver Nuggets': 'den',
  'Detroit Pistons': 'det',
  'Golden State Warriors': 'gs',
  'Houston Rockets': 'hou',
  'Indiana Pacers': 'ind',
  'LA Clippers': 'lac',
  'Los Angeles Lakers': 'lal',
  'Memphis Grizzlies': 'mem',
  'Miami Heat': 'mia',
  'Milwaukee Bucks': 'mil',
  'Minnesota Timberwolves': 'min',
  'New Orleans Pelicans': 'no',
  'New York Knicks': 'nyk',
  'Oklahoma City Thunder': 'okc',
  'Orlando Magic': 'orl',
  'Philadelphia 76ers': 'phi',
  'Phoenix Suns': 'phx',
  'Portland Trail Blazers': 'por',
  'Sacramento Kings': 'sac',
  'San Antonio Spurs': 'sa',
  'Toronto Raptors': 'tor',
  'Utah Jazz': 'uta',
  'Washington Wizards': 'wsh',
};

// Map Polymarket short names to ESPN full names
const POLYMARKET_TO_ESPN_NAMES: Record<string, string> = {
  'Hawks': 'Atlanta Hawks',
  'Celtics': 'Boston Celtics',
  'Nets': 'Brooklyn Nets',
  'Hornets': 'Charlotte Hornets',
  'Bulls': 'Chicago Bulls',
  'Cavaliers': 'Cleveland Cavaliers',
  'Mavericks': 'Dallas Mavericks',
  'Nuggets': 'Denver Nuggets',
  'Pistons': 'Detroit Pistons',
  'Warriors': 'Golden State Warriors',
  'Rockets': 'Houston Rockets',
  'Pacers': 'Indiana Pacers',
  'Clippers': 'LA Clippers',
  'Lakers': 'Los Angeles Lakers',
  'Grizzlies': 'Memphis Grizzlies',
  'Heat': 'Miami Heat',
  'Bucks': 'Milwaukee Bucks',
  'Timberwolves': 'Minnesota Timberwolves',
  'Pelicans': 'New Orleans Pelicans',
  'Knicks': 'New York Knicks',
  'Thunder': 'Oklahoma City Thunder',
  'Magic': 'Orlando Magic',
  '76ers': 'Philadelphia 76ers',
  'Suns': 'Phoenix Suns',
  'Trail Blazers': 'Portland Trail Blazers',
  'Kings': 'Sacramento Kings',
  'Spurs': 'San Antonio Spurs',
  'Raptors': 'Toronto Raptors',
  'Jazz': 'Utah Jazz',
  'Wizards': 'Washington Wizards',
};

// Convert Polymarket team name to ESPN full name
export function polymarketToESPNName(shortName: string): string {
  return POLYMARKET_TO_ESPN_NAMES[shortName] || shortName;
}

// Get today's NBA schedule from ESPN API
async function getTodayNBASchedule(): Promise<Array<{ away: string; home: string; date: string }>> {
  try {
    const response = await fetch('https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard');
    if (!response.ok) {
      throw new Error(`ESPN API error: ${response.status}`);
    }

    const data = await response.json();
    const games = data.events || [];

    const schedule = games.map((game: any) => {
      const comp = game.competitions?.[0];
      const competitors = comp?.competitors || [];

      // Away team is usually index 0, home team is index 1
      const awayTeam = competitors.find((c: any) => c.homeAway === 'away')?.team?.displayName || '';
      const homeTeam = competitors.find((c: any) => c.homeAway === 'home')?.team?.displayName || '';
      const gameDate = game.date ? new Date(game.date) : new Date();

      return {
        away: awayTeam,
        home: homeTeam,
        date: gameDate.toISOString().split('T')[0], // YYYY-MM-DD
      };
    }).filter((g: any) => g.away && g.home);

    return schedule;
  } catch (error) {
    console.error('Error fetching ESPN schedule:', error);
    return [];
  }
}

// Convert team name to Polymarket code
function getTeamCode(teamName: string): string | null {
  return NBA_TEAM_CODES[teamName] || null;
}

// Construct Polymarket event slug from team names and date
function constructEventSlug(awayTeam: string, homeTeam: string, date: string): string | null {
  const awayCode = getTeamCode(awayTeam);
  const homeCode = getTeamCode(homeTeam);

  if (!awayCode || !homeCode) {
    console.warn(`Cannot find team codes for ${awayTeam} vs ${homeTeam}`);
    return null;
  }

  return `nba-${awayCode}-${homeCode}-${date}`;
}

// Fetch a single event by slug
async function fetchEventBySlug(slug: string): Promise<any | null> {
  try {
    const response = await fetch(`https://gamma-api.polymarket.com/events?slug=${slug}`);
    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    console.error(`Error fetching event ${slug}:`, error);
    return null;
  }
}

// Parse teams from title
export function parseTeamsFromTitle(title: string): { teamA: string; teamB: string } | null {
  // "Bulls vs. Pistons" or "Bulls vs Pistons"
  const vsMatch = title.match(/(.+?)\s+vs\.?\s+(.+)/i);
  if (vsMatch) {
    return {
      teamA: vsMatch[1].trim(),
      teamB: vsMatch[2].trim(),
    };
  }

  return null;
}

// Convert Polymarket market to ArenaMarket
function marketToArenaMarket(market: any, eventTitle: string, eventSlug?: string): ArenaMarket | null {
  const question = market.question || '';
  const slug = market.slug || '';

  // Parse teams from event title
  const teams = parseTeamsFromTitle(eventTitle);
  if (!teams) {
    return null;
  }

  // Parse outcome prices
  let outcomePrices: number[] = [0.5, 0.5];
  try {
    if (typeof market.outcomePrices === 'string') {
      const parsed = JSON.parse(market.outcomePrices);
      outcomePrices = parsed.map((p: string) => parseFloat(p));
    } else if (Array.isArray(market.outcomePrices)) {
      outcomePrices = market.outcomePrices.map((p: any) =>
        typeof p === 'string' ? parseFloat(p) : p
      );
    }
  } catch (e) {
    console.warn('Failed to parse outcomePrices:', market.outcomePrices);
  }

  return {
    marketId: market.id,
    eventId: market.id,
    eventSlug: eventSlug || '',
    marketSlug: slug,
    title: question,
    sport: 'NBA',
    startTime: market.gameStartTime || new Date().toISOString(),
    volume: market.volumeNum || market.volume || 0,
    liquidity: market.liquidityNum || market.liquidity,
    prices: {
      yes: outcomePrices[0] || 0.5,
      no: outcomePrices[1] || 0.5,
    },
    teamA: { name: polymarketToESPNName(teams.teamA) },
    teamB: { name: polymarketToESPNName(teams.teamB) },
  };
}

// Get all markets for today's NBA games
export async function getTopMarkets(limit: number = 10): Promise<ArenaMarket[]> {
  try {
    // Get NBA events directly from Polymarket
    console.log('Fetching NBA events from Polymarket...');

    // Fetch events from Polymarket with NBA tag_id
    // Get a larger limit to ensure we get all recent games
    const url = `https://gamma-api.polymarket.com/events?tag_id=745&closed=false&limit=100`;
    console.log(`Fetching from: ${url}`);

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Polymarket API error: ${response.status}`);
    }

    const events = await response.json();
    console.log(`Found ${events.length} total events`);

    // Filter for actual games (not futures)
    // Games have "vs" or "vs." in the title
    const gameEvents = events.filter((event: any) => {
      const title = event.title || '';
      return title.includes(' vs ') || title.includes(' vs. ');
    });

    console.log(`Found ${gameEvents.length} actual game events`);

    // Extract all markets from game events
    const allMarkets: ArenaMarket[] = [];
    for (const event of gameEvents) {
      const eventTitle = event.title || '';
      const eventSlug = event.slug || '';
      const markets = event.markets || [];

      // Include all market types from game events
      for (const market of markets) {
        const arenaMarket = marketToArenaMarket(market, eventTitle, eventSlug);
        if (arenaMarket) {
          allMarkets.push(arenaMarket);
        }
      }
    }

    console.log(`Extracted ${allMarkets.length} total markets`);

    // Sort by volume and return top markets
    allMarkets.sort((a, b) => b.volume - a.volume);

    return allMarkets.slice(0, limit);
  } catch (error) {
    console.error('Error in getTopMarkets:', error);
    return [];
  }
}

// Kept for compatibility but not used in new flow
export async function fetchSportsMarkets(limit: number = 20): Promise<any[]> {
  return [];
}
