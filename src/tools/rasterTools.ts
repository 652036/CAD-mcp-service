import { readFile, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fromArrayBuffer } from "geotiff";
import sharp from "sharp";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

type GeoTiffSummary = {
  path: string;
  width: number;
  height: number;
  samplesPerPixel: number;
  bitsPerSample?: number;
  sampleFormat?: number;
  bbox: { minX: number; minY: number; maxX: number; maxY: number };
  origin?: [number, number];
  resolution?: [number, number];
  crs?: { code?: string; epsg?: number; description?: string };
};

async function loadGeoTiffSummary(filePath: string): Promise<GeoTiffSummary> {
  const stats = await stat(filePath).catch(() => null);
  if (!stats) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buf = await readFile(filePath);
  // node Buffer is a Uint8Array view; geotiff needs an ArrayBuffer.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tiff = await fromArrayBuffer(ab as ArrayBuffer);
  const image = await tiff.getImage();

  const width = image.getWidth();
  const height = image.getHeight();
  const samplesPerPixel = image.getSamplesPerPixel();
  const fd = image.fileDirectory as unknown as Record<string, unknown>;
  const bitsPerSample = (fd.BitsPerSample as number[] | undefined)?.[0];
  const sampleFormat = (fd.SampleFormat as number[] | undefined)?.[0];

  let origin: [number, number] | undefined;
  let resolution: [number, number] | undefined;
  let bbox: GeoTiffSummary["bbox"];
  try {
    const o = image.getOrigin();
    const r = image.getResolution();
    origin = [o[0], o[1]];
    resolution = [r[0], r[1]];
    const minX = origin[0];
    const maxY = origin[1];
    const maxX = minX + resolution[0] * width;
    const minY = maxY + resolution[1] * height;
    bbox = {
      minX: Math.min(minX, maxX),
      minY: Math.min(minY, maxY),
      maxX: Math.max(minX, maxX),
      maxY: Math.max(minY, maxY),
    };
  } catch {
    bbox = { minX: 0, minY: 0, maxX: width, maxY: height };
  }

  // Extract CRS metadata from GeoKeyDirectoryTag if present (best-effort).
  let crs: GeoTiffSummary["crs"] | undefined;
  const geoKeys = image.getGeoKeys?.() as Record<string, unknown> | undefined;
  if (geoKeys) {
    const projected = geoKeys.ProjectedCSTypeGeoKey as number | undefined;
    const geographic = geoKeys.GeographicTypeGeoKey as number | undefined;
    const epsg = projected ?? geographic;
    if (epsg) {
      crs = { code: `EPSG:${epsg}`, epsg };
    }
    const citation =
      (geoKeys.PCSCitationGeoKey as string | undefined) ??
      (geoKeys.GTCitationGeoKey as string | undefined);
    if (citation) {
      crs = { ...(crs ?? {}), description: citation };
    }
  }

  return {
    path: filePath,
    width,
    height,
    samplesPerPixel,
    bitsPerSample,
    sampleFormat,
    bbox,
    origin,
    resolution,
    crs,
  };
}

async function decodeGeoTiffToPng(
  filePath: string,
  options: { maxWidth?: number; maxHeight?: number } = {},
): Promise<{ pngBuffer: Buffer; width: number; height: number }> {
  const buf = await readFile(filePath);
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const tiff = await fromArrayBuffer(ab as ArrayBuffer);
  const image = await tiff.getImage();
  const fullW = image.getWidth();
  const fullH = image.getHeight();
  const maxW = options.maxWidth ?? 1024;
  const maxH = options.maxHeight ?? 1024;
  const scale = Math.min(maxW / fullW, maxH / fullH, 1);
  const outW = Math.max(1, Math.floor(fullW * scale));
  const outH = Math.max(1, Math.floor(fullH * scale));

  const raster = (await image.readRasters({
    width: outW,
    height: outH,
    interleave: false,
  })) as unknown as ArrayLike<number>[] & { width: number; height: number };

  const samplesPerPixel = image.getSamplesPerPixel();
  const pixelCount = outW * outH;
  // Normalise to 8-bit RGB by stretching min/max per channel (works for both 8-bit
  // colour imagery and single-band DEMs/indices).
  const rgb = new Uint8Array(pixelCount * 3);
  const channelCount = Math.min(samplesPerPixel, 3);

  const stretch = (band: ArrayLike<number>) => {
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < band.length; i += 1) {
      const v = band[i];
      if (Number.isFinite(v)) {
        if (v < min) min = v;
        if (v > max) max = v;
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) {
      return (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    }
    const range = max - min;
    return (v: number) => Math.max(0, Math.min(255, Math.round(((v - min) / range) * 255)));
  };

  if (channelCount >= 3) {
    const stretches = [0, 1, 2].map((c) => stretch(raster[c]));
    for (let i = 0; i < pixelCount; i += 1) {
      rgb[i * 3 + 0] = stretches[0](raster[0][i]);
      rgb[i * 3 + 1] = stretches[1](raster[1][i]);
      rgb[i * 3 + 2] = stretches[2](raster[2][i]);
    }
  } else {
    const single = stretch(raster[0]);
    for (let i = 0; i < pixelCount; i += 1) {
      const v = single(raster[0][i]);
      rgb[i * 3 + 0] = v;
      rgb[i * 3 + 1] = v;
      rgb[i * 3 + 2] = v;
    }
  }

  const pngBuffer = await sharp(rgb, {
    raw: { width: outW, height: outH, channels: 3 },
  })
    .png()
    .toBuffer();
  return { pngBuffer, width: outW, height: outH };
}

export const RASTER_TOOL_NAMES = [
  "import_geotiff_metadata",
  "attach_raster_layer",
  "list_raster_layers",
  "get_raster_layer",
  "remove_raster_layer",
  "set_raster_layer_visible",
  "rename_raster_layer",
  "render_raster_layer_png",
] as const;

export function registerRasterTools(server: McpServer, session: CadSession): void {
  server.registerTool(
    "import_geotiff_metadata",
    {
      description:
        "Read a GeoTIFF file and return width / height / sample format / bbox / origin / resolution / CRS without attaching it to the session. Use attach_raster_layer to keep it as a session basemap.",
      inputSchema: {
        path: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const summary = await loadGeoTiffSummary(args.path);
        return mcpJson({ success: true, data: summary });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "attach_raster_layer",
    {
      description:
        "Attach a GeoTIFF on disk to the session as a raster basemap layer. Returns the assigned layer id and parsed metadata. Use list_raster_layers / render_raster_layer_png afterwards.",
      inputSchema: {
        path: z.string().min(1),
        name: z.string().optional(),
        id: z.string().optional(),
        visible: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        const summary = await loadGeoTiffSummary(args.path);
        const layer = session.rasterStore.attach({
          name: args.name ?? path.basename(args.path),
          path: args.path,
          width: summary.width,
          height: summary.height,
          samplesPerPixel: summary.samplesPerPixel,
          bitsPerSample: summary.bitsPerSample,
          sampleFormat: summary.sampleFormat,
          bbox: summary.bbox,
          origin: summary.origin,
          resolution: summary.resolution,
          crs: summary.crs,
          id: args.id,
          visible: args.visible,
        });
        return mcpJson({ success: true, data: layer });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_raster_layers",
    {
      description: "List all raster (basemap) layers attached to the session.",
      inputSchema: {},
    },
    async () => {
      const layers = session.rasterStore.list();
      return mcpJson({
        success: true,
        data: { layers, count: layers.length },
      });
    },
  );

  server.registerTool(
    "get_raster_layer",
    {
      description: "Return one raster layer record by id.",
      inputSchema: { id: z.string().min(1) },
    },
    async (args) => {
      const layer = session.rasterStore.get(args.id);
      if (!layer) {
        return mcpJson({ success: false, error: `Raster layer not found: ${args.id}` });
      }
      return mcpJson({ success: true, data: layer });
    },
  );

  server.registerTool(
    "remove_raster_layer",
    {
      description: "Remove a raster layer by id.",
      inputSchema: { id: z.string().min(1) },
    },
    async (args) => {
      const ok = session.rasterStore.remove(args.id);
      if (!ok) {
        return mcpJson({ success: false, error: `Raster layer not found: ${args.id}` });
      }
      return mcpJson({ success: true, data: { removed: args.id } });
    },
  );

  server.registerTool(
    "set_raster_layer_visible",
    {
      description: "Toggle a raster layer's visibility flag.",
      inputSchema: {
        id: z.string().min(1),
        visible: z.boolean(),
      },
    },
    async (args) => {
      try {
        const layer = session.rasterStore.setVisible(args.id, args.visible);
        return mcpJson({ success: true, data: layer });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "rename_raster_layer",
    {
      description: "Rename a raster layer for human reference.",
      inputSchema: {
        id: z.string().min(1),
        name: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const layer = session.rasterStore.rename(args.id, args.name);
        return mcpJson({ success: true, data: layer });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "render_raster_layer_png",
    {
      description:
        "Decode an attached raster layer (or a GeoTIFF on disk) into a PNG preview. Single-band rasters are auto-stretched to grayscale; multi-band rasters use the first three bands. Returns base64 PNG bytes; pass `output_path` to also write to disk.",
      inputSchema: {
        id: z.string().optional(),
        path: z.string().optional(),
        max_width: z.number().int().positive().optional(),
        max_height: z.number().int().positive().optional(),
        output_path: z.string().optional(),
      },
    },
    async (args) => {
      try {
        let filePath = args.path;
        if (!filePath && args.id) {
          const layer = session.rasterStore.get(args.id);
          if (!layer) {
            return mcpJson({ success: false, error: `Raster layer not found: ${args.id}` });
          }
          filePath = layer.path;
        }
        if (!filePath) {
          return mcpJson({ success: false, error: "Either `id` or `path` is required" });
        }
        const { pngBuffer, width, height } = await decodeGeoTiffToPng(filePath, {
          maxWidth: args.max_width,
          maxHeight: args.max_height,
        });
        if (args.output_path) {
          await writeFile(args.output_path, pngBuffer);
        }
        return mcpJson({
          success: true,
          data: {
            mimeType: "image/png",
            png_base64: pngBuffer.toString("base64"),
            byte_length: pngBuffer.byteLength,
            width,
            height,
            output_path: args.output_path,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
