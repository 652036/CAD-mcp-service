import { SceneGraph } from "../core/SceneGraph.js";
import type { SceneSnapshotV1 } from "../core/types.js";

/**
 * CAD editing session: one {@link SceneGraph}, nested transactions, and undo/redo.
 */
export class CadSession {
  readonly sceneGraph = new SceneGraph();
  private readonly txnStack: SceneSnapshotV1[] = [];
  private undoStack: SceneSnapshotV1[] = [];
  private redoStack: SceneSnapshotV1[] = [];

  beginTransaction(): void {
    this.txnStack.push(this.sceneGraph.exportSnapshot());
  }

  commitTransaction(): void {
    if (this.txnStack.length === 0) {
      throw new Error("No active transaction");
    }
    this.txnStack.pop();
  }

  rollbackTransaction(): void {
    if (this.txnStack.length === 0) {
      throw new Error("No active transaction");
    }
    const snap = this.txnStack.pop()!;
    this.sceneGraph.restoreSnapshot(snap);
  }

  pushUndoCheckpoint(): void {
    this.redoStack = [];
    this.undoStack.push(this.sceneGraph.exportSnapshot());
  }

  undo(): void {
    if (this.undoStack.length === 0) {
      throw new Error("Nothing to undo");
    }
    this.redoStack.push(this.sceneGraph.exportSnapshot());
    const prev = this.undoStack.pop()!;
    this.sceneGraph.restoreSnapshot(prev);
  }

  redo(): void {
    if (this.redoStack.length === 0) {
      throw new Error("Nothing to redo");
    }
    this.undoStack.push(this.sceneGraph.exportSnapshot());
    const next = this.redoStack.pop()!;
    this.sceneGraph.restoreSnapshot(next);
  }

  getUndoRedoDepths(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  clearUndoRedo(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  loadSnapshot(snapshot: SceneSnapshotV1): void {
    this.sceneGraph.restoreSnapshot(snapshot);
    this.clearUndoRedo();
  }

  newEmptyScene(name?: string): void {
    const now = new Date().toISOString();
    const empty: SceneSnapshotV1 = {
      version: 1,
      projectName: name !== undefined && name !== "" ? name : "Untitled",
      updatedAt: now,
      layers: [{ name: "0", visible: true, locked: false }],
      entities: [],
    };
    this.sceneGraph.restoreSnapshot(empty);
    this.clearUndoRedo();
  }
}
