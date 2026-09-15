# YATME — Yet Another Tibia Map Editor

Browser-based OpenTibia map editor for Tibia 15.00+ client data. Built with React 19, PixiJS 8, TypeScript, and Vite.

Renders and edits OTBM map files using sprite data extracted from the Tibia client. Inspired by [Remere's Map Editor](https://github.com/hjnilsson/rme).

## Asset Setup

The editor requires asset files from a Tibia 15.00+ client. You can find them at:

```
%LOCALAPPDATA%\Tibia\packages\Tibia\assets\
```

The directory contains:

```
catalog-content.json                    # Asset manifest
appearances-<hash>.dat                  # Protobuf appearance definitions
sprites-<hash>.bmp.lzma                # Sprite sheet files (~5000 files)
...                                     # Other client data files
```

You will also need your `.otbm` map file and its sidecar XML files (e.g. `*-house.xml`, `*-monster.xml`, `*-npc.xml`, `*-zones.xml`) if available.

Where to place these files depends on your setup — see the sections below.

---

## Self-Hosting with Docker Compose

Host the map editor alongside your OTS server for map development and administration.

### 1. Prepare files

Copy the client assets into an `assets/` directory and your map files into a `maps/` directory:

```
assets/
├── catalog-content.json
├── appearances-<hash>.dat
├── sprites-<hash>.bmp.lzma
└── ...
maps/
├── mymap.otbm
├── mymap-house.xml
└── ...
```

### 2. Create `docker-compose.yml`

```yaml
services:
  editor:
    image: knobik/yatme:latest
    user: "${UID:-1000}:${GID:-1000}"
    ports:
      - "${PORT:-8080}:8080"
    volumes:
      - ./assets:/app/sprites:ro
      - ./maps:/app/maps
      - sprites-png:/app/sprites-png
    restart: unless-stopped

volumes:
  sprites-png:
```

### 3. Start the editor

```bash
docker compose up -d
```

The editor is available at `http://localhost:8080`.

On first startup, sprite sheets are automatically converted from `.bmp.lzma` to PNG. The `sprites-png` volume persists converted sprites across container restarts.

### Position deep links

Append integer `x`, `y`, and `z` query parameters to center the editor on a
tile after the map loads:

```text
http://localhost:8080/?x=32377&y=32256&z=7
```

The target tile is briefly highlighted. Invalid or incomplete positions are
ignored. An optional `house` parameter lets the editor prefer the matching
house geometry from its OTBM sidecar, falling back to the supplied position:

```text
http://localhost:8080/?x=32377&y=32256&z=7&house=10301
```

### Volumes

| Mount | Description |
|-------|-------------|
| `./assets:/app/sprites:ro` | Tibia client sprite sheets, `catalog-content.json`, and `appearances-<hash>.dat`. Mounted read-only. |
| `./maps:/app/maps` | OTBM map files and their sidecar XML files (e.g. `*-house.xml`, `*-zones.xml`) if available. Read-write so the editor can save changes. |
| `sprites-png` (named volume) | Cache for converted PNG sprites. Persists across container restarts so conversion only runs once. |

### Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT`   | `8080`  | Host port   |
| `UID`    | `1000`  | Container user ID |
| `GID`    | `1000`  | Container group ID |
| `READ_ONLY` | `false` | When truthy (`1`/`true`/`yes`/`on`), every write (`POST`) route for map and sidecar data is refused server-side, regardless of caller. Use for deployments that only ever serve the read-only quest viewer. See [Quest Viewer](#quest-viewer-read-only-embedding). |
| `QUEST_MAP_DIR` | `<MAP_DIR>/quests` | Directory allowlisted for quest map lookups (see [Quest Viewer](#quest-viewer-read-only-embedding)). The legacy name `QUESTS_DIR` is still honoured if `QUEST_MAP_DIR` is unset. |
| `VIEWER_ALLOWED_ORIGINS` | *(empty — same-origin only)* | Comma-separated allowlist of origins permitted to send `postMessage` commands to an embedded quest viewer. Served to the client at runtime via `GET /api/quest-config` (see [Quest Viewer](#quest-viewer-read-only-embedding)). |

---

## Quest Viewer (read-only embedding)

In addition to the writable local editor, YATME can serve a **read-only quest
viewer**: a minimal, non-editing map view intended to be embedded (e.g. in an
iframe on a quest guide page) that shows one quest's map and an optional route
overlay, driven entirely by `postMessage` commands from the embedding page.

Existing editor behavior — the writable local editor and the `x`/`y`/`z`/
`house` deep links described above — is unchanged; the quest viewer is a
separate mode that must be explicitly selected via URL.

### Selecting the viewer

The viewer mode is selected purely by URL query parameters. Any URL that does
not explicitly ask for the quest viewer continues to load the normal writable
editor:

```text
http://localhost:8080/?viewer=quest&quest=thais-quest
http://localhost:8080/?viewer=quest&quest=thais-quest&x=32377&y=32256&z=7
```

- `viewer=quest` — required, exact match, to opt into the quest viewer.
- `quest=<slug>` — required; must match `^[a-z0-9]+(?:-[a-z0-9]+)*$` and be
  at most 100 characters. An unknown `viewer` value, a missing/invalid
  `quest` slug, or a slug the server has no map for all fall back to (or
  error out of) something other than a silently-broken editor — they never
  fall through to a writable view.
- `x` / `y` / `z` — optional; once the quest map finishes loading, the same
  bounds-checked deep-link parser used by the writable editor
  (`x`/`y`: 0–65535, `z`: 0–15, all integers) centers the camera and floor on
  that tile and pings it, exactly like the existing editor deep links.

### Quest map directory layout

Quest maps live under the server's allowlisted `QUEST_MAP_DIR` (default
`<MAP_DIR>/quests`; the legacy name `QUESTS_DIR` still works if `QUEST_MAP_DIR`
is unset). Each quest is **exactly one file** selected by its
validated slug — never an arbitrary path supplied by a caller:

```
maps/quests/
├── thais-quest.otbm
├── thais-quest-house.xml       # optional sidecars, same "<slug>-<kind>.xml" naming
├── thais-quest-zones.xml
└── other-quest.otbm
```

The server resolves `<questsDir>/<slug>.otbm` and `<questsDir>/<slug>-<kind>.xml`
only after validating the slug against the same pattern as above, rejecting
anything containing path separators, `..`, or characters outside
`[a-z0-9-]`, and rejecting any resolved path that would escape `questsDir`
(defense in depth beyond the slug pattern itself). One iframe/tab loads
exactly one quest map.

### Read-only enforcement

Read-only is enforced **server-side**, not just hidden in the UI:

- `POST /api/quests/:slug/map` and `POST /api/quests/:slug/map/sidecars/:name`
  always reject with `403 { error: "Quest maps are read-only" }` — quest maps
  have no writer, independent of any other configuration.
- When the server is started with `READ_ONLY=true`, the existing single-map
  `POST /api/map` and `POST /api/map/sidecars/:name` routes reject the same
  way, so a quest-only deployment can't be written to even through the
  legacy editor routes. `READ_ONLY=false` (default) preserves today's
  writable-editor behavior exactly.

### `postMessage` protocol

The embedding parent page and the quest viewer iframe communicate with a
small, strictly-validated `postMessage` protocol (`src/lib/questProtocol.ts`).
Every message carries a `version` (currently `1`) and a `quest` slug; both
must match exactly or the message is dropped. Coordinates are bounds-checked
the same way as the `x`/`y`/`z` deep link (`x`/`y`: 0–65535, `z`: 0–15,
integers only).

**Viewer → parent** (posted to `window.parent` and `window.opener`, if present,
once the map has finished loading):

```jsonc
{ "type": "yatme:ready", "version": 1, "quest": "thais-quest" }
```

**Parent → viewer** — navigate the camera to a single verified point:

```jsonc
{
  "type": "yatme:navigate",
  "version": 1,
  "quest": "thais-quest",
  "stepId": "step-2",
  "pointId": "pt-2",
  "x": 32377, "y": 32256, "z": 7
}
```

`stepId` and `pointId` identify the route step/point this navigation
corresponds to; if `pointId` matches a point from the last `yatme:set-route`
message, that point is highlighted as the active point.

**Parent → viewer** — set (or replace) the displayed route, an ordered list of
points (max 500, in display order — no separate ordinal field) rendered as
connected, labeled markers:

```jsonc
{
  "type": "yatme:set-route",
  "version": 1,
  "quest": "thais-quest",
  "points": [
    { "id": "pt-1", "stepId": "step-1", "missionId": "mission-1", "x": 32377, "y": 32256, "z": 7, "label": "Start", "confidence": 0.95 },
    { "id": "pt-2", "stepId": "step-2", "missionId": "mission-1", "x": 32380, "y": 32256, "z": 7 }
  ]
}
```

Each route point requires `id`, `stepId`, `missionId`, `x`, `y`, `z`; `label`
(string) and `confidence` (number, `0`–`1`) are optional. Setting a new route
clears any previously active point — send a follow-up `yatme:navigate` with
the matching `pointId` to (re-)highlight one.

A message is accepted only if **all** of the following hold; otherwise it is
silently dropped:

1. **Origin allowlist** — the sender's `event.origin` is in the viewer's
   allowlist. The allowlist is **not** baked in at build time: the client
   fetches it at startup from `GET /api/quest-config` (server-side runtime
   endpoint, see below), so a single prebuilt image can be reconfigured
   per-deployment purely via the `VIEWER_ALLOWED_ORIGINS` env var. If unset
   (or while the fetch is still pending), only the viewer's own origin is
   trusted (fail-closed default) and no inbound messages are processed.
2. **Protocol version** — `version` matches exactly (`1`).
3. **Quest match** — `quest` matches the viewer's own quest slug (from the URL).
4. **Schema** — the message shape, coordinate bounds, id/label lengths,
   confidence bounds, and route length all validate (see
   `parseQuestInboundMessage` for the exact rules).

#### `GET /api/quest-config`

Returns the server's runtime viewer-origin allowlist as JSON, so the client
can validate incoming `postMessage` senders without any build-time
configuration:

```jsonc
{ "allowedOrigins": ["https://quests.example.com"] }
```

Route points and the active point are rendered with Pixi overlays
(`src/lib/RouteOverlay.ts`): ordered markers, connectors between consecutive
same-floor points (based on their position in the `points` array), and
per-point labels (falling back to `stepId` when `label` is omitted), filtered
to the map's current floor.

The viewer UI itself is minimal and read-only — no save/edit controls are
rendered in quest mode — while the underlying `MapRenderer`/camera and the
existing editor code paths are otherwise unchanged and unaffected when the
viewer is not selected.

### Alternative: `docker run`

If you prefer not to use Docker Compose, run the container directly.

First, create the named volume for the sprite cache:

```bash
docker volume create sprites-png
```

Then start the container:

```bash
docker run -d \
  --name yatme \
  -p 8080:8080 \
  -v ./assets:/app/sprites:ro \
  -v ./maps:/app/maps \
  -v sprites-png:/app/sprites-png \
  knobik/yatme:latest
```

To run as a specific user (matching your host UID/GID):

```bash
docker run -d \
  --name yatme \
  -u "$(id -u):$(id -g)" \
  -p 8080:8080 \
  -v ./assets:/app/sprites:ro \
  -v ./maps:/app/maps \
  -v sprites-png:/app/sprites-png \
  knobik/yatme:latest
```

See the [Volumes](#volumes) and [Configuration](#configuration) tables above for details on each mount.

---

## Local Development

### Prerequisites

- Node.js 22+
- Docker (optional, for protobuf codegen)

### Asset Setup

Copy the client assets (see [Asset Setup](#asset-setup)) into `tibia/sprites/` and your map files into `maps/`:

```
tibia/sprites/
├── catalog-content.json
├── appearances-<hash>.dat
├── sprites-<hash>.bmp.lzma
└── ...
maps/
├── mymap.otbm
└── ...
```

### Sprite Conversion

Convert the `.bmp.lzma` sprite sheets to PNG (required once, or after updating assets):

```bash
npm run convert-sprites
```

This reads from `tibia/sprites/` and writes PNGs to `tibia/sprites-png/`.

### Dev Server

```bash
npm install
npm run dev
```

The dev server serves assets from `tibia/` and `data/` as public directories.

### Build

```bash
npm run build     # TypeScript check + Vite production build
npm run preview   # Preview the production build locally
```

### Testing

```bash
npm test                              # Run all tests
npm run test:watch                    # Watch mode
npm run test:coverage                 # Coverage report
npx vitest run src/lib/Camera.test.ts # Single file
```

### Linting

```bash
npm run lint
```
