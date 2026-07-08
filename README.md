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

When releasing, bump the version in the footer of `index.html` and the
`CACHE` name in `sw.js` (this is what makes clients pick up the new assets),
then tag the commit.
