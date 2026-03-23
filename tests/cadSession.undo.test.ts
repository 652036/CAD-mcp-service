import test from "node:test";
import assert from "node:assert/strict";
import { CadSession } from "../src/session/CadSession.js";

test("CadSession pushUndoCheckpoint and undo restores prior state", () => {
  const session = new CadSession();
  session.pushUndoCheckpoint();
  assert.equal(session.sceneGraph.listEntities().length, 0);

  session.sceneGraph.createPoint([3, 4]);
  assert.equal(session.sceneGraph.listEntities().length, 1);

  session.undo();
  assert.equal(session.sceneGraph.listEntities().length, 0);
});
