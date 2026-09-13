import { z } from "zod";

/** 2D point in drawing units (e.g. mm). */
export const point2Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
});

/** 3D point in drawing units. */
export const point3Schema = z.object({
  x: z.number().finite(),
  y: z.number().finite(),
  z: z.number().finite(),
});

/** `[x, y]` coordinate pair. */
export const coord2TupleSchema = z.tuple([z.number().finite(), z.number().finite()]);

/** `[x, y, z]` coordinate triple. */
export const coord3TupleSchema = z.tuple([
  z.number().finite(),
  z.number().finite(),
  z.number().finite(),
]);

export type Point2 = z.infer<typeof point2Schema>;
export type Point3 = z.infer<typeof point3Schema>;
