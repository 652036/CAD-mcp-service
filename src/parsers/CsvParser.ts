import type { NewEntity2D } from "../core/types.js";

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    const next = line[i + 1];
    if (ch === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += ch;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

export type CsvPointImportOptions = {
  xColumn?: string;
  yColumn?: string;
  zColumn?: string;
  idColumn?: string;
  kind?: string;
  layer?: string;
};

export function parseCsvRows(text: string): Array<Record<string, string>> {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return [];
  }
  const headers = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? "";
    });
    return row;
  });
}

export function parseCsvPointsToEntities(
  text: string,
  options: CsvPointImportOptions = {},
): NewEntity2D[] {
  const rows = parseCsvRows(text);
  const xColumn = options.xColumn ?? "x";
  const yColumn = options.yColumn ?? "y";
  const zColumn = options.zColumn;
  const idColumn = options.idColumn;
  const kind = options.kind ?? "sampling_point";

  return rows.flatMap((row) => {
    const x = Number(row[xColumn]);
    const y = Number(row[yColumn]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return [];
    }

    const properties: Record<string, unknown> = {
      kind,
      source: "csv-points",
    };
    Object.entries(row).forEach(([key, value]) => {
      if (key === xColumn || key === yColumn) {
        return;
      }
      if (zColumn && key === zColumn) {
        const z = Number(value);
        properties.elevation = Number.isFinite(z) ? z : value;
        return;
      }
      if (idColumn && key === idColumn) {
        properties.label = value;
        return;
      }
      properties[key] = value;
    });

    return [
      {
        id: idColumn ? row[idColumn] || undefined : undefined,
        type: "point",
        coords: [x, y],
        layer: options.layer,
        properties,
      } satisfies NewEntity2D,
    ];
  });
}
