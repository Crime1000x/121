export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  expiresIn: number;
}

const CACHE_PREFIX = 'polyarena_';
const CACHE_VERSION = '3'; // Increment when data structure changes

export class Cache {
  // Check and migrate cache if needed
  static checkVersion(): void {
    if (typeof window === 'undefined') return;

    try {
      const currentVersion = localStorage.getItem(CACHE_PREFIX + 'version');
      if (currentVersion !== CACHE_VERSION) {
        console.log('Cache version changed, clearing old cache...');
        this.clear();
        localStorage.setItem(CACHE_PREFIX + 'version', CACHE_VERSION);
      }
    } catch (error) {
      console.warn('Failed to check cache version:', error);
    }
  }
  static set<T>(key: string, data: T, expiresInMs: number = 3600000): void {
    if (typeof window === 'undefined') return;

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      expiresIn: expiresInMs,
    };

    try {
      localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
      console.warn('Failed to set cache:', error);
    }
  }

  static get<T>(key: string): T | null {
    if (typeof window === 'undefined') return null;

    try {
      const item = localStorage.getItem(CACHE_PREFIX + key);
      if (!item) return null;

      const entry: CacheEntry<T> = JSON.parse(item);
      const now = Date.now();

      // Check if expired
      if (now - entry.timestamp > entry.expiresIn) {
        localStorage.removeItem(CACHE_PREFIX + key);
        return null;
      }

      return entry.data;
    } catch (error) {
      console.warn('Failed to get cache:', error);
      return null;
    }
  }

  static remove(key: string): void {
    if (typeof window === 'undefined') return;

    try {
      localStorage.removeItem(CACHE_PREFIX + key);
    } catch (error) {
      console.warn('Failed to remove cache:', error);
    }
  }

  static clear(): void {
    if (typeof window === 'undefined') return;

    try {
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        // Don't remove the version key
        if (key.startsWith(CACHE_PREFIX) && key !== CACHE_PREFIX + 'version') {
          localStorage.removeItem(key);
        }
      });
    } catch (error) {
      console.warn('Failed to clear cache:', error);
    }
  }
}

// Helper functions
import { H2HGame, H2HStats } from '@/types';

export function getCachedH2H(
  teamA: string,
  teamB: string
): { games: H2HGame[]; stats: H2HStats } | null {
  const key = `h2h_${[teamA, teamB].sort().join('_')}`;
  return Cache.get<{ games: H2HGame[]; stats: H2HStats }>(key);
}

export function setCachedH2H(
  teamA: string,
  teamB: string,
  data: { games: H2HGame[]; stats: H2HStats }
) {
  const key = `h2h_${[teamA, teamB].sort().join('_')}`;
  // Cache for 24 hours
  Cache.set(key, data, 24 * 60 * 60 * 1000);
}

import { ArenaMarket } from '@/types';

export function getCachedMarkets(): ArenaMarket[] | null {
  return Cache.get<ArenaMarket[]>('markets');
}

export function setCachedMarkets(data: ArenaMarket[]) {
  // Cache for 5 minutes
  Cache.set('markets', data, 5 * 60 * 1000);
}
