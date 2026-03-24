import { randomUUID } from "node:crypto";
import type {
  DrawingRecord,
  DrawingState,
  DrawingViewRecord,
} from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class DrawingManager {
  private readonly drawings = new Map<string, DrawingRecord>();

  exportState(): DrawingState {
    return {
      drawings: Array.from(this.drawings.values()).map(clone),
    };
  }

  restoreState(state: DrawingState): void {
    this.drawings.clear();
    for (const drawing of state.drawings) {
      this.drawings.set(drawing.id, clone(drawing));
    }
  }

  createDrawing(name: string, template?: string): DrawingRecord {
    const drawing: DrawingRecord = {
      id: randomUUID(),
      name,
      template,
      views: [],
      annotations: [],
    };
    this.drawings.set(drawing.id, drawing);
    return clone(drawing);
  }

  listDrawings(): DrawingRecord[] {
    return Array.from(this.drawings.values()).map(clone);
  }

  getDrawing(id: string): DrawingRecord | undefined {
    const drawing = this.drawings.get(id);
    return drawing ? clone(drawing) : undefined;
  }

  addView(
    drawingId: string,
    sourceId: string,
    viewType: string,
    scale: number,
    position: [number, number],
    options?: Record<string, unknown>,
  ): DrawingViewRecord {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing not found: ${drawingId}`);
    }
    const view: DrawingViewRecord = {
      id: randomUUID(),
      sourceId,
      viewType,
      scale,
      position,
      options,
    };
    drawing.views.push(view);
    return clone(view);
  }

  setSheetSize(drawingId: string, sheetSize: string): DrawingRecord {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing not found: ${drawingId}`);
    }
    drawing.sheetSize = sheetSize;
    return clone(drawing);
  }

  addAnnotation(drawingId: string, entityId: string): DrawingRecord {
    const drawing = this.drawings.get(drawingId);
    if (!drawing) {
      throw new Error(`Drawing not found: ${drawingId}`);
    }
    drawing.annotations.push(entityId);
    return clone(drawing);
  }
}
