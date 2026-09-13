import type { SceneSnapshotV1 } from "./types.js";

/** Undo/redo stacks storing serialized scene snapshots. */
export class HistoryManager {
  private readonly undoStack: string[] = [];
  private readonly redoStack: string[] = [];

  private serialize(snapshot: SceneSnapshotV1): string {
    return JSON.stringify(snapshot);
  }

  private deserialize(raw: string): SceneSnapshotV1 {
    return JSON.parse(raw) as SceneSnapshotV1;
  }

  clearRedo(): void {
    this.redoStack.length = 0;
  }

  recordUndoPoint(snapshot: SceneSnapshotV1): void {
    this.undoStack.push(this.serialize(snapshot));
    this.clearRedo();
  }

  /**
   * Pushes `current` onto redo, pops and returns the prior state from undo.
   * Returns undefined if undo is empty.
   */
  undo(current: SceneSnapshotV1): SceneSnapshotV1 | undefined {
    const raw = this.undoStack.pop();
    if (raw === undefined) {
      return undefined;
    }
    this.redoStack.push(this.serialize(current));
    return this.deserialize(raw);
  }

  /**
   * Pushes `current` onto undo, pops and returns the next state from redo.
   * Returns undefined if redo is empty.
   */
  redo(current: SceneSnapshotV1): SceneSnapshotV1 | undefined {
    const raw = this.redoStack.pop();
    if (raw === undefined) {
      return undefined;
    }
    this.undoStack.push(this.serialize(current));
    return this.deserialize(raw);
  }
}
