import test from "node:test";
import assert from "node:assert/strict";
import { getCurveLengthValue, patchEntityProperties } from "../src/tools/queryTools.js";

test("getCurveLengthValue measures common 2D entities", () => {
  assert.equal(
    getCurveLengthValue({
      id: "line-1",
      type: "line",
      coords: [0, 0, 3, 4],
      layer: "0",
    }),
    5,
  );

  assert.equal(
    getCurveLengthValue({
      id: "circle-1",
      type: "circle",
      coords: [0, 0, 2],
      layer: "0",
    }),
    4 * Math.PI,
  );

  assert.equal(
    getCurveLengthValue({
      id: "poly-1",
      type: "polyline",
      coords: [0, 0, 3, 0, 3, 4],
      closed: false,
      layer: "0",
    }),
    7,
  );
});

test("patchEntityProperties merges custom display metadata", () => {
  const patched = patchEntityProperties(
    {
      id: "arc-1",
      type: "arc",
      coords: [0, 0, 5, 0, Math.PI / 2],
      layer: "0",
      properties: { color: "#111111" },
    },
    { linetype: "CENTER", color: "#222222" },
  );

  assert.deepEqual(patched.properties, {
    color: "#222222",
    linetype: "CENTER",
  });
});
