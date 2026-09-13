import * as shapefile from "shapefile";
import shpwrite from "shp-write";
import type { Entity2D } from "../core/types.js";
import {
  exportEntitiesToGeoJson,
  parseGeoJsonObjectToEntities,
} from "./GeoJsonParser.js";

type GeoJsonFeatureCollection = ReturnType<typeof exportEntitiesToGeoJson>;

export async function parseShapefileToEntities(paths: {
  shpPath: string;
  dbfPath?: string;
}): Promise<ReturnType<typeof parseGeoJsonObjectToEntities>> {
  const collection = await shapefile.read(paths.shpPath, paths.dbfPath);
  return parseGeoJsonObjectToEntities(
    collection as unknown as Parameters<typeof parseGeoJsonObjectToEntities>[0],
  );
}

export async function exportEntitiesToShapefileZip(
  entities: readonly Entity2D[],
): Promise<Uint8Array> {
  const featureCollection: GeoJsonFeatureCollection = exportEntitiesToGeoJson(entities);
  const zipped = shpwrite.zip(featureCollection as never, {
    folder: "cad-mcp-shapefile",
    types: {
      point: "points",
      polygon: "polygons",
      line: "lines",
    },
  }) as ArrayBuffer | Uint8Array;
  return zipped instanceof Uint8Array ? zipped : new Uint8Array(zipped);
}
