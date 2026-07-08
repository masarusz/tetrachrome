// Graph-coloring solver used to compute a level's "par": the minimum
// number of colors the map actually needs (2, 3, or 4).

// Backtracking with highest-degree-first ordering. The budget caps the
// search on pathological maps: proving a graph is NOT k-colorable is the
// expensive direction, and if we run out we just report the safe answer.
function colorable(adj, k, budget = 200000) {
  const n = adj.length;
  const colors = new Array(n).fill(-1);
  const order = [...Array(n).keys()].sort((a, b) => adj[b].length - adj[a].length);
  let nodes = 0;

  function bt(idx) {
    if (idx === n) return true;
    if (++nodes > budget) throw new Error('budget');
    const i = order[idx];
    let used = 0;
    for (const j of adj[i]) if (colors[j] >= 0) used |= 1 << colors[j];
    for (let c = 0; c < k; c++) {
      if (used & (1 << c)) continue;
      colors[i] = c;
      if (bt(idx + 1)) return true;
      colors[i] = -1;
    }
    return false;
  }

  try {
    return bt(0) ? colors : null;
  } catch {
    return undefined; // budget exceeded: unknown
  }
}

// Minimum colors needed, between 1 and 4. The four color theorem
// guarantees 4 is always enough for these planar maps.
export function minColors(adj) {
  for (let k = 1; k < 4; k++) {
    const result = colorable(adj, k);
    if (result) return k;
    if (result === undefined) return 4; // couldn't prove either way; assume 4
  }
  return 4;
}

// A valid k-coloring as an array of color indices, or null.
export function solve(adj, k) {
  const result = colorable(adj, k);
  return result || null;
}

// Complete a partial coloring (preset[i] = -1 for free regions) into a
// full k-coloring, or null if the position is a dead end.
export function solveFrom(adj, k, preset, budget = 200000) {
  const n = adj.length;
  const colors = [...preset];
  for (let i = 0; i < n; i++) {
    if (colors[i] < 0) continue;
    for (const j of adj[i]) if (colors[j] === colors[i]) return null;
  }
  const order = [...Array(n).keys()]
    .filter((i) => colors[i] < 0)
    .sort((a, b) => adj[b].length - adj[a].length);
  let nodes = 0;

  function bt(idx) {
    if (idx === order.length) return true;
    if (++nodes > budget) throw new Error('budget');
    const i = order[idx];
    let used = 0;
    for (const j of adj[i]) if (colors[j] >= 0) used |= 1 << colors[j];
    for (let c = 0; c < k; c++) {
      if (used & (1 << c)) continue;
      colors[i] = c;
      if (bt(idx + 1)) return true;
      colors[i] = -1;
    }
    return false;
  }

  try {
    return bt(0) ? colors : null;
  } catch {
    return null; // budget exceeded: treat as unsolvable rather than hang
  }
}
