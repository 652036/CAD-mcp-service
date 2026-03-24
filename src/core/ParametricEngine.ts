import type {
  ConstraintRecord,
  ParameterRecord,
  ParametricState,
} from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class ParametricEngine {
  private readonly parameters = new Map<string, ParameterRecord>();
  private readonly constraints = new Map<string, ConstraintRecord>();

  exportState(): ParametricState {
    return {
      parameters: Array.from(this.parameters.values()).map(clone),
      constraints: Array.from(this.constraints.values()).map(clone),
    };
  }

  restoreState(state: ParametricState): void {
    this.parameters.clear();
    this.constraints.clear();
    for (const parameter of state.parameters) {
      this.parameters.set(parameter.name, clone(parameter));
    }
    for (const constraint of state.constraints) {
      this.constraints.set(constraint.id, clone(constraint));
    }
  }

  setParameter(
    name: string,
    value: number | string | boolean,
    unit?: string,
    expression?: string,
  ): ParameterRecord {
    const next: ParameterRecord = {
      name,
      value,
      unit,
      expression,
      updatedAt: new Date().toISOString(),
    };
    this.parameters.set(name, next);
    return clone(next);
  }

  getParameter(name: string): ParameterRecord | undefined {
    const parameter = this.parameters.get(name);
    return parameter ? clone(parameter) : undefined;
  }

  listParameters(): ParameterRecord[] {
    return Array.from(this.parameters.values()).map(clone);
  }

  deleteParameter(name: string): boolean {
    return this.parameters.delete(name);
  }

  addConstraint(record: ConstraintRecord): ConstraintRecord {
    this.constraints.set(record.id, clone(record));
    return clone(record);
  }

  listConstraints(): ConstraintRecord[] {
    return Array.from(this.constraints.values()).map(clone);
  }
}
