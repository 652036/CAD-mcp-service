import type { EntityRecord } from "../../core/SceneGraph.js";

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

function pointString(
  pts: ReadonlyArray<{ x: number; y: number }>,
  yFlip: (y: number) => number,
): string {
  return pts.map((p) => `${p.x},${yFlip(p.y)}`).join(" ");
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

export function computeBBox(entities: readonly EntityRecord[]): BBox | null {
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

  for (const e of entities) {
    switch (e.kind) {
      case "point":
        add(e.x, e.y);
        break;
      case "line":
        add(e.x1, e.y1);
        add(e.x2, e.y2);
        break;
      case "circle":
        add(e.cx - e.radius, e.cy - e.radius);
        add(e.cx + e.radius, e.cy + e.radius);
        break;
      case "arc": {
        const steps = 24;
        const t0 = e.startAngle;
        const t1 = e.endAngle;
        let delta = t1 - t0;
        while (delta <= 0) {
          delta += Math.PI * 2;
        }
        for (let i = 0; i <= steps; i++) {
          const t = t0 + (delta * i) / steps;
          add(e.cx + e.radius * Math.cos(t), e.cy + e.radius * Math.sin(t));
        }
        break;
      }
      case "rectangle":
        add(e.x, e.y);
        add(e.x + e.width, e.y + e.height);
        break;
      case "polygon":
      case "polyline":
        for (const p of e.points) {
          add(p.x, p.y);
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
export function entitiesToSvg(entities: readonly EntityRecord[]): string {
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
    switch (e.kind) {
      case "point": {
        const px = e.x;
        const py = yFlip(e.y);
        parts.push(
          `<circle cx="${px}" cy="${py}" r="1.2" fill="none" stroke="#222" stroke-width="0.3"/>`,
        );
        break;
      }
      case "line":
        parts.push(
          `<line x1="${e.x1}" y1="${yFlip(e.y1)}" x2="${e.x2}" y2="${yFlip(e.y2)}" stroke="#222" stroke-width="0.25" fill="none"/>`,
        );
        break;
      case "circle":
        parts.push(
          `<circle cx="${e.cx}" cy="${yFlip(e.cy)}" r="${e.radius}" fill="none" stroke="#222" stroke-width="0.25"/>`,
        );
        break;
      case "arc":
        parts.push(
          `<path d="${escapeAttr(arcPath(e.cx, e.cy, e.radius, e.startAngle, e.endAngle, yFlip))}" fill="none" stroke="#222" stroke-width="0.25"/>`,
        );
        break;
      case "rectangle": {
        const ry = e.cornerRadius ?? 0;
        parts.push(
          `<rect x="${e.x}" y="${yFlip(e.y + e.height)}" width="${e.width}" height="${e.height}" rx="${ry}" fill="none" stroke="#222" stroke-width="0.25"/>`,
        );
        break;
      }
      case "polygon": {
        const pts = pointString(e.points, yFlip);
        if (e.closed && e.points.length > 0) {
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
        const pts = pointString(e.points, yFlip);
        if (e.closed && e.points.length > 0) {
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
      default:
        break;
    }
  }

  const inner = parts.join("\n  ");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${ox} ${oy} ${w} ${h}">\n  ${inner}\n</svg>`;
}
