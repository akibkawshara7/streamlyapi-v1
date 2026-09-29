import express, { Request, Response } from 'express';
import * as cheerio from 'cheerio';

export const vidsyncRouter = express.Router();
export const subtitlesRouter = express.Router();
export const embedRouter = express.Router();
export const shortRouter = express.Router();
export const imdbRouter = express.Router();

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
imdbRouter.use(strictlyNoCacheMiddleware);

// Public TMDB API keys with fallback rotation
const TMDB_KEYS = [
  process.env.TMDB_API_KEY,
  '8265bd1679663a7ea12ac168da84d2e8',
  '1f54bd990f1cdfb230adb312546d765d',
  '4f8205562725e2d67a14e9f731215b04'
].filter(Boolean) as string[];

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const tmdbMovieCache = new Map<string, { timestamp: number; data: any }>();
const tmdbTvCache = new Map<string, { timestamp: number; data: any }>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Short URL maps for /s/:shortId redirector
const shortUrlMap = new Map<string, string>();
const urlToShortMap = new Map<string, string>();

/**
 * Encodes a long stream/proxy URL into a short link hosted on the website's base URL
 * e.g. http://localhost:3000/s/aB3x9K
 */
export function shortenUrl(rawUrl: string, req?: Request): string {
  if (!rawUrl || typeof rawUrl !== 'string') return '';

  let shortId = urlToShortMap.get(rawUrl);
  if (!shortId) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let code = '';
    for (let i = 0; i < 7; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    shortId = code;
    shortUrlMap.set(shortId, rawUrl);
    urlToShortMap.set(rawUrl, shortId);
  }

  let host = 'localhost:3000';
  let protocol = 'http';
  if (req) {
    host = (req.get('x-forwarded-host') || req.get('host') || host).split(',')[0].trim();
    protocol = (req.get('x-forwarded-proto') || req.protocol || 'http').split(',')[0].trim();
  }

  return `${protocol}://${host}/s/${shortId}`;
}

// Redirect router for /s/:shortId
shortRouter.get('/:shortId', (req: Request, res: Response) => {
  const { shortId } = req.params;
  const targetUrl = shortUrlMap.get(shortId);

  if (targetUrl) {
    return res.redirect(302, targetUrl);
  }

  // Fallback: Check if shortId is a base64url encoded URL
  try {
    const decoded = Buffer.from(shortId, 'base64url').toString('utf-8');
    if (decoded.startsWith('http://') || decoded.startsWith('https://')) {
      return res.redirect(302, decoded);
    }
  } catch {}

  return res.status(404).json({
    success: false,
    error: 'Short URL not found or expired.'
  });
});

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
 */
export function normalizeLanguageName(raw: string, defaultLanguage: string = 'English'): string {
  if (!raw || typeof raw !== 'string') return defaultLanguage;
  let clean = raw.trim();

  // Strip leading numbering like "1. ", "01. ", "2 - ", etc.
  clean = clean.replace(/^\d+[\.\-\s:]+/, '').trim();

  // Strip bracketed descriptors
  clean = clean.replace(/[\(\[\{].*?[\)\]\}]/g, '').trim();

  const lower = clean.toLowerCase();

  if (ISO_LANG_MAP[lower]) {
    return ISO_LANG_MAP[lower];
  }

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

  if (/\b(original|native)\b/i.test(lower)) {
    return defaultLanguage;
  }

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
 * Priority order for languages
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
    name = val.name || val.id || val.provider || val.server || 'Default';
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
  const match = q.match(/(\d+)p?/i);
  if (match) {
    return -parseInt(match[1], 10);
  }
  if (/4k|uhd/i.test(q)) return -2160;
  if (/auto/i.test(q)) return 1000;
  return 500;
}

/**
 * Fetches core streams from vidsync.pro upstream
 */
export async function fetchVidsyncCoreStreams(
  type: 'tv' | 'movie' | 'anime',
  params: { id: string | number; season?: number; episode?: number }
): Promise<any[]> {
  const query = new URLSearchParams();
  query.set('type', type);
  query.set('id', String(params.id));
  if (params.season !== undefined) {
    query.set('season', String(params.season));
  }
  if (params.episode !== undefined) {
    query.set('episode', String(params.episode));
  }

  const targetUrl = `https://vidsync.pro/api/core/streams?${query.toString()}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(targetUrl, {
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
 * Audio: <Language> -> Provider: <Provider> -> Stream items (shortened URLs)
 */
export function organizeStreamsByLanguage(
  rawSources: any[],
  defaultLanguage: string = 'English',
  req?: Request
): LanguageProviderStreams {
  const tempMap: Record<string, Record<string, FormattedStreamItem[]>> = {};

  for (const s of rawSources) {
    let playUrl = s.url || s.rawUrl || s.relayUrl || s.relay || '';
    if (playUrl && playUrl.startsWith('/')) {
      playUrl = `https://vidsync.pro${playUrl}`;
    }

    const item: FormattedStreamItem = {
      url: playUrl,
      quality: s.quality || 'Auto'
    };

    const providerName = extractProviderName(s.provider, s);

    // Detect languages for this stream
    const langs = new Set<string>();
    if (Array.isArray(s.audioTracks) && s.audioTracks.length > 0) {
      for (const track of s.audioTracks) {
        const labelOrCode = track.label || track.language;
        if (labelOrCode) {
          langs.add(normalizeLanguageName(labelOrCode, defaultLanguage));
        }
      }
    }
    if (s.edition?.audioLabel || s.edition?.audio) {
      langs.add(normalizeLanguageName(s.edition.audioLabel || s.edition.audio, defaultLanguage));
    }
    if (s.language) {
      langs.add(normalizeLanguageName(s.language, defaultLanguage));
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

      const existing = tempMap[audioKey][providerKey];
      const hasQuality = existing.some(ex => ex.quality === item.quality);
      if (!hasQuality) {
        existing.push(item);
      }
    }
  }

  const orderedResult: LanguageProviderStreams = {};

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
// Route Controllers: Vidsync Streams (Direct TMDB Season & Episode)
// -------------------------------------------------------------

// 1. TV Stream: GET /stream/tv/:tmdbId/:season/:episode (or /stream/tv/:tmdbId/:episode)
vidsyncRouter.get(
  [
    '/tv/:tmdbId/:season/:episode',
    '/tv/:tmdbId/:episode',
    '/:tmdbId/:season/:episode',
    '/:tmdbId/:episode'
  ],
  async (req: Request, res: Response, next: express.NextFunction) => {
    const { tmdbId } = req.params;
    if (tmdbId === 'movie') {
      return next();
    }
    let season = req.params.season;
    let episode = req.params.episode;

    if (!episode) {
      episode = season;
      season = '1';
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
      const rawSources = await fetchVidsyncCoreStreams('tv', {
        id: tmdbId,
        season: sNum,
        episode: eNum
      });

      if (rawSources.length === 0) {
        return res.status(404).json({
          success: false,
          type: 'tv',
          error: `No playable stream sources found for TMDB ${tmdbId} S${sNum}E${eNum}.`,
          tmdb_id: tmdbId,
          season: sNum,
          episode: eNum,
          tmdb_season: sNum,
          tmdb_episode: eNum
        });
      }

      const organized = organizeStreamsByLanguage(rawSources, 'English', req);

      return res.json({
        success: true,
        type: 'tv',
        tmdb_id: tmdbId,
        season: sNum,
        episode: eNum,
        tmdb_season: sNum,
        tmdb_episode: eNum,
        source: organized,
        sources: organized,
        providers: organized
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to resolve TV streams from upstream Vidsync player.',
        details: err.message || String(err)
      });
    }
  }
);

// 2. Movie Stream: GET /stream/movie/:tmdbId
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
      const rawSources = await fetchVidsyncCoreStreams('movie', { id: tmdbId });

      if (rawSources.length === 0) {
        return res.status(404).json({
          success: false,
          type: 'movie',
          error: `No playable stream sources found for Movie TMDB ${tmdbId}.`,
          tmdb_id: tmdbId
        });
      }

      const organized = organizeStreamsByLanguage(rawSources, 'English', req);

      return res.json({
        success: true,
        type: 'movie',
        tmdb_id: tmdbId,
        source: organized,
        sources: organized,
        providers: organized
      });
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
// Subtitles - Vidsync (With TMDB API)
// -------------------------------------------------------------

export async function retrieveVidsyncSubtitles(
  tmdbId: string,
  isTv: boolean,
  season?: number,
  episode?: number,
  requestedLang?: string
) {
  const subtitleUrl = isTv
    ? `https://vidsync.pro/api/subtitles/tmdb/tv/${tmdbId}?season=${season || 1}&episode=${episode || 1}`
    : `https://vidsync.pro/api/subtitles/tmdb/movie/${tmdbId}`;

  const res = await fetch(subtitleUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      'Origin': 'https://vidsync.pro',
      'Referer': 'https://vidsync.pro/',
      'Accept': 'application/json, text/plain, */*'
    },
    signal: AbortSignal.timeout(15000)
  });

  if (!res.ok) {
    throw new Error(`Vidsync Subtitles returned HTTP ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const list = Array.isArray(data?.subtitles)
    ? data.subtitles
    : Array.isArray(data)
    ? data
    : [];

  // Group subtitles by Language: <LanguageName>
  const tempMap: Record<string, Record<string, { url: string; format: 'vtt' | 'srt' }>> = {};
  const seenUrlsPerLang: Record<string, Set<string>> = {};

  for (const item of list) {
    let playUrl = item.url || '';
    if (playUrl.startsWith('/')) {
      playUrl = `https://vidsync.pro${playUrl}`;
    } else if (!playUrl && item.sourceUrl) {
      playUrl = `https://vidsync.pro/api/subtitles/file?url=${encodeURIComponent(item.sourceUrl)}`;
    }
    if (!playUrl) continue;

    const rawLang = item.language || item.rawLanguage || item.label || 'en';
    const langName = normalizeLanguageName(rawLang, 'English');
    const langKey = `Language: ${langName}`;

    if (!tempMap[langKey]) {
      tempMap[langKey] = {};
      seenUrlsPerLang[langKey] = new Set();
    }

    if (seenUrlsPerLang[langKey].has(playUrl)) {
      continue;
    }
    seenUrlsPerLang[langKey].add(playUrl);

    const trackNumber = Object.keys(tempMap[langKey]).length + 1;
    const trackKey = `Track ${trackNumber}`;
    let format: 'vtt' | 'srt' = 'vtt';
    if (item.format === 'srt' || playUrl.toLowerCase().includes('.srt')) {
      format = 'srt';
    }

    tempMap[langKey][trackKey] = {
      url: playUrl,
      format
    };
  }

  // Filter or select single language requested or default to English
  const reqLower = (requestedLang || '').trim().toLowerCase();
  let finalSubtitles: Record<string, Record<string, { url: string; format: 'vtt' | 'srt' }>> = {};

  if (reqLower === 'all') {
    for (const pLang of PRIORITY_LANGUAGES) {
      const k = `Language: ${pLang}`;
      if (tempMap[k] && Object.keys(tempMap[k]).length > 0) {
        finalSubtitles[k] = tempMap[k];
      }
    }
    for (const k of Object.keys(tempMap).sort((a, b) => a.localeCompare(b))) {
      if (!finalSubtitles[k]) {
        finalSubtitles[k] = tempMap[k];
      }
    }
  } else if (reqLower) {
    const norm = normalizeLanguageName(reqLower, '');
    let matchedKey = '';
    if (norm && tempMap[`Language: ${norm}`]) {
      matchedKey = `Language: ${norm}`;
    } else {
      matchedKey = Object.keys(tempMap).find(k => {
        const name = k.replace(/^Language:\s*/i, '').toLowerCase();
        return name === reqLower;
      }) || '';
    }
    if (matchedKey && tempMap[matchedKey]) {
      finalSubtitles[matchedKey] = tempMap[matchedKey];
    }
  } else {
    // Default: Single language (English, identical to previous OpenSubtitles output)
    if (tempMap['Language: English'] && Object.keys(tempMap['Language: English']).length > 0) {
      finalSubtitles['Language: English'] = tempMap['Language: English'];
    } else {
      const firstAvailable = Object.keys(tempMap)[0];
      if (firstAvailable) {
        finalSubtitles[firstAvailable] = tempMap[firstAvailable];
      }
    }
  }

  return finalSubtitles;
}

// Subtitle file proxy route: GET /file
subtitlesRouter.get('/file', async (req: Request, res: Response) => {
  const fileUrl = (req.query.url as string) || '';
  if (!fileUrl) {
    return res.status(400).send('Missing url parameter');
  }

  try {
    const upstreamUrl = fileUrl.startsWith('http')
      ? `https://vidsync.pro/api/subtitles/file?url=${encodeURIComponent(fileUrl)}`
      : `https://vidsync.pro${fileUrl.startsWith('/') ? '' : '/'}${fileUrl}`;

    const upstreamRes = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': USER_AGENT,
        'Origin': 'https://vidsync.pro',
        'Referer': 'https://vidsync.pro/'
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!upstreamRes.ok) {
      if (fileUrl.startsWith('http')) {
        const directRes = await fetch(fileUrl, {
          headers: { 'User-Agent': USER_AGENT },
          signal: AbortSignal.timeout(10000)
        });
        if (directRes.ok) {
          const contentType = directRes.headers.get('content-type') || 'text/vtt; charset=utf-8';
          res.setHeader('Content-Type', contentType);
          res.setHeader('Access-Control-Allow-Origin', '*');
          const buffer = await directRes.arrayBuffer();
          return res.send(Buffer.from(buffer));
        }
      }
      return res.status(upstreamRes.status).send(`Upstream returned ${upstreamRes.status}`);
    }

    const contentType = upstreamRes.headers.get('content-type') || 'text/vtt; charset=utf-8';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buffer = await upstreamRes.arrayBuffer();
    return res.send(Buffer.from(buffer));
  } catch (err: any) {
    return res.status(502).send(err.message || 'Failed to fetch subtitle file');
  }
});

// Exact Vidsync mirror routes: /tmdb/tv/:tmdbId and /tmdb/movie/:tmdbId
subtitlesRouter.get('/tmdb/tv/:tmdbId', async (req: Request, res: Response) => {
  const { tmdbId } = req.params;
  const sNum = parseInt((req.query.season as string) || (req.query.s as string) || '1', 10);
  const eNum = parseInt((req.query.episode as string) || (req.query.e as string) || '1', 10);
  const langQuery = (req.query.lang as string) || (req.query.language as string) || '';

  if (!tmdbId || !/^\d+$/.test(tmdbId)) {
    return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
  }

  try {
    const subtitles = await retrieveVidsyncSubtitles(tmdbId, true, sNum, eNum, langQuery);
    return res.json({
      success: true,
      provider: 'Vidsync Subtitles',
      tmdb_id: tmdbId,
      season: sNum,
      episode: eNum,
      subtitles
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      error: 'Failed to retrieve subtitles from Vidsync subtitles service.',
      details: err.message || String(err)
    });
  }
});

subtitlesRouter.get('/tmdb/movie/:tmdbId', async (req: Request, res: Response) => {
  const { tmdbId } = req.params;
  const langQuery = (req.query.lang as string) || (req.query.language as string) || '';

  if (!tmdbId || !/^\d+$/.test(tmdbId)) {
    return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
  }

  try {
    const subtitles = await retrieveVidsyncSubtitles(tmdbId, false, undefined, undefined, langQuery);
    return res.json({
      success: true,
      provider: 'Vidsync Subtitles',
      tmdb_id: tmdbId,
      subtitles
    });
  } catch (err: any) {
    return res.status(502).json({
      success: false,
      error: 'Failed to retrieve subtitles from Vidsync subtitles service.',
      details: err.message || String(err)
    });
  }
});

// Subtitles - TV Show: GET /subtitles/tv/:tmdbId/:season/:episode (and /tv/:tmdbId?season=1&episode=1)
subtitlesRouter.get(
  ['/tv/:tmdbId/:season/:episode', '/tv/:tmdbId/:episode', '/tv/:tmdbId', '/:tmdbId/:season/:episode', '/:tmdbId/:episode'],
  async (req: Request, res: Response, next: express.NextFunction) => {
    const { tmdbId } = req.params;
    if (tmdbId === 'movie' || tmdbId === 'file' || tmdbId === 'tmdb') {
      return next();
    }
    let season = req.params.season || (req.query.season as string) || (req.query.s as string) || '1';
    let episode = req.params.episode || (req.query.episode as string) || (req.query.e as string) || '1';
    const langQuery = (req.query.lang as string) || (req.query.language as string) || '';

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
    }

    const sNum = parseInt(season, 10);
    const eNum = parseInt(episode, 10);

    if (isNaN(sNum) || sNum < 1 || isNaN(eNum) || eNum < 1) {
      return res.status(400).json({ success: false, error: 'Invalid season or episode number. Must be positive integers >= 1.' });
    }

    try {
      const subtitles = await retrieveVidsyncSubtitles(tmdbId, true, sNum, eNum, langQuery);

      return res.json({
        success: true,
        provider: 'Vidsync Subtitles',
        tmdb_id: tmdbId,
        season: sNum,
        episode: eNum,
        subtitles
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to retrieve subtitles from Vidsync subtitles service.',
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
    const langQuery = (req.query.lang as string) || (req.query.language as string) || '';

    if (!tmdbId || !/^\d+$/.test(tmdbId)) {
      return res.status(400).json({ success: false, error: 'Invalid or missing tmdbId. Must be numeric.' });
    }

    try {
      const subtitles = await retrieveVidsyncSubtitles(tmdbId, false, undefined, undefined, langQuery);

      return res.json({
        success: true,
        provider: 'Vidsync Subtitles',
        tmdb_id: tmdbId,
        subtitles
      });
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        error: 'Failed to retrieve subtitles from Vidsync subtitles service.',
        details: err.message || String(err)
      });
    }
  }
);

// -------------------------------------------------------------
// TMDB & IMDb Mapping System Helpers
// -------------------------------------------------------------

function cleanTitle(title: string): string {
  if (!title) return '';
  return title.toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .trim();
}

function isTitleMatch(t1: string, t2: string): boolean {
  if (!t1 || !t2) return false;
  const c1 = cleanTitle(t1);
  const c2 = cleanTitle(t2);
  return c1 === c2 || c1.includes(c2) || c2.includes(c1);
}

function parseImdbDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function parseTmdbDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;
  return null;
}

function isDateMatch(date1: string, date2: string): boolean {
  const d1 = parseImdbDate(date1);
  const d2 = parseTmdbDate(date2);
  if (!d1 || !d2) return false;
  // Check if dates are within 2 days of each other
  return Math.abs(d1.getTime() - d2.getTime()) <= 2 * 24 * 60 * 60 * 1000;
}

async function resolveDnsOverHttps(hostname: string): Promise<string[]> {
  try {
    const res = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(hostname)}&type=A`, {
      signal: AbortSignal.timeout(3000)
    });
    if (!res.ok) return [];
    const json = await res.json();
    if (json.Answer && Array.isArray(json.Answer)) {
      return json.Answer.filter((ans: any) => ans.type === 1).map((ans: any) => ans.data);
    }
  } catch (err) {
    // Graceful fallback
  }
  return [];
}

/**
 * Fetches accurate TV series episode metadata from Stremio Cinemeta API (direct from IMDb dumps)
 */
export async function fetchImdbEpisodesFromCinemeta(imdbId: string, seasonNum?: number) {
  try {
    const url = `https://v3-cinemeta.stremio.com/meta/series/${imdbId}.json`;
    
    // Attempt direct fetch
    let res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(6000)
    }).catch(() => null);

    // If direct DNS resolution fails (e.g. getaddrinfo ENOTFOUND), use Google DNS-over-HTTPS fallback
    if (!res || !res.ok) {
      const ips = await resolveDnsOverHttps('v3-cinemeta.stremio.com');
      if (ips && ips.length > 0) {
        const ip = ips[0];
        const httpUrl = `http://${ip}/meta/series/${imdbId}.json`;
        res = await fetch(httpUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Host': 'v3-cinemeta.stremio.com'
          },
          signal: AbortSignal.timeout(6000)
        }).catch(() => null);
      }
    }

    if (!res || !res.ok) {
      console.log(`Cinemeta API is currently offline/unreachable for ${imdbId}. Falling back to direct scraping...`);
      return [];
    }

    const json = await res.json();
    const videos = json.meta?.videos || [];

    const episodes = videos.map((v: any) => {
      let releasedStr = '';
      if (v.released) {
        const d = new Date(v.released);
        if (!isNaN(d.getTime())) {
          releasedStr = d.toLocaleDateString('en-US', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
          });
        }
      }
      return {
        season: v.season,
        episode: v.episode,
        rating: v.rating ? String(v.rating) : null,
        episode_id: v.id || `${imdbId}:${v.season}:${v.episode}`,
        released: releasedStr,
        title: v.title || `Episode ${v.episode}`,
        overview: v.overview || '',
        thumbnail: v.thumbnail || ''
      };
    });

    if (seasonNum !== undefined) {
      return episodes.filter((ep: any) => ep.season === seasonNum);
    }
    return episodes;
  } catch (err) {
    console.log(`Note: Cinemeta metadata fallback in progress for ${imdbId}...`);
    return [];
  }
}

/**
 * Scrapes IMDb seasons episodes page directly
 */
export async function scrapeImdbEpisodesList(imdbId: string, season: number) {
  // 1. Try high-performance Stremio Cinemeta API first
  const cinemetaEpisodes = await fetchImdbEpisodesFromCinemeta(imdbId, season);
  if (cinemetaEpisodes && cinemetaEpisodes.length > 0) {
    return cinemetaEpisodes;
  }

  const url = `https://www.imdb.com/title/${imdbId}/episodes?season=${season}`;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.google.com/'
      },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return [];
    const html = await res.text();
    const $ = cheerio.load(html);
    const episodes: any[] = [];

    // Old IMDb Layout (.list_item)
    $('.list_item').each((i, el) => {
      const titleAnchor = $(el).find('a[itemprop="name"]');
      const title = titleAnchor.text().trim();
      if (!title) return;
      const href = titleAnchor.attr('href') || '';
      const epIdMatch = href.match(/tt\d+/);
      const epId = epIdMatch ? epIdMatch[0] : '';
      
      const epNumMeta = $(el).find('meta[itemprop="episodeNumber"]');
      const epNum = epNumMeta.attr('content') ? parseInt(epNumMeta.attr('content') || '0', 10) : i + 1;
      
      const ratingSpan = $(el).find('.ipl-rating-star__rating').first();
      const rating = ratingSpan.text().trim() || null;
      
      const airdateDiv = $(el).find('.airdate');
      const airdate = airdateDiv.text().trim().replace(/\s+/g, ' ');
      
      const descDiv = $(el).find('.item_description');
      const overview = descDiv.text().trim();
      
      const img = $(el).find('.image img');
      const thumbnail = img.attr('src') || '';

      episodes.push({
        season,
        episode: epNum,
        rating,
        episode_id: epId,
        released: airdate,
        title,
        overview,
        thumbnail
      });
    });

    // New IMDb Layout (data-testid="episode-card")
    if (episodes.length === 0) {
      $('[data-testid="episode-card"]').each((i, el) => {
        const titleEl = $(el).find('[data-testid="episode-card-title"]');
        const title = titleEl.text().trim();
        if (!title) return;
        const href = titleEl.attr('href') || '';
        const epIdMatch = href.match(/tt\d+/);
        const epId = epIdMatch ? epIdMatch[0] : '';

        let epNum = i + 1;
        const metaText = $(el).find('[data-testid="episode-card-metadata"]').text();
        const epNumMatch = metaText.match(/E(\d+)/i);
        if (epNumMatch) {
          epNum = parseInt(epNumMatch[1], 10);
        }

        const rating = $(el).find('[aria-label^="IMDb rating"]').text().trim() || null;
        const airdate = $(el).find('[data-testid="episode-card-airdate"]').text().trim() || '';
        const overview = $(el).find('[data-testid="episode-card-plot"]').text().trim() || '';
        const thumbnail = $(el).find('img').attr('src') || '';

        episodes.push({
          season,
          episode: epNum,
          rating,
          episode_id: epId,
          released: airdate,
          title,
          overview,
          thumbnail
        });
      });
    }

    return episodes;
  } catch (err) {
    console.error(`Error scraping IMDb season ${season}:`, err);
    return [];
  }
}

/**
 * Fallback to retrieve episodes directly from TMDB when IMDb scraper fails or is unavailable
 */
export async function getEpisodesFallbackFromTmdb(tmdbId: string, season: number) {
  try {
    const tmdbData = await fetchTmdb(`/tv/${tmdbId}/season/${season}`);
    if (!tmdbData || !Array.isArray(tmdbData.episodes)) return [];
    return tmdbData.episodes.map((ep: any) => ({
      season,
      episode: ep.episode_number,
      rating: ep.vote_average ? String(ep.vote_average.toFixed(1)) : null,
      episode_id: `tmdb_${ep.id}`,
      released: ep.air_date || '',
      title: ep.name || '',
      overview: ep.overview || '',
      thumbnail: ep.still_path ? `https://image.tmdb.org/t/p/w300${ep.still_path}` : ''
    }));
  } catch {
    return [];
  }
}

/**
 * Robustly maps user-given TMDB season/episode to IMDb season/episode by:
 * 1. Identifying the target TMDB episode ignoring 'episode_number' (finding the E-th index of Season S)
 * 2. Calculating the absolute episode index of the show on TMDB.
 * 3. Checking for corresponding absolute episode index on IMDb and confirming by Title and Air Date year.
 */
export async function mapTmdbToImdbEpisode(
  imdbId: string,
  tmdbId: string,
  sNum: number,
  eNum: number
): Promise<{ season: number; episode: number }> {
  try {
    // 1. Fetch TV show details to get all seasons
    const showDetails = await fetchTmdb(`/tv/${tmdbId}`).catch(() => null);
    if (!showDetails) return { season: sNum, episode: eNum };

    const seasonsList = Array.isArray(showDetails.seasons)
      ? showDetails.seasons.filter((s: any) => s.season_number > 0)
      : [];

    // 2. Fetch TMDB episodes of Season sNum
    const tmdbSeasonData = await fetchTmdb(`/tv/${tmdbId}/season/${sNum}`).catch(() => null);
    if (!tmdbSeasonData || !Array.isArray(tmdbSeasonData.episodes)) {
      return { season: sNum, episode: eNum };
    }

    // Ignore 'episode_number' and get the E-th episode in the list (1-indexed)
    const targetTmdbEp = tmdbSeasonData.episodes[eNum - 1];
    if (!targetTmdbEp) {
      return { season: sNum, episode: eNum };
    }

    const targetTitle = targetTmdbEp.name || '';
    const targetAirDate = targetTmdbEp.air_date || '';
    const targetYear = targetAirDate ? parseInt(targetAirDate.substring(0, 4), 10) : null;

    // Calculate absolute index of this TMDB episode
    let tmdbAbsoluteIndex = 0;
    for (const s of seasonsList) {
      if (s.season_number < sNum) {
        tmdbAbsoluteIndex += s.episode_count;
      }
    }
    tmdbAbsoluteIndex += eNum;

    console.log(`Mapping TMDB S${sNum}E${eNum} (Absolute Index: ${tmdbAbsoluteIndex}, Year: ${targetYear}, Title: "${targetTitle}")`);

    // 3. Search and match with IMDb episodes by absolute index first
    let imdbAbsoluteIndex = 0;
    for (let s = 1; s <= showDetails.number_of_seasons; s++) {
      const imdbEpisodes = await scrapeImdbEpisodesList(imdbId, s);
      if (imdbEpisodes && imdbEpisodes.length > 0) {
        if (imdbAbsoluteIndex + imdbEpisodes.length >= tmdbAbsoluteIndex) {
          const matchedEp = imdbEpisodes[tmdbAbsoluteIndex - imdbAbsoluteIndex - 1];
          if (matchedEp) {
            const titleMatched = targetTitle && matchedEp.title && isTitleMatch(targetTitle, matchedEp.title);
            const imdbYear = matchedEp.released ? parseImdbDate(matchedEp.released)?.getFullYear() : null;
            const yearMatches = targetYear && imdbYear && Math.abs(targetYear - imdbYear) <= 1;

            if (titleMatched || yearMatches || showDetails.name?.toLowerCase().includes('piece')) {
              console.log(`Matched by absolute index: S${s}E${matchedEp.episode} ("${matchedEp.title}")`);
              return { season: s, episode: matchedEp.episode };
            }
          }
        }
        imdbAbsoluteIndex += imdbEpisodes.length;
      }
    }

    // 4. Fallback to Title & Date matching across seasons
    const seasonsToCheck = Array.from(new Set([sNum, 1, sNum - 1, sNum + 1])).filter(s => s >= 1);
    for (const imdbSeason of seasonsToCheck) {
      const imdbEpisodes = await scrapeImdbEpisodesList(imdbId, imdbSeason);
      if (imdbEpisodes && imdbEpisodes.length > 0) {
        for (const ep of imdbEpisodes) {
          const titleMatched = targetTitle && ep.title && isTitleMatch(targetTitle, ep.title);
          const imdbYear = ep.released ? parseImdbDate(ep.released)?.getFullYear() : null;
          const yearMatches = targetYear && imdbYear && targetYear === imdbYear;

          if (titleMatched && yearMatches) {
            console.log(`Matched by title and year: S${imdbSeason}E${ep.episode} ("${ep.title}")`);
            return { season: imdbSeason, episode: ep.episode };
          }
        }
      }
    }

    return { season: sNum, episode: eNum };
  } catch (err) {
    console.error("Error mapping TMDB to IMDb:", err);
    return { season: sNum, episode: eNum };
  }
}

// -------------------------------------------------------------
// IMDb Episodes Finder Routes (For website's search tab)
// -------------------------------------------------------------

imdbRouter.get(
  '/id/:imdbId',
  async (req: Request, res: Response) => {
    const { imdbId } = req.params;
    const seasonQuery = req.query.season;

    if (!imdbId.startsWith('tt')) {
      return res.status(400).json({ success: false, error: 'Invalid IMDb ID format. Must start with "tt".' });
    }

    try {
      let episodes = await fetchImdbEpisodesFromCinemeta(imdbId);
      if (!episodes || episodes.length === 0) {
        // Fallback to direct scraping if Cinemeta fails
        for (let s = 1; s <= 5; s++) {
          const scraped = await scrapeImdbEpisodesList(imdbId, s);
          if (scraped && scraped.length > 0) {
            episodes.push(...scraped);
          } else {
            break;
          }
        }
      }

      if (seasonQuery) {
        const sVal = parseInt(String(seasonQuery), 10);
        if (!isNaN(sVal) && sVal > 0) {
          episodes = episodes.filter((ep: any) => ep.season === sVal);
        }
      }

      const formattedEpisodes = episodes.map((ep: any) => ({
        season: String(ep.season),
        ep: String(ep.episode),
        [`ep${ep.episode}`]: String(ep.episode),
        title: ep.title,
        released: ep.released,
        episode_id: ep.episode_id,
        overview: ep.overview,
        thumbnail: ep.thumbnail
      }));

      return res.json({
        success: true,
        imdb_id: imdbId,
        episodes: formattedEpisodes
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  }
);

imdbRouter.all(
  ['/episodes', '/episodes/:id'],
  async (req: Request, res: Response) => {
    let id = req.params.id || req.query.id || req.body.id;
    let seasonParam = req.query.season || req.body.season;

    if (typeof id !== 'string') {
      return res.status(400).json({ success: false, error: 'Missing or invalid series ID.' });
    }

    id = id.trim();

    // Extract IMDb ID if full URL is given
    if (id.includes('imdb.com/title/')) {
      const match = id.match(/tt\d+/);
      if (match) id = match[0];
    }

    try {
      let tmdbId = '';
      let imdbId = '';
      let showDetails: any = null;
      let isMovie = false;

      if (id.startsWith('tt')) {
        imdbId = id;
        // Find TMDB show from IMDb ID
        const findData = await fetchTmdb(`/find/${imdbId}?external_source=imdb_id`).catch(() => null);
        if (findData) {
          if (Array.isArray(findData.tv_results) && findData.tv_results.length > 0) {
            tmdbId = String(findData.tv_results[0].id);
          } else if (Array.isArray(findData.movie_results) && findData.movie_results.length > 0) {
            tmdbId = String(findData.movie_results[0].id);
            isMovie = true;
          }
        }
      } else if (/^\d+$/.test(id)) {
        tmdbId = id;
      }

      if (!tmdbId) {
        return res.status(404).json({ success: false, error: `Could not resolve TMDB entry for ID ${id}` });
      }

      if (isMovie) {
        const movieData = await fetchTmdb(`/movie/${tmdbId}`);
        return res.json({
          success: true,
          is_movie: true,
          imdb_id: movieData.imdb_id || imdbId,
          tmdb_id: tmdbId,
          title: movieData.title,
          poster: movieData.poster_path ? `https://image.tmdb.org/t/p/w500${movieData.poster_path}` : null,
          year: movieData.release_date ? movieData.release_date.substring(0, 4) : null,
          rating: movieData.vote_average ? movieData.vote_average.toFixed(1) : null,
          description: movieData.overview,
          genres: Array.isArray(movieData.genres) ? movieData.genres.map((g: any) => g.name) : []
        });
      }

      // Fetch TV show details
      showDetails = await fetchTmdb(`/tv/${tmdbId}`);
      if (!imdbId) {
        const ext = await fetchTmdb(`/tv/${tmdbId}/external_ids`).catch(() => null);
        imdbId = ext?.imdb_id || '';
      }

      const genres = Array.isArray(showDetails.genres) ? showDetails.genres.map((g: any) => g.name) : [];
      const poster = showDetails.poster_path ? `https://image.tmdb.org/t/p/w500${showDetails.poster_path}` : null;
      const year = showDetails.first_air_date ? showDetails.first_air_date.substring(0, 4) : null;
      const rating = showDetails.vote_average ? showDetails.vote_average.toFixed(1) : null;
      const description = showDetails.overview || '';

      // Seasons list excluding Season 0 (Specials)
      const seasonsList = Array.isArray(showDetails.seasons)
        ? showDetails.seasons.filter((s: any) => s.season_number > 0)
        : [];

      const seasonsSummary = seasonsList.map((s: any) => ({
        season: s.season_number,
        name: s.name || `Season ${s.season_number}`,
        episode_count: s.episode_count
      }));

      // Determine seasons to fetch
      let targetSeasons: number[] = [];
      if (seasonParam) {
        const sVal = parseInt(String(seasonParam), 10);
        if (!isNaN(sVal) && sVal > 0) {
          targetSeasons = [sVal];
        }
      } else {
        // Fetch all seasons, caps at first 10 seasons to avoid gateway timeouts
        targetSeasons = seasonsList.map((s: any) => s.season_number);
        if (targetSeasons.length > 10) {
          targetSeasons = targetSeasons.slice(0, 10);
        }
      }

      const seasonsData: any[] = [];

      for (const sNum of targetSeasons) {
        let episodes: any[] = [];
        if (imdbId) {
          episodes = await scrapeImdbEpisodesList(imdbId, sNum);
        }

        // Fallback to TMDB if scraper is empty or failed
        if (!episodes || episodes.length === 0) {
          episodes = await getEpisodesFallbackFromTmdb(tmdbId, sNum);
        }

        const originalSeasonInfo = seasonsList.find((s: any) => s.season_number === sNum);

        seasonsData.push({
          season: sNum,
          name: originalSeasonInfo?.name || `Season ${sNum}`,
          total_episodes: episodes.length,
          episodes
        });
      }

      return res.json({
        success: true,
        imdb_id: imdbId,
        tmdb_id: tmdbId,
        title: showDetails.name || showDetails.original_name,
        poster,
        year,
        rating,
        description,
        total_seasons: showDetails.number_of_seasons,
        total_episodes: showDetails.number_of_episodes,
        genres,
        seasons_summary: seasonsSummary,
        seasons: seasonsData
      });
    } catch (err: any) {
      return res.status(500).json({
        success: false,
        error: 'Failed to retrieve IMDb season & episode data.',
        details: err.message || String(err)
      });
    }
  }
);

// Match individual episode: GET /imdb/:tmdbId/:season/:ep
imdbRouter.get(
  '/:tmdbId/:season/:ep',
  async (req: Request, res: Response) => {
    let { tmdbId, season, ep } = req.params;
    if (tmdbId === 'episodes') {
      return res.status(400).json({ success: false, error: 'Invalid route parameter usage.' });
    }
    
    const sNum = parseInt(season, 10);
    const eNum = parseInt(ep, 10);
    if (isNaN(sNum) || isNaN(eNum)) {
      return res.status(400).json({ success: false, error: 'Invalid season or episode format' });
    }

    try {
      let imdbId = '';
      if (tmdbId.startsWith('tt')) {
        imdbId = tmdbId;
        const findData = await fetchTmdb(`/find/${imdbId}?external_source=imdb_id`).catch(() => null);
        if (findData && Array.isArray(findData.tv_results) && findData.tv_results.length > 0) {
          tmdbId = String(findData.tv_results[0].id);
        } else {
          return res.status(404).json({ success: false, error: `Could not resolve TMDB ID for IMDb ${imdbId}` });
        }
      } else {
        const ext = await fetchTmdb(`/tv/${tmdbId}/external_ids`).catch(() => null);
        imdbId = ext?.imdb_id || '';
      }

      // Fetch TMDB season details
      const tmdbSeasonData = await fetchTmdb(`/tv/${tmdbId}/season/${sNum}`).catch(() => null);
      if (!tmdbSeasonData || !Array.isArray(tmdbSeasonData.episodes)) {
        return res.status(404).json({ success: false, error: `Season ${sNum} not found in TMDB` });
      }

      // Find the E-th episode in TMDB list (1-indexed, i.e., index ep - 1)
      const targetTmdbEp = tmdbSeasonData.episodes[eNum - 1];
      if (!targetTmdbEp) {
        return res.status(404).json({ success: false, error: `Episode index ${eNum} not found in TMDB Season ${sNum}` });
      }

      const targetTitle = targetTmdbEp.name || '';
      const targetAirDate = targetTmdbEp.air_date || '';

      // Match on IMDb
      let match = false;
      let matchedImdbSeason = sNum;
      let matchedImdbEpisode = eNum;
      let matchedImdbTitle = '';
      let matchedImdbReleased = '';
      let matchedImdbEpId = '';

      const seasonsToCheck = Array.from(new Set([sNum, 1, sNum - 1, sNum + 1])).filter(s => s >= 1);

      for (const imdbSeason of seasonsToCheck) {
        const imdbEpisodes = await scrapeImdbEpisodesList(imdbId, imdbSeason);
        if (imdbEpisodes && imdbEpisodes.length > 0) {
          for (const epItem of imdbEpisodes) {
            const titleMatched = targetTitle && epItem.title && isTitleMatch(targetTitle, epItem.title);
            const dateMatched = targetAirDate && epItem.released && isDateMatch(targetAirDate, epItem.released);

            if (titleMatched || dateMatched) {
              match = true;
              matchedImdbSeason = imdbSeason;
              matchedImdbEpisode = epItem.episode;
              matchedImdbTitle = epItem.title;
              matchedImdbReleased = epItem.released;
              matchedImdbEpId = epItem.episode_id;
              break;
            }
          }
        }
        if (match) break;
      }

      if (!match) {
        // Continuous series absolute index check (e.g. One Piece)
        const imdbSeason1 = await scrapeImdbEpisodesList(imdbId, 1);
        if (imdbSeason1 && imdbSeason1.length > 0) {
          const absEpNum = targetTmdbEp.episode_number;
          const matchedEp = imdbSeason1.find(epItem => epItem.episode === absEpNum);
          if (matchedEp) {
            match = true;
            matchedImdbSeason = 1;
            matchedImdbEpisode = absEpNum;
            matchedImdbTitle = matchedEp.title;
            matchedImdbReleased = matchedEp.released;
            matchedImdbEpId = matchedEp.episode_id;
          }
        }
      }

      return res.json({
        success: true,
        match,
        tmdb_id: tmdbId,
        imdb_id: imdbId,
        tmdb_season: sNum,
        tmdb_episode_index: eNum,
        tmdb_episode_number: targetTmdbEp.episode_number,
        tmdb_title: targetTitle,
        tmdb_air_date: targetAirDate,
        imdb_season: matchedImdbSeason,
        imdb_episode: matchedImdbEpisode,
        imdb_title: matchedImdbTitle || targetTitle,
        imdb_released: matchedImdbReleased || targetAirDate,
        imdb_episode_id: matchedImdbEpId,
        season: String(matchedImdbSeason),
        ep: String(matchedImdbEpisode),
        [`ep${matchedImdbEpisode}`]: String(matchedImdbEpisode),
        title: matchedImdbTitle || targetTitle,
        released: matchedImdbReleased || targetAirDate
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  }
);

// Map entire TMDB TV Show to IMDb episodes: GET /imdb/:tmdbId
imdbRouter.get(
  '/:tmdbId',
  async (req: Request, res: Response) => {
    let { tmdbId } = req.params;
    if (tmdbId === 'episodes') {
      return res.status(400).json({ success: false, error: 'Invalid route parameter usage.' });
    }
    const seasonQuery = req.query.season;

    try {
      let imdbId = '';
      if (tmdbId.startsWith('tt')) {
        imdbId = tmdbId;
        const findData = await fetchTmdb(`/find/${imdbId}?external_source=imdb_id`).catch(() => null);
        if (findData && Array.isArray(findData.tv_results) && findData.tv_results.length > 0) {
          tmdbId = String(findData.tv_results[0].id);
        } else {
          return res.status(404).json({ success: false, error: `Could not resolve TMDB ID for IMDb ${imdbId}` });
        }
      } else {
        const ext = await fetchTmdb(`/tv/${tmdbId}/external_ids`).catch(() => null);
        imdbId = ext?.imdb_id || '';
      }

      // Fetch show details
      const showDetails = await fetchTmdb(`/tv/${tmdbId}`);
      if (!showDetails) {
        return res.status(404).json({ success: false, error: 'TV show not found' });
      }

      // Get target seasons to map
      let targetSeasons: number[] = [];
      if (seasonQuery) {
        const sVal = parseInt(String(seasonQuery), 10);
        if (!isNaN(sVal) && sVal > 0) {
          targetSeasons = [sVal];
        }
      } else {
        // Fetch seasons (limit to first 10 seasons by default to prevent gateway timeout)
        const seasonsList = Array.isArray(showDetails.seasons)
          ? showDetails.seasons.filter((s: any) => s.season_number > 0)
          : [];
        targetSeasons = seasonsList.map((s: any) => s.season_number);
        if (targetSeasons.length > 10) {
          targetSeasons = targetSeasons.slice(0, 10);
        }
      }

      const allMappedEpisodes: any[] = [];

      for (const sNum of targetSeasons) {
        const tmdbSeasonData = await fetchTmdb(`/tv/${tmdbId}/season/${sNum}`).catch(() => null);
        if (!tmdbSeasonData || !Array.isArray(tmdbSeasonData.episodes)) continue;

        // Scrape IMDb episodes for this season
        const imdbEpisodes = await scrapeImdbEpisodesList(imdbId, sNum).catch(() => []);

        // Scrape Season 1 for absolute index fallback
        const imdbSeason1 = (sNum !== 1) ? await scrapeImdbEpisodesList(imdbId, 1).catch(() => []) : imdbEpisodes;

        // Map each episode of this TMDB season
        for (let idx = 0; idx < tmdbSeasonData.episodes.length; idx++) {
          const tmdbEp = tmdbSeasonData.episodes[idx];
          const targetTitle = tmdbEp.name || '';
          const targetAirDate = tmdbEp.air_date || '';

          // Look for title/date match in this IMDb season
          let match = false;
          let matchedImdbSeason = sNum;
          let matchedImdbEpisode = idx + 1;
          let matchedImdbTitle = targetTitle;
          let matchedImdbReleased = targetAirDate;

          for (const epItem of imdbEpisodes) {
            const titleMatched = targetTitle && epItem.title && isTitleMatch(targetTitle, epItem.title);
            const dateMatched = targetAirDate && epItem.released && isDateMatch(targetAirDate, epItem.released);
            if (titleMatched || dateMatched) {
              match = true;
              matchedImdbSeason = sNum;
              matchedImdbEpisode = epItem.episode;
              matchedImdbTitle = epItem.title;
              matchedImdbReleased = epItem.released;
              break;
            }
          }

          if (!match && imdbSeason1 && imdbSeason1.length > 0) {
            const absEpNum = tmdbEp.episode_number;
            const matchedEp = imdbSeason1.find(epItem => epItem.episode === absEpNum);
            if (matchedEp) {
              match = true;
              matchedImdbSeason = 1;
              matchedImdbEpisode = absEpNum;
              matchedImdbTitle = matchedEp.title;
              matchedImdbReleased = matchedEp.released;
            }
          }

          allMappedEpisodes.push({
            season: String(matchedImdbSeason),
            [`ep${matchedImdbEpisode}`]: String(matchedImdbEpisode),
            ep: String(matchedImdbEpisode),
            title: matchedImdbTitle,
            released: matchedImdbReleased,
            tmdb_title: targetTitle,
            tmdb_air_date: targetAirDate,
            match
          });
        }
      }

      return res.json({
        success: true,
        imdb_id: imdbId,
        tmdb_id: tmdbId,
        title: showDetails.name || showDetails.original_name,
        episodes: allMappedEpisodes
      });
    } catch (err: any) {
      return res.status(500).json({ success: false, error: err.message || String(err) });
    }
  }
);
