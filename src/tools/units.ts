/** Input unit → millimetres (internal storage). */
export type LengthUnit = "mm" | "cm" | "m" | "in";

const TO_MM: Record<LengthUnit, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  in: 25.4,
};

export function toMillimetres(value: number, unit: LengthUnit = "mm"): number {
  return value * TO_MM[unit];
}
