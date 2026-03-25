declare module "shapefile" {
  export function read(
    shp: string,
    dbf?: string,
    options?: { encoding?: string; highWaterMark?: number },
  ): Promise<unknown>;
}

declare module "shp-write" {
  type WriteResult = {
    shp: DataView;
    shx: DataView;
    dbf: DataView;
    prj?: string;
  };

  type ZipOptions = {
    folder?: string;
    types?: {
      point?: string;
      polygon?: string;
      line?: string;
    };
  };

  type ShpWrite = {
    write: (
      data: Array<Record<string, unknown>>,
      geometryType: string,
      geometries: unknown[],
      callback: (err: unknown, result: WriteResult) => void,
    ) => void;
    zip: (geojson: unknown, options?: ZipOptions) => ArrayBuffer | Uint8Array;
  };

  const shpwrite: ShpWrite;
  export const write: ShpWrite["write"];
  export const zip: ShpWrite["zip"];
  export default shpwrite;
}
