import type { Entity2D, NewEntity2D } from "../core/types.js";

type GeoJsonGeometry =
  | { type: "Point"; coordinates: number[] }
  | { type: "MultiPoint"; coordinates: number[][] }
  | { type: "LineString"; coordinates: number[][] }
  | { type: "MultiLineString"; coordinates: number[][][] }
  | { type: "Polygon"; coordinates: number[][][] }
  | { type: "MultiPolygon"; coordinates: number[][][][] };

type GeoJsonFeature = {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry: GeoJsonGeometry | null;
};

type GeoJsonFeatureCollection = {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
};

function flattenCoords(points: number[][]): number[] {
  return points.flatMap((point) => [point[0] ?? 0, point[1] ?? 0]);
}

function toProperties(feature: GeoJsonFeature): Record<string, unknown> {
  return {
    ...(feature.properties ?? {}),
    source: "geojson",
    geoJsonId: feature.id,
  };
}

function lineEntity(
  coords: number[][],
  properties: Record<string, unknown>,
  id?: string | number,
): NewEntity2D | null {
  if (coords.length < 2) {
    return null;
  }
  if (coords.length === 2) {
    return {
      id: id === undefined ? undefined : String(id),
      type: "line",
      coords: [coords[0][0], coords[0][1], coords[1][0], coords[1][1]],
      properties,
    };
  }
  return {
    id: id === undefined ? undefined : String(id),
    type: "polyline",
    coords: flattenCoords(coords),
    closed: false,
    properties,
  } as NewEntity2D;
}

function polygonEntity(
  coords: number[][][],
  properties: Record<string, unknown>,
  id?: string | number,
): NewEntity2D | null {
  const ring = coords[0];
  if (!ring || ring.length < 3) {
    return null;
  }
  const deduped =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1]
      ? ring.slice(0, -1)
      : ring;
  return {
    id: id === undefined ? undefined : String(id),
    type: "polygon",
    coords: flattenCoords(deduped),
    properties: {
      ...properties,
      closed: true,
      holeCount: Math.max(0, coords.length - 1),
    },
  };
}

function featureToEntities(feature: GeoJsonFeature): NewEntity2D[] {
  if (!feature.geometry) {
    return [];
  }
  const properties = toProperties(feature);
  switch (feature.geometry.type) {
    case "Point":
      return [
        {
          id: feature.id === undefined ? undefined : String(feature.id),
          type: "point",
          coords: [feature.geometry.coordinates[0], feature.geometry.coordinates[1]],
          properties,
        },
      ];
    case "MultiPoint":
      return feature.geometry.coordinates.map((coords, index) => ({
        id:
          feature.id === undefined
            ? undefined
            : `${String(feature.id)}:${index + 1}`,
        type: "point",
        coords: [coords[0], coords[1]],
        properties,
      }));
    case "LineString": {
      const entity = lineEntity(feature.geometry.coordinates, properties, feature.id);
      return entity ? [entity] : [];
    }
    case "MultiLineString":
      return feature.geometry.coordinates.flatMap((coords, index) => {
        const entity = lineEntity(coords, properties, feature.id ?? index + 1);
        return entity ? [entity] : [];
      });
    case "Polygon": {
      const entity = polygonEntity(feature.geometry.coordinates, properties, feature.id);
      return entity ? [entity] : [];
    }
    case "MultiPolygon":
      return feature.geometry.coordinates.flatMap((coords, index) => {
        const entity = polygonEntity(coords, properties, feature.id ?? index + 1);
        return entity ? [entity] : [];
      });
    default:
      return [];
  }
}

export function parseGeoJsonObjectToEntities(
  raw: GeoJsonFeatureCollection | GeoJsonFeature,
): NewEntity2D[] {
  if (raw.type === "FeatureCollection") {
    return raw.features.flatMap(featureToEntities);
  }
  if (raw.type === "Feature") {
    return featureToEntities(raw);
  }
  throw new Error("GeoJSON root must be a Feature or FeatureCollection");
}

export function parseGeoJsonToEntities(text: string): NewEntity2D[] {
  return parseGeoJsonObjectToEntities(
    JSON.parse(text) as GeoJsonFeatureCollection | GeoJsonFeature,
  );
}

function polygonFromRectangle(entity: Entity2D): number[][] {
  const [x, y, width, height] = entity.coords;
  return [
    [x, y],
    [x + width, y],
    [x + width, y + height],
    [x, y + height],
    [x, y],
  ];
}

export function exportEntitiesToGeoJson(
  entities: readonly Entity2D[],
): GeoJsonFeatureCollection {
  const features: GeoJsonFeature[] = [];
  entities.forEach((entity) => {
    const properties = { ...(entity.properties ?? {}), layer: entity.layer };
    switch (entity.type) {
      case "point":
        features.push({
          type: "Feature",
          id: entity.id,
          properties,
          geometry: {
            type: "Point",
            coordinates: [entity.coords[0], entity.coords[1]],
          },
        });
        return;
      case "line":
        features.push({
          type: "Feature",
          id: entity.id,
          properties,
          geometry: {
            type: "LineString",
            coordinates: [
              [entity.coords[0], entity.coords[1]],
              [entity.coords[2], entity.coords[3]],
            ],
          },
        });
        return;
      case "polyline":
        features.push({
          type: "Feature",
          id: entity.id,
          properties,
          geometry: {
            type: "LineString",
            coordinates: entity.coords.reduce<number[][]>((out, value, index) => {
              if (index % 2 === 0) {
                out.push([value, entity.coords[index + 1] ?? 0]);
              }
                return out;
              }, []),
          },
        });
        return;
      case "polygon":
        features.push({
          type: "Feature",
          id: entity.id,
          properties,
          geometry: {
            type: "Polygon",
            coordinates: [[
              ...entity.coords.reduce<number[][]>((out, value, index) => {
                if (index % 2 === 0) {
                  out.push([value, entity.coords[index + 1] ?? 0]);
                }
                return out;
              }, []),
                [entity.coords[0], entity.coords[1]],
            ]],
          },
        });
        return;
      case "rectangle":
        features.push({
          type: "Feature",
          id: entity.id,
          properties,
          geometry: {
            type: "Polygon",
            coordinates: [polygonFromRectangle(entity)],
          },
        });
        return;
      default:
        return;
    }
  });

  return { type: "FeatureCollection", features };
}
