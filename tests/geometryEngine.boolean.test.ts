import test from "node:test";
import assert from "node:assert/strict";
import { CadSession } from "../src/session/CadSession.js";

test("GeometryEngine subtract keeps the remaining portion of the left solid bbox", () => {
  const session = new CadSession();
  const left = session.geometryEngine.createSolid({
    type: "box",
    coords: [0, 0, 0, 10, 10, 10],
  });
  const right = session.geometryEngine.createSolid({
    type: "box",
    coords: [6, 0, 0, 10, 10, 10],
  });

  const resultId = session.geometryEngine.createBooleanResult("subtract", left, right);
  const result = session.geometryEngine.getSolid(resultId);

  assert.ok(result);
  assert.equal(result?.type, "boolean_result");
  assert.deepEqual(result?.coords, [0, 0, 0, 6, 10, 10]);
  assert.deepEqual(result?.properties?.operands, [left, right]);
});

test("GeometryEngine subtract leaves the left solid unchanged when operands do not overlap", () => {
  const session = new CadSession();
  const left = session.geometryEngine.createSolid({
    type: "box",
    coords: [0, 0, 0, 10, 10, 10],
  });
  const right = session.geometryEngine.createSolid({
    type: "box",
    coords: [20, 0, 0, 5, 5, 5],
  });

  const resultId = session.geometryEngine.createBooleanResult("subtract", left, right);
  const result = session.geometryEngine.getSolid(resultId);

  assert.deepEqual(result?.coords, [0, 0, 0, 10, 10, 10]);
});
