// src/lib/utils/espn-mapping.ts

export const NBA_TEAM_MAPPING: Record<string, { espnId: string; abbreviation: string }> = {
  'Boston Celtics': { espnId: '2', abbreviation: 'BOS' },
  'Brooklyn Nets': { espnId: '17', abbreviation: 'BKN' },
  'New York Knicks': { espnId: '18', abbreviation: 'NYK' },
  'Philadelphia 76ers': { espnId: '20', abbreviation: 'PHI' },
  'Toronto Raptors': { espnId: '28', abbreviation: 'TOR' },
  'Chicago Bulls': { espnId: '4', abbreviation: 'CHI' },
  'Cleveland Cavaliers': { espnId: '5', abbreviation: 'CLE' },
  'Detroit Pistons': { espnId: '8', abbreviation: 'DET' },
  'Indiana Pacers': { espnId: '11', abbreviation: 'IND' },
  'Milwaukee Bucks': { espnId: '15', abbreviation: 'MIL' },
  'Atlanta Hawks': { espnId: '1', abbreviation: 'ATL' },
  'Charlotte Hornets': { espnId: '30', abbreviation: 'CHA' },
  'Miami Heat': { espnId: '14', abbreviation: 'MIA' },
  'Orlando Magic': { espnId: '19', abbreviation: 'ORL' },
  'Washington Wizards': { espnId: '27', abbreviation: 'WAS' },
  'Denver Nuggets': { espnId: '7', abbreviation: 'DEN' },
  'Minnesota Timberwolves': { espnId: '16', abbreviation: 'MIN' },
  'Oklahoma City Thunder': { espnId: '25', abbreviation: 'OKC' },
  'Portland Trail Blazers': { espnId: '22', abbreviation: 'POR' },
  'Utah Jazz': { espnId: '26', abbreviation: 'UTA' },
  'Golden State Warriors': { espnId: '9', abbreviation: 'GSW' },
  'LA Clippers': { espnId: '12', abbreviation: 'LAC' },
  'Los Angeles Lakers': { espnId: '13', abbreviation: 'LAL' },
  'Phoenix Suns': { espnId: '21', abbreviation: 'PHX' },
  'Sacramento Kings': { espnId: '23', abbreviation: 'SAC' },
  'Dallas Mavericks': { espnId: '6', abbreviation: 'DAL' },
  'Houston Rockets': { espnId: '10', abbreviation: 'HOU' },
  'Memphis Grizzlies': { espnId: '29', abbreviation: 'MEM' },
  'New Orleans Pelicans': { espnId: '3', abbreviation: 'NOP' },
  'San Antonio Spurs': { espnId: '24', abbreviation: 'SAS' },
};

export function getEspnTeamId(teamName: string): string | null {
  return NBA_TEAM_MAPPING[teamName]?.espnId || null;
}

export function getTeamLogoUrl(teamName: string): string {
  const mapping = NBA_TEAM_MAPPING[teamName];
  if (mapping && mapping.abbreviation) {
    return `https://a.espncdn.com/i/teamlogos/nba/500/${mapping.abbreviation.toLowerCase()}.png`;
  }
  return 'https://a.espncdn.com/i/teamlogos/nba/500/nba.png';
}

/**
 * 智能查找 ESPN 比赛 ID
 * 自动扫描前后 1 天，解决时区导致找不到比赛的问题
 */
export async function findEspnGame(teamA: string, teamB: string, dateStr?: string): Promise<string | null> {
  try {
    const teamAId = getEspnTeamId(teamA);
    const teamBId = getEspnTeamId(teamB);

    if (!teamAId || !teamBId) return null;

    // 如果没有日期，默认今天
    const baseDate = dateStr ? new Date(dateStr) : new Date();
    
    // 生成要检查的日期列表：[前一天, 当天, 后一天]
    // 这样可以完美解决 Polymarket UTC 时间与 ESPN 美国时间不一致的问题
    const datesToCheck = [-1, 0, 1].map(offset => {
        const d = new Date(baseDate);
        d.setDate(d.getDate() + offset);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yyyy}${mm}${dd}`;
    });

    // 并行查询这几天的赛程
    for (const dateParam of datesToCheck) {
        try {
            const response = await fetch(
                `https://site.api.espn.com/apis/site/v2/sports/basketball/nba/scoreboard?dates=${dateParam}`
            );
            
            if (!response.ok) continue;

            const data = await response.json();
            const events = data.events || [];

            for (const event of events) {
                const competition = event.competitions?.[0];
                if (!competition) continue;

                const competitors = competition.competitors || [];
                const teamIds = competitors.map((c: any) => c.team?.id);

                // 只要两个队伍 ID 都匹配，就是这场比赛
                if (teamIds.includes(teamAId) && teamIds.includes(teamBId)) {
                    console.log(`✅ Found ESPN game on ${dateParam}: ${event.id}`);
                    return event.id;
                }
            }
        } catch (e) {
            console.warn(`Failed to check date ${dateParam}`, e);
        }
    }

    return null;
  } catch (error) {
    console.error('Error finding ESPN game:', error);
    return null;
  }
}