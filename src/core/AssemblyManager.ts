import { randomUUID } from "node:crypto";
import type {
  AssemblyComponent,
  AssemblyMate,
  AssemblyRecord,
  AssemblyState,
  ExplodedViewRecord,
} from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class AssemblyManager {
  private readonly assemblies = new Map<string, AssemblyRecord>();

  exportState(): AssemblyState {
    return {
      assemblies: Array.from(this.assemblies.values()).map(clone),
    };
  }

  restoreState(state: AssemblyState): void {
    this.assemblies.clear();
    for (const assembly of state.assemblies) {
      this.assemblies.set(assembly.id, clone(assembly));
    }
  }

  createAssembly(name: string): AssemblyRecord {
    const assembly: AssemblyRecord = {
      id: randomUUID(),
      name,
      components: [],
      mates: [],
      explodedViews: [],
    };
    this.assemblies.set(assembly.id, assembly);
    return clone(assembly);
  }

  listAssemblies(): AssemblyRecord[] {
    return Array.from(this.assemblies.values()).map(clone);
  }

  getAssembly(id: string): AssemblyRecord | undefined {
    const assembly = this.assemblies.get(id);
    return assembly ? clone(assembly) : undefined;
  }

  addComponent(
    assemblyId: string,
    ref: string,
    position: [number, number, number],
    rotation: [number, number, number],
  ): AssemblyComponent {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      throw new Error(`Assembly not found: ${assemblyId}`);
    }
    const component: AssemblyComponent = {
      id: randomUUID(),
      ref,
      position,
      rotation,
    };
    assembly.components.push(component);
    return clone(component);
  }

  removeComponent(assemblyId: string, instanceId: string): boolean {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      throw new Error(`Assembly not found: ${assemblyId}`);
    }
    const before = assembly.components.length;
    assembly.components = assembly.components.filter(
      (component) => component.id !== instanceId,
    );
    return before !== assembly.components.length;
  }

  addMate(
    assemblyId: string,
    type: string,
    a: string,
    b: string,
    value?: number,
  ): AssemblyMate {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      throw new Error(`Assembly not found: ${assemblyId}`);
    }
    const mate: AssemblyMate = { id: randomUUID(), type, a, b, value };
    assembly.mates.push(mate);
    return clone(mate);
  }

  setComponentFlexible(
    assemblyId: string,
    instanceId: string,
    flexible: boolean,
  ): AssemblyComponent {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      throw new Error(`Assembly not found: ${assemblyId}`);
    }
    const component = assembly.components.find((item) => item.id === instanceId);
    if (!component) {
      throw new Error(`Component not found: ${instanceId}`);
    }
    component.flexible = flexible;
    return clone(component);
  }

  createExplodedView(assemblyId: string, name: string): ExplodedViewRecord {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      throw new Error(`Assembly not found: ${assemblyId}`);
    }
    const view: ExplodedViewRecord = { id: randomUUID(), name, steps: [] };
    assembly.explodedViews.push(view);
    return clone(view);
  }

  addExplodeStep(
    assemblyId: string,
    viewId: string,
    componentIds: string[],
    direction: [number, number, number],
    distance: number,
  ): ExplodedViewRecord {
    const assembly = this.assemblies.get(assemblyId);
    if (!assembly) {
      throw new Error(`Assembly not found: ${assemblyId}`);
    }
    const view = assembly.explodedViews.find((item) => item.id === viewId);
    if (!view) {
      throw new Error(`Exploded view not found: ${viewId}`);
    }
    view.steps.push({ componentIds: [...componentIds], direction, distance });
    return clone(view);
  }
}
