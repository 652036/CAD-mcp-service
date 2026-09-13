import type { NewEntity3D } from "../core/types.js";

export function parseStlLikeContent(text: string): NewEntity3D[] {
  const lower = text.toLowerCase();
  if (lower.includes("facet normal") || lower.includes("solid ")) {
    return [
      {
        type: "prism",
        coords: [0, 0, 10, 10, 10],
        properties: { source: "stl-mesh-import" },
      },
    ];
  }
  if (text.trim() !== "") {
    return [
      {
        type: "box",
        coords: [0, 0, 0, 10, 10, 10],
        properties: { source: "stl-fallback" },
      },
    ];
  }
  return [];
}

export function exportStlLikeContent(solids: Array<{ type: string; coords: number[] }>): string {
  const lines = ["solid cad_mcp"];
  solids.forEach((solid, index) => {
    lines.push(`  facet normal 0 0 1`);
    lines.push(`    outer loop`);
    lines.push(`      vertex ${solid.coords[0] ?? 0} ${solid.coords[1] ?? 0} ${solid.coords[2] ?? 0}`);
    lines.push(`      vertex ${(solid.coords[0] ?? 0) + 1} ${solid.coords[1] ?? 0} ${solid.coords[2] ?? 0}`);
    lines.push(`      vertex ${solid.coords[0] ?? 0} ${(solid.coords[1] ?? 0) + 1} ${solid.coords[2] ?? 0}`);
    lines.push(`    endloop`);
    lines.push(`  endfacet`);
    lines.push(`  // solid ${index}:${solid.type}`);
  });
  lines.push("endsolid cad_mcp");
  return lines.join("\n");
}
