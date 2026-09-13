import { randomUUID } from "node:crypto";
import type { ConstraintRecord } from "./types.js";
import { ParametricEngine } from "./ParametricEngine.js";

export class ConstraintSolver {
  constructor(private readonly parametricEngine: ParametricEngine) {}

  addConstraint(
    type: string,
    entities: string[],
    data?: Record<string, unknown>,
  ): ConstraintRecord {
    return this.parametricEngine.addConstraint({
      id: randomUUID(),
      type,
      entities: [...entities],
      data,
    });
  }

  listConstraints(): ConstraintRecord[] {
    return this.parametricEngine.listConstraints();
  }
}
