import type { CadSessionSnapshotV1, SceneSnapshotV1 } from "../core/types.js";

export type CadProjectFileV1 = {
  format: "cad-mcp-project";
  formatVersion: 1;
  savedAt: string;
  snapshot: SceneSnapshotV1 | CadSessionSnapshotV1;
};
