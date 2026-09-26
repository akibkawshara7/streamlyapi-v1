import express, { Request, Response } from 'express';
import { detectAniListFromFribb } from './fribb.js';

export const itMapRouter = express.Router();

const TMDB_KEYS = [
  process.env.TMDB_API_KEY,
  '8265bd1679663a7ea12ac168da84d2e8',
  '1f54bd990f1cdfb230adb312546d765d',
  '4f8205562725e2d67a14e9f731215b04'
].filter(Boolean) as string[];

// Dedicated Caches for ITMap & Fribb combined (24 hours TTL)
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// 1. TMDB Show Metadata Cache
const tmdbShowCache = new Map<string, CacheEntry<any>>();
const tmdbShowInflight = new Map<string, Promise<any>>();

// 2. Cinemeta Videos Cache
const cinemetaCache = new Map<string, CacheEntry<any[]>>();
const cinemetaInflight = new Map<string, Promise<any[]>>();

// 3. Fully Computed ITMap + Fribb AniList Result Cache (instant sub-millisecond responses)
export interface ItMapResult {
  tmdb_id: string;
  tmdb_season: number;
  tmdb_episode: number;
  imdb_id: string | null;
  imdb_season: number;
  imdb_episode: number;
  anilist_id: number | null;
  anilist_episode: number | null;
}

const itMapResultCache = new Map<string, CacheEntry<ItMapResult>>();
const itMapInflight = new Map<string, Promise<ItMapResult>>();

/**
 * Fetch TMDB Show with cache and key rotation
 */
async function fetchTmdbSingleCached(tmdbId: string): Promise<any> {
  const cached = tmdbShowCache.get(tmdbId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const inflight = tmdbShowInflight.get(tmdbId);
  if (inflight) return inflight;

  const fetchPromise = (async () => {
    let lastErr: any = null;
    for (const key of TMDB_KEYS) {
      try {
        const res = await fetch(
          `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${key}&append_to_response=external_ids`,
          {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(6000)
          }
        );
        if (res.ok) {
          const data = await res.json();
          tmdbShowCache.set(tmdbId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
          return data;
        }
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error(`Failed to fetch TMDB show: ${tmdbId}`);
  })();

  tmdbShowInflight.set(tmdbId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    tmdbShowInflight.delete(tmdbId);
  }
}

/**
 * Fetch Cinemeta series videos with cache
 */
async function fetchCinemetaVideosCached(imdbId: string): Promise<any[]> {
  const cached = cinemetaCache.get(imdbId);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const inflight = cinemetaInflight.get(imdbId);
  if (inflight) return inflight;

  const fetchPromise = (async () => {
    try {
      const res = await fetch(`https://v3-cinemeta.strem.io/meta/series/${imdbId}.json`, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data: any = await res.json();
        const videos = Array.isArray(data?.meta?.videos) ? data.meta.videos : [];
        cinemetaCache.set(imdbId, { data: videos, expiresAt: Date.now() + CACHE_TTL_MS });
        return videos;
      }
    } catch {}
    return [];
  })();

  cinemetaInflight.set(imdbId, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    cinemetaInflight.delete(imdbId);
  }
}

/**
 * Resolves TMDB Show and absolute episode to TMDB Season/Episode, IMDb ID & Season/Episode,
 * and detects AniList ID + Episode via Fribb.
 * Fully cached with request coalescing for highest performance.
 */
export async function resolveItMap(tmdb: string, absoluteEpisode: number): Promise<ItMapResult> {
  const cacheKey = `${tmdb}:${absoluteEpisode}`;

  // 1. Instant Cache Hit Check
  const cached = itMapResultCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  // 2. Coalesce concurrent requests
  const inflight = itMapInflight.get(cacheKey);
  if (inflight) return inflight;

  const computePromise = (async () => {
    const tvData = await fetchTmdbSingleCached(tmdb);
    const tmdbRegularSeasons = (tvData?.seasons || [])
      .filter((s: any) => typeof s.season_number === 'number' && s.season_number > 0)
      .sort((a: any, b: any) => a.season_number - b.season_number);

    let remTmdb = absoluteEpisode;
    let tmdbSeason = 1;
    let tmdbEpisode = absoluteEpisode;
    let tmdbMatched = false;

    for (const s of tmdbRegularSeasons) {
      const epCount = s.episode_count || 0;
      if (epCount <= 0) continue;
      if (!tmdbMatched && remTmdb <= epCount) {
        tmdbSeason = s.season_number;
        tmdbEpisode = remTmdb;
        tmdbMatched = true;
        break;
      }
      remTmdb -= epCount;
    }

    if (!tmdbMatched && tmdbRegularSeasons.length > 0) {
      const lastSeason = tmdbRegularSeasons[tmdbRegularSeasons.length - 1];
      tmdbSeason = lastSeason.season_number;
      tmdbEpisode = remTmdb;
    }

    const imdbId: string | null = tvData?.external_ids?.imdb_id || null;
    let imdbSeason = tmdbSeason;
    let imdbEpisode = tmdbEpisode;

    if (imdbId) {
      const videos = await fetchCinemetaVideosCached(imdbId);
      if (videos.length > 0) {
        const seasonMap = new Map<number, number[]>();
        for (const v of videos) {
          const sNum = typeof v.season === 'number' ? v.season : parseInt(v.season, 10) || 1;
          const epNum = typeof v.episode === 'number'
            ? v.episode
            : typeof v.number === 'number'
              ? v.number
              : parseInt(v.number || v.episode, 10) || 1;
          if (!seasonMap.has(sNum)) seasonMap.set(sNum, []);
          seasonMap.get(sNum)!.push(epNum);
        }
        const regSeasons = Array.from(seasonMap.keys()).filter((s) => s > 0).sort((a, b) => a - b);
        let remImdb = absoluteEpisode;
        let imdbMatched = false;
        for (const sNum of regSeasons) {
          const epCount = seasonMap.get(sNum)!.length;
          if (!imdbMatched && remImdb <= epCount) {
            imdbSeason = sNum;
            imdbEpisode = remImdb;
            imdbMatched = true;
            break;
          }
          remImdb -= epCount;
        }
        if (!imdbMatched && regSeasons.length > 0) {
          imdbSeason = regSeasons[regSeasons.length - 1];
          imdbEpisode = remImdb;
        }
      }
    }

    // Detect AniList ID and episode from Fribb using TMDB ID, IMDb ID, and season/episode mapping
    let anilistId: number | null = null;
    let anilistEp: number | null = null;
    try {
      const fribbMatch = await detectAniListFromFribb({
        tmdbId: tmdb,
        absoluteEpisode,
        tmdbSeason,
        tmdbEpisode,
        imdbId,
        imdbSeason,
        imdbEpisode
      });
      if (fribbMatch && fribbMatch.anilist_id) {
        anilistId = fribbMatch.anilist_id;
        anilistEp = fribbMatch.anilist_episode;
      }
    } catch (fribbErr) {
      console.warn(`Fribb detection skipped for TMDB ${tmdb}:`, fribbErr);
    }

    const result: ItMapResult = {
      tmdb_id: tmdb,
      tmdb_season: tmdbSeason,
      tmdb_episode: tmdbEpisode,
      imdb_id: imdbId,
      imdb_season: imdbSeason,
      imdb_episode: imdbEpisode,
      anilist_id: anilistId,
      anilist_episode: anilistEp
    };

    // Cache the result
    if (itMapResultCache.size > 20000) {
      const keys = itMapResultCache.keys();
      for (let i = 0; i < 2000; i++) {
        const next = keys.next();
        if (next.done) break;
        itMapResultCache.delete(next.value);
      }
    }
    itMapResultCache.set(cacheKey, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });

    return result;
  })();

  itMapInflight.set(cacheKey, computePromise);
  try {
    return await computePromise;
  } finally {
    itMapInflight.delete(cacheKey);
  }
}

/**
 * Route handler:
 * GET /map/:tmdb/:absep
 * GET /map/:tmdb?ep=...
 * GET /api/map/:tmdb/:absep
 * GET /api/map/:tmdb?ep=...
 */
itMapRouter.get(
  ['/:tmdb/:absep', '/map/:tmdb/:absep', '/:tmdb', '/map/:tmdb'],
  async (req: Request, res: Response) => {
    const { tmdb, absep } = req.params;
    if (!tmdb || !/^\d+$/.test(tmdb)) {
      return res.status(400).json({ error: 'Invalid TMDB ID. Must be numeric.' });
    }

    const epParam = absep || req.query.absep || req.query.ep || req.query.episode || 1;
    const ab = parseInt(String(epParam), 10);
    if (isNaN(ab) || ab < 1) {
      return res.status(400).json({ error: 'Invalid absolute episode. Must be a positive integer >= 1.' });
    }

    const cacheKey = `${tmdb}:${ab}`;
    const isHit = itMapResultCache.has(cacheKey) && Date.now() < (itMapResultCache.get(cacheKey)?.expiresAt || 0);

    try {
      const it = await resolveItMap(tmdb, ab);

      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=86400');
      res.setHeader('X-Cache', isHit ? 'HIT' : 'MISS');
      res.setHeader('X-Cache-Strategy', 'map-fribb-memory-24h');

      return res.json({
        tmdb_id: it.tmdb_id,
        season: it.tmdb_season,
        episode: it.tmdb_episode,
        imdb_id: it.imdb_id,
        imdb_season: it.imdb_season,
        imdb_episode: it.imdb_episode,
        anilist_id: it.anilist_id,
        anilist_episode: it.anilist_episode
      });
    } catch (err: any) {
      return res.status(502).json({ error: err.message || 'Failed to map' });
    }
  }
);
