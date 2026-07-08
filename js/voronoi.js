// Procedural map generation: Voronoi cells via half-plane clipping.
// O(n²) per cell, which is fine for the ≤50 regions this game uses,
// and avoids any external dependency.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lerpPt = (a, b, u) => ({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u });

// Clip a cell polygon against the perpendicular bisector of sites p and q,
// keeping the side closer to p. Each polygon edge carries a tag: the index
// of the neighboring site that produced it, or 'border' for the map edge.
function clipCell(poly, tags, p, q, qTag) {
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const nx = q.x - p.x;
  const ny = q.y - p.y;
  const side = (v) => (v.x - mx) * nx + (v.y - my) * ny; // <= 0 means closer to p

  const n = poly.length;
  const outV = [];
  const inTag = []; // inTag[m] = tag of the edge arriving at outV[m]
  for (let k = 0; k < n; k++) {
    const A = poly[k];
    const B = poly[(k + 1) % n];
    const t = tags[k];
    const sa = side(A);
    const sb = side(B);
    const aIn = sa <= 0;
    const bIn = sb <= 0;
    if (aIn && bIn) {
      outV.push(B);
      inTag.push(t);
    } else if (aIn && !bIn) {
      outV.push(lerpPt(A, B, sa / (sa - sb)));
      inTag.push(t);
    } else if (!aIn && bIn) {
      outV.push(lerpPt(A, B, sa / (sa - sb)));
      inTag.push(qTag); // arrived here traveling along the bisector
      outV.push(B);
      inTag.push(t);
    }
  }
  // Re-index so tags[m] describes the edge outV[m] -> outV[m+1].
  const outT = outV.map((_, m) => inTag[(m + 1) % outV.length]);
  return { poly: outV, tags: outT };
}

function computeCells(points, width, height) {
  return points.map((p, i) => {
    let poly = [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ];
    let tags = ['border', 'border', 'border', 'border'];
    for (let j = 0; j < points.length; j++) {
      if (i === j || poly.length === 0) continue;
      ({ poly, tags } = clipCell(poly, tags, p, points[j], j));
    }
    return { site: p, poly, tags };
  });
}

function centroid(poly) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const p = poly[k];
    const q = poly[(k + 1) % poly.length];
    const cross = p.x * q.y - q.x * p.y;
    a += cross;
    cx += (p.x + q.x) * cross;
    cy += (p.y + q.y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-9) return poly[0];
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

const MIN_EDGE = 0.01; // ignore floating-point sliver edges

export function generateMap(seed, count, width = 800, height = 600) {
  const rng = mulberry32(seed);
  const margin = 30;
  let points = Array.from({ length: count }, () => ({
    x: margin + rng() * (width - 2 * margin),
    y: margin + rng() * (height - 2 * margin),
  }));

  // Lloyd's relaxation evens out cell sizes so maps look hand-drawn
  // rather than shattered.
  let cells;
  for (let iter = 0; iter < 3; iter++) {
    cells = computeCells(points, width, height);
    if (iter < 2) points = cells.map((c) => (c.poly.length >= 3 ? centroid(c.poly) : c.site));
  }

  const adjacency = points.map(() => new Set());
  const edges = []; // shared borders, used for conflict highlighting
  cells.forEach((cell, i) => {
    cell.tags.forEach((t, k) => {
      if (typeof t !== 'number') return;
      const A = cell.poly[k];
      const B = cell.poly[(k + 1) % cell.poly.length];
      if (Math.hypot(B.x - A.x, B.y - A.y) < MIN_EDGE) return;
      adjacency[i].add(t);
      adjacency[t].add(i); // symmetrize in case numeric noise trims one side
      if (t > i) edges.push({ a: i, b: t, x1: A.x, y1: A.y, x2: B.x, y2: B.y });
    });
  });

  return {
    cells: cells.map((c) => ({ site: c.site, poly: c.poly })),
    adjacency: adjacency.map((s) => [...s]),
    edges,
    width,
    height,
    seed,
  };
}
