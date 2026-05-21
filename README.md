# iPhone Gallery Viewer (Tauri + React + Rust)

Offline desktop MVP for browsing iPhone photos/videos on Windows/macOS/Linux, including HEIC/HEIF and MOV/HEVC via local decoding/transcoding.

## Stack
- Tauri (v2, stable)
- React + TypeScript + Vite
- Rust backend inside Tauri
- `ffmpeg` (video thumbnails, poster frame, MOV->H.264 fallback)
- `libheif` (`heif-convert` fallback for HEIC/HEIF)
- Disk thumbnail cache with invalidation by `mtime` + `size` + deterministic fingerprint hash

## MVP features
- Choose a media folder (for example `DCIM` export)
- Recursive scan for:
  - Photos: `.jpg`, `.jpeg`, `.png`, `.heic`, `.heif`
  - Videos: `.mp4`, `.mov`
- Virtualized gallery grid (desktop-first)
- Item viewer:
  - Photo: zoom + pan + prev/next
  - Video: play/pause + seek + mute + fullscreen
- HEIC/HEIF decoding for thumbnails and display fallback
- MOV transcoding fallback to playable H.264 MP4
- Search/filter by filename and type (`all/photo/video`)

## Project structure

```text
.
├── AGENTS.md
├── package.json
├── src
│   ├── App.tsx
│   ├── components
│   │   ├── GalleryGrid.tsx
│   │   └── MediaViewer.tsx
│   ├── lib
│   │   ├── api.ts
│   │   ├── media-utils.ts
│   │   ├── media-utils.test.ts
│   │   └── types.ts
│   ├── main.tsx
│   └── styles
│       └── app.css
└── src-tauri
    ├── Cargo.toml
    ├── capabilities/default.json
    ├── tauri.conf.json
    └── src
        ├── cache.rs
        ├── commands.rs
        ├── dto.rs
        ├── errors.rs
        ├── indexer.rs
        ├── main.rs
        └── thumbnails.rs
```

## Run (dev)

Prerequisites:
1. Node.js 20+
2. Rust toolchain (stable, with `cargo`/`rustc`)
3. `ffmpeg` available in `PATH`
4. `heif-convert` (from `libheif`) available in `PATH` for robust HEIC fallback

Commands:

```bash
npm install
npm run tauri dev
```

## Build (prod)

```bash
npm run tauri build
```

Bundled app artifacts will be created by Tauri under `src-tauri/target/release/bundle`.

## Architecture overview

### 1) Indexer (`src-tauri/src/indexer.rs`)
- Recursively scans folder with `walkdir`
- Filters supported extensions
- Collects metadata: path, type, size, mtime
- Tries dimensions for JPEG/PNG (cheap header read)

### 2) Thumbnail pipeline (`src-tauri/src/thumbnails.rs`)
- Dedicated worker queue with bounded concurrency (based on CPU, min 2 / max 6)
- Generates:
  - photo thumbnails (`ffmpeg`; HEIC fallback through `heif-convert`)
  - video poster thumbnails (`ffmpeg` frame extraction)
  - display-safe JPEG for HEIC/HEIF viewer
  - playable MP4 fallback for MOV

### 3) Cache (`src-tauri/src/cache.rs`)
- Disk cache directories: `thumbs/`, `display/`, `video/`
- Cache key: source path + size + mtime + variant -> SHA-256
- Sidecar fingerprint JSON for cache validity checks

### 4) Frontend
- `GalleryGrid` uses manual virtualization (render only visible rows + overscan)
- Thumbnail requests are queued in frontend and processed with small concurrency
- `MediaViewer` requests resolved display/playable paths from backend

## Tests
- Rust unit tests:
  - extension filtering and support checks (`indexer.rs`)
  - cache key invalidation behavior (`cache.rs`)
- TypeScript unit tests:
  - filtering/search/sorting (`src/lib/media-utils.test.ts`)

Run tests:

```bash
# frontend unit tests
npm test

# backend unit tests
cd src-tauri && cargo test
```

## Known codec notes by OS
- Windows: HEIC/HEVC system codecs are often missing, so this app uses local decode/transcode with `ffmpeg` / `libheif` fallback.
- macOS: many Apple media formats work natively, but app still uses local fallback paths for consistency.
- Linux: behavior depends on installed ffmpeg build and codec support; ensure ffmpeg includes required codecs.

## Compromises in MVP and v2 ideas

MVP compromises:
- No persistent media DB index (in-memory list from each scan)
- No EXIF-based sorting/grouping yet
- Video transcoding fallback is on-demand and can take time for large files
- No background watch/incremental reindex

Potential v2:
- Persistent SQLite index + incremental scanner
- Progressive decode with cancellation + better task prioritization
- EXIF metadata extraction (date/location/live photo pairs)
- Duplicate detection / smart albums
- Better transcoding profiles and hardware-accelerated pipeline
