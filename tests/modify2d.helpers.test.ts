import test from "node:test";
import assert from "node:assert/strict";
import {
  mirrorEntity2D,
  offsetEntity2D,
  rotateEntity2D,
  translateEntity2D,
} from "../src/tools/modify2dTools.js";

test("mirrorEntity2D mirrors a line across the Y axis", () => {
  const mirrored = mirrorEntity2D(
    {
      id: "line-1",
      type: "line",
      coords: [1, 0, 3, 0],
      layer: "0",
    },
    { x: 0, y: -10 },
    { x: 0, y: 10 },
  );

  assert.deepEqual(mirrored.coords, [-1, 0, -3, 0]);
});

test("offsetEntity2D offsets a line to its left side", () => {
  const offset = offsetEntity2D(
    {
      id: "line-1",
      type: "line",
      coords: [0, 0, 10, 0],
      layer: "0",
    },
    2,
    "left",
  );

  assert.deepEqual(offset.coords, [0, 2, 10, 2]);
});

test("rotateEntity2D turns a rectangle into a polygon when rotated", () => {
  const rotated = rotateEntity2D(
    {
      id: "rect-1",
      type: "rectangle",
      coords: [0, 0, 4, 2],
      layer: "0",
    },
    { x: 0, y: 0 },
    Math.PI / 2,
  );

  assert.equal(rotated.type, "polygon");
  assert.equal(rotated.coords.length, 8);
});

test("translateEntity2D keeps rectangle dimensions while moving origin", () => {
  const moved = translateEntity2D(
    {
      id: "rect-1",
      type: "rectangle",
      coords: [0, 0, 4, 2],
      layer: "0",
    },
    3,
    -2,
  );

  assert.deepEqual(moved.coords, [3, -2, 4, 2]);
});
