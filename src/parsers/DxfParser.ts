export type DxfMinimalParseResult = {
  layers: string[];
  entities: unknown[];
};

/**
 * Minimal DXF parse stub (no file I/O). Prefer adding a real parser later instead of a heavy dependency.
 */
export function parseDxfMinimal(_content: string): DxfMinimalParseResult {
  return { layers: ["0"], entities: [] };
}

export type SceneSummary = Record<string, unknown>;

/**
 * Writes a tiny valid DXF with HEADER + ENTITIES and zero geometric entities (comment line only). MVP export.
 */
export function exportDxfMinimal(_sceneSummary: SceneSummary): string {
  const lines: string[] = [
    "0",
    "SECTION",
    "2",
    "HEADER",
    "9",
    "$ACADVER",
    "1",
    "AC1024",
    "0",
    "ENDSEC",
    "0",
    "SECTION",
    "2",
    "ENTITIES",
    "999",
    "cad-mcp-server MVP: empty ENTITIES (use full exporter later)",
    "0",
    "ENDSEC",
    "0",
    "EOF",
  ];
  return lines.join("\r\n");
}
