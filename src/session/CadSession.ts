import {
  AssemblyManager,
  ConstraintSolver,
  DrawingManager,
  GeometryEngine,
  OrganizationManager,
  ParametricEngine,
  Renderer,
  SceneGraph,
} from "../core/index.js";
import type {
  AssemblyState,
  CadSessionSnapshotV1,
  DrawingState,
  OrganizationState,
  ParametricState,
  SceneSnapshotV1,
} from "../core/types.js";

function emptyParametricState(): ParametricState {
  return { parameters: [], constraints: [] };
}

function emptyOrganizationState(): OrganizationState {
  return { blocks: [], groups: [] };
}

function emptyAssemblyState(): AssemblyState {
  return { assemblies: [] };
}

function emptyDrawingState(): DrawingState {
  return { drawings: [] };
}

/**
 * CAD editing session: one SceneGraph plus parametric, organization, assembly,
 * drawing, preview, nested transactions, and undo/redo.
 */
export class CadSession {
  readonly sceneGraph = new SceneGraph();
  readonly geometryEngine = new GeometryEngine(this.sceneGraph);
  readonly parametricEngine = new ParametricEngine();
  readonly constraintSolver = new ConstraintSolver(this.parametricEngine);
  readonly organizationManager = new OrganizationManager();
  readonly assemblyManager = new AssemblyManager();
  readonly drawingManager = new DrawingManager();
  readonly renderer = new Renderer();

  private readonly txnStack: CadSessionSnapshotV1[] = [];
  private undoStack: CadSessionSnapshotV1[] = [];
  private redoStack: CadSessionSnapshotV1[] = [];

  exportSnapshot(): CadSessionSnapshotV1 {
    return {
      version: 1,
      scene: this.sceneGraph.exportSnapshot(),
      parametrics: this.parametricEngine.exportState(),
      organization: this.organizationManager.exportState(),
      assemblies: this.assemblyManager.exportState(),
      drawings: this.drawingManager.exportState(),
    };
  }

  restoreSnapshot(snapshot: CadSessionSnapshotV1): void {
    if (snapshot.version !== 1) {
      throw new Error(`Unsupported session snapshot version: ${snapshot.version}`);
    }
    this.sceneGraph.restoreSnapshot(snapshot.scene);
    this.parametricEngine.restoreState(snapshot.parametrics);
    this.organizationManager.restoreState(snapshot.organization);
    this.assemblyManager.restoreState(snapshot.assemblies);
    this.drawingManager.restoreState(snapshot.drawings);
  }

  beginTransaction(): void {
    this.txnStack.push(this.exportSnapshot());
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
    this.restoreSnapshot(snap);
  }

  pushUndoCheckpoint(): void {
    this.redoStack = [];
    this.undoStack.push(this.exportSnapshot());
  }

  undo(): void {
    if (this.undoStack.length === 0) {
      throw new Error("Nothing to undo");
    }
    this.redoStack.push(this.exportSnapshot());
    this.restoreSnapshot(this.undoStack.pop()!);
  }

  redo(): void {
    if (this.redoStack.length === 0) {
      throw new Error("Nothing to redo");
    }
    this.undoStack.push(this.exportSnapshot());
    this.restoreSnapshot(this.redoStack.pop()!);
  }

  getUndoRedoDepths(): { undo: number; redo: number } {
    return { undo: this.undoStack.length, redo: this.redoStack.length };
  }

  clearUndoRedo(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  loadSceneSnapshot(snapshot: SceneSnapshotV1): void {
    this.sceneGraph.restoreSnapshot(snapshot);
    this.clearUndoRedo();
  }

  loadSnapshot(snapshot: SceneSnapshotV1 | CadSessionSnapshotV1): void {
    if ("scene" in snapshot) {
      this.restoreSnapshot(snapshot);
    } else {
      this.sceneGraph.restoreSnapshot(snapshot);
      this.parametricEngine.restoreState(emptyParametricState());
      this.organizationManager.restoreState(emptyOrganizationState());
      this.assemblyManager.restoreState(emptyAssemblyState());
      this.drawingManager.restoreState(emptyDrawingState());
    }
    this.clearUndoRedo();
  }

  newEmptyScene(name?: string): void {
    const now = new Date().toISOString();
    const emptyScene: SceneSnapshotV1 = {
      version: 1,
      projectName: name !== undefined && name !== "" ? name : "Untitled",
      updatedAt: now,
      layers: [{ name: "0", visible: true, locked: false }],
      entities: [],
    };
    this.sceneGraph.restoreSnapshot(emptyScene);
    this.parametricEngine.restoreState(emptyParametricState());
    this.organizationManager.restoreState(emptyOrganizationState());
    this.assemblyManager.restoreState(emptyAssemblyState());
    this.drawingManager.restoreState(emptyDrawingState());
    this.clearUndoRedo();
  }
}
