import type { NewEntity3D } from "../core/types.js";

export function parseStepLikeContent(text: string): NewEntity3D[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const solids: NewEntity3D[] = [];
  for (const line of lines) {
    const parts = line.split(/\s+/);
    const keyword = parts[0]?.toUpperCase();
    if (keyword === "BOX" && parts.length >= 4) {
      solids.push({
        type: "box",
        coords: [0, 0, 0, Number(parts[1]), Number(parts[2]), Number(parts[3])],
      });
    } else if (keyword === "SPHERE" && parts.length >= 2) {
      solids.push({ type: "sphere", coords: [0, 0, 0, Number(parts[1])] });
    } else if (keyword === "CYLINDER" && parts.length >= 3) {
      solids.push({
        type: "cylinder",
        coords: [0, 0, 0, Number(parts[1]), Number(parts[2])],
      });
    }
  }
  if (solids.length === 0 && text.trim() !== "") {
    solids.push({
      type: "box",
      coords: [0, 0, 0, 10, 10, 10],
      properties: { source: "step-fallback" },
    });
  }
  return solids;
}

export function exportStepLikeContent(solids: Array<{ type: string; coords: number[] }>): string {
  return solids
    .map((solid) => `${solid.type.toUpperCase()} ${solid.coords.join(" ")}`)
    .join("\n");
}
