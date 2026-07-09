// Regression tests for the pure modules (map generation + solver).
// Run: node tests/test.mjs — no dependencies, exits non-zero on failure.
import assert from 'node:assert/strict';
import { generateMap, mulberry32 } from '../js/voronoi.js';
import { minColors, solve, solveFrom } from '../js/solver.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (err) {
    console.error(`FAIL  ${name}\n      ${err.message}`);
    process.exitCode = 1;
  }
}

const validColoring = (adj, colors, k) =>
  colors.every((c, i) => c >= 0 && c < k && adj[i].every((j) => colors[j] !== c));

// ---------- rng ----------

test('mulberry32 is deterministic and in [0, 1)', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  for (let i = 0; i < 100; i++) {
    const v = a();
    assert.equal(v, b());
    assert.ok(v >= 0 && v < 1);
  }
  assert.notEqual(mulberry32(1)(), mulberry32(2)());
});

// ---------- map generation ----------

test('generateMap is deterministic for a given seed', () => {
  const m1 = generateMap(12345, 18);
  const m2 = generateMap(12345, 18);
  assert.deepEqual(JSON.parse(JSON.stringify(m1)), JSON.parse(JSON.stringify(m2)));
  assert.notDeepEqual(m1.adjacency, generateMap(54321, 18).adjacency);
});

test('maps are structurally sound across seeds and sizes', () => {
  for (const count of [6, 18, 30, 47]) {
    for (let seed = 1; seed <= 15; seed++) {
      const m = generateMap(seed * 7919, count);
      assert.equal(m.cells.length, count, `cell count (seed ${seed}, n ${count})`);
      m.cells.forEach((c, i) => assert.ok(c.poly.length >= 3, `degenerate cell ${i}`));
      m.adjacency.forEach((ns, i) => {
        assert.ok(!ns.includes(i), `self-adjacency at ${i}`);
        ns.forEach((j) => assert.ok(m.adjacency[j].includes(i), `asymmetric ${i}<->${j}`));
      });
      for (const e of m.edges) {
        assert.ok(m.adjacency[e.a].includes(e.b), `edge ${e.a}-${e.b} not in adjacency`);
      }
    }
  }
});

test('every generated map is 4-colorable (four color theorem holds)', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const m = generateMap(seed * 104729, 30);
    const colors = solve(m.adjacency, 4);
    assert.ok(colors, `seed ${seed} not 4-colorable?!`);
    assert.ok(validColoring(m.adjacency, colors, 4), `invalid coloring for seed ${seed}`);
  }
});

// ---------- solver: known chromatic numbers ----------

test('minColors on graphs with known chromatic numbers', () => {
  assert.equal(minColors([[]]), 1, 'single node');
  assert.equal(minColors([[1], [0]]), 2, 'one edge');
  assert.equal(minColors([[1, 3], [0, 2], [1, 3], [0, 2]]), 2, 'even cycle C4');
  assert.equal(minColors([[1, 2], [0, 2], [0, 1]]), 3, 'triangle');
  // odd wheel W5: hub 0 + 5-cycle 1..5 — needs 4 colors
  const w5 = [[1, 2, 3, 4, 5], [0, 2, 5], [0, 1, 3], [0, 2, 4], [0, 3, 5], [0, 4, 1]];
  assert.equal(minColors(w5), 4, 'odd wheel W5');
  // even wheel W6: hub + 6-cycle — needs only 3
  const w6 = [[1, 2, 3, 4, 5, 6], [0, 2, 6], [0, 1, 3], [0, 2, 4], [0, 3, 5], [0, 4, 6], [0, 5, 1]];
  assert.equal(minColors(w6), 3, 'even wheel W6');
});

// ---------- solver: partial completion (hints) ----------

test('solveFrom completes a valid partial coloring and honors it', () => {
  const m = generateMap(777, 18);
  const full = solve(m.adjacency, 4);
  const preset = full.map((c, i) => (i % 3 === 0 ? c : -1));
  const sol = solveFrom(m.adjacency, 4, preset);
  assert.ok(Array.isArray(sol), 'should be solvable');
  preset.forEach((c, i) => { if (c >= 0) assert.equal(sol[i], c, `preset ${i} changed`); });
  assert.ok(validColoring(m.adjacency, sol, 4));
});

test('solveFrom returns null for dead ends, not for open positions', () => {
  // star: center 0 touches 1-4; leaves all differently colored -> dead end
  const star = [[1, 2, 3, 4], [0], [0], [0], [0]];
  assert.equal(solveFrom(star, 4, [-1, 0, 1, 2, 3]), null, 'dead end');
  assert.ok(Array.isArray(solveFrom(star, 4, [-1, 0, 1, 2, 2])), 'open position');
  // conflicting preset itself is invalid -> null
  assert.equal(solveFrom([[1], [0]], 4, [0, 0]), null, 'conflicting preset');
});

test('solveFrom returns undefined (not null) when the budget runs out', () => {
  // large random-ish graph + budget 1: cannot even start searching
  const m = generateMap(999, 40);
  const preset = new Array(40).fill(-1);
  assert.equal(solveFrom(m.adjacency, 4, preset, 1), undefined);
});

// ---------- par sanity on campaign levels ----------

test('campaign level pars are in range and late levels need 4 colors', () => {
  const levelSeed = (k) => {
    let h = (k + 0x9e3779b9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return (h ^ (h >>> 16)) >>> 0;
  };
  const regions = (k) => 6 + Math.round((k - 1) * 0.7);
  for (const k of [1, 10, 25, 40, 60]) {
    const par = minColors(generateMap(levelSeed(k), regions(k)).adjacency);
    assert.ok(par >= 2 && par <= 4, `level ${k} par ${par} out of range`);
  }
  assert.equal(minColors(generateMap(levelSeed(60), regions(60)).adjacency), 4, 'level 60 should be par 4');
});

console.log(process.exitCode ? '\nSOME TESTS FAILED' : `\nall ${passed} tests passed`);
