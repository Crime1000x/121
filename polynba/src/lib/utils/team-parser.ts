import teamMapping from '@/../public/data/team-mapping.json';

export interface TeamMapping {
  espn: string;
  aliases: string[];
}

export function parseTeamAbbr(teamName: string, sport: string = 'nba'): string | null {
  const sportMapping = teamMapping[sport as keyof typeof teamMapping];
  if (!sportMapping) return null;

  // Direct match
  for (const [canonical, data] of Object.entries(sportMapping)) {
    const mapping = data as TeamMapping;

    // Check exact match
    if (canonical.toLowerCase() === teamName.toLowerCase()) {
      return mapping.espn;
    }

    // Check aliases
    for (const alias of mapping.aliases) {
      if (alias.toLowerCase() === teamName.toLowerCase()) {
        return mapping.espn;
      }
    }

    // Check if team name contains canonical name
    if (teamName.toLowerCase().includes(canonical.toLowerCase())) {
      return mapping.espn;
    }
  }

  // Fallback: return original if it's already an abbreviation (3 chars)
  if (teamName.length === 3) {
    return teamName.toUpperCase();
  }

  return null;
}

export function parseTeamsFromTitle(title: string): { teamA: string; teamB: string } | null {
  // Pattern 1: "Team A vs Team B"
  const vsPattern = /(.+?)\s+(?:vs\.?|@|v)\s+(.+?)(?:\s+\||$|Will|win|beat|\?)/i;
  const match = title.match(vsPattern);

  if (match) {
    const teamA = match[1].trim();
    const teamB = match[2].trim();

    const abbrA = parseTeamAbbr(teamA);
    const abbrB = parseTeamAbbr(teamB);

    if (abbrA && abbrB) {
      return { teamA: abbrA, teamB: abbrB };
    }
  }

  // Pattern 2: "Will Team A beat Team B"
  const willPattern = /Will\s+(.+?)\s+(?:beat|defeat)\s+(.+?)(?:\s+by|\?|$)/i;
  const willMatch = title.match(willPattern);

  if (willMatch) {
    const teamA = willMatch[1].trim();
    const teamB = willMatch[2].trim();

    const abbrA = parseTeamAbbr(teamA);
    const abbrB = parseTeamAbbr(teamB);

    if (abbrA && abbrB) {
      return { teamA: abbrA, teamB: abbrB };
    }
  }

  return null;
}
