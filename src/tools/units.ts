/** Input unit → millimetres (internal storage). */
export type LengthUnit = "mm" | "cm" | "m" | "in" | "ft";

const TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
  ft: 304.8,
};

/** Accepts `inch` as an alias for `in` (planning doc naming). */
export function normalizeLengthUnit(
  unit: string | undefined,
): LengthUnit {
  if (unit === undefined || unit === "") return "mm";
  if (unit === "inch") return "in";
  if (unit in TO_MM) return unit as LengthUnit;
  throw new Error(`Unsupported length unit: ${unit}`);
}

export function toMillimetres(value: number, unit: LengthUnit = "mm"): number {
  return value * TO_MM[unit];
}
