import 'dotenv/config';
import express from 'express';

import { itMapRouter } from './src/server/mapper.js';
import { vidsyncRouter, subtitlesRouter } from './src/server/vidsync.js';

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // OpenAPI Specification
  const swaggerDocument = {
    openapi: "3.0.0",
    info: {
      title: "Apikume & Vidsync Streaming API",
      version: "3.0.0",
      description: "High-performance streaming resolver API with ITMap (TMDB + IMDb + AniList Fribb Mapping), Vidsync Streams (Language Hierarchy: English, Hindi, etc.), and OpenSubtitles."
    },
    servers: [{ url: "/" }],
    paths: {
      "/map/{tmdb}/{absep}": {
        get: {
          summary: "ITMap: Map TMDB ID & absolute episode to TMDB Season/Episode, IMDb, and AniList ID",
          parameters: [
            { name: "tmdb", in: "path", required: true, schema: { type: "string" }, description: "TMDB TV Show ID" },
            { name: "absep", in: "path", required: true, schema: { type: "integer" }, description: "Absolute episode number (default: 1)" }
          ],
          responses: {
            200: {
              description: "Complete mapping details including TMDB season/ep, IMDb ID & season/ep, and AniList ID & ep (if anime)",
              content: {
                "application/json": {
                  example: {
                    tmdb_id: "1429",
                    season: 2,
                    episode: 1,
                    imdb_id: "tt2560140",
                    imdb_season: 2,
                    imdb_episode: 1,
                    anilist_id: 20958,
                    anilist_episode: 1
                  }
                }
              }
            },
            400: { description: "Invalid parameters" },
            502: { description: "Upstream mapping resolution failure" }
          }
        }
      },
      "/stream/tv/{tmdbId}/{absoluteEpisode}": {
        get: {
          summary: "Vidsync TV & Anime Stream Resolver (grouped by Language -> Provider -> Qualities)",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Show ID" },
            { name: "absoluteEpisode", in: "path", required: true, schema: { type: "integer" }, description: "Absolute episode number" }
          ],
          responses: {
            200: {
              description: "Stream sources grouped by Language hierarchy and Provider with sorted qualities",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    type: "tv",
                    tmdb_id: "1396",
                    season: 1,
                    episode: 1,
                    sources: {
                      "Audio: Hindi": {
                        "Provider: VidZee": [
                          {
                            url: "https://.../index.m3u8",
                            proxy_url: "https://vidsync.pro/api/core/proxy?data=...",
                            quality: "1080p"
                          }
                        ]
                      },
                      "Audio: English": {
                        "Provider: VidSrc": [
                          {
                            url: "https://.../master.m3u8",
                            proxy_url: "https://vidsync.pro/api/core/proxy?data=...",
                            quality: "480p"
                          }
                        ],
                        "Provider: Castle": [
                          {
                            url: "https://.../master.m3u8",
                            proxy_url: "https://vidsync.pro/api/core/proxy?data=...",
                            quality: "720p"
                          },
                          {
                            url: "https://.../master.m3u8",
                            proxy_url: "https://vidsync.pro/api/core/proxy?data=...",
                            quality: "480p"
                          }
                        ]
                      }
                    }
                  }
                }
              }
            },
            404: { description: "Stream not found" }
          }
        }
      },
      "/stream/movie/{tmdbId}": {
        get: {
          summary: "Vidsync Movie Stream Resolver (grouped by Language -> Provider -> Qualities)",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Movie ID" }
          ],
          responses: {
            200: {
              description: "Movie stream sources grouped by Language and Provider with sorted qualities",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    type: "movie",
                    tmdb_id: "550",
                    sources: {
                      "Audio: Hindi": {
                        "Provider: VidZee": [
                          {
                            url: "https://.../master.m3u8",
                            proxy_url: "https://vidsync.pro/api/core/proxy?data=...",
                            quality: "1080p"
                          }
                        ]
                      }
                    }
                  }
                }
              }
            },
            404: { description: "Not found" }
          }
        }
      },
      "/subtitles/tv/{tmdbId}/{absoluteEpisode}": {
        get: {
          summary: "OpenSubtitles v3 Subtitles for TV Show (fetches IMDb ID, season, ep)",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB ID" },
            { name: "absoluteEpisode", in: "path", required: true, schema: { type: "integer" }, description: "Absolute episode number" }
          ],
          responses: {
            200: {
              description: "Subtitles grouped by Language with Track 1, Track 2 numbering",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    provider: "Stremio OpenSubtitles v3",
                    tmdb_id: "1396",
                    imdb_id: "tt0903747",
                    absolute_episode: 1,
                    season: 1,
                    episode: 1,
                    subtitles: {
                      "Language: English": {
                        "Track 1": {
                          "url": "https://...",
                          "format": "vtt"
                        },
                        "Track 2": {
                          "url": "https://...",
                          "format": "srt"
                        }
                      },
                      "Language: Hindi": {
                        "Track 1": {
                          "url": "https://...",
                          "format": "vtt"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      },
      "/subtitles/movie/{tmdbId}": {
        get: {
          summary: "OpenSubtitles v3 Subtitles for Movie (fetches IMDb ID)",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Movie ID" }
          ],
          responses: {
            200: {
              description: "Subtitles grouped by Language with Track 1, Track 2 numbering",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    provider: "Stremio OpenSubtitles v3",
                    tmdb_id: "550",
                    imdb_id: "tt0137523",
                    subtitles: {
                      "Language: English": {
                        "Track 1": {
                          "url": "https://...",
                          "format": "vtt"
                        },
                        "Track 2": {
                          "url": "https://...",
                          "format": "srt"
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  app.get('/api/openapi.json', (req, res) => {
    res.json(swaggerDocument);
  });

  const swaggerHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Apikume & Vidsync API Docs</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui.css" />
  <style>
    html { box-sizing: border-box; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; }
    .topbar { display: none !important; }
    .swagger-ui .scheme-container { background: #fafafa; box-shadow: none; border-bottom: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@5.18.2/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        spec: ${JSON.stringify(swaggerDocument)},
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;

  // Serve Swagger UI at /, /docs, and /api/docs
  app.get(['/', '/docs', '/api/docs'], (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(swaggerHtml);
  });

  // ITMap (with integrated Fribb AniList detection): /map/:tmdb/:absep and /api/map/:tmdb/:absep
  app.use('/map', itMapRouter);
  app.use('/api/map', itMapRouter);

  // Vidsync Stream: /api/stream/tv or movie, /stream/tv or movie (and /api/vidsync alias)
  app.use('/api/stream', vidsyncRouter);
  app.use('/stream', vidsyncRouter);
  app.use('/api/vidsync', vidsyncRouter);
  app.use('/vidsync', vidsyncRouter);

  // Subtitles: /subtitles and /api/subtitles
  app.use('/subtitles', subtitlesRouter);
  app.use('/api/subtitles', subtitlesRouter);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
