export type BoundingBox3D = {
  min: [number, number, number];
  max: [number, number, number];
};

/**
 * Envelope of the positive-volume difference of two axis-aligned boxes.
 * This is a bounding-box approximation for general solids, not an OCCT Boolean.
 * An empty result uses the left minimum for both corners.
 */
export function subtractBoundingBox(left: BoundingBox3D, right: BoundingBox3D): BoundingBox3D {
  const axes = [0, 1, 2] as const;
  const result: BoundingBox3D = { min: [...left.min], max: [...left.max] };
  const disjoint = axes.some((axis) =>
    right.max[axis] <= left.min[axis] || right.min[axis] >= left.max[axis],
  );
  if (disjoint) return result;

  const coversAxis = (axis: number): boolean =>
    right.min[axis] <= left.min[axis] && right.max[axis] >= left.max[axis];
  if (axes.every(coversAxis)) {
    return { min: [...left.min], max: [...left.min] };
  }

  for (const axis of axes) {
    // A face only disappears if the cutter spans both other dimensions.
    // Interior holes, corner cuts and disconnected remainders keep their
    // original outer extent; selecting just the largest fragment loses data.
    if (!axes.every((other) => other === axis || coversAxis(other))) continue;
    if (right.min[axis] <= left.min[axis]) {
      result.min[axis] = right.max[axis];
    } else if (right.max[axis] >= left.max[axis]) {
      result.max[axis] = right.min[axis];
    }
  }
  return result;
}
