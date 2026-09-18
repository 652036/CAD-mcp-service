import test from "node:test";
import assert from "node:assert/strict";
import { subtractBoundingBox } from "../src/utils/subtractBoundingBox.js";

type Box = { min: [number, number, number]; max: [number, number, number] };
const left: Box = { min: [0, 0, 0], max: [10, 10, 10] };

const unchanged: [string, Box][] = [
  ["interior cavity", { min: [2, 2, 2], max: [8, 8, 8] }],
  ["corner cut", { min: [6, 6, 6], max: [12, 12, 12] }],
  ["edge cut", { min: [6, 6, -1], max: [12, 12, 11] }],
  ["partial face cut", { min: [6, 2, 2], max: [12, 8, 8] }],
  ["interior slab leaving two components", { min: [3, -1, -1], max: [7, 11, 11] }],
  ["disjoint boxes", { min: [20, 0, 0], max: [25, 5, 5] }],
  ["touching face", { min: [10, 0, 0], max: [15, 10, 10] }],
];
for (const [name, right] of unchanged) {
  test(`subtract bbox preserves outer extent: ${name}`, () => {
    assert.deepEqual(subtractBoundingBox(left, right), left);
  });
}

for (const axis of [0, 1, 2]) {
  for (const side of ["min", "max"] as const) {
    test(`subtract bbox trims a full face on axis ${axis}, ${side} side`, () => {
      const right: Box = { min: [-1, -1, -1], max: [11, 11, 11] };
      const expected: Box = structuredClone(left);
      if (side === "min") {
        right.max[axis] = 4;
        expected.min[axis] = 4;
      } else {
        right.min[axis] = 6;
        expected.max[axis] = 6;
      }
      assert.deepEqual(subtractBoundingBox(left, right), expected);
    });
  }
}

for (const right of [left, { min: [-1, -1, -1], max: [11, 11, 11] } as Box]) {
  test(`subtract bbox returns the empty sentinel when covered by ${JSON.stringify(right)}`, () => {
    assert.deepEqual(subtractBoundingBox(left, right), { min: [0, 0, 0], max: [0, 0, 0] });
  });
}

test("subtract bbox does not mutate or alias either operand", () => {
  const a: Box = structuredClone(left);
  const b: Box = { min: [6, -1, -1], max: [11, 11, 11] };
  const saved = structuredClone([a, b]);
  const result = subtractBoundingBox(a, b);
  result.min[0] = -100;
  result.max[1] = 100;
  assert.deepEqual([a, b], saved);
});

// Independent oracle: partition the left box at the right box's planes, then
// enclose all positive-volume cells whose centers are outside the right box.
function cellOracle(a: Box, b: Box): Box {
  const cuts = [0, 1, 2].map((i) => [...new Set([
    a.min[i], a.max[i],
    Math.max(a.min[i], Math.min(a.max[i], b.min[i])),
    Math.max(a.min[i], Math.min(a.max[i], b.max[i])),
  ])].sort((x, y) => x - y));
  let result: Box | undefined;
  for (let x = 0; x < cuts[0].length - 1; x++) {
    for (let y = 0; y < cuts[1].length - 1; y++) {
      for (let z = 0; z < cuts[2].length - 1; z++) {
        const indices = [x, y, z];
        const lo = indices.map((j, i) => cuts[i][j]) as Box["min"];
        const hi = indices.map((j, i) => cuts[i][j + 1]) as Box["max"];
        const inside = indices.every((_, i) => {
          const midpoint = (lo[i] + hi[i]) / 2;
          return midpoint > b.min[i] && midpoint < b.max[i];
        });
        if (inside) continue;
        if (!result) result = { min: [...lo], max: [...hi] };
        else for (let i = 0; i < 3; i++) {
          result.min[i] = Math.min(result.min[i], lo[i]);
          result.max[i] = Math.max(result.max[i], hi[i]);
        }
      }
    }
  }
  return result ?? { min: [...a.min], max: [...a.min] };
}

test("subtract bbox matches independent cell decomposition for 500 seeded cases", () => {
  let seed = 123456789;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const box = (): Box => {
    const min = [0, 1, 2].map(() => Math.floor(next() * 15) - 5) as Box["min"];
    return { min, max: min.map((v) => v + 1 + Math.floor(next() * 10)) as Box["max"] };
  };
  for (let i = 0; i < 500; i++) {
    const a = box();
    const b = box();
    assert.deepEqual(subtractBoundingBox(a, b), cellOracle(a, b), `case ${i}: ${JSON.stringify([a, b])}`);
  }
});
