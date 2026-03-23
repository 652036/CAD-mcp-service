/** Minimal stub; Agent 2 will implement the real scene graph. */
export type ProjectMetadata = Record<string, unknown>;

export class SceneGraph {
  constructor() {}

  getProjectMetadata(): ProjectMetadata {
    return {};
  }

  listEntities(): readonly unknown[] {
    return [];
  }

  listLayers(): readonly unknown[] {
    return [];
  }
}
