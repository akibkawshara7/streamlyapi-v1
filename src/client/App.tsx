import React, { useState, useEffect } from 'react';
import {
  Film, Tv, Globe, Server, Star, Sparkles, Terminal, Code,
  Volume2, Radio, BookOpen, Copy, Check, ExternalLink, Calendar,
  ListOrdered, Layers
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { xorEncrypt } from './Player';

export default function App() {
  const [activeTab, setActiveTab] = useState<'imdb' | 'dynamic' | 'inspector' | 'docs' | 'tester'>('imdb');

  // IMDb Episodes Finder State
  const [imdbIdInput, setImdbIdInput] = useState('tt0903747');
  const [imdbSeasonFilter, setImdbSeasonFilter] = useState('');
  const [imdbMethod, setImdbMethod] = useState<'POST' | 'GET'>('POST');
  const [imdbData, setImdbData] = useState<any>(null);
  const [imdbLoading, setImdbLoading] = useState(false);
  const [imdbError, setImdbError] = useState<string | null>(null);
  const [selectedSeasonTab, setSelectedSeasonTab] = useState<number | 'all'>('all');
  const [copiedJson, setCopiedJson] = useState(false);

  // Dynamic Audio Sniffer State
  const [mediaType, setMediaType] = useState<'movie' | 'tv'>('movie');
  const [tmdbId, setTmdbId] = useState('315635');
  const [season, setSeason] = useState('1');
  const [episode, setEpisode] = useState('1');
  const [sniffResult, setSniffResult] = useState<any>(null);
  const [loadingSniffer, setLoadingSniffer] = useState(false);
  const [activeAudioTrack, setActiveAudioTrack] = useState<any>(null);

  // Inspector State
  const [inspectType, setInspectType] = useState<'movie' | 'tv'>('movie');
  const [inspectId, setInspectId] = useState('315635');
  const [inspectData, setInspectData] = useState<any>(null);
  const [inspectLoading, setInspectLoading] = useState(false);

  // Static Tester State
  const [testHls, setTestHls] = useState('');
  const [testSub, setTestSub] = useState('');
  const [generatedLink, setGeneratedLink] = useState('');

  // Fetch IMDb Episodes via POST (JSON) or GET
  const fetchImdbEpisodes = async (idToFetch?: string, seasonToFetch?: string) => {
    const targetId = (idToFetch || imdbIdInput).trim();
    const targetSeason = seasonToFetch !== undefined ? seasonToFetch : imdbSeasonFilter;

    if (!targetId) {
      setImdbError("Please enter a valid IMDb ID (e.g. tt0903747)");
      return;
    }

    setImdbLoading(true);
    setImdbError(null);

    try {
      let res;
      if (imdbMethod === 'POST') {
        const bodyPayload: any = { id: targetId };
        if (targetSeason && !isNaN(parseInt(targetSeason, 10))) {
          bodyPayload.season = parseInt(targetSeason, 10);
        }
        res = await fetch('/imdb/episodes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });
      } else {
        const queryParams = new URLSearchParams({ id: targetId });
        if (targetSeason && !isNaN(parseInt(targetSeason, 10))) {
          queryParams.set('season', targetSeason);
        }
        res = await fetch(`/imdb/episodes?${queryParams.toString()}`);
      }

      const json = await res.json();
      if (!res.ok || json.error) {
        throw new Error(json.message || `HTTP ${res.status}: Failed to fetch IMDb episodes`);
      }

      setImdbData(json);
      setSelectedSeasonTab('all');
    } catch (err: any) {
      setImdbError(err.message || 'An error occurred while fetching episodes');
      setImdbData(null);
    } finally {
      setImdbLoading(false);
    }
  };

  // Initial load: Fetch Breaking Bad
  useEffect(() => {
    fetchImdbEpisodes('tt0903747');
  }, []);

  const runAudioSniffer = async (t?: string, id?: string, s?: string, ep?: string) => {
    const type = t || mediaType;
    const mediaId = id || tmdbId;
    const ses = s || season;
    const epi = ep || episode;

    setLoadingSniffer(true);
    try {
      const res = await fetch(`/api/movies/languages/detect/${type}/${mediaId}/${ses}/${epi}`);
      const data = await res.json();
      setSniffResult(data);
      if (data.detected_audio_tracks && data.detected_audio_tracks.length > 0) {
        setActiveAudioTrack(data.detected_audio_tracks[0]);
      }
    } catch (err) {
      console.error("Audio sniffer error:", err);
    } finally {
      setLoadingSniffer(false);
    }
  };

  const runInspector = async () => {
    setInspectLoading(true);
    try {
      const res = await fetch(`/api/movies/inspect/${inspectType}/${inspectId}?season=${season}&episode=${episode}`);
      const data = await res.json();
      setInspectData(data);
    } catch (err) {
      console.error("Inspector error:", err);
    } finally {
      setInspectLoading(false);
    }
  };

  const copyJsonOutput = () => {
    if (!imdbData) return;
    navigator.clipboard.writeText(JSON.stringify(imdbData, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const generateTestLink = () => {
    const params = new URLSearchParams();
    if (testHls) params.set('hls', testHls);
    if (testSub) params.set('subtitle', testSub);
    const query = params.toString();
    if (!query) return;
    const encrypted = xorEncrypt(query);
    setGeneratedLink(`${window.location.origin}/stream/${encrypted}`);
  };

  const filteredSeasons = imdbData?.seasons?.filter((s: any) => {
    if (selectedSeasonTab === 'all') return true;
    return s.season === selectedSeasonTab;
  }) || [];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-blue-600 selection:text-white">

      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-900/60 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 via-yellow-500 to-amber-600 flex items-center justify-center shadow-lg shadow-amber-500/20 text-slate-950 font-black tracking-tighter text-sm">
              IMDb
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Apikume Media Suite
              </h1>
              <p className="text-xs text-slate-400">IMDb Season & Episode Finder · Multi-Language HLS</p>
            </div>
          </div>

          <nav className="flex items-center gap-1.5 bg-slate-950/60 p-1.5 rounded-xl border border-slate-800">
            <button
              onClick={() => setActiveTab('imdb')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'imdb' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Tv className="w-3.5 h-3.5" /> IMDb Episodes Finder
            </button>
            <button
              onClick={() => {
                setActiveTab('dynamic');
                if (!sniffResult) runAudioSniffer('movie', '315635', '1', '1');
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'dynamic' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Radio className="w-3.5 h-3.5" /> Audio Sniffer
            </button>
            <button
              onClick={() => {
                setActiveTab('inspector');
                if (!inspectData) runInspector();
              }}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'inspector' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Terminal className="w-3.5 h-3.5" /> CinemaOS
            </button>
            <button
              onClick={() => setActiveTab('docs')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${activeTab === 'docs' ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <BookOpen className="w-3.5 h-3.5" /> API Docs
            </button>
            <a
              href="/docs"
              target="_blank"
              rel="noreferrer"
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-400 hover:text-blue-400 transition-colors flex items-center gap-1 border border-slate-800 hover:border-slate-700 bg-slate-900/50"
              title="Open full interactive Swagger UI"
            >
              <span>Swagger UI</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </nav>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">

        {/* 1. IMDB SEASONS & EPISODES FINDER TAB */}
        {activeTab === 'imdb' && (
          <div className="space-y-6">

            {/* Header & Description */}
            <div className="bg-gradient-to-r from-slate-900 via-amber-950/20 to-slate-900 border border-amber-900/30 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden">
              <div className="max-w-3xl space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> Complete IMDb Series Seasons & Episodes
                </div>
                <h2 className="text-2xl md:text-4xl font-extrabold text-white tracking-tight">
                  IMDb Season & Episode Finder (/imdb/episodes)
                </h2>
                <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
                  JSON request bhejo ya query pass karo. Ye IMDb se kisi bhi series ke sare seasons, total episodes count, episode titles, release dates, ratings, aur overviews nikal kar deta hai.
                </p>

                {/* Popular Presets */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <span className="text-xs text-slate-400 font-medium">Quick Presets:</span>
                  {[
                    { id: 'tt0903747', title: 'Breaking Bad' },
                    { id: 'tt0944947', title: 'Game of Thrones' },
                    { id: 'tt4574334', title: 'Stranger Things' },
                    { id: 'tt6473300', title: 'Mirzapur (Indian)' },
                    { id: 'tt13443470', title: 'Wednesday' },
                    { id: 'tt1190634', title: 'The Boys' }
                  ].map(show => (
                    <button
                      key={show.id}
                      onClick={() => {
                        setImdbIdInput(show.id);
                        setImdbSeasonFilter('');
                        fetchImdbEpisodes(show.id, '');
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs bg-slate-900 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-800 transition-colors"
                    >
                      {show.title}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Request Controller Form */}
            <div className="bg-slate-900/80 rounded-2xl border border-slate-800 p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4 items-end">
                <div className="lg:col-span-1">
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Method</label>
                  <select
                    value={imdbMethod}
                    onChange={e => setImdbMethod(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2.5 text-xs font-bold text-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  >
                    <option value="POST">POST (JSON Body)</option>
                    <option value="GET">GET (Query/Path)</option>
                  </select>
                </div>

                <div className="lg:col-span-2">
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                    IMDb ID <span className="text-slate-500 font-normal">(e.g. tt0903747)</span>
                  </label>
                  <input
                    type="text"
                    value={imdbIdInput}
                    onChange={e => setImdbIdInput(e.target.value)}
                    placeholder="tt0903747 or https://www.imdb.com/title/tt0903747/"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="lg:col-span-1">
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">
                    Season <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={imdbSeasonFilter}
                    onChange={e => setImdbSeasonFilter(e.target.value)}
                    placeholder="All or 1, 2..."
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs font-mono text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="lg:col-span-2">
                  <button
                    onClick={() => fetchImdbEpisodes()}
                    disabled={imdbLoading}
                    className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold px-6 py-2.5 rounded-xl shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 text-xs"
                  >
                    {imdbLoading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-slate-950/20 border-t-slate-950 rounded-full animate-spin"></div>
                        Fetching from IMDb...
                      </>
                    ) : (
                      <>
                        <Tv className="w-4 h-4" /> Fetch Seasons & Episodes
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* JSON Request Preview */}
              <div className="pt-2 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-slate-400">
                <div className="flex items-center gap-2 font-mono">
                  <span className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-amber-400 font-bold">
                    {imdbMethod}
                  </span>
                  <span>/imdb/episodes</span>
                  {imdbMethod === 'POST' && (
                    <span className="text-slate-500">
                      Payload: &#123; "id": "{imdbIdInput}"{imdbSeasonFilter ? `, "season": ${imdbSeasonFilter}` : ''} &#125;
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-slate-500">Also available at <code className="text-slate-400">/api/imdb/episodes</code></span>
                </div>
              </div>
            </div>

            {/* Error Message */}
            {imdbError && (
              <div className="bg-red-950/40 border border-red-900/50 rounded-2xl p-4 text-red-300 text-xs flex items-center gap-3">
                <div className="w-2 h-2 rounded-full bg-red-500"></div>
                <span>{imdbError}</span>
              </div>
            )}

            {/* Series Meta Header & Overview */}
            {imdbData && (
              <div className="space-y-6">
                <div className="bg-slate-900/60 rounded-3xl border border-slate-800 p-6 md:p-8 flex flex-col md:flex-row gap-6 items-start">
                  {imdbData.poster && (
                    <div className="w-36 md:w-44 aspect-[2/3] rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 shrink-0 shadow-xl">
                      <img
                        src={imdbData.poster}
                        alt={imdbData.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}

                  <div className="flex-1 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                            {imdbData.imdb_id}
                          </span>
                          {imdbData.year && (
                            <span className="text-xs text-slate-400 font-medium">({imdbData.year})</span>
                          )}
                        </div>
                        <h3 className="text-2xl md:text-3xl font-extrabold text-white mt-1">
                          {imdbData.title}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        {imdbData.rating && (
                          <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800 text-amber-400 font-bold text-sm">
                            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
                            <span>{imdbData.rating}</span>
                            <span className="text-[10px] text-slate-500 font-normal">/ 10</span>
                          </div>
                        )}
                        <button
                          onClick={copyJsonOutput}
                          className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 rounded-xl border border-slate-800 text-xs text-slate-300 flex items-center gap-1.5 transition-colors"
                        >
                          {copiedJson ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-slate-400" />}
                          <span>{copiedJson ? 'Copied JSON' : 'Copy Response'}</span>
                        </button>
                      </div>
                    </div>

                    {imdbData.description && (
                      <p className="text-xs md:text-sm text-slate-300 leading-relaxed max-w-3xl">
                        {imdbData.description}
                      </p>
                    )}

                    {/* Stats summary badges */}
                    <div className="flex flex-wrap items-center gap-3 pt-1">
                      <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                        <span className="text-slate-400">Total Seasons: </span>
                        <span className="text-white font-bold">{imdbData.total_seasons}</span>
                      </div>
                      <div className="bg-slate-950/80 px-3.5 py-1.5 rounded-xl border border-slate-800 text-xs">
                        <span className="text-slate-400">Total Episodes: </span>
                        <span className="text-white font-bold">{imdbData.total_episodes}</span>
                      </div>
                      {imdbData.genres && imdbData.genres.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          {imdbData.genres.map((g: string, i: number) => (
                            <span key={i} className="text-[11px] text-slate-400 bg-slate-950 px-2.5 py-1 rounded-lg border border-slate-800">
                              {g}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Seasons Breakdown Summary */}
                    {imdbData.seasons_summary && (
                      <div className="space-y-1.5 pt-2">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          Seasons & Episodes Overview:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {imdbData.seasons_summary.map((sSum: any) => (
                            <span
                              key={sSum.season}
                              className="text-xs bg-slate-950 border border-slate-800/80 px-2.5 py-1 rounded-lg text-slate-300"
                            >
                              <strong className="text-amber-400">{sSum.name || `Season ${sSum.season}`}</strong>: {sSum.episode_count} eps
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Season Tabs Filter */}
                {imdbData.seasons && imdbData.seasons.length > 0 && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                      <button
                        onClick={() => setSelectedSeasonTab('all')}
                        className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${selectedSeasonTab === 'all' ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'}`}
                      >
                        All Seasons ({imdbData.total_episodes} Episodes)
                      </button>
                      {imdbData.seasons.map((sGroup: any) => (
                        <button
                          key={sGroup.season}
                          onClick={() => setSelectedSeasonTab(sGroup.season)}
                          className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all shrink-0 ${selectedSeasonTab === sGroup.season ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20' : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'}`}
                        >
                          {sGroup.name || `Season ${sGroup.season}`} ({sGroup.total_episodes} eps)
                        </button>
                      ))}
                    </div>

                    {/* Episodes List by Season */}
                    <div className="space-y-8">
                      {filteredSeasons.map((sGroup: any) => (
                        <div key={sGroup.season} className="space-y-4">
                          <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                            <h4 className="text-lg font-bold text-white flex items-center gap-2">
                              <Layers className="w-5 h-5 text-amber-400" />
                              {sGroup.name || `Season ${sGroup.season}`}
                            </h4>
                            <span className="text-xs text-slate-400 font-mono bg-slate-950 px-2.5 py-0.5 rounded-full border border-slate-800">
                              {sGroup.total_episodes} Episodes
                            </span>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {sGroup.episodes.map((ep: any, eIdx: number) => (
                              <div
                                key={eIdx}
                                className="bg-slate-900/50 hover:bg-slate-900 border border-slate-800 hover:border-amber-500/40 rounded-2xl overflow-hidden transition-all flex flex-col justify-between shadow-lg"
                              >
                                {ep.thumbnail && (
                                  <div className="relative aspect-video w-full bg-slate-950 overflow-hidden">
                                    <img
                                      src={ep.thumbnail}
                                      alt={ep.title}
                                      className="w-full h-full object-cover"
                                      loading="lazy"
                                    />
                                    <div className="absolute top-2.5 left-2.5 bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-800 text-[11px] font-bold text-amber-400">
                                      S{ep.season} · E{ep.episode}
                                    </div>
                                    {ep.rating && (
                                      <div className="absolute top-2.5 right-2.5 bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-800 text-[11px] font-bold text-white flex items-center gap-1">
                                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {ep.rating}
                                      </div>
                                    )}
                                  </div>
                                )}

                                <div className="p-4 flex-1 flex flex-col justify-between space-y-2">
                                  <div>
                                    <div className="flex items-center justify-between text-[11px] text-slate-400 mb-1">
                                      <span className="font-mono">{ep.episode_id}</span>
                                      {ep.released && (
                                        <span className="flex items-center gap-1">
                                          <Calendar className="w-3 h-3" />
                                          {ep.released.substring(0, 10)}
                                        </span>
                                      )}
                                    </div>
                                    <h5 className="font-bold text-sm text-white line-clamp-1">
                                      {ep.episode}. {ep.title}
                                    </h5>
                                    {ep.overview && (
                                      <p className="text-xs text-slate-400 line-clamp-2 mt-1 leading-relaxed">
                                        {ep.overview}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* 2. DYNAMIC AUDIO SNIFFER */}
        {activeTab === 'dynamic' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-6 md:p-8 shadow-2xl space-y-6">
              <div className="border-b border-slate-800 pb-4">
                <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                  <Radio className="w-6 h-6 text-blue-400" /> Dynamic HLS Audio Sniffer
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  HLS master playlist se available audio tracks dynamically detect karta hai.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Type</label>
                  <select
                    value={mediaType}
                    onChange={e => setMediaType(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-medium text-white"
                  >
                    <option value="movie">Movie</option>
                    <option value="tv">TV Series</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">TMDB ID</label>
                  <input
                    type="text"
                    value={tmdbId}
                    onChange={e => setTmdbId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white"
                  />
                </div>
                {mediaType === 'tv' && (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Season</label>
                      <input
                        type="text"
                        value={season}
                        onChange={e => setSeason(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 uppercase mb-1">Episode</label>
                      <input
                        type="text"
                        value={episode}
                        onChange={e => setEpisode(e.target.value)}
                        className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-sm font-mono text-white"
                      />
                    </div>
                  </>
                )}
                <div className={mediaType === 'movie' ? 'sm:col-span-3' : ''}>
                  <button
                    onClick={() => runAudioSniffer()}
                    disabled={loadingSniffer}
                    className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold px-6 py-2.5 rounded-xl shadow-lg transition-all"
                  >
                    {loadingSniffer ? 'Sniffing...' : 'Sniff Manifest Audio Tracks'}
                  </button>
                </div>
              </div>

              {sniffResult && (
                <div className="space-y-4 pt-4 border-t border-slate-800">
                  <div className="flex flex-wrap gap-2">
                    {sniffResult.detected_audio_tracks?.map((tr: any, idx: number) => (
                      <button
                        key={idx}
                        onClick={() => setActiveAudioTrack(tr)}
                        className={`p-3 rounded-xl border text-xs font-bold transition-all ${activeAudioTrack?.code === tr.code ? 'bg-blue-600 text-white border-blue-500' : 'bg-slate-950 text-slate-300 border-slate-800'}`}
                      >
                        {tr.language} ({tr.code})
                      </button>
                    ))}
                  </div>

                  {activeAudioTrack && (
                    <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2 text-xs font-mono">
                      <p className="text-slate-400">Audio Track: <span className="text-white font-bold">{activeAudioTrack.language}</span></p>
                      <p className="text-blue-400 truncate">{activeAudioTrack.sample_url}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 3. CINEMAOS INSPECTOR */}
        {activeTab === 'inspector' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex items-center justify-between border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white">CinemaOS HLS Inspector</h2>
                  <p className="text-xs text-slate-400 mt-1">Sniff server streams directly.</p>
                </div>
                <button onClick={runInspector} className="px-6 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold">
                  {inspectLoading ? 'Loading...' : 'Run Inspector'}
                </button>
              </div>

              {inspectData && (
                <div className="space-y-4">
                  {inspectData.servers?.map((srv: any, idx: number) => (
                    <div key={idx} className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-2">
                      <h4 className="font-bold text-sm text-white">{srv.server_name}</h4>
                      {srv.hls_streams?.map((h: any, i: number) => (
                        <div key={i} className="flex justify-between items-center text-xs">
                          <span className="text-slate-300">{h.quality}</span>
                          <a href={h.url} target="_blank" rel="noreferrer" className="text-blue-400 font-mono hover:underline">Open M3U8</a>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* 4. API DOCUMENTATION TAB */}
        {activeTab === 'docs' && (
          <div className="space-y-6">
            <div className="bg-slate-900/80 rounded-3xl border border-slate-800 p-6 md:p-8 shadow-2xl space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-4">
                <div>
                  <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                    <BookOpen className="w-6 h-6 text-blue-400" /> API Endpoints & Documentation
                  </h2>
                  <p className="text-xs text-slate-400 mt-1">
                    All new IMDb and Streaming endpoints registered in this server.
                  </p>
                </div>
                <a
                  href="/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/20"
                >
                  <span>Open Swagger UI</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="space-y-4">
                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 text-emerald-400 font-mono text-xs font-bold">
                      POST
                    </span>
                    <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs font-bold">
                      GET
                    </span>
                    <span className="text-sm font-bold text-white font-mono">/imdb/episodes</span>
                    <span className="text-xs text-slate-400">or /api/imdb/episodes</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Returns all seasons and episodes for an IMDb series. Accepts JSON request body: <code className="text-amber-400">&#123; "id": "tt0903747", "season": 1 &#125;</code> or query string <code className="text-amber-400">?id=tt0903747</code>.
                  </p>
                </div>

                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs font-bold">
                      GET
                    </span>
                    <span className="text-sm font-bold text-white font-mono">/imdb/episodes/:id</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Find all seasons and episodes directly by IMDb path ID (e.g. <code className="text-amber-400">/imdb/episodes/tt0903747</code>).
                  </p>
                </div>

                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs font-bold">
                      GET
                    </span>
                    <span className="text-sm font-bold text-white font-mono">/api/movies/languages/detect/:type/:id/:season/:ep</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Dynamic Manifest Audio Sniffer: Scans HLS manifest audio groups to report all detected audio languages.
                  </p>
                </div>

                <div className="bg-slate-950 rounded-2xl border border-slate-800 p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-blue-500/20 text-blue-400 font-mono text-xs font-bold">
                      GET
                    </span>
                    <span className="text-sm font-bold text-white font-mono">/api/movies/hls/master/:type/:id/:season/:ep</span>
                  </div>
                  <p className="text-xs text-slate-300">
                    Returns standard HLS master playlist with multi-audio declarations for the specified TMDB ID.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 5. TESTER */}
        {activeTab === 'tester' && (
          <div className="max-w-4xl mx-auto space-y-6">
            <div className="bg-slate-900/60 rounded-2xl p-8 border border-slate-800 shadow-xl space-y-4">
              <input
                type="text"
                value={testHls}
                onChange={e => setTestHls(e.target.value)}
                placeholder="https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-slate-100 outline-none"
              />
              <button onClick={generateTestLink} className="w-full bg-blue-600 text-white font-semibold px-6 py-3 rounded-xl">
                Generate Encoded Player URL
              </button>
              {generatedLink && (
                <a href={generatedLink} target="_blank" rel="noreferrer" className="text-sm text-blue-400 font-mono block break-all">
                  {generatedLink}
                </a>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
