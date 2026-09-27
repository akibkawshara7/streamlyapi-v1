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
  ben: 'Bengali', bn: 'Bengali',
  mar: 'Marathi', mr: 'Marathi',
  pan: 'Punjabi', pa: 'Punjabi',
  guj: 'Gujarati', gu: 'Gujarati',
  urd: 'Urdu', ur: 'Urdu',
  fil: 'Filipino', tl: 'Filipino',
  bul: 'Bulgarian', bg: 'Bulgarian',
  cze: 'Czech', ces: 'Czech', cs: 'Czech',
  est: 'Estonian', et: 'Estonian',
  hrv: 'Croatian', hr: 'Croatian',
  hun: 'Hungarian', hu: 'Hungarian',
  mac: 'Macedonian', mkd: 'Macedonian', mk: 'Macedonian',
  per: 'Persian', fas: 'Persian', fa: 'Persian',
  ron: 'Romanian', rum: 'Romanian', ro: 'Romanian',
  slv: 'Slovenian', sl: 'Slovenian',
  srp: 'Serbian', sr: 'Serbian',
  ice: 'Icelandic', isl: 'Icelandic', is: 'Icelandic',
  slk: 'Slovak', sk: 'Slovak',
  ukr: 'Ukrainian', uk: 'Ukrainian'
};

/**
 * Strict language normalizer that cleans track labels down to canonical language names
 * Consolidates all variations (e.g. "Hindi (Original)", "1. Hindi", "Hindi 5.1", "hi", "hin") into "Hindi"
 */
export function normalizeLanguageName(raw: string, defaultLanguage: string = 'English'): string {
  if (!raw || typeof raw !== 'string') return defaultLanguage;
  let clean = raw.trim();

  // Strip leading numbering like "1. ", "01. ", "2 - ", etc.
  clean = clean.replace(/^\d+[\.\-\s:]+/, '').trim();

  // Strip bracketed descriptors like (Original), [Dubbed], (Clean Audio), [ORG], (5.1)
  clean = clean.replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();

  const lower = clean.toLowerCase();

  // Check direct ISO map
  if (ISO_LANG_MAP[lower]) {
    return ISO_LANG_MAP[lower];
  }

  // Keywords matching with word boundary / subword support
  if (/hindi|\bhin\b|\bhi\b/i.test(lower)) return 'Hindi';
  if (/english|\beng\b|\ben\b/i.test(lower)) return 'English';
  if (/japanese|\bjap\b|\bjpn\b|\bja\b/i.test(lower)) return 'Japanese';
  if (/tamil|\btam\b|\bta\b/i.test(lower)) return 'Tamil';
  if (/telugu|\btel\b|\bte\b/i.test(lower)) return 'Telugu';
  if (/bengali|bangla|\bben\b|\bbn\b/i.test(lower)) return 'Bengali';
  if (/malayalam|\bmal\b|\bml\b/i.test(lower)) return 'Malayalam';
  if (/kannada|\bkan\b|\bkn\b/i.test(lower)) return 'Kannada';
  if (/marathi|\bmar\b|\bmr\b/i.test(lower)) return 'Marathi';
  if (/punjabi|\bpan\b|\bpa\b/i.test(lower)) return 'Punjabi';
  if (/gujarati|\bguj\b|\bgu\b/i.test(lower)) return 'Gujarati';
  if (/urdu|\burd\b|\bur\b/i.test(lower)) return 'Urdu';
  if (/spanish|espanol|\bspa\b|\bes\b/i.test(lower)) return 'Spanish';
  if (/french|francais|\bfra\b|\bfre\b|\bfr\b/i.test(lower)) return 'French';
  if (/german|deutsch|\bger\b|\bdeu\b|\bde\b/i.test(lower)) return 'German';
  if (/italian|italiano|\bita\b|\bit\b/i.test(lower)) return 'Italian';
  if (/portuguese|portugues|\bpor\b|\bpt\b/i.test(lower)) return 'Portuguese';
  if (/russian|\brus\b|\bru\b/i.test(lower)) return 'Russian';
  if (/korean|\bkor\b|\bko\b/i.test(lower)) return 'Korean';
  if (/chinese|mandarin|cantonese|\bzho\b|\bchi\b|\bzh\b/i.test(lower)) return 'Chinese';
  if (/arabic|\bara\b|\bar\b/i.test(lower)) return 'Arabic';
  if (/turkish|\btur\b|\btr\b/i.test(lower)) return 'Turkish';
  if (/indonesian|\bind\b|\bid\b/i.test(lower)) return 'Indonesian';
  if (/thai|\btha\b|\bth\b/i.test(lower)) return 'Thai';
  if (/vietnamese|\bvie\b|\bvi\b/i.test(lower)) return 'Vietnamese';
  if (/filipino|tagalog|\bfil\b|\btl\b/i.test(lower)) return 'Filipino';
  if (/polish|\bpol\b|\bpl\b/i.test(lower)) return 'Polish';
  if (/dutch|\bnld\b|\bdut\b|\bnl\b/i.test(lower)) return 'Dutch';

  // Generic original/native label fallback to default language
  if (/\b(original|native)\b/i.test(lower)) {
    return defaultLanguage;
  }

  // Strip remaining audio-related words
  const stripped = clean.replace(/\b(original|native|dubbed|dub|clean audio|audio|multi|org|5\.1|7\.1|aac|ac3)\b/gi, '').trim();
  if (stripped.length > 2) {
    return stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
  }

  return defaultLanguage;
}

export function getFullLanguageName(codeOrName: string): string {
  return normalizeLanguageName(codeOrName);
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
 * Hindi and English first, followed by Japanese, regional and international languages
 */
const PRIORITY_LANGUAGES = [
  'Hindi',
  'English',
  'Japanese',
  'Tamil',
  'Telugu',
  'Malayalam',
  'Kannada',
  'Bengali',
  'Marathi',
  'Punjabi',
  'Gujarati',
  'Urdu',
  'Spanish',
  'French',
  'German',
  'Portuguese',
  'Russian',
  'Italian',
  'Korean',
  'Chinese',
  'Arabic',
  'Turkish',
  'Filipino',
  'Thai',
  'Vietnamese',
  'Indonesian',
  'Polish',
  'Dutch'
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

      const responsePayload: any = {
        success: true,
        type: streamType,
        tmdb_id: tmdbId,
        season,
        episode,
        ...(anilistId ? { anilist_id: anilistId, anilist_episode: anilistEp || episode } : {}),
        source: organized,
        sources: organized,
        providers: organized
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

      const responsePayload: any = {
        success: true,
        type: streamType,
        tmdb_id: tmdbId,
        season: sNum,
        episode: eNum,
        ...(anilistId ? { anilist_id: anilistId, anilist_episode: anilistEp || eNum } : {}),
        source: organized,
        sources: organized,
        providers: organized
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

      const responsePayload: any = {
        success: true,
        type: streamType,
        tmdb_id: tmdbId,
        ...(anilistId ? { anilist_id: anilistId } : {}),
        source: organized,
        sources: organized,
        providers: organized
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

  const tempMap: Record<string, Record<string, { url: string; format: 'vtt' | 'srt' }>> = {};

  for (const item of rawSubtitles) {
    if (!item.url || typeof item.url !== 'string') continue;
    const langCode = item.lang || 'en';
    const langName = normalizeLanguageName(langCode);
    const langKey = `Language: ${langName}`;

    if (!tempMap[langKey]) {
      tempMap[langKey] = {};
    }

    const trackNumber = Object.keys(tempMap[langKey]).length + 1;
    const trackKey = `Track ${trackNumber}`;
    const format: 'vtt' | 'srt' = item.url.toLowerCase().endsWith('.vtt') ? 'vtt' : 'srt';

    tempMap[langKey][trackKey] = {
      url: item.url,
      format
    };
  }

  const orderedResult: Record<string, Record<string, { url: string; format: 'vtt' | 'srt' }>> = {};

  // First priority languages (Hindi, English, etc.)
  for (const lang of PRIORITY_LANGUAGES) {
    const langKey = `Language: ${lang}`;
    if (tempMap[langKey] && Object.keys(tempMap[langKey]).length > 0) {
      orderedResult[langKey] = tempMap[langKey];
    }
  }

  // Any remaining languages alphabetically
  const remainingKeys = Object.keys(tempMap)
    .filter(k => !orderedResult[k] && Object.keys(tempMap[k]).length > 0)
    .sort((a, b) => a.localeCompare(b));

  for (const langKey of remainingKeys) {
    orderedResult[langKey] = tempMap[langKey];
  }

  return orderedResult;
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
