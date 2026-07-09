// Graph-coloring solver used to compute a level's "par" (the minimum
// number of colors the map actually needs) and to power hints.

// Single backtracking core. Completes `preset` (-1 = free region; omit for
// a blank board) into a full k-coloring, highest-degree-first.
// Returns: a colors array on success, null when provably impossible,
// undefined when the search budget ran out (unknown either way — proving
// non-colorability is the expensive direction).
function search(adj, k, preset, budget = 200000) {
  const n = adj.length;
  const colors = preset ? [...preset] : new Array(n).fill(-1);
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
    return undefined;
  }
}

// Minimum colors needed, between 1 and 4. The four color theorem
// guarantees 4 is always enough for these planar maps; on a budget
// blowout we assume 4 — the safe answer for par.
export function minColors(adj) {
  for (let k = 1; k < 4; k++) {
    const result = search(adj, k);
    if (result) return k;
    if (result === undefined) return 4;
  }
  return 4;
}

// A valid k-coloring as an array of color indices, or null.
export function solve(adj, k) {
  return search(adj, k) || null;
}

// Complete a partial coloring into a full k-coloring.
// Array on success, null if provably a dead end, undefined if unknown
// (budget exhausted) — callers must treat null and undefined differently.
export function solveFrom(adj, k, preset, budget) {
  return search(adj, k, preset, budget);
}
