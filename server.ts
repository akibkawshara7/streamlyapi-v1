import 'dotenv/config';
import express from 'express';

import { vidsyncRouter, subtitlesRouter, shortRouter, imdbRouter } from './src/server/vidsync.js';

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
      description: "High-performance streaming resolver API with direct TMDB Season/Episode Streams, Short Redirect URLs (/s/:shortId), and OpenSubtitles."
    },
    servers: [{ url: "/" }],
    paths: {
      "/stream/tv/{tmdbId}/{season}/{episode}": {
        get: {
          summary: "Vidsync TV Stream Resolver (grouped by Audio Language -> Provider -> Qualities)",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Show ID" },
            { name: "season", in: "path", required: true, schema: { type: "integer" }, description: "TMDB Season number" },
            { name: "episode", in: "path", required: true, schema: { type: "integer" }, description: "TMDB Episode number" }
          ],
          responses: {
            200: {
              description: "Stream sources grouped by Audio Language hierarchy and Provider with short redirect URLs",
              content: {
                "application/json": {
                  example: {
                    success: true,
                    type: "tv",
                    tmdb_id: "1396",
                    season: 1,
                    episode: 1,
                    tmdb_season: 1,
                    tmdb_episode: 1,
                    sources: {
                      "Audio: Hindi": {
                        "Provider: VidZee": [
                          {
                            url: "http://localhost:3000/s/aB3x9K",
                            quality: "1080p"
                          }
                        ]
                      },
                      "Audio: English": {
                        "Provider: VidSrc": [
                          {
                            url: "http://localhost:3000/s/xP9k2L",
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
          summary: "Vidsync Movie Stream Resolver (grouped by Audio Language -> Provider -> Qualities)",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Movie ID" }
          ],
          responses: {
            200: {
              description: "Movie stream sources grouped by Audio Language and Provider with short redirect URLs",
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
                            url: "http://localhost:3000/s/zT1k8V",
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
      "/subtitles/tv/{tmdbId}/{season}/{episode}": {
        get: {
          summary: "Vidsync Subtitles for TV Show",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Show ID" },
            { name: "season", in: "path", required: true, schema: { type: "integer" }, description: "Season number" },
            { name: "episode", in: "path", required: true, schema: { type: "integer" }, description: "Episode number" }
          ],
          responses: {
            200: {
              description: "Complete list of subtitles from Vidsync with identity, languages, and tracks"
            }
          }
        }
      },
      "/subtitles/movie/{tmdbId}": {
        get: {
          summary: "Vidsync Subtitles for Movie",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Movie ID" }
          ],
          responses: {
            200: {
              description: "Complete list of subtitles from Vidsync with identity, languages, and tracks"
            }
          }
        }
      },
      "/subtitles/tmdb/tv/{tmdbId}": {
        get: {
          summary: "Exact Vidsync Mirror: Subtitles for TV Show",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Show ID" },
            { name: "season", in: "query", required: false, schema: { type: "integer", default: 1 }, description: "Season number" },
            { name: "episode", in: "query", required: false, schema: { type: "integer", default: 1 }, description: "Episode number" }
          ],
          responses: {
            200: {
              description: "Raw Vidsync format with identity, languages, and subtitles list"
            }
          }
        }
      },
      "/subtitles/tmdb/movie/{tmdbId}": {
        get: {
          summary: "Exact Vidsync Mirror: Subtitles for Movie",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Movie ID" }
          ],
          responses: {
            200: {
              description: "Raw Vidsync format with identity, languages, and subtitles list"
            }
          }
        }
      },
      "/subtitles/file": {
        get: {
          summary: "Proxied Subtitle File Streaming (VTT / SRT)",
          parameters: [
            { name: "url", in: "query", required: true, schema: { type: "string" }, description: "Target subtitle file URL" }
          ],
          responses: {
            200: {
              description: "Streams the WebVTT / SRT file with CORS enabled"
            }
          }
        }
      },
      "/s/{shortId}": {
        get: {
          summary: "Short Redirect URL: Redirects to actual stream or proxy link",
          parameters: [
            { name: "shortId", in: "path", required: true, schema: { type: "string" }, description: "7-character short link code" }
          ],
          responses: {
            302: { description: "Redirect to original target URL" },
            404: { description: "Short link not found or expired" }
          }
        }
      },
      "/imdb/episodes": {
        get: {
          summary: "IMDb Series & Season Episodes Finder",
          parameters: [
            { name: "id", in: "query", required: true, schema: { type: "string" }, description: "IMDb ID (tt...) or TMDB ID" },
            { name: "season", in: "query", required: false, schema: { type: "integer" }, description: "Season number (optional)" }
          ],
          responses: {
            200: {
              description: "Full IMDb metadata along with episodes list, scraped with resilient fallbacks"
            }
          }
        }
      },
      "/imdb/{tmdbId}": {
        get: {
          summary: "Map entire TMDB TV Show to IMDb episodes",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB Show ID or IMDb ID" },
            { name: "season", in: "query", required: false, schema: { type: "integer" }, description: "Filter specific season (optional)" }
          ],
          responses: {
            200: {
              description: "Array of mapped episodes showing title, released date, and match correctness"
            }
          }
        }
      },
      "/imdb/{tmdbId}/{season}/{ep}": {
        get: {
          summary: "Match individual episode ignoring absolute numbering discrepancies",
          parameters: [
            { name: "tmdbId", in: "path", required: true, schema: { type: "string" }, description: "TMDB ID or IMDb ID" },
            { name: "season", in: "path", required: true, schema: { type: "integer" }, description: "TMDB Season number" },
            { name: "ep", in: "path", required: true, schema: { type: "integer" }, description: "Episode index count (e.g. 18 for the 18th episode)" }
          ],
          responses: {
            200: {
              description: "Complete mapped episode object with matching success status"
            }
          }
        }
      },
      "/imdb/id/{imdbId}": {
        get: {
          summary: "Fetch direct raw IMDb episodes (using unblocked high-performance dataset dumps)",
          parameters: [
            { name: "imdbId", in: "path", required: true, schema: { type: "string" }, description: "IMDb Series ID starting with 'tt'" },
            { name: "season", in: "query", required: false, schema: { type: "integer" }, description: "Filter specific season (optional)" }
          ],
          responses: {
            200: {
              description: "Direct array of unmapped IMDb episodes containing original numbering"
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

  // Short URL Redirector: /s/:shortId
  app.use('/s', shortRouter);

  // Vidsync Stream: /api/stream/tv or movie, /stream/tv or movie
  app.use('/api/stream', vidsyncRouter);
  app.use('/stream', vidsyncRouter);
  app.use('/api/vidsync', vidsyncRouter);
  app.use('/vidsync', vidsyncRouter);

  // Subtitles: /subtitles and /api/subtitles
  app.use('/subtitles', subtitlesRouter);
  app.use('/api/subtitles', subtitlesRouter);

  // IMDb Episodes: /imdb and /api/imdb
  app.use('/imdb', imdbRouter);
  app.use('/api/imdb', imdbRouter);

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
