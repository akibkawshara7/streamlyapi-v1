import express, { Request, Response } from 'express';
import { resolveItMap } from './mapper.js';
import { detectAniListFromFribb } from './fribb.js';

export const vidsyncRouter = express.Router();
export const subtitlesRouter = express.Router();
export const embedRouter = express.Router();

// Strictly no cache middleware for streams
const strictlyNoCacheMiddleware = (req: Request, res: Response, next: Function) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  next();
};

vidsyncRouter.use(strictlyNoCacheMiddleware);
subtitlesRouter.use(strictlyNoCacheMiddleware);
embedRouter.use(strictlyNoCacheMiddleware);

// Public TMDB API keys with fallback rotation
const TMDB_KEYS = [
  process.env.TMDB_API_KEY,
  '8265bd1679663a7ea12ac168da84d2e8',
  '1f54bd990f1cdfb230adb312546d765d',
  '4f8205562725e2d67a14e9f731215b04'
].filter(Boolean) as string[];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const tmdbMovieCache = new Map<string, { timestamp: number; imdbId: string | null }>();
const tmdbTvSeasonCache = new Map<string, { timestamp: number; seasons: any[] }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// ISO 639 code to English display name mapping
const ISO_LANG_MAP: Record<string, string> = {
  eng: 'English', en: 'English',
  hin: 'Hindi', hi: 'Hindi',
  spa: 'Spanish', es: 'Spanish',
  por: 'Portuguese', pt: 'Portuguese',
  pob: 'Portuguese (Brazil)', pb: 'Portuguese (Brazil)', 'pt-br': 'Portuguese (Brazil)',
  fre: 'French', fra: 'French', fr: 'French',
  ger: 'German', deu: 'German', de: 'German',
  ita: 'Italian', it: 'Italian',
  rus: 'Russian', ru: 'Russian',
  jpn: 'Japanese', ja: 'Japanese',
  kor: 'Korean', ko: 'Korean',
  ara: 'Arabic', ar: 'Arabic',
  zho: 'Chinese', chi: 'Chinese', zh: 'Chinese',
  tur: 'Turkish', tr: 'Turkish',
  pol: 'Polish', pl: 'Polish',
  swe: 'Swedish', sv: 'Swedish',
  dan: 'Danish', da: 'Danish',
  fin: 'Finnish', fi: 'Finnish',
  nor: 'Norwegian', no: 'Norwegian',
  dut: 'Dutch', nld: 'Dutch', nl: 'Dutch',
  gre: 'Greek', ell: 'Greek', el: 'Greek',
  heb: 'Hebrew', he: 'Hebrew',
  vie: 'Vietnamese', vi: 'Vietnamese',
  tha: 'Thai', th: 'Thai',
  ind: 'Indonesian', id: 'Indonesian',
  tam: 'Tamil', ta: 'Tamil',
  tel: 'Telugu', te: 'Telugu',
  mal: 'Malayalam', ml: 'Malayalam',
  kan: 'Kannada', kn: 'Kannada',
  fil: 'Filipino', tl: 'Filipino'
};

export function getFullLanguageName(codeOrName: string): string {
  if (!codeOrName || typeof codeOrName !== 'string') return 'English';
  const clean = codeOrName.trim().toLowerCase();
  if (ISO_LANG_MAP[clean]) {
    return ISO_LANG_MAP[clean];
  }
  if (codeOrName.length > 3) {
    return codeOrName.charAt(0).toUpperCase() + codeOrName.slice(1);
  }
  return clean.toUpperCase();
}

/**
 * Fetch with TMDB API key fallback rotation
 */
async function fetchTmdb(endpointPath: string): Promise<any> {
  let lastError: any = null;
  for (const key of TMDB_KEYS) {
    try {
      const separator = endpointPath.includes('?') ? '&' : '?';
      const url = `https://api.themoviedb.org/3${endpointPath}${separator}api_key=${key}`;
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json' },
        signal: AbortSignal.timeout(8000)
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (e) {
      lastError = e;
    }
  }
  throw lastError || new Error(`TMDB request failed for endpoint: ${endpointPath}`);
}

/**
 * Resolves TMDB TV season and episode from absolute episode without IMDb fetch
 */
async function getTmdbTvSeasonAndEpisode(tmdbId: string, absoluteEpisode: number): Promise<{ season: number; episode: number }> {
  let seasons: any[] = [];
  const cached = tmdbTvSeasonCache.get(tmdbId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    seasons = cached.seasons;
  } else {
    try {
      const data = await fetchTmdb(`/tv/${tmdbId}`);
      seasons = data.seasons || [];
      tmdbTvSeasonCache.set(tmdbId, { timestamp: Date.now(), seasons });
    } catch {
      seasons = [];
    }
  }

  const regularSeasons = seasons
    .filter((s: any) => typeof s.season_number === 'number' && s.season_number > 0)
    .sort((a: any, b: any) => a.season_number - b.season_number);

  let remTmdb = absoluteEpisode;
  let tmdbSeason = 1;
  let tmdbEpisode = absoluteEpisode;
  let tmdbMatched = false;

  for (const s of regularSeasons) {
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

  if (!tmdbMatched && regularSeasons.length > 0) {
    const lastSeason = regularSeasons[regularSeasons.length - 1];
    tmdbSeason = lastSeason.season_number;
    tmdbEpisode = remTmdb;
  }

  return { season: tmdbSeason, episode: tmdbEpisode };
}

/**
 * Resolves IMDb ID for a Movie via TMDB external_ids (used for Subtitles)
 */
export async function getMovieImdbId(tmdbId: string): Promise<string | null> {
  const cached = tmdbMovieCache.get(tmdbId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.imdbId;
  }

  try {
    const extData = await fetchTmdb(`/movie/${tmdbId}/external_ids`);
    const imdbId = extData.imdb_id || null;
    tmdbMovieCache.set(tmdbId, {
      timestamp: Date.now(),
      imdbId
    });
    return imdbId;
  } catch {
    return null;
  }
}

/**
 * Priority order for languages:
 * English first, then Hindi, then other popular global languages in descending order
 */
const PRIORITY_LANGUAGES = [
  'English',
  'Hindi',
  'Japanese',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Portuguese (Brazil)',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Russian',
  'Italian',
  'Korean',
  'Chinese',
  'Arabic',
  'Turkish',
  'Filipino',
  'Thai',
  'Vietnamese',
  'Indonesian'
];

export interface FormattedStreamItem {
  url: string;
  proxy_url: string;
  quality: string;
}

export type LanguageProviderStreams = Record<string, Record<string, FormattedStreamItem[]>>;

/**
 * Extracts and formats provider name cleanly
 */
export function extractProviderName(rawProvider: any, sourceItem?: any): string {
  let val = rawProvider;
  if (!val && sourceItem) {
    val = sourceItem.providerName || sourceItem.source || sourceItem.server || sourceItem.name;
  }
  if (!val) return 'Default';

  let name = '';
  if (typeof val === 'string') {
    name = val.trim();
  } else if (typeof val === 'object') {
    name = val.name || val.id || 'Default';
  } else {
    name = String(val);
  }

  const clean = name.trim();
  const lower = clean.toLowerCase();

  const KNOWN_MAP: Record<string, string> = {
    vidsrc: 'VidSrc',
    vidzee: 'VidZee',
    moviebox: 'Moviebox',
    castle: 'Castle',
    showbox: 'Showbox',
    streamwish: 'Streamwish',
    filelions: 'Filelions',
    doodstream: 'Doodstream',
    vidcloud: 'Vidcloud',
    upcloud: 'Upcloud',
    mixdrop: 'Mixdrop',
    superstream: 'Superstream',
    vidsync: 'VidSync'
  };

  if (KNOWN_MAP[lower]) {
    return KNOWN_MAP[lower];
  }

  if (clean.length > 1 && clean !== lower && clean !== clean.toUpperCase()) {
    return clean;
  }

  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

/**
 * Quality sorting order: 2160p -> 1080p -> 720p -> 480p -> 360p -> Auto
 */
function qualityRank(q: string): number {
  if (!q) return 999;
  const clean = q.toLowerCase();
  const match = clean.match(/(\d+)/);
  if (match) {
    return -parseInt(match[1], 10);
  }
  if (clean.includes('auto')) return 100;
  return 200;
}

/**
 * Fetches streams directly from vidsync.pro API with proper headers
 */
export async function fetchVidsyncCoreStreams(
  type: 'tv' | 'anime' | 'movie',
  params: {
    id: string | number;
    season?: number;
    episode?: number;
  }
): Promise<any[]> {
  const { id, season = 1, episode = 1 } = params;

  let requestUrl = '';
  if (type === 'tv') {
    requestUrl = `https://vidsync.pro/api/core/streams?type=tv&id=${id}&episode=${episode}&season=${season}`;
  } else if (type === 'anime') {
    requestUrl = `https://vidsync.pro/api/core/streams?type=anime&id=${id}&episode=${episode}`;
  } else {
    requestUrl = `https://vidsync.pro/api/core/streams?type=movie&id=${id}`;
  }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(requestUrl, {
        headers: {
          'User-Agent': USER_AGENT,
          'Origin': 'https://vidsync.pro',
          'Referer': 'https://vidsync.pro/',
          'Accept': 'application/json, text/plain, */*'
        },
        signal: AbortSignal.timeout(10000)
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.sources) && data.sources.length > 0) {
          return data.sources;
        }
      }
    } catch {
      // Retry if transient network failure
    }
    if (attempt < 2) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  return [];
}

/**
 * Organizes raw vidsync sources into:
 * Language Hierarchy (English, Hindi, etc.) -> Provider Name (VidSrc, Moviebox, etc.) -> Stream items (qualities)
 *
 * Compiles all items from the same provider under the same language into a single provider entry,
 * ordering qualities (1080p -> 720p -> 480p -> 360p) and removing duplicates.
 */
export function organizeStreamsByLanguage(
  rawSources: any[],
  defaultLanguage: string = 'English'
): LanguageProviderStreams {
  const tempMap: Record<string, Record<string, FormattedStreamItem[]>> = {};

  for (const s of rawSources) {
    let playUrl = s.url || s.rawUrl || s.relayUrl || s.relay || '';
    if (playUrl && playUrl.startsWith('/')) {
      playUrl = `https://vidsync.pro${playUrl}`;
    }

    let proxyUrl = s.proxyUrl || s.proxy_url || '';
    if (proxyUrl && proxyUrl.startsWith('/')) {
      proxyUrl = `https://vidsync.pro${proxyUrl}`;
    }

    // Add relay/proxy URL if the direct URL is not present
    if (!playUrl && proxyUrl) {
      playUrl = proxyUrl;
    }
    if (!proxyUrl && playUrl && playUrl.includes('vidsync.pro')) {
      proxyUrl = playUrl;
    }

    const item: FormattedStreamItem = {
      url: playUrl,
      proxy_url: proxyUrl,
      quality: s.quality || 'Auto'
    };

    const providerName = extractProviderName(s.provider, s);

    // Detect languages for this stream
    const langs = new Set<string>();
    if (Array.isArray(s.audioTracks) && s.audioTracks.length > 0) {
      for (const track of s.audioTracks) {
        const labelOrCode = track.label || track.language;
        if (labelOrCode) {
          langs.add(getFullLanguageName(labelOrCode));
        }
      }
    }
    if (s.edition?.audioLabel || s.edition?.audio) {
      langs.add(getFullLanguageName(s.edition.audioLabel || s.edition.audio));
    }
    if (s.language) {
      langs.add(getFullLanguageName(s.language));
    }
    if (langs.size === 0) {
      langs.add(defaultLanguage);
    }

    for (const lang of langs) {
      const audioKey = `Audio: ${lang}`;
      const providerKey = `Provider: ${providerName}`;

      if (!tempMap[audioKey]) {
        tempMap[audioKey] = {};
      }
      if (!tempMap[audioKey][providerKey]) {
        tempMap[audioKey][providerKey] = [];
      }

      // Compile entries for the same provider: keep distinct qualities (e.g. 1080p, 720p, 480p, 360p)
      const existing = tempMap[audioKey][providerKey];
      const hasQuality = existing.some(ex => ex.quality === item.quality);
      if (!hasQuality) {
        existing.push(item);
      }
    }
  }

  // Construct dictionary ordered by language hierarchy
  const orderedResult: LanguageProviderStreams = {};

  // First priority languages (English, Hindi, etc.)
  for (const lang of PRIORITY_LANGUAGES) {
    const audioKey = `Audio: ${lang}`;
    if (tempMap[audioKey] && Object.keys(tempMap[audioKey]).length > 0) {
      orderedResult[audioKey] = {};
      const sortedProviders = Object.keys(tempMap[audioKey]).sort((a, b) => a.localeCompare(b));
      for (const prov of sortedProviders) {
        orderedResult[audioKey][prov] = tempMap[audioKey][prov].sort(
          (a, b) => qualityRank(a.quality) - qualityRank(b.quality)
        );
      }
    }
  }

  // Any remaining languages alphabetically
  const remainingKeys = Object.keys(tempMap)
    .filter(k => !orderedResult[k] && Object.keys(tempMap[k]).length > 0)
    .sort((a, b) => a.localeCompare(b));

  for (const audioKey of remainingKeys) {
    orderedResult[audioKey] = {};
    const sortedProviders = Object.keys(tempMap[audioKey]).sort((a, b) => a.localeCompare(b));
    for (const prov of sortedProviders) {
      orderedResult[audioKey][prov] = tempMap[audioKey][prov].sort(
        (a, b) => qualityRank(a.quality) - qualityRank(b.quality)
      );
    }
  }

  return orderedResult;
}

// -------------------------------------------------------------
// Route Controllers: Vidsync Streams (No IMDb fetch needed)
// -------------------------------------------------------------

// 1. TV Stream: GET /stream/tv/:tmdbId/:absoluteEpisode (and aliases)
vidsyncRouter.get(
  ['/tv/:tmdbId/:absoluteEpisode', '/:tmdbId/:absoluteEpisode'],
  async (req: Request, res: Response, next) => {
    const { tmdbId, absoluteEpisode } = req.params;

    if (tmdbId === 'movie' || tmdbId === 'anime') {
      return next();
    }

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing tmdbId. Must be numeric.'
      });
    }

    const absEpNum = parseInt(absoluteEpisode, 10);
    if (isNaN(absEpNum) || absEpNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid absoluteEpisode. Must be a positive integer >= 1.'
      });
    }

    try {
      // 1. Direct TMDB Season and Episode calculation (no IMDb fetch)
      const { season, episode } = await getTmdbTvSeasonAndEpisode(tmdbId, absEpNum);

      // 2. Direct Fribb AniList check
      let anilistId: number | null = null;
      let anilistEp: number | null = null;
      try {
        const detected = await detectAniListFromFribb({
          tmdbId,
          absoluteEpisode: absEpNum,
          tmdbSeason: season,
          tmdbEpisode: episode
        });
        if (detected.anilist_id) {
          anilistId = detected.anilist_id;
          anilistEp = detected.anilist_episode || episode;
        }
      } catch {}

      let rawSources: any[] = [];
      let streamType: 'tv' | 'anime' = 'tv';

      // If anime detected, fetch anime stream directly
      if (anilistId) {
        rawSources = await fetchVidsyncCoreStreams('anime', {
          id: anilistId,
          episode: anilistEp || episode
        });
        if (rawSources.length > 0) {
          streamType = 'anime';
        }
      }

      // If not anime or anime stream yielded no sources, fetch tv stream
      if (rawSources.length === 0) {
        rawSources = await fetchVidsyncCoreStreams('tv', {
          id: tmdbId,
          season,
          episode
        });
        streamType = 'tv';
      }

      if (rawSources.length === 0) {
        return res.status(404).json({
          success: false,
          type: streamType,
          error: `No playable stream sources found for TMDB ${tmdbId} S${season}E${episode}.`,
          tmdb_id: tmdbId,
          season,
          episode,
          ...(anilistId ? { anilist_id: anilistId, anilist_episode: anilistEp || episode } : {})
        });
      }

      const organized = organizeStreamsByLanguage(rawSources, streamType === 'anime' ? 'Japanese' : 'English');

      let subtitlesData: Record<string, any> = {};
      try {
        const itMap = await resolveItMap(tmdbId, absEpNum).catch(() => null);
        if (itMap?.imdb_id) {
          subtitlesData = await retrieveOpenSubtitles(
            itMap.imdb_id,
            true,
            itMap.imdb_season || season,
            itMap.imdb_episode || episode
          ).catch(() => ({}));
        }
      } catch {}

      const responsePayload: any = {
        success: true,
        type: streamType,
        tmdb_id: tmdbId,
        season,
        episode,
        ...(anilistId ? { anilist_id: anilistId, anilist_episode: anilistEp || episode } : {}),
        source: organized,
        sources: organized,
        providers: organized,
        subtitles: subtitlesData
      };

      return res.json(responsePayload);
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to resolve TV streams from upstream Vidsync player.',
        details: err.message || String(err)
      });
    }
  }
);

// 1b. TV Stream with explicit season & episode: GET /stream/tv/:tmdbId/:season/:episode
vidsyncRouter.get(
  ['/tv/:tmdbId/:season/:episode', '/:tmdbId/:season/:episode'],
  async (req: Request, res: Response, next) => {
    const { tmdbId, season, episode } = req.params;

    if (tmdbId === 'movie' || tmdbId === 'anime') {
      return next();
    }

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing tmdbId. Must be numeric.'
      });
    }

    const sNum = parseInt(season, 10);
    const eNum = parseInt(episode, 10);
    if (isNaN(sNum) || sNum < 1 || isNaN(eNum) || eNum < 1) {
      return res.status(400).json({
        success: false,
        error: 'Invalid season or episode number. Must be positive integers >= 1.'
      });
    }

    try {
      // Check directly in Fribb for AniList match
      let anilistId: number | null = null;
      let anilistEp: number | null = null;

      try {
        const detected = await detectAniListFromFribb({
          tmdbId,
          absoluteEpisode: eNum,
          tmdbSeason: sNum,
          tmdbEpisode: eNum
        });
        if (detected.anilist_id) {
          anilistId = detected.anilist_id;
          anilistEp = detected.anilist_episode || eNum;
        }
      } catch {}

      let rawSources: any[] = [];
      let streamType: 'tv' | 'anime' = 'tv';

      if (anilistId) {
        rawSources = await fetchVidsyncCoreStreams('anime', {
          id: anilistId,
          episode: anilistEp || eNum
        });
        if (rawSources.length > 0) {
          streamType = 'anime';
        }
      }

      if (rawSources.length === 0) {
        rawSources = await fetchVidsyncCoreStreams('tv', {
          id: tmdbId,
          season: sNum,
          episode: eNum
        });
        streamType = 'tv';
      }

      if (rawSources.length === 0) {
        return res.status(404).json({
          success: false,
          type: streamType,
          error: `No playable stream sources found for TMDB ${tmdbId} S${sNum}E${eNum}.`,
          tmdb_id: tmdbId,
          season: sNum,
          episode: eNum,
          ...(anilistId ? { anilist_id: anilistId, anilist_episode: anilistEp || eNum } : {})
        });
      }

      const organized = organizeStreamsByLanguage(rawSources, streamType === 'anime' ? 'Japanese' : 'English');

      let subtitlesData: Record<string, any> = {};
      try {
        const ext = await fetchTmdb(`/tv/${tmdbId}/external_ids`).catch(() => null);
        const imdbId = ext?.imdb_id || null;
        if (imdbId) {
          subtitlesData = await retrieveOpenSubtitles(imdbId, true, sNum, eNum).catch(() => ({}));
        }
      } catch {}

      const responsePayload: any = {
        success: true,
        type: streamType,
        tmdb_id: tmdbId,
        season: sNum,
        episode: eNum,
        ...(anilistId ? { anilist_id: anilistId, anilist_episode: anilistEp || eNum } : {}),
        source: organized,
        sources: organized,
        providers: organized,
        subtitles: subtitlesData
      };

      return res.json(responsePayload);
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to resolve TV streams from upstream Vidsync player.',
        details: err.message || String(err)
      });
    }
  }
);

// 2. Movie Stream: GET /stream/movie/:tmdbId (No IMDb fetch)
vidsyncRouter.get(
  ['/movie/:tmdbId', '/:tmdbId'],
  async (req: Request, res: Response) => {
    const { tmdbId } = req.params;

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or missing tmdbId. Must be numeric.'
      });
    }

    try {
      // Check directly in Fribb if Anime movie detected
      let anilistId: number | null = null;
      try {
        const detected = await detectAniListFromFribb({
          tmdbId,
          absoluteEpisode: 1
        });
        if (detected.anilist_id) {
          anilistId = detected.anilist_id;
        }
      } catch {}

      let rawSources: any[] = [];
      let streamType: 'movie' | 'anime' = 'movie';

      rawSources = await fetchVidsyncCoreStreams('movie', { id: tmdbId });

      if (rawSources.length === 0 && anilistId) {
        rawSources = await fetchVidsyncCoreStreams('anime', { id: anilistId, episode: 1 });
        if (rawSources.length > 0) {
          streamType = 'anime';
        }
      }

      if (rawSources.length === 0) {
        return res.status(404).json({
          success: false,
          type: streamType,
          error: `No playable stream sources found for Movie TMDB ${tmdbId}.`,
          tmdb_id: tmdbId,
          ...(anilistId ? { anilist_id: anilistId } : {})
        });
      }

      const organized = organizeStreamsByLanguage(rawSources, streamType === 'anime' ? 'Japanese' : 'English');

      let subtitlesData: Record<string, any> = {};
      try {
        const imdbId = await getMovieImdbId(tmdbId).catch(() => null);
        if (imdbId) {
          subtitlesData = await retrieveOpenSubtitles(imdbId, false).catch(() => ({}));
        }
      } catch {}

      const responsePayload: any = {
        success: true,
        type: streamType,
        tmdb_id: tmdbId,
        ...(anilistId ? { anilist_id: anilistId } : {}),
        source: organized,
        sources: organized,
        providers: organized,
        subtitles: subtitlesData
      };

      return res.json(responsePayload);
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to resolve Movie streams from upstream Vidsync player.',
        details: err.message || String(err)
      });
    }
  }
);

// -------------------------------------------------------------
// Subtitles - OpenSubtitles v3 (Fetch IMDb ID, Season, and Episode here)
// -------------------------------------------------------------

export async function retrieveOpenSubtitles(imdbId: string, isTv: boolean, season?: number, episode?: number) {
  const subtitleUrl = isTv
    ? `https://opensubtitles-v3.strem.io/subtitles/series/${imdbId}:${season}:${episode}.json`
    : `https://opensubtitles-v3.strem.io/subtitles/movie/${imdbId}.json`;

  const res = await fetch(subtitleUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Accept': 'application/json'
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`OpenSubtitles v3 returned HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const rawSubtitles = Array.isArray(data.subtitles) ? data.subtitles : [];

  const grouped: Record<string, Array<{ url: string; format: 'vtt' | 'srt' }>> = {};

  for (const item of rawSubtitles) {
    if (!item.url || typeof item.url !== 'string') continue;
    const langCode = item.lang || 'en';
    const langName = getFullLanguageName(langCode);

    if (!grouped[langName]) {
      grouped[langName] = [];
    }

    const format: 'vtt' | 'srt' = item.url.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt';
    grouped[langName].push({
      url: item.url,
      format
    });
  }

  const sortedKeys = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
  const sortedGroupedSubtitles: Record<string, Array<{ url: string; format: 'vtt' | 'srt' }>> = {};
  for (const k of sortedKeys) {
    sortedGroupedSubtitles[k] = grouped[k];
  }

  return sortedGroupedSubtitles;
}

// Subtitles - TV Show: GET /subtitles/tv/:tmdbId/:absoluteEpisode
subtitlesRouter.get(
  ['/tv/:tmdbId/:absoluteEpisode', '/:tmdbId/:absoluteEpisode'],
  async (req: Request, res: Response, next) => {
    const { tmdbId, absoluteEpisode } = req.params;

    if (tmdbId === 'movie') {
      return next();
    }

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
    }

    const absEpNum = parseInt(absoluteEpisode, 10);
    if (isNaN(absEpNum) || absEpNum < 1) {
      return res.status(400).json({ success: false, error: 'Invalid absoluteEpisode. Must be a positive integer >= 1.' });
    }

    try {
      // Subtitles resolves IMDb ID, season, and episode
      const itMap = await resolveItMap(tmdbId, absEpNum);

      if (!itMap.imdb_id) {
        return res.status(404).json({
          success: false,
          error: `Could not resolve IMDb ID for TMDB TV show ${tmdbId}. External ID is missing on TMDB.`
        });
      }

      const subtitles = await retrieveOpenSubtitles(itMap.imdb_id, true, itMap.imdb_season, itMap.imdb_episode);

      return res.json({
        success: true,
        provider: 'Stremio OpenSubtitles v3',
        tmdb_id: tmdbId,
        imdb_id: itMap.imdb_id,
        absolute_episode: absEpNum,
        season: itMap.tmdb_season,
        episode: itMap.tmdb_episode,
        imdb_season: itMap.imdb_season,
        imdb_episode: itMap.imdb_episode,
        subtitles
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to retrieve subtitles from OpenSubtitles v3 service.',
        details: err.message || String(err)
      });
    }
  }
);

// Subtitles - TV Show with explicit season & episode: GET /subtitles/tv/:tmdbId/:season/:episode
subtitlesRouter.get(
  ['/tv/:tmdbId/:season/:episode', '/:tmdbId/:season/:episode'],
  async (req: Request, res: Response) => {
    const { tmdbId, season, episode } = req.params;

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
    }

    const sNum = parseInt(season, 10);
    const eNum = parseInt(episode, 10);
    if (isNaN(sNum) || sNum < 1 || isNaN(eNum) || eNum < 1) {
      return res.status(400).json({ success: false, error: 'Invalid season or episode number. Must be positive integers >= 1.' });
    }

    try {
      const ext = await fetchTmdb(`/tv/${tmdbId}/external_ids`);
      const imdbId = ext.imdb_id || null;

      if (!imdbId) {
        return res.status(404).json({ success: false, error: `Could not resolve IMDb ID for TMDB TV show ${tmdbId}.` });
      }

      const subtitles = await retrieveOpenSubtitles(imdbId, true, sNum, eNum);

      return res.json({
        success: true,
        provider: 'Stremio OpenSubtitles v3',
        tmdb_id: tmdbId,
        imdb_id: imdbId,
        season: sNum,
        episode: eNum,
        subtitles
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to retrieve subtitles from OpenSubtitles v3 service.',
        details: err.message || String(err)
      });
    }
  }
);

// Subtitles - Movie: GET /subtitles/movie/:tmdbId
subtitlesRouter.get(
  ['/movie/:tmdbId', '/:tmdbId'],
  async (req: Request, res: Response) => {
    const { tmdbId } = req.params;

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
    }

    try {
      const imdbId = await getMovieImdbId(tmdbId);

      if (!imdbId) {
        return res.status(404).json({ success: false, error: `Could not resolve IMDb ID for TMDB Movie ${tmdbId}.` });
      }

      const subtitles = await retrieveOpenSubtitles(imdbId, false);

      return res.json({
        success: true,
        provider: 'Stremio OpenSubtitles v3',
        tmdb_id: tmdbId,
        imdb_id: imdbId,
        subtitles
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to retrieve movie subtitles from OpenSubtitles v3 service.',
        details: err.message || String(err)
      });
    }
  }
);
