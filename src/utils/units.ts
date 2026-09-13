export type LengthUnit = "mm" | "cm" | "m" | "inch" | "ft";

const MM_PER_UNIT: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  inch: 25.4,
  ft: 304.8,
};

/** Converts a length from the given unit to millimeters. */
export function toMm(value: number, unit: LengthUnit): number {
  return value * MM_PER_UNIT[unit];
}
