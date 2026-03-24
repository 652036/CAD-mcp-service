export interface Point2D {
  x: number;
  y: number;
}

export interface Line2D {
  a: Point2D;
  b: Point2D;
}

const EPSILON = 1e-9;

export function point(x: number, y: number): Point2D {
  return { x, y };
}

export function pointsFromCoords(coords: readonly number[]): Point2D[] {
  const pts: Point2D[] = [];
  for (let i = 0; i + 1 < coords.length; i += 2) {
    pts.push({ x: coords[i], y: coords[i + 1] });
  }
  return pts;
}

export function coordsFromPoints(points: readonly Point2D[]): number[] {
  const coords: number[] = [];
  for (const p of points) {
    coords.push(p.x, p.y);
  }
  return coords;
}

export function add(a: Point2D, b: Point2D): Point2D {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub(a: Point2D, b: Point2D): Point2D {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale(a: Point2D, factor: number): Point2D {
  return { x: a.x * factor, y: a.y * factor };
}

export function dot(a: Point2D, b: Point2D): number {
  return a.x * b.x + a.y * b.y;
}

export function cross(a: Point2D, b: Point2D): number {
  return a.x * b.y - a.y * b.x;
}

export function length(v: Point2D): number {
  return Math.hypot(v.x, v.y);
}

export function distance(a: Point2D, b: Point2D): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalize(v: Point2D): Point2D {
  const len = length(v);
  if (len <= EPSILON) {
    throw new Error("Cannot normalize a zero-length vector");
  }
  return { x: v.x / len, y: v.y / len };
}

export function leftNormal(unitVector: Point2D): Point2D {
  return { x: -unitVector.y, y: unitVector.x };
}

export function translatePoint(p: Point2D, dx: number, dy: number): Point2D {
  return { x: p.x + dx, y: p.y + dy };
}

export function rotatePointAround(
  p: Point2D,
  center: Point2D,
  angle: number,
): Point2D {
  const tx = p.x - center.x;
  const ty = p.y - center.y;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return {
    x: center.x + tx * c - ty * s,
    y: center.y + tx * s + ty * c,
  };
}

export function mirrorPointAcrossLine(
  p: Point2D,
  axisStart: Point2D,
  axisEnd: Point2D,
): Point2D {
  const axis = sub(axisEnd, axisStart);
  const unit = normalize(axis);
  const relative = sub(p, axisStart);
  const parallel = dot(relative, unit);
  const projection = add(axisStart, scale(unit, parallel));
  return {
    x: projection.x * 2 - p.x,
    y: projection.y * 2 - p.y,
  };
}

export function signedPolygonArea(points: readonly Point2D[]): number {
  if (points.length < 3) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    sum += a.x * b.y - b.x * a.y;
  }
  return sum / 2;
}

export function lineIntersection(
  first: Line2D,
  second: Line2D,
): Point2D | null {
  const p = first.a;
  const r = sub(first.b, first.a);
  const q = second.a;
  const s = sub(second.b, second.a);
  const rxs = cross(r, s);
  if (Math.abs(rxs) <= EPSILON) {
    return null;
  }
  const t = cross(sub(q, p), s) / rxs;
  return add(p, scale(r, t));
}

export function offsetSegment(
  start: Point2D,
  end: Point2D,
  distanceMm: number,
): Line2D {
  const direction = normalize(sub(end, start));
  const normal = leftNormal(direction);
  const shift = scale(normal, distanceMm);
  return {
    a: add(start, shift),
    b: add(end, shift),
  };
}

export function offsetPolylinePoints(
  points: readonly Point2D[],
  distanceMm: number,
  closed: boolean,
): Point2D[] {
  if (points.length < 2) {
    throw new Error("At least two points are required");
  }

  const segments: Line2D[] = [];
  const segmentCount = closed ? points.length : points.length - 1;
  for (let i = 0; i < segmentCount; i++) {
    const start = points[i];
    const end = points[(i + 1) % points.length];
    if (distance(start, end) <= EPSILON) {
      throw new Error("Offset does not support zero-length segments");
    }
    segments.push(offsetSegment(start, end, distanceMm));
  }

  if (closed) {
    const out: Point2D[] = [];
    for (let i = 0; i < segments.length; i++) {
      const prev = segments[(i - 1 + segments.length) % segments.length];
      const current = segments[i];
      out.push(lineIntersection(prev, current) ?? current.a);
    }
    return out;
  }

  const out: Point2D[] = [segments[0].a];
  for (let i = 1; i < segments.length; i++) {
    out.push(lineIntersection(segments[i - 1], segments[i]) ?? segments[i].a);
  }
  out.push(segments[segments.length - 1].b);
  return out;
}

export function normalizeAngle(angle: number): number {
  let next = angle % (Math.PI * 2);
  if (next < 0) {
    next += Math.PI * 2;
  }
  return next;
}

export function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) <= epsilon;
}
