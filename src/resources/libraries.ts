/** Starter block definitions for MCP resource `cad://blocks/library`. */
export const blocksLibraryPlaceholder = {
  version: 1,
  blocks: [
    { name: "hex_bolt_m8", description: "ISO-style M8 hex bolt placeholder" },
    { name: "deep_groove_bearing_608", description: "608 bearing placeholder" },
    { name: "socket_head_cap_screw_m6", description: "M6 cap screw placeholder" },
  ],
} as const;

/** Starter material catalog for MCP resource `cad://materials/library`. */
export const materialsLibraryPlaceholder = {
  version: 1,
  materials: [
    { id: "steel_mild", name: "Mild Steel", densityKgM3: 7850 },
    { id: "aluminum_6061", name: "Aluminum 6061", densityKgM3: 2700 },
    { id: "abs", name: "ABS", densityKgM3: 1040 },
  ],
} as const;

export const linetypesLibrary = {
  version: 1,
  linetypes: [
    { name: "CONTINUOUS", pattern: [], description: "Solid line" },
    { name: "CENTER", pattern: [12, -2, 2, -2], description: "Centerline" },
    { name: "HIDDEN", pattern: [6, -3], description: "Hidden edge line" },
    { name: "PHANTOM", pattern: [12, -3, 3, -3, 3, -3], description: "Phantom line" },
  ],
} as const;

export const textStylesLibrary = {
  version: 1,
  styles: [
    { name: "standard", fontFamily: "Simplex", heightMm: 2.5 },
    { name: "title", fontFamily: "Simplex", heightMm: 5 },
    { name: "note", fontFamily: "Simplex", heightMm: 3.5 },
  ],
} as const;

export const dimensionStylesLibrary = {
  version: 1,
  styles: [
    {
      name: "iso-default",
      textHeightMm: 2.5,
      arrowSizeMm: 2.5,
      unitFormat: "mm",
    },
    {
      name: "ansi-default",
      textHeightMm: 3,
      arrowSizeMm: 3,
      unitFormat: "mm",
    },
  ],
} as const;

export const isoStandardResource = {
  version: 1,
  standard: "ISO",
  notes: [
    "Use first-angle projection unless stated otherwise.",
    "Dimension in millimetres unless units are called out.",
    "Prefer functional dimensions and avoid redundant dimensioning.",
  ],
} as const;

export const ansiStandardResource = {
  version: 1,
  standard: "ANSI",
  notes: [
    "Use third-angle projection unless stated otherwise.",
    "Show tolerances with ASME-aligned notation when applicable.",
    "Keep title block and revision control visible on every sheet.",
  ],
} as const;
