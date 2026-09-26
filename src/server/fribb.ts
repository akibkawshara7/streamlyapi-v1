export interface FribbMinimalResult {
  anilist_id: number | null;
  ep: number;
}

export interface FribbItem {
  anilist_id?: number | null;
  mal_id?: number | null;
  themoviedb_id?: number | { tv?: number | number[]; movie?: number | number[] } | null;
  tmdb_id?: number | null;
  imdb_id?: string | string[] | null;
  type?: string;
  season?: { tmdb?: number; tvdb?: number };
  episode_offset?: { tmdb?: number; tvdb?: number };
  [key: string]: any;
}

export interface FribbIndex {
  items: FribbItem[];
  // O(1) indexed lookup by TMDB ID
  tmdbMap: Map<number, FribbItem[]>;
  // O(1) indexed lookup by IMDb ID
  imdbMap: Map<string, FribbItem[]>;
}

// Global in-memory dataset cache
let cachedFribbIndex: FribbIndex | null = null;
let fribbLoadingPromise: Promise<FribbIndex> | null = null;

// Dedicated Result Cache for Fribb (24 hours TTL)
const FRIBB_CACHE_TTL = 24 * 60 * 60 * 1000;
const fribbResultCache = new Map<string, { result: FribbMinimalResult; expiresAt: number }>();
const fribbInflight = new Map<string, Promise<FribbMinimalResult>>();

/**
 * Indexes the Fribb items array for O(1) instant TMDB and IMDb lookups
 */
function buildFribbIndex(items: FribbItem[]): FribbIndex {
  const tmdbMap = new Map<number, FribbItem[]>();
  const imdbMap = new Map<string, FribbItem[]>();

  const addTmdb = (id: number, item: FribbItem) => {
    if (!id || isNaN(id)) return;
    let list = tmdbMap.get(id);
    if (!list) {
      list = [];
      tmdbMap.set(id, list);
    }
    list.push(item);
  };

  const addImdb = (imdbId: string, item: FribbItem) => {
    if (!imdbId || typeof imdbId !== 'string') return;
    const clean = imdbId.trim().toLowerCase();
    if (!clean) return;
    let list = imdbMap.get(clean);
    if (!list) {
      list = [];
      imdbMap.set(clean, list);
    }
    list.push(item);
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const tmdb = item.themoviedb_id;

    if (tmdb !== undefined && tmdb !== null) {
      if (typeof tmdb === 'number') {
        addTmdb(tmdb, item);
      } else if (typeof tmdb === 'object') {
        if (typeof tmdb.tv === 'number') {
          addTmdb(tmdb.tv, item);
        } else if (Array.isArray(tmdb.tv)) {
          for (const tid of tmdb.tv) {
            if (typeof tid === 'number') addTmdb(tid, item);
          }
        }

        if (typeof tmdb.movie === 'number') {
          addTmdb(tmdb.movie, item);
        } else if (Array.isArray(tmdb.movie)) {
          for (const mid of tmdb.movie) {
            if (typeof mid === 'number') addTmdb(mid, item);
          }
        }
      }
    }

    if (typeof item.tmdb_id === 'number') {
      addTmdb(item.tmdb_id, item);
    }

    if (item.imdb_id) {
      if (typeof item.imdb_id === 'string') {
        addImdb(item.imdb_id, item);
      } else if (Array.isArray(item.imdb_id)) {
        for (const iid of item.imdb_id) {
          if (typeof iid === 'string') addImdb(iid, item);
        }
      }
    }
  }

  return { items, tmdbMap, imdbMap };
}

/**
 * Loads the Fribb dataset with high-speed CDN failover and stores it in memory
 */
export async function getFribbDataset(): Promise<FribbIndex> {
  if (cachedFribbIndex) return cachedFribbIndex;
  if (fribbLoadingPromise) return fribbLoadingPromise;

  fribbLoadingPromise = (async () => {
    const sources = [
      'https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-full.json',
      'https://cdn.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-full.json',
      'https://fastly.jsdelivr.net/gh/Fribb/anime-lists@master/anime-list-full.json'
    ];

    let rawData: FribbItem[] | null = null;
    for (const url of sources) {
      try {
        const res = await fetch(url, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(12000)
        });
        if (res.ok) {
          rawData = await res.json();
          break;
        }
      } catch {
        // Try next source
      }
    }

    if (!rawData || !Array.isArray(rawData)) {
      if (cachedFribbIndex) return cachedFribbIndex;
      cachedFribbIndex = buildFribbIndex([]);
      return cachedFribbIndex;
    }

    cachedFribbIndex = buildFribbIndex(rawData);
    return cachedFribbIndex;
  })()
    .catch((err) => {
      console.error('Failed to load Fribb dataset:', err);
      if (!cachedFribbIndex) cachedFribbIndex = buildFribbIndex([]);
      return cachedFribbIndex;
    })
    .finally(() => {
      fribbLoadingPromise = null;
    });

  return fribbLoadingPromise;
}

// Pre-warm the Fribb dataset immediately in the background on startup
getFribbDataset().catch(() => {});

/**
 * Detects AniList ID and episode using TMDB, IMDb, season and episode metadata.
 * Returns { anilist_id, anilist_episode } or null values if not detected.
 */
export async function detectAniListFromFribb(params: {
  tmdbId: number | string;
  absoluteEpisode: number;
  tmdbSeason?: number;
  tmdbEpisode?: number;
  imdbId?: string | null;
  imdbSeason?: number;
  imdbEpisode?: number;
}): Promise<{ anilist_id: number | null; anilist_episode: number | null }> {
  const rawTmdb = String(params.tmdbId || '').trim();
  const numTmdb = parseInt(rawTmdb, 10);
  const absEp = parseInt(String(params.absoluteEpisode || '').trim(), 10) || 1;

  const dataset = await getFribbDataset();

  // 1. Match candidates by TMDB ID
  let allMatches: FribbItem[] = !isNaN(numTmdb) ? (dataset.tmdbMap.get(numTmdb) || []) : [];

  // 2. If no matches by TMDB ID, fallback to matching by IMDb ID
  if (allMatches.length === 0 && params.imdbId) {
    const cleanImdb = String(params.imdbId).trim().toLowerCase();
    allMatches = dataset.imdbMap.get(cleanImdb) || [];
  }

  // If still no matches, not an anime in Fribb
  if (allMatches.length === 0) {
    return { anilist_id: null, anilist_episode: null };
  }

  // Filter TV items first (fallback to all if movie/special)
  const tvMatches = allMatches.filter(
    (it: FribbItem) => it.type === 'TV' || (it.season?.tmdb !== undefined && it.season?.tmdb > 0)
  );
  const pool = tvMatches.length > 0 ? tvMatches : allMatches;

  // Single entry -> direct match
  if (pool.length === 1) {
    return {
      anilist_id: pool[0].anilist_id !== undefined && pool[0].anilist_id !== null ? pool[0].anilist_id : null,
      anilist_episode: absEp
    };
  }

  // Multiple entries -> match by season and episode offset
  const targetSeason = params.tmdbSeason ?? 1;
  const targetEpisode = params.tmdbEpisode ?? absEp;

  // Match season candidates
  let seasonCandidates = pool.filter((it: FribbItem) => {
    const itSeason = it.season?.tmdb !== undefined && it.season?.tmdb !== null
      ? parseInt(String(it.season.tmdb), 10)
      : (it.season?.tvdb !== undefined ? parseInt(String(it.season.tvdb), 10) : 1);
    return itSeason === targetSeason;
  });

  // If no match on tmdbSeason, try imdbSeason
  if (seasonCandidates.length === 0 && params.imdbSeason && params.imdbSeason !== targetSeason) {
    seasonCandidates = pool.filter((it: FribbItem) => {
      const itSeason = it.season?.tmdb !== undefined && it.season?.tmdb !== null
        ? parseInt(String(it.season.tmdb), 10)
        : (it.season?.tvdb !== undefined ? parseInt(String(it.season.tvdb), 10) : 1);
      return itSeason === params.imdbSeason;
    });
  }

  if (seasonCandidates.length === 0) {
    seasonCandidates = pool;
  }

  // Sort candidates by offset
  const candidateOffsets = seasonCandidates.map((it: FribbItem) => {
    const offsetVal = it.episode_offset?.tmdb !== undefined && it.episode_offset?.tmdb !== null
      ? parseInt(String(it.episode_offset.tmdb), 10)
      : (it.episode_offset?.tvdb !== undefined ? parseInt(String(it.episode_offset.tvdb), 10) : 0);
    return {
      item: it,
      offset: isNaN(offsetVal) ? 0 : offsetVal
    };
  }).sort((a, b) => a.offset - b.offset);

  const hasPositiveOffsets = candidateOffsets.some(c => c.offset > 0);

  if (!hasPositiveOffsets) {
    const matched = candidateOffsets[0].item;
    return {
      anilist_id: matched.anilist_id !== undefined && matched.anilist_id !== null ? matched.anilist_id : null,
      anilist_episode: targetEpisode
    };
  }

  // Find closest lower offset to targetEpisode
  const lowerCandidates = candidateOffsets.filter(c => c.offset > 0 && c.offset < targetEpisode);

  if (lowerCandidates.length > 0) {
    const closestLower = lowerCandidates[lowerCandidates.length - 1];
    const computedEp = targetEpisode - closestLower.offset;
    return {
      anilist_id: closestLower.item.anilist_id !== undefined && closestLower.item.anilist_id !== null ? closestLower.item.anilist_id : null,
      anilist_episode: computedEp > 0 ? computedEp : 1
    };
  } else {
    const lowestCandidate = candidateOffsets[0].item;
    return {
      anilist_id: lowestCandidate.anilist_id !== undefined && lowestCandidate.anilist_id !== null ? lowestCandidate.anilist_id : null,
      anilist_episode: targetEpisode
    };
  }
}

/**
 * Backward compatibility helper for vidsyncRouter
 */
export async function resolveFribbToAnilistAndEp(
  tmdbIdInput: string | number,
  absoluteEpInput: string | number
): Promise<FribbMinimalResult> {
  const rawId = String(tmdbIdInput || '').trim();
  const numId = parseInt(rawId, 10);
  const absEp = parseInt(String(absoluteEpInput || '').trim(), 10);

  if (!rawId || isNaN(numId)) {
    const err: any = new Error('Invalid or missing TMDB ID. Must be numeric.');
    err.status = 400;
    throw err;
  }

  if (isNaN(absEp) || absEp < 1) {
    const err: any = new Error('Invalid absolute episode. Must be a positive integer.');
    err.status = 400;
    throw err;
  }

  const cacheKey = `${numId}:${absEp}`;
  const cached = fribbResultCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.result;
  }

  const inflight = fribbInflight.get(cacheKey);
  if (inflight) return inflight;

  const resolvePromise = (async () => {
    let tmdbSeason = 1;
    let tmdbEpisode = absEp;
    let imdbId: string | null = null;
    let imdbSeason = 1;
    let imdbEpisode = absEp;

    try {
      const { resolveItMap } = await import('./mapper.js');
      const itRes = await resolveItMap(String(numId), absEp);
      if (itRes) {
        tmdbSeason = itRes.tmdb_season;
        tmdbEpisode = itRes.tmdb_episode;
        imdbId = itRes.imdb_id;
        imdbSeason = itRes.imdb_season;
        imdbEpisode = itRes.imdb_episode;
      }
    } catch {
      // Fallback
    }

    const detected = await detectAniListFromFribb({
      tmdbId: numId,
      absoluteEpisode: absEp,
      tmdbSeason,
      tmdbEpisode,
      imdbId,
      imdbSeason,
      imdbEpisode
    });

    if (!detected.anilist_id) {
      const err: any = new Error(`No anime found in Fribb for TMDB ID ${rawId}`);
      err.status = 404;
      throw err;
    }

    const result: FribbMinimalResult = {
      anilist_id: detected.anilist_id,
      ep: detected.anilist_episode || absEp
    };

    fribbResultCache.set(cacheKey, { result, expiresAt: Date.now() + FRIBB_CACHE_TTL });
    return result;
  })();

  fribbInflight.set(cacheKey, resolvePromise);
  try {
    return await resolvePromise;
  } finally {
    fribbInflight.delete(cacheKey);
  }
}
