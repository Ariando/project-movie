'use strict';

const path = require('path');
const express = require('express');

// Load .env if present (Node >= 20.6). Real env vars always win.
try {
  process.loadEnvFile(path.join(__dirname, '.env'));
} catch {
  // No .env file: rely on the process environment (e.g. in production).
}

const OMDB_API_KEY = process.env.OMDB_API_KEY;
const PORT = Number(process.env.PORT) || 3000;
const OMDB_BASE_URL = 'https://www.omdbapi.com/';

if (!OMDB_API_KEY) {
  console.error(
    'Missing OMDB_API_KEY.\n' +
      'Copy .env.example to .env and set your OMDb key, then restart.'
  );
  process.exit(1);
}

const app = express();
app.disable('x-powered-by');

/* ------------------------------------------------------------------ *
 * Tiny in-memory cache (OMDb data is effectively static)
 * ------------------------------------------------------------------ */
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const cache = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(key);
    return null;
  }
  // Refresh LRU position.
  cache.delete(key);
  cache.set(key, hit);
  return hit.value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

/* ------------------------------------------------------------------ *
 * Minimal fixed-window rate limit per IP
 * ------------------------------------------------------------------ */
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const hits = new Map();

function rateLimit(req, res, next) {
  const now = Date.now();
  const ip = req.ip || 'unknown';
  const entry = hits.get(ip);

  if (!entry || now > entry.resetAt) {
    hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return next();
  }

  entry.count += 1;
  if (entry.count > RATE_LIMIT_MAX) {
    res.set('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Too many requests. Please slow down.' });
  }
  return next();
}

// Drop stale rate-limit buckets so the map cannot grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of hits) {
    if (now > entry.resetAt) hits.delete(ip);
  }
}, RATE_LIMIT_WINDOW_MS).unref();

/* ------------------------------------------------------------------ *
 * OMDb request helper -- the API key never leaves this module
 * ------------------------------------------------------------------ */
async function queryOmdb(params) {
  const url = new URL(OMDB_BASE_URL);
  url.searchParams.set('apikey', OMDB_API_KEY);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      const err = new Error(`OMDb responded with ${response.status}`);
      err.status = 502;
      throw err;
    }
    return await response.json();
  } catch (cause) {
    if (cause.name === 'AbortError') {
      const err = new Error('Upstream request timed out');
      err.status = 504;
      throw err;
    }
    if (!cause.status) cause.status = 502;
    throw cause;
  } finally {
    clearTimeout(timeout);
  }
}

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */
const IMDB_ID_PATTERN = /^tt\d{6,10}$/;

app.get('/api/movies', rateLimit, async (req, res, next) => {
  const query = String(req.query.q ?? '').trim();
  if (query.length < 2 || query.length > 100) {
    return res
      .status(400)
      .json({ error: 'Query "q" must be between 2 and 100 characters.' });
  }

  const page = Number.parseInt(req.query.page ?? '1', 10);
  if (!Number.isInteger(page) || page < 1 || page > 100) {
    return res.status(400).json({ error: 'Query "page" must be 1-100.' });
  }

  const cacheKey = `s:${query.toLowerCase()}:${page}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  try {
    const data = await queryOmdb({ s: query, page: String(page), type: 'movie' });

    if (data.Response !== 'True') {
      return res.status(404).json({ error: data.Error || 'No movies found.' });
    }

    const payload = {
      results: (data.Search ?? []).map((movie) => ({
        imdbID: movie.imdbID,
        title: movie.Title,
        year: movie.Year,
        poster: movie.Poster && movie.Poster !== 'N/A' ? movie.Poster : null,
      })),
      totalResults: Number(data.totalResults) || 0,
      page,
    };

    cacheSet(cacheKey, payload);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

app.get('/api/movies/:imdbID', rateLimit, async (req, res, next) => {
  const { imdbID } = req.params;
  if (!IMDB_ID_PATTERN.test(imdbID)) {
    return res.status(400).json({ error: 'Invalid IMDb id.' });
  }

  const cacheKey = `i:${imdbID}`;
  const cached = cacheGet(cacheKey);
  if (cached) {
    res.set('X-Cache', 'HIT');
    return res.json(cached);
  }

  try {
    const data = await queryOmdb({ i: imdbID, plot: 'short' });

    if (data.Response !== 'True') {
      return res.status(404).json({ error: data.Error || 'Movie not found.' });
    }

    const payload = {
      imdbID: data.imdbID,
      title: data.Title,
      year: data.Year,
      released: data.Released,
      runtime: data.Runtime,
      genre: data.Genre,
      director: data.Director,
      actors: data.Actors,
      plot: data.Plot,
      imdbRating: data.imdbRating,
      poster: data.Poster && data.Poster !== 'N/A' ? data.Poster : null,
    };

    cacheSet(cacheKey, payload);
    res.set('X-Cache', 'MISS');
    return res.json(payload);
  } catch (err) {
    return next(err);
  }
});

app.get('/healthz', (_req, res) => res.json({ ok: true }));

// Serve only the frontend assets. Serving __dirname wholesale would also
// expose server.js, package.json and anything else added to the repo root.
const PUBLIC_FILES = {
  '/': 'index.html',
  '/index.html': 'index.html',
  '/script.js': 'script.js',
  '/jquery.min.js': 'jquery.min.js',
};

for (const [route, file] of Object.entries(PUBLIC_FILES)) {
  app.get(route, (_req, res) => res.sendFile(path.join(__dirname, file)));
}

app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));

// Error handler: log details server-side, return a generic message.
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  console.error('[error]', status, err.message);
  res.status(status).json({ error: 'Upstream movie service unavailable.' });
});

app.listen(PORT, () => {
  console.log(`Movie proxy listening on http://localhost:${PORT}`);
});
