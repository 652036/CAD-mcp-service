/** Placeholder block definitions for MCP resource `cad://blocks/library`. */
export const blocksLibraryPlaceholder = {
  version: 1,
  blocks: [] as { name: string; description?: string }[],
} as const;

/** Placeholder material catalog for MCP resource `cad://materials/library`. */
export const materialsLibraryPlaceholder = {
  version: 1,
  materials: [] as { id: string; name?: string; densityKgM3?: number }[],
} as const;
