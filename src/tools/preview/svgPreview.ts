import type { Entity2D } from "../../core/types.js";

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

/** Flat coords [x0,y0,x1,y1,...] → SVG points string */
function coordsToPointString(
  coords: readonly number[],
  yFlip: (y: number) => number,
): string {
  const parts: string[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) {
    parts.push(`${coords[i]},${yFlip(coords[i + 1])}`);
  }
  return parts.join(" ");
}

/** Map mathematical Y-up to SVG Y-down inside viewBox. */
function makeYFlip(minY: number, height: number): (y: number) => number {
  return (y: number) => height - (y - minY);
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function computeBBox(entities: readonly Entity2D[]): BBox | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  };

  const addCoordsPairs = (coords: readonly number[]) => {
    for (let i = 0; i + 1 < coords.length; i += 2) {
      add(coords[i], coords[i + 1]);
    }
  };

  for (const e of entities) {
    const c = e.coords;
    switch (e.type) {
      case "point":
        if (c.length >= 2) {
          add(c[0], c[1]);
        }
        break;
      case "line":
        if (c.length >= 4) {
          add(c[0], c[1]);
          add(c[2], c[3]);
        }
        break;
      case "circle":
        if (c.length >= 3) {
          const cx = c[0];
          const cy = c[1];
          const r = c[2];
          add(cx - r, cy - r);
          add(cx + r, cy + r);
        }
        break;
      case "arc":
        if (c.length >= 5) {
          const cx = c[0];
          const cy = c[1];
          const radius = c[2];
          const t0 = c[3];
          const t1 = c[4];
          const steps = 24;
          let delta = t1 - t0;
          while (delta <= 0) {
            delta += Math.PI * 2;
          }
          for (let i = 0; i <= steps; i++) {
            const t = t0 + (delta * i) / steps;
            add(cx + radius * Math.cos(t), cy + radius * Math.sin(t));
          }
        }
        break;
      case "ellipse":
        if (c.length >= 5) {
          add(c[0] - c[2], c[1] - c[3]);
          add(c[0] + c[2], c[1] + c[3]);
        }
        break;
      case "rectangle":
        if (c.length >= 4) {
          const x = c[0];
          const y = c[1];
          const width = c[2];
          const height = c[3];
          add(x, y);
          add(x + width, y + height);
        }
        break;
      case "polygon":
      case "polyline":
      case "spline":
      case "leader":
      case "multileader":
        addCoordsPairs(c);
        break;
      case "text":
      case "mtext":
      case "symbol":
      case "dimension":
      case "table":
      case "viewport":
        if (c.length >= 2) {
          add(c[0], c[1]);
          add(c[0] + 10, c[1] + 5);
        }
        break;
      default:
        break;
    }
  }

  if (!Number.isFinite(minX)) {
    return null;
  }
  return { minX, minY, maxX, maxY };
}

function arcPath(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  yFlip: (y: number) => number,
): string {
  let delta = a1 - a0;
  while (delta <= 0) {
    delta += Math.PI * 2;
  }
  const large = delta > Math.PI ? 1 : 0;
  const x0 = cx + r * Math.cos(a0);
  const y0 = yFlip(cy + r * Math.sin(a0));
  const x1 = cx + r * Math.cos(a1);
  const y1 = yFlip(cy + r * Math.sin(a1));
  return `M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`;
}

/**
 * Minimal wireframe SVG. Coordinates are mm; Y is mathematical (up); flipped for SVG.
 */
export function entitiesToSvg(entities: readonly Entity2D[]): string {
  if (entities.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect x="1" y="1" width="98" height="98" fill="none" stroke="#999" stroke-dasharray="4 2"/><text x="50" y="50" text-anchor="middle" font-size="8" fill="#666">empty</text></svg>`;
  }

  const bbox = computeBBox(entities);
  if (!bbox) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text x="10" y="50" font-size="8">no bounds</text></svg>`;
  }

  const pad = 2;
  const w = Math.max(bbox.maxX - bbox.minX, 1e-6) + pad * 2;
  const h = Math.max(bbox.maxY - bbox.minY, 1e-6) + pad * 2;
  const ox = bbox.minX - pad;
  const oy = bbox.minY - pad;
  const yFlip = makeYFlip(oy, h);

  const parts: string[] = [];
  for (const e of entities) {
    const c = e.coords;
    switch (e.type) {
      case "point": {
        if (c.length < 2) {
          break;
        }
        const px = c[0];
        const py = yFlip(c[1]);
        parts.push(
          `<circle cx="${px}" cy="${py}" r="1.2" fill="none" stroke="#222" stroke-width="0.3"/>`,
        );
        break;
      }
      case "line":
        if (c.length >= 4) {
          parts.push(
            `<line x1="${c[0]}" y1="${yFlip(c[1])}" x2="${c[2]}" y2="${yFlip(c[3])}" stroke="#222" stroke-width="0.25" fill="none"/>`,
          );
        }
        break;
      case "circle":
        if (c.length >= 3) {
          parts.push(
            `<circle cx="${c[0]}" cy="${yFlip(c[1])}" r="${c[2]}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        }
        break;
      case "arc":
        if (c.length >= 5) {
          parts.push(
            `<path d="${escapeAttr(arcPath(c[0], c[1], c[2], c[3], c[4], yFlip))}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        }
        break;
      case "rectangle": {
        if (c.length < 4) {
          break;
        }
        const x = c[0];
        const y = c[1];
        const width = c[2];
        const height = c[3];
        const ry =
          typeof e.properties?.cornerRadius === "number"
            ? e.properties.cornerRadius
            : 0;
        parts.push(
          `<rect x="${x}" y="${yFlip(y + height)}" width="${width}" height="${height}" rx="${ry}" fill="none" stroke="#222" stroke-width="0.25"/>`,
        );
        break;
      }
      case "ellipse":
        if (c.length >= 5) {
          parts.push(
            `<ellipse cx="${c[0]}" cy="${yFlip(c[1])}" rx="${c[2]}" ry="${c[3]}" fill="none" stroke="#222" stroke-width="0.25" transform="rotate(${(-c[4] * 180) / Math.PI} ${c[0]} ${yFlip(c[1])})"/>`,
          );
        }
        break;
      case "polygon": {
        const pts = coordsToPointString(c, yFlip);
        if (c.length < 2) {
          break;
        }
        const closed = e.properties?.closed !== false;
        if (closed) {
          parts.push(
            `<polygon points="${escapeAttr(pts)}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        } else {
          parts.push(
            `<polyline points="${escapeAttr(pts)}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        }
        break;
      }
      case "polyline": {
        const pts = coordsToPointString(c, yFlip);
        if (c.length < 2) {
          break;
        }
        if (e.closed) {
          parts.push(
            `<polygon points="${escapeAttr(pts)}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        } else {
          parts.push(
            `<polyline points="${escapeAttr(pts)}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        }
        break;
      }
      case "spline":
      case "leader":
      case "multileader": {
        const pts = coordsToPointString(c, yFlip);
        if (c.length >= 2) {
          parts.push(
            `<polyline points="${escapeAttr(pts)}" fill="none" stroke="#222" stroke-width="0.25"/>`,
          );
        }
        break;
      }
      case "text":
      case "mtext":
      case "symbol":
      case "dimension":
      case "table":
      case "viewport":
        if (c.length >= 2) {
          const label =
            typeof e.properties?.subtype === "string"
              ? e.properties.subtype
              : e.type;
          parts.push(
            `<text x="${c[0]}" y="${yFlip(c[1])}" font-size="4" fill="#444">${escapeAttr(String(label))}</text>`,
          );
        }
        break;
      default:
        break;
    }
  }

  const inner = parts.join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox} ${oy} ${w} ${h}">\n  ${inner}\n</svg>`;
}
