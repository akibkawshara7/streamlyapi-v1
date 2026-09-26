var __defProp = Object.defineProperty;
var __name = (target, value) =>
  __defProp(target, "name", { value, configurable: true });
import { getForwardedHeaders } from "./episodes.js";
import {
  getOrCreateAnikumeIdsBatch,
  getOrCreateMangaAnikumeIdsBatch,
} from "./db.js";
import { getMalLargePoster } from "./details.js";
const MAL_CLIENT_ID = "27cd7dc92c63858141ca8edf39fa3e7f";
function formatRating(score) {
  if (score === void 0 || score === null) {
    return null;
  }
  const num = typeof score === "number" ? score : parseFloat(String(score));
  if (isNaN(num) || num <= 0) {
    return null;
  }
  const val = num > 10 ? num / 10 : num;
  return val.toFixed(1);
}
__name(formatRating, "formatRating");
function cleanDescription(desc) {
  if (!desc || typeof desc !== "string") return null;
  const text = desc
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .trim();
  return text || null;
}
__name(cleanDescription, "cleanDescription");
function normalizeStatus(status) {
  if (!status) return null;
  const s = status.toUpperCase().trim();
  if (
    [
      "RELEASING",
      "AIRING",
      "CURRENTLY_AIRING",
      "CURRENT",
      "PUBLISHING",
    ].includes(s)
  ) {
    return "RELEASING";
  }
  if (["FINISHED", "COMPLETED", "FINISHED_AIRING"].includes(s)) {
    return "FINISHED";
  }
  if (
    [
      "UPCOMING",
      "NOT_YET_RELEASED",
      "NOT_YET_AIRED",
      "TO_BE_RELEASED",
    ].includes(s)
  ) {
    return "UPCOMING";
  }
  if (["CANCELLED", "CANCELED", "DISCONTINUED"].includes(s)) {
    return "CANCELLED";
  }
  return "FINISHED";
}
__name(normalizeStatus, "normalizeStatus");
function normalizeFormat(format) {
  if (!format) return null;
  const f = format.toLowerCase().trim().replace(/_/g, " ");
  return (f === "tv" ? "tv show" : f)
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}
__name(normalizeFormat, "normalizeFormat");
function normalizeMangaFormat(format, countryOfOrigin) {
  const origin = countryOfOrigin ? countryOfOrigin.toUpperCase().trim() : "";
  const fmt = format ? format.toUpperCase().trim().replace(/-/g, "_") : "";
  if (origin === "KR" || origin === "KOREA" || fmt === "MANHWA") {
    return "Manhwa";
  }
  if (
    origin === "CN" ||
    origin === "TW" ||
    origin === "CHINA" ||
    origin === "TAIWAN" ||
    fmt === "MANHUA"
  ) {
    return "Manhua";
  }
  if (origin === "JP" || origin === "JAPAN" || fmt === "MANGA") {
    return "Manga";
  }
  if (fmt === "NOVEL" || fmt === "LIGHT_NOVEL" || fmt === "LIGHT NOVEL") {
    return "Light Novel";
  }
  if (fmt === "ONE_SHOT" || fmt === "ONESHOT" || fmt === "ONE SHOT") {
    return "One Shot";
  }
  if (fmt === "DOUJINSHI" || fmt === "DOUJIN") {
    return "Doujinshi";
  }
  return normalizeFormat(format);
}
__name(normalizeMangaFormat, "normalizeMangaFormat");
function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  let season = "WINTER";
  if (month >= 3 && month <= 5) season = "SPRING";
  else if (month >= 6 && month <= 8) season = "SUMMER";
  else if (month >= 9 && month <= 11) season = "FALL";
  return { season, year };
}
__name(getCurrentSeason, "getCurrentSeason");
async function mapAndFormatAnimeItemsBatch(rawList, precomputedAnikumeIds) {
  if (!rawList || rawList.length === 0) return [];
  const anikumeIds =
    precomputedAnikumeIds ||
    (await getOrCreateAnikumeIdsBatch(
      rawList.map((raw) => ({
        anilist_id: raw.anilist_id || null,
        mal_id: raw.mal_id || null,
      })),
    ));
  return rawList.map((raw, idx) => {
    const anikumeId = anikumeIds[idx] || "";
    const poster =
      raw.poster ||
      raw.cover ||
      raw.coverImage?.extraLarge ||
      raw.coverImage?.large ||
      raw.coverImage?.medium ||
      null;
    const item = {
      anikume_id: anikumeId,
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      format: normalizeFormat(raw.format),
      status: normalizeStatus(raw.status),
      is_adult: false,
    };
    return item;
  });
}
__name(mapAndFormatAnimeItemsBatch, "mapAndFormatAnimeItemsBatch");
async function mapAndFormatAnimeHeroItemsBatch(rawList, precomputedAnikumeIds) {
  if (!rawList || rawList.length === 0) return [];
  const anikumeIds =
    precomputedAnikumeIds ||
    (await getOrCreateAnikumeIdsBatch(
      rawList.map((raw) => ({
        anilist_id: raw.anilist_id || null,
        mal_id: raw.mal_id || null,
      })),
    ));
  return rawList.map((raw, idx) => {
    const anikumeId = anikumeIds[idx] || "";
    const poster =
      raw.poster ||
      raw.cover ||
      raw.coverImage?.extraLarge ||
      raw.coverImage?.large ||
      raw.coverImage?.medium ||
      null;
    const banner = raw.banner || poster || null;
    const item = {
      anikume_id: anikumeId,
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      banner,
      description: cleanDescription(raw.description),
      rating: formatRating(
        raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean,
      ),
      status: normalizeStatus(raw.status),
      year: raw.year || null,
      is_adult: false,
    };
    return item;
  });
}
__name(mapAndFormatAnimeHeroItemsBatch, "mapAndFormatAnimeHeroItemsBatch");
async function mapAndFormatAnimeTopItemsBatch(rawList, precomputedAnikumeIds) {
  if (!rawList || rawList.length === 0) return [];
  const anikumeIds =
    precomputedAnikumeIds ||
    (await getOrCreateAnikumeIdsBatch(
      rawList.map((raw) => ({
        anilist_id: raw.anilist_id || null,
        mal_id: raw.mal_id || null,
      })),
    ));
  return rawList.map((raw, idx) => {
    const anikumeId = anikumeIds[idx] || "";
    const poster =
      raw.poster ||
      raw.cover ||
      raw.coverImage?.extraLarge ||
      raw.coverImage?.large ||
      raw.coverImage?.medium ||
      null;
    const item = {
      anikume_id: anikumeId,
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      rating: formatRating(
        raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean,
      ),
      format: normalizeFormat(raw.format),
      status: normalizeStatus(raw.status),
      is_adult: false,
    };
    return item;
  });
}
__name(mapAndFormatAnimeTopItemsBatch, "mapAndFormatAnimeTopItemsBatch");
async function mapAndFormatAnimeItem(raw) {
  const items = await mapAndFormatAnimeItemsBatch([raw]);
  return items[0];
}
__name(mapAndFormatAnimeItem, "mapAndFormatAnimeItem");
async function mapAndFormatMangaHeroItemsBatch(rawList, precomputedAnikumeIds) {
  if (!rawList || rawList.length === 0) return [];
  const anikumeIds =
    precomputedAnikumeIds ||
    (await getOrCreateMangaAnikumeIdsBatch(
      rawList.map((raw) => ({
        anilist_id: raw.anilist_id || null,
        mal_id: raw.mal_id || null,
      })),
    ));
  return rawList.map((raw, idx) => {
    const anikumeId = anikumeIds[idx] || "";
    const poster =
      raw.poster ||
      raw.cover ||
      raw.coverImage?.extraLarge ||
      raw.coverImage?.large ||
      raw.coverImage?.medium ||
      null;
    const banner = raw.banner || poster || null;
    return {
      anikume_id: anikumeId,
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      banner,
      description: cleanDescription(raw.description),
      rating: formatRating(
        raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean,
      ),
      status: normalizeStatus(raw.status),
      year: raw.year || (raw.startDate?.year ? raw.startDate.year : null),
      is_adult: Boolean(raw.is_adult),
    };
  });
}
__name(mapAndFormatMangaHeroItemsBatch, "mapAndFormatMangaHeroItemsBatch");
async function mapAndFormatMangaItemsBatch(rawList, precomputedAnikumeIds) {
  if (!rawList || rawList.length === 0) return [];
  const anikumeIds =
    precomputedAnikumeIds ||
    (await getOrCreateMangaAnikumeIdsBatch(
      rawList.map((raw) => ({
        anilist_id: raw.anilist_id || null,
        mal_id: raw.mal_id || null,
      })),
    ));
  return rawList.map((raw, idx) => {
    const anikumeId = anikumeIds[idx] || "";
    const poster =
      raw.poster ||
      raw.cover ||
      raw.coverImage?.extraLarge ||
      raw.coverImage?.large ||
      raw.coverImage?.medium ||
      null;
    return {
      anikume_id: anikumeId,
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      format: normalizeMangaFormat(raw.format, raw.countryOfOrigin),
      status: normalizeStatus(raw.status),
      is_adult: Boolean(raw.is_adult),
    };
  });
}
__name(mapAndFormatMangaItemsBatch, "mapAndFormatMangaItemsBatch");
async function mapAndFormatMangaTopItemsBatch(rawList, precomputedAnikumeIds) {
  if (!rawList || rawList.length === 0) return [];
  const anikumeIds =
    precomputedAnikumeIds ||
    (await getOrCreateMangaAnikumeIdsBatch(
      rawList.map((raw) => ({
        anilist_id: raw.anilist_id || null,
        mal_id: raw.mal_id || null,
      })),
    ));
  return rawList.map((raw, idx) => {
    const anikumeId = anikumeIds[idx] || "";
    const poster =
      raw.poster ||
      raw.cover ||
      raw.coverImage?.extraLarge ||
      raw.coverImage?.large ||
      raw.coverImage?.medium ||
      null;
    return {
      anikume_id: anikumeId,
      title: {
        romaji: raw.title?.romaji || null,
        english: raw.title?.english || null,
        native: raw.title?.native || null,
      },
      poster,
      rating: formatRating(
        raw.rating ?? raw.score ?? raw.averageScore ?? raw.mean,
      ),
      format: normalizeMangaFormat(raw.format, raw.countryOfOrigin),
      status: normalizeStatus(raw.status),
      is_adult: Boolean(raw.is_adult),
    };
  });
}
__name(mapAndFormatMangaTopItemsBatch, "mapAndFormatMangaTopItemsBatch");
async function fetchAniListAnimeCatalog(clientIp) {
  const { season, year } = getCurrentSeason();
  const query = `
    query ($season: MediaSeason, $seasonYear: Int) {
      trending: Page(page: 1, perPage: 15) {
        media(type: ANIME, sort: TRENDING_DESC) {
          id
          idMal
          isAdult
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          seasonYear
          startDate { year }
          season
          genres
          format
          status
        }
      }
      popularSeason: Page(page: 1, perPage: 15) {
        media(type: ANIME, season: $season, seasonYear: $seasonYear, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          seasonYear
          startDate { year }
          season
          genres
          format
          status
        }
      }
      upcoming: Page(page: 1, perPage: 15) {
        media(type: ANIME, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          seasonYear
          startDate { year }
          season
          genres
          format
          status
        }
      }
      allTimePopular: Page(page: 1, perPage: 10) {
        media(type: ANIME, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          seasonYear
          startDate { year }
          season
          genres
          format
          status
        }
      }
      top10: Page(page: 1, perPage: 10) {
        media(type: ANIME, sort: SCORE_DESC) {
          id
          idMal
          isAdult
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          seasonYear
          startDate { year }
          season
          genres
          format
          status
        }
      }
      top10Movies: Page(page: 1, perPage: 10) {
        media(type: ANIME, format: MOVIE, sort: SCORE_DESC) {
          id
          idMal
          isAdult
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          seasonYear
          startDate { year }
          season
          genres
          format
          status
        }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getForwardedHeaders(clientIp),
    },
    body: JSON.stringify({ query, variables: { season, seasonYear: year } }),
  });
  if (!res.ok) {
    throw new Error(`AniList anime query returned status ${res.status}`);
  }
  const json = await res.json();
  const data = json.data;
  if (!data) throw new Error("AniList returned empty data");
  const parseMedia = __name((m, rankIdx) => {
    const poster =
      m.coverImage?.extraLarge ||
      m.coverImage?.large ||
      m.coverImage?.medium ||
      null;
    const banner = m.bannerImage || poster;
    return {
      anilist_id: m.id,
      mal_id: m.idMal || null,
      is_adult: false,
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null,
      },
      poster,
      banner,
      description: m.description || null,
      rating: formatRating(m.averageScore),
      format: normalizeFormat(m.format),
      status: normalizeStatus(m.status),
      year: m.seasonYear || m.startDate?.year || null,
      season: m.season || null,
      genres: m.genres || [],
      rank: rankIdx !== void 0 ? rankIdx + 1 : void 0,
    };
  }, "parseMedia");
  const trendingRaw = (data.trending?.media || [])
    .slice(0, 10)
    .map((m) => parseMedia(m));
  const popularSeasonRaw = (data.popularSeason?.media || [])
    .slice(0, 10)
    .map((m) => parseMedia(m));
  const upcomingRaw = (data.upcoming?.media || [])
    .slice(0, 10)
    .map((m) => parseMedia(m));
  const allTimePopularRaw = (data.allTimePopular?.media || [])
    .slice(0, 10)
    .map((m) => parseMedia(m));
  const top10Raw = (data.top10?.media || [])
    .slice(0, 10)
    .map((m, idx) => parseMedia(m, idx));
  const top10MoviesRaw = (data.top10Movies?.media || [])
    .slice(0, 10)
    .map((m, idx) => parseMedia(m, idx));
  const middleRaw = [
    ...trendingRaw,
    ...popularSeasonRaw,
    ...upcomingRaw,
    ...allTimePopularRaw,
  ];
  const topRaw = [...top10Raw, ...top10MoviesRaw];
  const heroSliderRaw = trendingRaw.slice(0, 6);
  const allUniqueRaw = [...middleRaw, ...topRaw];
  const allIdPairs = allUniqueRaw.map((raw) => ({
    anilist_id: raw.anilist_id || null,
    mal_id: raw.mal_id || null,
  }));
  const allAnikumeIds = await getOrCreateAnikumeIdsBatch(allIdPairs);
  const middleIds = allAnikumeIds.slice(0, middleRaw.length);
  const topIds = allAnikumeIds.slice(middleRaw.length);
  const heroIds = middleIds.slice(0, heroSliderRaw.length);
  const [heroSlider, middleConverted, topConverted] = await Promise.all([
    mapAndFormatAnimeHeroItemsBatch(heroSliderRaw, heroIds),
    mapAndFormatAnimeItemsBatch(middleRaw, middleIds),
    mapAndFormatAnimeTopItemsBatch(topRaw, topIds),
  ]);
  let offset = 0;
  const trending = middleConverted.slice(offset, offset + trendingRaw.length);
  offset += trendingRaw.length;
  const popularSeason = middleConverted.slice(
    offset,
    offset + popularSeasonRaw.length,
  );
  offset += popularSeasonRaw.length;
  const upcoming = middleConverted.slice(offset, offset + upcomingRaw.length);
  offset += upcomingRaw.length;
  const allTimePopular = middleConverted.slice(
    offset,
    offset + allTimePopularRaw.length,
  );
  const top10 = topConverted.slice(0, top10Raw.length);
  const top10Movies = topConverted.slice(
    top10Raw.length,
    top10Raw.length + top10MoviesRaw.length,
  );
  return {
    hero_slider: heroSlider,
    trending_now: trending,
    popular_this_season: popularSeason,
    upcoming,
    all_time_popular: allTimePopular,
    top_10: top10,
    top_10_movies: top10Movies,
  };
}
__name(fetchAniListAnimeCatalog, "fetchAniListAnimeCatalog");
async function fetchAniListMangaCatalog(clientIp) {
  const query = `
    query {
      trending: Page(page: 1, perPage: 15) {
        media(type: MANGA, sort: TRENDING_DESC) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate { year }
          genres
          format
          status
        }
      }
      popularSeason: Page(page: 1, perPage: 15) {
        media(type: MANGA, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate { year }
          genres
          format
          status
        }
      }
      upcoming: Page(page: 1, perPage: 15) {
        media(type: MANGA, status: NOT_YET_RELEASED, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate { year }
          genres
          format
          status
        }
      }
      allTimePopular: Page(page: 1, perPage: 10) {
        media(type: MANGA, sort: POPULARITY_DESC) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate { year }
          genres
          format
          status
        }
      }
      top10: Page(page: 1, perPage: 10) {
        media(type: MANGA, sort: SCORE_DESC) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate { year }
          genres
          format
          status
        }
      }
      top10Manhwa: Page(page: 1, perPage: 10) {
        media(type: MANGA, countryOfOrigin: "KR", sort: SCORE_DESC) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          startDate { year }
          genres
          format
          status
        }
      }
    }
  `;
  const res = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getForwardedHeaders(clientIp),
    },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) {
    throw new Error(`AniList manga query returned status ${res.status}`);
  }
  const json = await res.json();
  const data = json.data;
  if (!data) throw new Error("AniList returned empty data for manga");
  const mapRawAni = __name((m) => {
    const poster =
      m.coverImage?.extraLarge ||
      m.coverImage?.large ||
      m.coverImage?.medium ||
      null;
    const banner = m.bannerImage || poster;
    return {
      anilist_id: m.id,
      mal_id: m.idMal || null,
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null,
      },
      poster,
      banner,
      description: cleanDescription(m.description),
      rating: formatRating(m.averageScore),
      format: m.format,
      countryOfOrigin: m.countryOfOrigin,
      status: m.status,
      year: m.startDate?.year || null,
      genres: m.genres || [],
      is_adult: Boolean(m.isAdult),
    };
  }, "mapRawAni");
  const trendingRaw = (data.trending?.media || []).slice(0, 10).map(mapRawAni);
  const heroSliderRaw = trendingRaw.slice(0, 6);
  const popularSeasonRaw = (data.popularSeason?.media || [])
    .slice(0, 10)
    .map(mapRawAni);
  const upcomingRaw = (data.upcoming?.media || []).slice(0, 10).map(mapRawAni);
  const allTimePopularRaw = (data.allTimePopular?.media || [])
    .slice(0, 10)
    .map(mapRawAni);
  const top10Raw = (data.top10?.media || []).slice(0, 10).map(mapRawAni);
  const top10ManhwaRaw = (data.top10Manhwa?.media || [])
    .slice(0, 10)
    .map(mapRawAni);
  const middleRaw = [
    ...trendingRaw,
    ...popularSeasonRaw,
    ...upcomingRaw,
    ...allTimePopularRaw,
  ];
  const topRaw = [...top10Raw, ...top10ManhwaRaw];
  const allUniqueRaw = [...middleRaw, ...topRaw];
  const allIdPairs = allUniqueRaw.map((raw) => ({
    anilist_id: raw.anilist_id || null,
    mal_id: raw.mal_id || null,
  }));
  const allAnikumeIds = await getOrCreateMangaAnikumeIdsBatch(allIdPairs);
  const middleIds = allAnikumeIds.slice(0, middleRaw.length);
  const topIds = allAnikumeIds.slice(middleRaw.length);
  const heroIds = middleIds.slice(0, heroSliderRaw.length);
  const [heroSlider, middleConverted, topConverted] = await Promise.all([
    mapAndFormatMangaHeroItemsBatch(heroSliderRaw, heroIds),
    mapAndFormatMangaItemsBatch(middleRaw, middleIds),
    mapAndFormatMangaTopItemsBatch(topRaw, topIds),
  ]);
  let offset = 0;
  const trending = middleConverted.slice(offset, offset + trendingRaw.length);
  offset += trendingRaw.length;
  const popularSeason = middleConverted.slice(
    offset,
    offset + popularSeasonRaw.length,
  );
  offset += popularSeasonRaw.length;
  const upcoming = middleConverted.slice(offset, offset + upcomingRaw.length);
  offset += upcomingRaw.length;
  const allTimePopular = middleConverted.slice(
    offset,
    offset + allTimePopularRaw.length,
  );
  const top10 = topConverted.slice(0, top10Raw.length);
  const top10Manhwa = topConverted.slice(
    top10Raw.length,
    top10Raw.length + top10ManhwaRaw.length,
  );
  return {
    hero_slider: heroSlider,
    trending_now: trending,
    popular_this_season: popularSeason,
    upcoming,
    all_time_popular: allTimePopular,
    top_10: top10,
    top_10_movies: top10Manhwa,
    top_10_manhwa: top10Manhwa,
  };
}
__name(fetchAniListMangaCatalog, "fetchAniListMangaCatalog");
async function fetchMalRankingRaw(path, limit, isTopList = false) {
  const fields =
    "id,title,main_picture,alternative_titles,rank,status,media_type,nsfw,rating,genres,synopsis,mean,start_season,start_date,pictures";
  const url = `https://api.myanimelist.net/v2/${path}${path.includes("?") ? "&" : "?"}limit=${limit}&nsfw=true&fields=${fields}`;
  const res = await fetch(url, {
    headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID },
  });
  if (!res.ok) throw new Error(`MAL request failed: ${url} (${res.status})`);
  const data = await res.json();
  const items = data.data || [];
  return items.map((item, idx) => {
    const node = item.node;
    const isAdult = Boolean(
      node.nsfw === "black" ||
      node.rating === "rx" ||
      (Array.isArray(node.genres) &&
        node.genres.some((g) => g?.name === "Hentai" || g?.name === "Erotica")),
    );
    const rawPoster =
      node.main_picture?.large || node.main_picture?.medium || null;
    const poster = getMalLargePoster(rawPoster);
    const banner = poster;
    const genres = Array.isArray(node.genres)
      ? node.genres.map((g) => g.name)
      : [];
    const year =
      node.start_season?.year ||
      (node.start_date ? parseInt(node.start_date.substring(0, 4), 10) : null);
    const season = node.start_season?.season
      ? String(node.start_season.season).toUpperCase()
      : null;
    return {
      anilist_id: null,
      mal_id: node.id,
      title: {
        romaji: node.title || null,
        english: node.alternative_titles?.en || node.title || null,
        native: node.alternative_titles?.ja || null,
      },
      poster,
      banner,
      description: node.synopsis || null,
      rating: formatRating(node.mean),
      status: node.status || null,
      format: normalizeFormat(node.media_type),
      year,
      season,
      genres,
      is_adult: false,
      rank: isTopList ? node.rank || idx + 1 : void 0,
    };
  });
}
__name(fetchMalRankingRaw, "fetchMalRankingRaw");
async function fetchMalAnimeCatalog(clientIp) {
  const { season, year } = getCurrentSeason();
  const malSeason = season.toLowerCase();
  const [
    trendingRaw,
    popularSeasonRaw,
    upcomingRaw,
    allTimePopularRaw,
    top10Raw,
    top10MoviesRaw,
  ] = await Promise.all([
    fetchMalRankingRaw("anime/ranking?ranking_type=airing", 10).catch(() => []),
    fetchMalRankingRaw(
      `anime/season/${year}/${malSeason}?sort=anime_num_list_users`,
      10,
    ).catch(() => []),
    fetchMalRankingRaw("anime/ranking?ranking_type=upcoming", 10).catch(
      () => [],
    ),
    fetchMalRankingRaw("anime/ranking?ranking_type=bypopularity", 10).catch(
      () => [],
    ),
    fetchMalRankingRaw("anime/ranking?ranking_type=all", 10, true).catch(
      () => [],
    ),
    fetchMalRankingRaw("anime/ranking?ranking_type=movie", 10, true).catch(
      () => [],
    ),
  ]);
  const middleRaw = [
    ...trendingRaw.slice(0, 10),
    ...popularSeasonRaw.slice(0, 10),
    ...upcomingRaw.slice(0, 10),
    ...allTimePopularRaw.slice(0, 10),
  ];
  const topRaw = [...top10Raw.slice(0, 10), ...top10MoviesRaw.slice(0, 10)];
  const heroSliderRaw = trendingRaw.slice(0, 6);
  const allUniqueRaw = [...middleRaw, ...topRaw];
  const allIdPairs = allUniqueRaw.map((raw) => ({
    anilist_id: raw.anilist_id || null,
    mal_id: raw.mal_id || null,
  }));
  const allAnikumeIds = await getOrCreateAnikumeIdsBatch(allIdPairs);
  const middleIds = allAnikumeIds.slice(0, middleRaw.length);
  const topIds = allAnikumeIds.slice(middleRaw.length);
  const heroIds = middleIds.slice(0, heroSliderRaw.length);
  const [heroSlider, middleConverted, topConverted] = await Promise.all([
    mapAndFormatAnimeHeroItemsBatch(heroSliderRaw, heroIds),
    mapAndFormatAnimeItemsBatch(middleRaw, middleIds),
    mapAndFormatAnimeTopItemsBatch(topRaw, topIds),
  ]);
  let offset = 0;
  const trending = middleConverted.slice(
    offset,
    offset + Math.min(10, trendingRaw.length),
  );
  offset += Math.min(10, trendingRaw.length);
  const popularSeason = middleConverted.slice(
    offset,
    offset + Math.min(10, popularSeasonRaw.length),
  );
  offset += Math.min(10, popularSeasonRaw.length);
  const upcoming = middleConverted.slice(
    offset,
    offset + Math.min(10, upcomingRaw.length),
  );
  offset += Math.min(10, upcomingRaw.length);
  const allTimePopular = middleConverted.slice(
    offset,
    offset + Math.min(10, allTimePopularRaw.length),
  );
  const top10 = topConverted.slice(0, Math.min(10, top10Raw.length));
  const top10Movies = topConverted.slice(
    Math.min(10, top10Raw.length),
    Math.min(10, top10Raw.length) + Math.min(10, top10MoviesRaw.length),
  );
  return {
    hero_slider: heroSlider,
    trending_now: trending,
    popular_this_season: popularSeason,
    upcoming,
    all_time_popular: allTimePopular,
    top_10: top10,
    top_10_movies: top10Movies,
  };
}
__name(fetchMalAnimeCatalog, "fetchMalAnimeCatalog");
async function fetchMalRankingMangaRaw(path, limit, isTopList = false) {
  const fields =
    "id,title,main_picture,alternative_titles,rank,status,media_type,nsfw,genres,synopsis,mean,start_date,pictures";
  const url = `https://api.myanimelist.net/v2/${path}${path.includes("?") ? "&" : "?"}limit=${limit}&nsfw=true&fields=${fields}`;
  const res = await fetch(url, {
    headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID },
  });
  if (!res.ok) throw new Error(`MAL request failed: ${url} (${res.status})`);
  const data = await res.json();
  const items = data.data || [];
  return items.map((item, idx) => {
    const node = item.node;
    const isAdult = Boolean(
      node.nsfw === "black" ||
      (Array.isArray(node.genres) &&
        node.genres.some((g) => g?.name === "Hentai" || g?.name === "Erotica")),
    );
    const rawPoster =
      node.main_picture?.large || node.main_picture?.medium || null;
    const poster = getMalLargePoster(rawPoster);
    const banner = poster;
    const genres = Array.isArray(node.genres)
      ? node.genres.map((g) => g.name)
      : [];
    const year = node.start_date
      ? parseInt(node.start_date.substring(0, 4), 10)
      : null;
    return {
      anilist_id: null,
      mal_id: node.id,
      title: {
        romaji: node.title || null,
        english: node.alternative_titles?.en || node.title || null,
        native: node.alternative_titles?.ja || null,
      },
      poster,
      banner,
      description: cleanDescription(node.synopsis),
      rating: formatRating(node.mean),
      status: normalizeStatus(node.status),
      format: node.media_type,
      year,
      genres,
      is_adult: false,
      rank: isTopList ? node.rank || idx + 1 : void 0,
    };
  });
}
__name(fetchMalRankingMangaRaw, "fetchMalRankingMangaRaw");
async function fetchMalMangaCatalog(clientIp) {
  const [
    trendingRaw,
    popularSeasonRaw,
    upcomingRaw,
    allTimePopularRaw,
    top10Raw,
    top10ManhwaRaw,
  ] = await Promise.all([
    fetchMalRankingMangaRaw("manga/ranking?ranking_type=manga", 10).catch(
      () => [],
    ),
    fetchMalRankingMangaRaw("manga/ranking?ranking_type=publishing", 10).catch(
      () => [],
    ),
    fetchMalRankingMangaRaw("manga/ranking?ranking_type=upcoming", 10).catch(
      () => [],
    ),
    fetchMalRankingMangaRaw(
      "manga/ranking?ranking_type=bypopularity",
      10,
    ).catch(() => []),
    fetchMalRankingMangaRaw("manga/ranking?ranking_type=all", 10, true).catch(
      () => [],
    ),
    fetchMalRankingMangaRaw(
      "manga/ranking?ranking_type=manhwa",
      10,
      true,
    ).catch(() => []),
  ]);
  const middleRaw = [
    ...trendingRaw.slice(0, 10),
    ...popularSeasonRaw.slice(0, 10),
    ...upcomingRaw.slice(0, 10),
    ...allTimePopularRaw.slice(0, 10),
  ];
  const topRaw = [...top10Raw.slice(0, 10), ...top10ManhwaRaw.slice(0, 10)];
  const heroSliderRaw = trendingRaw.slice(0, 6);
  const allUniqueRaw = [...middleRaw, ...topRaw];
  const allIdPairs = allUniqueRaw.map((raw) => ({
    anilist_id: raw.anilist_id || null,
    mal_id: raw.mal_id || null,
  }));
  const allAnikumeIds = await getOrCreateMangaAnikumeIdsBatch(allIdPairs);
  const middleIds = allAnikumeIds.slice(0, middleRaw.length);
  const topIds = allAnikumeIds.slice(middleRaw.length);
  const heroIds = middleIds.slice(0, heroSliderRaw.length);
  const [heroSlider, middleConverted, topConverted] = await Promise.all([
    mapAndFormatMangaHeroItemsBatch(heroSliderRaw, heroIds),
    mapAndFormatMangaItemsBatch(middleRaw, middleIds),
    mapAndFormatMangaTopItemsBatch(topRaw, topIds),
  ]);
  let offset = 0;
  const trending = middleConverted.slice(
    offset,
    offset + Math.min(10, trendingRaw.length),
  );
  offset += Math.min(10, trendingRaw.length);
  const popularSeason = middleConverted.slice(
    offset,
    offset + Math.min(10, popularSeasonRaw.length),
  );
  offset += Math.min(10, popularSeasonRaw.length);
  const upcoming = middleConverted.slice(
    offset,
    offset + Math.min(10, upcomingRaw.length),
  );
  offset += Math.min(10, upcomingRaw.length);
  const allTimePopular = middleConverted.slice(
    offset,
    offset + Math.min(10, allTimePopularRaw.length),
  );
  const top10 = topConverted.slice(0, Math.min(10, top10Raw.length));
  const top10Manhwa = topConverted.slice(
    Math.min(10, top10Raw.length),
    Math.min(10, top10Raw.length) + Math.min(10, top10ManhwaRaw.length),
  );
  return {
    hero_slider: heroSlider,
    trending_now: trending,
    popular_this_season: popularSeason,
    upcoming,
    all_time_popular: allTimePopular,
    top_10: top10,
    top_10_movies: top10Manhwa,
    top_10_manhwa: top10Manhwa,
  };
}
__name(fetchMalMangaCatalog, "fetchMalMangaCatalog");
async function getAnimeCatalog(provider, clientIp) {
  const normProvider = provider ? provider.toLowerCase() : "auto";
  let catalog = null;
  if (normProvider === "anilist") {
    try {
      catalog = await fetchAniListAnimeCatalog(clientIp);
    } catch (err) {
      console.warn(
        "AniList Anime API unavailable, providing resilient mapped MAL catalog with AniList IDs:",
        err,
      );
      catalog = await fetchMalAnimeCatalog(clientIp);
    }
  } else if (normProvider === "mal") {
    try {
      catalog = await fetchMalAnimeCatalog(clientIp);
    } catch (err) {
      console.warn("MAL Anime API unavailable, trying AniList:", err);
      catalog = await fetchAniListAnimeCatalog(clientIp);
    }
  } else {
    try {
      catalog = await fetchAniListAnimeCatalog(clientIp);
    } catch (err) {
      console.warn("AniList Anime fetch failed, falling back to MAL:", err);
    }
    if (
      !catalog ||
      !catalog.trending_now ||
      catalog.trending_now.length === 0
    ) {
      try {
        catalog = await fetchMalAnimeCatalog(clientIp);
      } catch (err) {
        console.error("MAL Anime fetch failed:", err);
      }
    }
  }
  if (catalog) {
    return catalog;
  }
  throw new Error(
    `Failed to retrieve anime catalog from provider: ${normProvider}`,
  );
}
__name(getAnimeCatalog, "getAnimeCatalog");
async function getMangaCatalog(provider, clientIp) {
  const normProvider = provider ? provider.toLowerCase() : "auto";
  let catalog = null;
  if (normProvider === "anilist") {
    try {
      catalog = await fetchAniListMangaCatalog(clientIp);
    } catch (err) {
      console.warn(
        "AniList Manga API unavailable, providing resilient mapped MAL catalog with AniList IDs:",
        err,
      );
      catalog = await fetchMalMangaCatalog(clientIp);
    }
  } else if (normProvider === "mal") {
    try {
      catalog = await fetchMalMangaCatalog(clientIp);
    } catch (err) {
      console.warn("MAL Manga API unavailable, trying AniList:", err);
      catalog = await fetchAniListMangaCatalog(clientIp);
    }
  } else {
    try {
      catalog = await fetchAniListMangaCatalog(clientIp);
    } catch (err) {
      console.warn("AniList Manga fetch failed, falling back to MAL:", err);
    }
    if (
      !catalog ||
      !catalog.trending_now ||
      catalog.trending_now.length === 0
    ) {
      try {
        catalog = await fetchMalMangaCatalog(clientIp);
      } catch (err) {
        console.warn("MAL Manga fetch failed:", err);
      }
    }
  }
  if (catalog) {
    return catalog;
  }
  throw new Error(
    `Failed to retrieve manga catalog from provider: ${normProvider}`,
  );
}
__name(getMangaCatalog, "getMangaCatalog");
const ANILIST_GENRES = [
  "Action",
  "Adventure",
  "Comedy",
  "Drama",
  "Ecchi",
  "Fantasy",
  "Horror",
  "Mahou Shoujo",
  "Mecha",
  "Music",
  "Mystery",
  "Psychological",
  "Romance",
  "Sci-Fi",
  "Slice of Life",
  "Sports",
  "Supernatural",
  "Thriller",
  "Hentai",
];
const ANILIST_TAGS = [
  "4-koma",
  "Achromatic",
  "Achronological Order",
  "Acrobatics",
  "Acting",
  "Adoption",
  "Advertisement",
  "Afterlife",
  "Age Gap",
  "Age Regression",
  "Agender",
  "Agriculture",
  "Airsoft",
  "Alchemy",
  "Aliens",
  "Alternate Universe",
  "American Football",
  "Amnesia",
  "Anachronism",
  "Ancient China",
  "Angels",
  "Animals",
  "Anthology",
  "Anthropomorphism",
  "Anti-Hero",
  "Archery",
  "Aromantic",
  "Arranged Marriage",
  "Artificial Intelligence",
  "Asexual",
  "Assassins",
  "Astronomy",
  "Athletics",
  "Augmented Reality",
  "Autobiographical",
  "Aviation",
  "Badminton",
  "Ballet",
  "Band",
  "Bar",
  "Baseball",
  "Basketball",
  "Battle Royale",
  "Biographical",
  "Bisexual",
  "Blackmail",
  "Board Game",
  "Boarding School",
  "Body Horror",
  "Body Image",
  "Body Swapping",
  "Bowling",
  "Boxing",
  "Boys' Love",
  "Brainwashing",
  "Bullying",
  "Butler",
  "Calligraphy",
  "Camping",
  "Cannibalism",
  "Card Battle",
  "Cars",
  "Centaur",
  "CGI",
  "Cheating",
  "Cheerleading",
  "Chibi",
  "Chimera",
  "Chuunibyou",
  "Circus",
  "Class Struggle",
  "Classic Literature",
  "Classical Music",
  "Clone",
  "Coastal",
  "Cohabitation",
  "College",
  "Coming of Age",
  "Conspiracy",
  "Cosmic Horror",
  "Cosplay",
  "Cowboys",
  "Creature Taming",
  "Crime",
  "Criminal Organization",
  "Crossdressing",
  "Crossover",
  "Cult",
  "Cultivation",
  "Curses",
  "Cute Boys Doing Cute Things",
  "Cute Girls Doing Cute Things",
  "Cyberpunk",
  "Cyborg",
  "Cycling",
  "Dancing",
  "Death Game",
  "Delinquents",
  "Demons",
  "Denpa",
  "Desert",
  "Detective",
  "Dinosaurs",
  "Disability",
  "Dissociative Identities",
  "Dragons",
  "Drawing",
  "Drugs",
  "Dullahan",
  "Dungeon",
  "Dystopian",
  "E-Sports",
  "Eco-Horror",
  "Economics",
  "Educational",
  "Elderly Protagonist",
  "Elf",
  "Ensemble Cast",
  "Environmental",
  "Episodic",
  "Ero Guro",
  "Espionage",
  "Estranged Family",
  "Exiled",
  "Exorcism",
  "Fairy",
  "Fairy Tale",
  "Fake Relationship",
  "Family Life",
  "Fashion",
  "Female Harem",
  "Female Protagonist",
  "Femboy",
  "Fencing",
  "Filmmaking",
  "Firefighters",
  "Fishing",
  "Fitness",
  "Flash",
  "Food",
  "Football",
  "Foreign",
  "Found Family",
  "Fugitive",
  "Full CGI",
  "Full Color",
  "Gambling",
  "Gangs",
  "Gekiga",
  "Gender Bending",
  "Ghost",
  "Go",
  "Goblin",
  "Gods",
  "Golf",
  "Gore",
  "Graduation Project",
  "Guns",
  "Gyaru",
  "Handball",
  "Henshin",
  "Heterosexual",
  "Hikikomori",
  "Hip-hop Music",
  "Historical",
  "Homeless",
  "Horticulture",
  "Human Experimentation",
  "Ice Sports",
  "Idol",
  "Incest",
  "Indigenous Cultures",
  "Inn",
  "Inseki",
  "Interspecies",
  "Isekai",
  "Iyashikei",
  "Jazz Music",
  "Josei",
  "Judo",
  "Kabuki",
  "Kaiju",
  "Karuta",
  "Kemonomimi",
  "Kids",
  "Kingdom Management",
  "Konbini",
  "Kuudere",
  "Lacrosse",
  "Language Barrier",
  "LGBTQ+ Themes",
  "Long Strip",
  "Lost Civilization",
  "Love Triangle",
  "Mafia",
  "Magic",
  "Mahjong",
  "Maids",
  "Makeup",
  "Male Harem",
  "Male Protagonist",
  "Manzai",
  "Marriage",
  "Martial Arts",
  "Matchmaking",
  "Matriarchy",
  "Medicine",
  "Medieval",
  "Memory Manipulation",
  "Mermaid",
  "Meta",
  "Metal Music",
  "Middle east",
  "Military",
  "Mixed Gender Harem",
  "Mixed Media",
  "Modeling",
  "Monster Boy",
  "Monster Girl",
  "Mopeds",
  "Motorcycles",
  "Mountaineering",
  "Musical Theater",
  "Mythology",
  "Natural Disaster",
  "Necromancy",
  "Nekomimi",
  "Ninja",
  "No Dialogue",
  "Noir",
  "Non-fiction",
  "Nudity",
  "Nun",
  "Office",
  "Office Lady",
  "Oiran",
  "Ojou-sama",
  "Orphan",
  "Otaku Culture",
  "Outdoor Activities",
  "Pandemic",
  "Parenthood",
  "Parkour",
  "Parody",
  "Philosophy",
  "Photography",
  "Pirates",
  "Poker",
  "Police",
  "Politics",
  "Polyamorous",
  "Post-Apocalyptic",
  "POV",
  "Pregnancy",
  "Primarily Adult Cast",
  "Primarily Animal Cast",
  "Primarily Child Cast",
  "Primarily Female Cast",
  "Primarily Male Cast",
  "Primarily Teen Cast",
  "Prison",
  "Prophecy",
  "Proxy Battle",
  "Psychosexual",
  "Puppetry",
  "Rakugo",
  "Real Robot",
  "Rehabilitation",
  "Reincarnation",
  "Religion",
  "Rescue",
  "Restaurant",
  "Revenge",
  "Reverse Isekai",
  "Robots",
  "Rock Music",
  "Rotoscoping",
  "Royal Affairs",
  "Rugby",
  "Rural",
  "Samurai",
  "Satire",
  "School",
  "School Club",
  "Scuba Diving",
  "Seinen",
  "Shapeshifting",
  "Ships",
  "Shogi",
  "Short-Form Chapter",
  "Shoujo",
  "Shounen",
  "Shrine Maiden",
  "Skateboarding",
  "Skeleton",
  "Slapstick",
  "Slavery",
  "Snowscape",
  "Software Development",
  "Space",
  "Space Opera",
  "Spearplay",
  "Steampunk",
  "Stop Motion",
  "Succubus",
  "Suicide",
  "Sumo",
  "Super Power",
  "Super Robot",
  "Superhero",
  "Surfing",
  "Surreal Comedy",
  "Survival",
  "Swimming",
  "Swordplay",
  "Table Tennis",
  "Tanks",
  "Tanned Skin",
  "Teacher",
  "Teens' Love",
  "Tennis",
  "Terrorism",
  "Time Loop",
  "Time Manipulation",
  "Time Skip",
  "Tokusatsu",
  "Tomboy",
  "Torture",
  "Tragedy",
  "Trains",
  "Transgender",
  "Travel",
  "Triads",
  "Tsundere",
  "Twins",
  "Unrequited Love",
  "Urban",
  "Urban Fantasy",
  "Vampire",
  "Vertical Video",
  "Veterinarian",
  "Video Games",
  "Vikings",
  "Villainess",
  "Virtual World",
  "Vocal Synth",
  "Volleyball",
  "VTuber",
  "War",
  "Werewolf",
  "Wilderness",
  "Witch",
  "Work",
  "Wrestling",
  "Writing",
  "Wuxia",
  "Yakuza",
  "Yandere",
  "Youkai",
  "Yuri",
  "Zombie",
];
const GENRE_LOWER_MAP = new Map();
for (const g of ANILIST_GENRES) GENRE_LOWER_MAP.set(g.toLowerCase(), g);
const TAG_LOWER_MAP = new Map();
for (const t of ANILIST_TAGS) TAG_LOWER_MAP.set(t.toLowerCase(), t);
function resolveGenreAndTagFilters(rawGenreInput, rawTagInput) {
  const combined = [rawGenreInput, rawTagInput].filter(Boolean).join(",");
  if (!combined.trim()) return { genresIn: [], tagsIn: [], isAdult: false };
  const list = combined
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const genresIn = [];
  const tagsIn = [];
  let isAdult = false;
  for (const item of list) {
    const lower = item.toLowerCase();
    if (GENRE_LOWER_MAP.has(lower)) {
      const canonical = GENRE_LOWER_MAP.get(lower);
      if (!genresIn.includes(canonical)) genresIn.push(canonical);
      if (canonical === "Hentai") isAdult = true;
    } else if (TAG_LOWER_MAP.has(lower)) {
      const canonical = TAG_LOWER_MAP.get(lower);
      if (!tagsIn.includes(canonical)) tagsIn.push(canonical);
      if (canonical === "Hentai" || canonical === "Ero Guro") isAdult = true;
    } else {
      if (!tagsIn.includes(item)) tagsIn.push(item);
    }
  }
  return { genresIn, tagsIn, isAdult };
}
__name(resolveGenreAndTagFilters, "resolveGenreAndTagFilters");
function parseSortParams(sortParam, azParam, hasSearch) {
  const sortList = [];
  if (sortParam) {
    const rawSorts = sortParam
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
    const VALID_SORTS = new Set([
      "POPULARITY_DESC",
      "POPULARITY",
      "SCORE_DESC",
      "SCORE",
      "TRENDING_DESC",
      "TRENDING",
      "FAVOURITES_DESC",
      "FAVOURITES",
      "START_DATE_DESC",
      "START_DATE",
      "END_DATE_DESC",
      "END_DATE",
      "UPDATED_AT_DESC",
      "UPDATED_AT",
      "TITLE_ROMAJI_DESC",
      "TITLE_ROMAJI",
      "TITLE_ROMAJI_ASC",
      "TITLE_ENGLISH_DESC",
      "TITLE_ENGLISH",
      "TITLE_ENGLISH_ASC",
      "TITLE_NATIVE_DESC",
      "TITLE_NATIVE",
      "TITLE_NATIVE_ASC",
      "CHAPTERS_DESC",
      "CHAPTERS",
      "VOLUMES_DESC",
      "VOLUMES",
      "EPISODES_DESC",
      "EPISODES",
      "SEARCH_MATCH",
    ]);
    for (const s of rawSorts) {
      if (VALID_SORTS.has(s)) {
        sortList.push(s);
      }
    }
  }
  if (azParam) {
    const az = azParam.toLowerCase().trim();
    if (az === "romaji") sortList.push("TITLE_ROMAJI_ASC");
    if (az === "english") sortList.push("TITLE_ENGLISH_ASC");
    if (az === "native") sortList.push("TITLE_NATIVE_ASC");
  }
  if (sortList.length === 0) {
    if (hasSearch) {
      sortList.push("SEARCH_MATCH");
    } else {
      sortList.push("POPULARITY_DESC");
    }
  }
  return sortList;
}
__name(parseSortParams, "parseSortParams");
function resolveMangaFormatAndCountry(formatParam, countryParam) {
  let country = void 0;
  const formats = [];
  if (countryParam) {
    country = countryParam.trim().toUpperCase();
  }
  if (formatParam) {
    const rawFormats = formatParam
      .split(",")
      .map((f) => f.trim().toUpperCase().replace("-", "_"))
      .filter(Boolean);
    for (const f of rawFormats) {
      if (f === "MANHWA") {
        if (!country) country = "KR";
        if (!formats.includes("MANGA")) formats.push("MANGA");
      } else if (f === "MANHUA") {
        if (!country) country = "CN";
        if (!formats.includes("MANGA")) formats.push("MANGA");
      } else if (["MANGA", "NOVEL", "ONE_SHOT"].includes(f)) {
        if (!formats.includes(f)) formats.push(f);
      }
    }
  }
  return { formats: formats.length > 0 ? formats : void 0, country };
}
__name(resolveMangaFormatAndCountry, "resolveMangaFormatAndCountry");
async function fetchAniListRawAnime(params, clientIp) {
  const searchQuery = params.q || params.search;
  const sortList = parseSortParams(params.sort, params.az, !!searchQuery);
  const { genresIn, tagsIn, isAdult } = resolveGenreAndTagFilters(
    params.genre,
    params.tag || params.tags,
  );
  const variables = {
    page: params.page ? Number(params.page) : 1,
    perPage: params.perPage
      ? Number(params.perPage)
      : params.limit
        ? Number(params.limit)
        : 30,
    sort: sortList,
  };
  if (searchQuery) variables.search = searchQuery;
  if (genresIn.length > 0) variables.genreIn = genresIn;
  if (tagsIn.length > 0) variables.tagIn = tagsIn;
  if (isAdult) variables.isAdult = true;
  if (params.season) {
    variables.season = params.season.split(",")[0].trim().toUpperCase();
  }
  if (params.year) {
    const y = Number(params.year.toString().split(",")[0].trim());
    if (!isNaN(y)) variables.seasonYear = y;
  }
  if (params.format) {
    variables.formatIn = params.format
      .split(",")
      .map((f) => f.trim().toUpperCase().replace("-", "_"))
      .filter(Boolean);
  }
  if (params.status) {
    variables.statusIn = params.status
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  if (params.country || params.countryOfOrigin) {
    variables.countryOfOrigin = (params.country || params.countryOfOrigin)
      .toString()
      .trim()
      .toUpperCase();
  }
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $search: String,
      $genreIn: [String],
      $tagIn: [String],
      $season: MediaSeason,
      $seasonYear: Int,
      $formatIn: [MediaFormat],
      $statusIn: [MediaStatus],
      $sort: [MediaSort],
      $isAdult: Boolean,
      $countryOfOrigin: CountryCode
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
          perPage
        }
        media(
          type: ANIME,
          search: $search,
          genre_in: $genreIn,
          tag_in: $tagIn,
          season: $season,
          seasonYear: $seasonYear,
          format_in: $formatIn,
          status_in: $statusIn,
          sort: $sort,
          isAdult: $isAdult,
          countryOfOrigin: $countryOfOrigin
        ) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          format
          status
          seasonYear
          startDate { year }
          season
          genres
        }
      }
    }
  `;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getForwardedHeaders(clientIp),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`AniList browse request failed: ${response.status}`);
  }
  const json = await response.json();
  const pageData = json.data?.Page || {};
  const rawMedia = pageData.media || [];
  const items = rawMedia.map((m) => {
    const poster =
      m.coverImage?.extraLarge ||
      m.coverImage?.large ||
      m.coverImage?.medium ||
      null;
    const banner = m.bannerImage || poster;
    return {
      anilist_id: m.id,
      mal_id: m.idMal || null,
      is_adult:
        m.isAdult === true ||
        (m.genres && m.genres.some((g) => ["Hentai", "Erotica"].includes(g)))
          ? true
          : false,
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null,
      },
      poster,
      banner,
      description: m.description || null,
      rating: formatRating(m.averageScore),
      format: normalizeFormat(m.format),
      status: normalizeStatus(m.status),
      year: m.seasonYear || m.startDate?.year || null,
      season: m.season || null,
      genres: m.genres || [],
    };
  });
  return {
    pageInfo: pageData.pageInfo || {
      total: 0,
      currentPage: 1,
      lastPage: 1,
      hasNextPage: false,
      perPage: 30,
    },
    items,
  };
}
__name(fetchAniListRawAnime, "fetchAniListRawAnime");
async function fetchMalRawAnime(params, clientIp) {
  const searchQuery = params.q || params.search || "";
  if (!searchQuery) {
    return {
      pageInfo: {
        total: 0,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 30,
      },
      items: [],
    };
  }
  const page = params.page ? Number(params.page) : 1;
  const limit = params.perPage ? Number(params.perPage) : 30;
  const offset = (page - 1) * limit;
  const fields =
    "id,title,main_picture,alternative_titles,rank,status,media_type,nsfw,rating,genres,synopsis,mean,start_season,start_date,pictures";
  const url = `https://api.myanimelist.net/v2/anime?q=${encodeURIComponent(searchQuery)}&limit=${limit}&offset=${offset}&nsfw=true&fields=${fields}`;
  const res = await fetch(url, {
    headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID },
  });
  if (!res.ok) {
    throw new Error(`MAL browse request failed: ${res.status}`);
  }
  const json = await res.json();
  const rawMedia = json.data || [];
  const hasNextPage = !!json.paging?.next;
  const items = rawMedia.map((item) => {
    const m = item.node;
    const rawPoster = m.main_picture?.large || m.main_picture?.medium || null;
    const poster = getMalLargePoster(rawPoster);
    const banner = poster;
    const isNsfw =
      m.nsfw === "gray" || m.nsfw === "black" || m.nsfw === "hentai";
    const isRx =
      typeof m.rating === "string" &&
      ["rx", "r+", "r"].includes(m.rating.toLowerCase().trim());
    const hasAdultGenre =
      Array.isArray(m.genres) &&
      m.genres.some((g) => {
        const gName = (typeof g === "string" ? g : g?.name || "")
          .toLowerCase()
          .trim();
        return [
          "hentai",
          "erotica",
          "ecchi",
          "boys love",
          "girls love",
          "yuri",
          "yaoi",
        ].includes(gName);
      });
    return {
      anilist_id: null,
      mal_id: m.id,
      is_adult: isNsfw || isRx || hasAdultGenre,
      title: {
        romaji: m.title || null,
        english: m.alternative_titles?.en || null,
        native: m.alternative_titles?.ja || null,
      },
      poster,
      banner,
      description: m.synopsis || null,
      rating: formatRating(m.mean),
      format: normalizeFormat(m.media_type),
      status: normalizeStatus(m.status),
      year:
        m.start_season?.year ||
        (m.start_date ? parseInt(m.start_date.substring(0, 4)) : null),
      season: m.start_season?.season
        ? String(m.start_season.season).toUpperCase()
        : null,
      genres: m.genres?.map((g) => g.name) || [],
    };
  });
  return {
    pageInfo: {
      total: hasNextPage ? page * limit + 1 : page * limit,
      currentPage: page,
      lastPage: hasNextPage ? page + 1 : page,
      hasNextPage,
      perPage: limit,
    },
    items,
  };
}
__name(fetchMalRawAnime, "fetchMalRawAnime");
async function browseAnime(params, clientIp) {
  const isSearch = !!(params.q || params.search);
  const [aniSettled, malSettled] = await Promise.allSettled([
    fetchAniListRawAnime(params, clientIp),
    isSearch
      ? fetchMalRawAnime(params, clientIp)
      : Promise.resolve({ pageInfo: null, items: [] }),
  ]);
  const aniRes = aniSettled.status === "fulfilled" ? aniSettled.value : null;
  const malRes = malSettled.status === "fulfilled" ? malSettled.value : null;
  if (aniSettled.status === "rejected") {
    console.warn("AniList browse fetch failed:", aniSettled.reason);
  }
  if (malSettled.status === "rejected") {
    console.warn("MAL browse fetch failed:", malSettled.reason);
  }
  let combinedRaw = [];
  let pageInfo = null;
  if (aniRes && aniRes.items.length > 0) {
    pageInfo = aniRes.pageInfo;
    const aniItems = aniRes.items;
    const knownMalIds = new Set();
    for (const item of aniItems) {
      if (item.mal_id) {
        knownMalIds.add(Number(item.mal_id));
      }
    }
    const uniqueMalItems = (malRes?.items || []).filter((item) => {
      if (!item.mal_id) return true;
      return !knownMalIds.has(Number(item.mal_id));
    });
    combinedRaw = [...aniItems, ...uniqueMalItems];
  } else if (malRes && malRes.items.length > 0) {
    pageInfo = malRes.pageInfo;
    combinedRaw = malRes.items;
  } else {
    return {
      pageInfo: {
        total: 0,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 30,
      },
      results: [],
    };
  }
  const anikumeIds = await getOrCreateAnikumeIdsBatch(
    combinedRaw.map((r) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id })),
  );
  const results = combinedRaw.map((r, idx) => ({
    anikume_id: anikumeIds[idx],
    title: r.title,
    poster: r.poster,
    banner: r.banner,
    description: cleanDescription(r.description),
    rating: r.rating,
    format: r.format,
    status: r.status,
    year: r.year,
    is_adult: r.is_adult || false,
    season: r.season || null,
    genres: r.genres || [],
  }));
  return {
    pageInfo: pageInfo || {
      total: results.length,
      currentPage: params.page ? Number(params.page) : 1,
      lastPage: 1,
      hasNextPage: false,
      perPage: 30,
    },
    results,
  };
}
__name(browseAnime, "browseAnime");
async function searchAnime5(q, clientIp) {
  const browseRes = await browseAnime({ q, perPage: 5 }, clientIp);
  const fiveItems = (browseRes.results || []).slice(0, 5);
  return fiveItems.map((item) => ({
    anikume_id: item.anikume_id,
    title: item.title,
    poster: item.poster,
    rating: item.rating,
    format: item.format,
    status: item.status,
    is_adult: item.is_adult || false,
  }));
}
__name(searchAnime5, "searchAnime5");
async function fetchMalRawManga(params, clientIp) {
  const searchQuery = params.q || params.search || "";
  if (!searchQuery) {
    return {
      pageInfo: {
        total: 0,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 30,
      },
      items: [],
    };
  }
  const page = params.page ? Number(params.page) : 1;
  const limit = 30;
  const offset = (page - 1) * limit;
  const fields =
    "id,title,main_picture,alternative_titles,rank,status,media_type,nsfw,mean,start_date,genres,synopsis";
  const url = `https://api.myanimelist.net/v2/manga?q=${encodeURIComponent(searchQuery)}&limit=${limit}&offset=${offset}&nsfw=true&fields=${fields}`;
  const res = await fetch(url, {
    headers: { "X-MAL-CLIENT-ID": MAL_CLIENT_ID },
  });
  if (!res.ok) {
    throw new Error(`MAL manga browse request failed: ${res.status}`);
  }
  const json = await res.json();
  const rawMedia = json.data || [];
  const hasNextPage = !!json.paging?.next;
  const items = rawMedia.map((item) => {
    const m = item.node;
    const rawPoster = m.main_picture?.large || m.main_picture?.medium || null;
    const poster = getMalLargePoster(rawPoster);
    const banner = poster;
    const isNsfw =
      m.nsfw === "gray" || m.nsfw === "black" || m.nsfw === "hentai";
    const isRx =
      typeof m.rating === "string" &&
      ["rx", "r+", "r"].includes(m.rating.toLowerCase().trim());
    const hasAdultGenre =
      Array.isArray(m.genres) &&
      m.genres.some((g) => {
        const gName = (typeof g === "string" ? g : g?.name || "")
          .toLowerCase()
          .trim();
        return [
          "hentai",
          "erotica",
          "ecchi",
          "boys love",
          "girls love",
          "yuri",
          "yaoi",
        ].includes(gName);
      });
    return {
      anilist_id: null,
      mal_id: m.id,
      is_adult: isNsfw || isRx || hasAdultGenre,
      title: {
        romaji: m.title || null,
        english: m.alternative_titles?.en || null,
        native: m.alternative_titles?.ja || null,
      },
      poster,
      banner,
      description: m.synopsis || null,
      rating: formatRating(m.mean),
      format: normalizeMangaFormat(m.media_type),
      status: normalizeStatus(m.status),
      year: m.start_date ? parseInt(m.start_date.substring(0, 4)) : null,
      genres: m.genres?.map((g) => g.name) || [],
    };
  });
  return {
    pageInfo: {
      total: hasNextPage ? page * limit + 1 : page * limit,
      currentPage: page,
      lastPage: hasNextPage ? page + 1 : page,
      hasNextPage,
      perPage: limit,
    },
    items,
  };
}
__name(fetchMalRawManga, "fetchMalRawManga");
async function fetchAniListRawManga(params, clientIp) {
  const searchQuery = params.q || params.search;
  const sortList = parseSortParams(params.sort, params.az, !!searchQuery);
  const { genresIn, tagsIn, isAdult } = resolveGenreAndTagFilters(
    params.genre,
    params.tag || params.tags,
  );
  const { formats, country } = resolveMangaFormatAndCountry(
    params.format,
    params.country || params.countryOfOrigin,
  );
  const variables = {
    page: params.page ? Number(params.page) : 1,
    perPage: params.perPage
      ? Number(params.perPage)
      : params.limit
        ? Number(params.limit)
        : 30,
    sort: sortList,
  };
  if (searchQuery) variables.search = searchQuery;
  if (genresIn.length > 0) variables.genreIn = genresIn;
  if (tagsIn.length > 0) variables.tagIn = tagsIn;
  if (isAdult) variables.isAdult = true;
  if (formats && formats.length > 0) variables.formatIn = formats;
  if (country) variables.countryOfOrigin = country;
  if (params.year) {
    const y = Number(params.year.toString().split(",")[0].trim());
    if (!isNaN(y)) variables.seasonYear = y;
  }
  if (params.status) {
    variables.statusIn = params.status
      .split(",")
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);
  }
  const query = `
    query (
      $page: Int,
      $perPage: Int,
      $search: String,
      $genreIn: [String],
      $tagIn: [String],
      $formatIn: [MediaFormat],
      $statusIn: [MediaStatus],
      $sort: [MediaSort],
      $isAdult: Boolean,
      $countryOfOrigin: CountryCode,
      $seasonYear: Int
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          lastPage
          hasNextPage
          perPage
        }
        media(
          type: MANGA,
          search: $search,
          genre_in: $genreIn,
          tag_in: $tagIn,
          format_in: $formatIn,
          status_in: $statusIn,
          sort: $sort,
          isAdult: $isAdult,
          countryOfOrigin: $countryOfOrigin,
          seasonYear: $seasonYear
        ) {
          id
          idMal
          isAdult
          countryOfOrigin
          title { romaji english native }
          coverImage { extraLarge large medium }
          bannerImage
          description(asHtml: false)
          averageScore
          format
          status
          startDate { year }
          genres
        }
      }
    }
  `;
  const response = await fetch("https://graphql.anilist.co", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...getForwardedHeaders(clientIp),
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!response.ok) {
    throw new Error(`AniList browse request failed: ${response.status}`);
  }
  const json = await response.json();
  const pageData = json.data?.Page || {};
  const rawMedia = pageData.media || [];
  const items = rawMedia.map((m) => {
    const poster =
      m.coverImage?.extraLarge ||
      m.coverImage?.large ||
      m.coverImage?.medium ||
      null;
    const banner = m.bannerImage || poster;
    return {
      anilist_id: m.id,
      mal_id: m.idMal || null,
      is_adult:
        m.isAdult === true ||
        (m.genres && m.genres.some((g) => ["Hentai", "Erotica"].includes(g)))
          ? true
          : false,
      title: {
        romaji: m.title?.romaji || null,
        english: m.title?.english || null,
        native: m.title?.native || null,
      },
      poster,
      banner,
      description: m.description || null,
      rating: formatRating(m.averageScore),
      format: normalizeMangaFormat(m.format, m.countryOfOrigin),
      status: normalizeStatus(m.status),
      year: m.startDate?.year || null,
      genres: m.genres || [],
    };
  });
  return {
    pageInfo: pageData.pageInfo || {
      total: 0,
      currentPage: 1,
      lastPage: 1,
      hasNextPage: false,
      perPage: 30,
    },
    items,
  };
}
__name(fetchAniListRawManga, "fetchAniListRawManga");
async function browseManga(params, clientIp) {
  const isSearch = !!(params.q || params.search);
  const [aniSettled, malSettled] = await Promise.allSettled([
    fetchAniListRawManga(params, clientIp),
    isSearch
      ? fetchMalRawManga(params, clientIp)
      : Promise.resolve({ pageInfo: null, items: [] }),
  ]);
  const aniRes = aniSettled.status === "fulfilled" ? aniSettled.value : null;
  const malRes = malSettled.status === "fulfilled" ? malSettled.value : null;
  if (aniSettled.status === "rejected") {
    console.warn("AniList manga browse fetch failed:", aniSettled.reason);
  }
  if (malSettled.status === "rejected") {
    console.warn("MAL manga browse fetch failed:", malSettled.reason);
  }
  let combinedRaw = [];
  let pageInfo = null;
  if (aniRes && aniRes.items.length > 0) {
    pageInfo = aniRes.pageInfo;
    const aniItems = aniRes.items;
    const knownMalIds = new Set();
    for (const item of aniItems) {
      if (item.mal_id) {
        knownMalIds.add(Number(item.mal_id));
      }
    }
    const uniqueMalItems = (malRes?.items || []).filter((item) => {
      if (!item.mal_id) return true;
      return !knownMalIds.has(Number(item.mal_id));
    });
    combinedRaw = [...aniItems, ...uniqueMalItems];
  } else if (malRes && malRes.items.length > 0) {
    pageInfo = malRes.pageInfo;
    combinedRaw = malRes.items;
  } else {
    return {
      pageInfo: {
        total: 0,
        currentPage: 1,
        lastPage: 1,
        hasNextPage: false,
        perPage: 30,
      },
      results: [],
    };
  }
  const anikumeIds = await getOrCreateMangaAnikumeIdsBatch(
    combinedRaw.map((r) => ({ anilist_id: r.anilist_id, mal_id: r.mal_id })),
  );
  const results = combinedRaw.map((r, idx) => ({
    anikume_id: anikumeIds[idx],
    title: r.title,
    poster: r.poster,
    banner: r.banner,
    description: cleanDescription(r.description),
    rating: r.rating,
    format: r.format,
    status: r.status,
    year: r.year,
    is_adult: r.is_adult || false,
    genres: r.genres,
  }));
  return {
    pageInfo: pageInfo || {
      total: results.length,
      currentPage: params.page ? Number(params.page) : 1,
      lastPage: 1,
      hasNextPage: false,
      perPage: 30,
    },
    results,
  };
}
__name(browseManga, "browseManga");
async function searchManga5(q, clientIp) {
  const browseRes = await browseManga({ q }, clientIp);
  const fiveItems = (browseRes.results || []).slice(0, 5);
  return fiveItems.map((item) => ({
    anikume_id: item.anikume_id,
    title: item.title,
    poster: item.poster,
    banner: item.banner,
    description: item.description,
    rating: item.rating,
    format: item.format,
    status: item.status,
    year: item.year,
    genres: item.genres,
    is_adult: item.is_adult || false,
  }));
}
__name(searchManga5, "searchManga5");
export {
  ANILIST_GENRES,
  ANILIST_TAGS,
  browseAnime,
  browseManga,
  cleanDescription,
  fetchAniListAnimeCatalog,
  fetchAniListMangaCatalog,
  fetchMalAnimeCatalog,
  fetchMalMangaCatalog,
  formatRating,
  getAnimeCatalog,
  getMangaCatalog,
  mapAndFormatAnimeHeroItemsBatch,
  mapAndFormatAnimeItem,
  mapAndFormatAnimeItemsBatch,
  mapAndFormatAnimeTopItemsBatch,
  mapAndFormatMangaHeroItemsBatch,
  mapAndFormatMangaItemsBatch,
  mapAndFormatMangaTopItemsBatch,
  normalizeFormat,
  normalizeMangaFormat,
  normalizeStatus,
  parseSortParams,
  resolveGenreAndTagFilters,
  resolveMangaFormatAndCountry,
  searchAnime5,
  searchManga5,
};
