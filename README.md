# JellyDrop

A lightweight download portal for [Jellyfin](https://jellyfin.org/). JellyDrop gives you a clean,
Netflix-style interface for browsing your Jellyfin libraries and downloading media for offline use —
nothing else. No transcoding, no playback, no accounts. Just posters and a download button.

Only playable media files are ever downloadable. `.nfo` files, artwork, subtitles, metadata, and
filesystem paths are never exposed to the browser.

## Features

- Auto-discovers your Jellyfin movie and TV libraries
- Poster-grid browsing: Libraries → Movies / Series → Seasons → Episodes
- Download at three levels: single episode, entire season, or entire series
- Site-wide search across movies and TV shows
- A persistent download queue (bottom-right) that processes downloads one at a time automatically,
  with Waiting / Downloading / Complete / Failed status, real byte-level progress, and one-click retry
- On Chrome/Edge, pick a download folder once (e.g. an external drive or SD card) and every
  subsequent download writes straight there with no further prompts — Firefox/Safari fall back to
  normal browser downloads automatically
- Dark, responsive UI
- Single Docker container, configured entirely with three environment variables

## Configuration

JellyDrop is configured with environment variables only — there is no frontend configuration.

| Variable           | Description                                                       |
| ------------------ | ----------------------------------------------------------------- |
| `JELLYFIN_URL`     | Base URL of your Jellyfin server, e.g. `http://192.168.1.50:8096` |
| `JELLYFIN_API_KEY` | An API key generated in Jellyfin under Dashboard → API Keys       |
| `PORT`             | Port JellyDrop listens on (default `8080`)                        |

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

## Running with Docker (recommended)

```bash
docker compose up --build
```

Then open `http://localhost:8080` (or whatever `PORT` you set).

`docker-compose.yml` reads `.env` and passes the three variables straight into the container —
nothing else to configure.

## Running a prebuilt image (e.g. on Unraid)

Pushing to `main` on GitHub builds the image via the workflow at
`.github/workflows/docker-publish.yml` and publishes it to GitHub Container Registry at
`ghcr.io/<owner>/<repo>:latest` (lowercased). Once that's published (see below), a low-powered box
like an Unraid server doesn't need to build anything — just pull and run:

```yaml
services:
  jellydrop:
    image: ghcr.io/chuckbucket/jellydrop:latest
    container_name: jellydrop
    env_file:
      - .env
    ports:
      - "${PORT:-8080}:${PORT:-8080}"
    restart: unless-stopped
```

Only `image:` differs from the default `docker-compose.yml` (which uses `build: .` for local
development). `docker compose pull && docker compose up -d` picks up new versions later.

**First-time publish**: GHCR packages default to private even from a public repo. After the workflow
runs once, open the package on GitHub (repo page → "Packages" in the sidebar), go to
**Package settings → Change visibility → Public**, so Unraid can pull it without authenticating.

## Local development (without Docker)

Requires Node.js 20+.

```bash
npm install
npm run dev
```

This runs the Express backend (`tsx watch`, reading `JELLYFIN_URL`/`JELLYFIN_API_KEY`/`PORT` from the
repo-root `.env`) and the Vite dev server side by side. The frontend dev server proxies `/api` requests
to the backend automatically, so just open the Vite URL it prints (typically `http://localhost:5173`).

## Architecture

```
JellyDrop/
├── shared/       DTO types shared between backend and frontend
├── backend/      Express + TypeScript API — the only thing that talks to Jellyfin
│   └── src/
│       ├── jellyfin/     Jellyfin REST API client (the API key never leaves this layer)
│       ├── services/     business logic: mapping Jellyfin items to clean DTOs, filename building
│       ├── routes/       Express route handlers
│       └── utils/        streaming proxy helper, filename sanitization, DTO mappers
└── frontend/     React + Vite + Tailwind SPA
    └── src/
        ├── api/          typed fetch client for the backend API
        ├── context/       the client-side download queue (state machine + sequential processor)
        ├── pages/        one component per route
        └── components/   poster cards/grids, download buttons, nav, the queue panel
```

The backend is the only part of the system that knows `JELLYFIN_URL`/`JELLYFIN_API_KEY`. Every poster
image and every downloadable file is proxied and streamed through the backend — the frontend never
receives a direct Jellyfin URL, a filesystem path, or the original (potentially revealing) source
filename. Download filenames are always rebuilt server-side from clean metadata
(`Title (Year).mkv`, `Series - S01E02 - Episode Title.mkv`).

Season and series downloads don't zip anything server-side (no ZIP support in this MVP). Instead,
`GET /api/download/season/:id` and `GET /api/download/show/:id` return an ordered JSON manifest of
episodes; the frontend's download queue walks that list and downloads each episode individually, in
order, one at a time.

## API

| Route                           | Description                                                        |
| ------------------------------- | ------------------------------------------------------------------ |
| `GET /api/libraries`            | List movie/TV libraries                                            |
| `GET /api/library/:id`          | Contents of one library                                            |
| `GET /api/movies`               | Movies (optionally filtered by `libraryId`, or looked up by `ids`) |
| `GET /api/shows`                | TV series (optionally filtered by `libraryId`)                     |
| `GET /api/show/:id`             | A series' seasons, with episode counts                             |
| `GET /api/season/:id`           | A season's episode list                                            |
| `GET /api/search?q=`            | Search movies and series                                           |
| `GET /api/download/movie/:id`   | Streams the movie's media file                                     |
| `GET /api/download/episode/:id` | Streams the episode's media file                                   |
| `GET /api/download/season/:id`  | Ordered download manifest for a season                             |
| `GET /api/download/show/:id`    | Ordered download manifest for an entire series                     |
| `GET /api/image/:id`            | Poster image proxy (keeps the Jellyfin API key server-side)        |

## Not in this MVP (by design)

Jellyfin user authentication, resumable downloads, a PWA/offline shell, download history, favorites,
multiple Jellyfin servers, and Sonarr/Radarr integration are all left out on purpose. The
routes/services split in the backend and the plain React context in the frontend are meant to make
adding any of these later straightforward without a rewrite.
