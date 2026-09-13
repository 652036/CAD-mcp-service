import test from "node:test";
import assert from "node:assert/strict";
import { SceneGraph } from "../src/core/SceneGraph.js";

test("SceneGraph exportSnapshot / restoreSnapshot roundtrip", () => {
  const source = new SceneGraph();
  source.createLayer("L1");
  source.createPoint([1, 2], { layer: "L1" });
  source.createLine([0, 0, 5, 5], { layer: "L1" });

  const snapshot = source.exportSnapshot();
  const target = new SceneGraph();
  target.restoreSnapshot(snapshot);

  assert.equal(target.listEntities().length, 2);
  assert.ok(target.getLayers().has("0"));
  assert.ok(target.getLayers().has("L1"));

  const meta = target.getProjectMetadata();
  assert.equal(meta.entityCount, 2);
  assert.ok(meta.layerCount >= 2);
});
