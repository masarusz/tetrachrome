# Tetrachrome 🎨

A four-color map puzzle for the browser. Color every region of a procedurally
generated map so that no two neighboring regions share a color — the
[four color theorem](https://en.wikipedia.org/wiki/Four_color_theorem)
guarantees four colors are always enough.

**Play it: <https://masarusz.github.io/tetrachrome/>**

## Features

- **60-level campaign** — deterministic seeds, so every player gets the same
  maps. Difficulty ramps from 6 regions to 47. Levels unlock sequentially.
- **Par system** — a graph-coloring solver computes the true minimum number of
  colors each map needs (2, 3, or 4). Solve at par without hints to earn a ⭐.
- **Daily puzzle** — one shared puzzle per day, seeded from the UTC date.
- **Free play** — endless random maps in three sizes.
- **Hints** — the solver fills one region for you (and warns you when your
  current position can't be completed).
- **Undo, clear, keyboard shortcuts** — 1–4 select colors, E erase, Z undo,
  H hint, R clear.
- **Color-blind mode** — pattern overlays (stripes, dots, lines, crosshatch)
  on top of an Okabe–Ito palette.
- **Share your daily result** — Wordle-style share text (system share sheet
  on mobile, clipboard on desktop).
- **Stats screen** — levels solved, perfect stars, daily streaks, free play
  wins.
- **Offline play** — a service worker caches the app shell, so it works with
  no connection after the first visit.
- **Dark mode, mobile-friendly, no backend** — progress is stored in
  `localStorage`.

## How it works

- **Map generation** ([js/voronoi.js](js/voronoi.js)) — random seeded points
  are turned into Voronoi cells by clipping each cell against the
  perpendicular bisectors of its neighbors (O(n²), dependency-free), then
  smoothed with Lloyd's relaxation. Each polygon edge is tagged with the
  neighbor that produced it, which yields the adjacency graph and the exact
  shared-border segments used for conflict highlighting.
- **Solver** ([js/solver.js](js/solver.js)) — backtracking graph coloring with
  highest-degree-first ordering and a node budget, used for par computation
  and hints.
- **Game** ([js/app.js](js/app.js)) — plain ES modules, SVG rendering, no
  build step and no dependencies.

## Development

Serve the folder with any static file server:

```sh
python3 -m http.server 4173
```

Then open <http://localhost:4173/>. There is nothing to install or build.

## Deployment

Hosted on GitHub Pages from the `main` branch (Settings → Pages → Deploy from
branch → `main` / root).

When releasing, bump the version **everywhere it appears**, then tag the
commit:

- the `?v=` query strings on `style.css` / `js/app.js` in `index.html` and on
  the module imports at the top of `js/app.js` (GitHub Pages caches assets
  for ~10 minutes, so unversioned URLs can pair new HTML with stale JS);
- the `CACHE` name and the `ASSETS` query strings in `sw.js`;
- the version shown in the `index.html` footer.

## Change Log

### v1.1.1 — 2026-07-08
- Fix: Stats button (and any freshly added feature) could do nothing right
  after a release — GitHub Pages' ~10-minute asset cache could serve new
  HTML with stale JS, and the service worker then pinned the stale file.
  All assets are now referenced with `?v=` version query strings so each
  release gets brand-new URLs.

### v1.1.0 — 2026-07-08
- New: offline play — a service worker caches the app shell on first visit
- New: Wordle-style share button for daily results (system share sheet on
  mobile, clipboard on desktop)
- New: stats screen — levels solved, perfect stars, dailies solved,
  current/best daily streak, free play wins
- UI: toasts now appear at the top of the board so they don't cover the
  result bar

### v1.0.1 — 2026-07-08
- Fix: the solved board is now visible after winning — the full-screen
  blurred overlay was replaced by a compact result bar docked at the bottom
  edge of the board, sized down further on narrow screens
- UI: version number shown in the footer

### v1.0.0 — 2026-07-08
- Initial release
- 60-level campaign with deterministic seeded maps and par scoring
  (⭐ for solving at par without hints)
- Daily puzzle seeded from the UTC date
- Free play with three map sizes
- Solver-powered hints, including dead-end warnings
- Undo, clear, and keyboard shortcuts
- Color-blind pattern mode (Okabe–Ito palette plus texture overlays)
- Dark mode, mobile-friendly, progress in `localStorage`
