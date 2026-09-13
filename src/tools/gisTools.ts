import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import proj4 from "proj4";
import type { CadSession } from "../session/index.js";
import {
  normalizeProjectCrs,
  normalizeProjectExtent,
  normalizeProjectOrigin,
  transformBetweenLocalAndWorld,
} from "../utils/crs.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

// Pre-register a few CRSes commonly used in resource/environment workflows in CN
// (proj4js ships EPSG:4326 and EPSG:3857 by default; the ones below cover
//  CGCS2000, Beijing 1954, Xian 1980 and the Mercator variants used for tiles).
proj4.defs([
  // CGCS2000 (geodetic and Mercator-tile compatible)
  ["EPSG:4490", "+proj=longlat +ellps=GRS80 +no_defs +type=crs"],
  ["EPSG:4479", "+proj=geocent +ellps=GRS80 +units=m +no_defs +type=crs"],
  // Pseudo-Mercator (web tiles)
  ["EPSG:3857", "+proj=merc +a=6378137 +b=6378137 +lat_ts=0 +lon_0=0 +x_0=0 +y_0=0 +k=1 +units=m +nadgrids=@null +wktext +no_defs +type=crs"],
  // CGCS2000 / 3-degree Gauss-Kruger zones 25..45 (covers mainland CN)
  ["EPSG:4513", "+proj=tmerc +lat_0=0 +lon_0=75 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4514", "+proj=tmerc +lat_0=0 +lon_0=78 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4515", "+proj=tmerc +lat_0=0 +lon_0=81 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4516", "+proj=tmerc +lat_0=0 +lon_0=84 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4517", "+proj=tmerc +lat_0=0 +lon_0=87 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4518", "+proj=tmerc +lat_0=0 +lon_0=90 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4519", "+proj=tmerc +lat_0=0 +lon_0=93 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4520", "+proj=tmerc +lat_0=0 +lon_0=96 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4521", "+proj=tmerc +lat_0=0 +lon_0=99 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4522", "+proj=tmerc +lat_0=0 +lon_0=102 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4523", "+proj=tmerc +lat_0=0 +lon_0=105 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4524", "+proj=tmerc +lat_0=0 +lon_0=108 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4525", "+proj=tmerc +lat_0=0 +lon_0=111 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4526", "+proj=tmerc +lat_0=0 +lon_0=114 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4527", "+proj=tmerc +lat_0=0 +lon_0=117 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4528", "+proj=tmerc +lat_0=0 +lon_0=120 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4529", "+proj=tmerc +lat_0=0 +lon_0=123 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4530", "+proj=tmerc +lat_0=0 +lon_0=126 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4531", "+proj=tmerc +lat_0=0 +lon_0=129 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4532", "+proj=tmerc +lat_0=0 +lon_0=132 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
  ["EPSG:4533", "+proj=tmerc +lat_0=0 +lon_0=135 +k=1 +x_0=500000 +y_0=0 +ellps=GRS80 +units=m +no_defs +type=crs"],
]);

function normalizeCrsKey(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) return `EPSG:${trimmed}`;
  return trimmed.toUpperCase().startsWith("EPSG:")
    ? `EPSG:${trimmed.slice(5).trim()}`
    : trimmed;
}

export const GIS_TOOL_NAMES = [
  "set_project_crs",
  "get_project_crs",
  "set_map_extent",
  "set_drawing_scale",
  "transform_coords",
  "reproject_point",
  "reproject_points",
  "register_crs_definition",
  "list_known_crs",
] as const;

export function registerGisTools(server: McpServer, session: CadSession): void {
  server.registerTool(
    "set_project_crs",
    {
      description:
        "Set project CRS and optional origin metadata for resource/environment mapping workflows.",
      inputSchema: {
        code: z.string().optional(),
        name: z.string().optional(),
        wkt: z.string().optional(),
        units: z.string().optional(),
        origin: z
          .object({
            x: z.number(),
            y: z.number(),
            z: z.number().optional(),
          })
          .optional(),
      },
    },
    async (args) => {
      try {
        const current = session.sceneGraph.getGeoReference();
        session.sceneGraph.setGeoReference({
          ...current,
          crs: normalizeProjectCrs(args),
          origin: args.origin
            ? normalizeProjectOrigin(args.origin)
            : current.origin,
        });
        return mcpJson({
          success: true,
          data: session.sceneGraph.getGeoReference(),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_project_crs",
    {
      description: "Return current project georeferencing metadata.",
      inputSchema: {},
    },
    async () =>
      mcpJson({
        success: true,
        data: session.sceneGraph.getGeoReference(),
      }),
  );

  server.registerTool(
    "set_map_extent",
    {
      description:
        "Set the current map extent used for paper layout, grids, and exports.",
      inputSchema: {
        minX: z.number(),
        minY: z.number(),
        maxX: z.number(),
        maxY: z.number(),
      },
    },
    async (args) => {
      try {
        const current = session.sceneGraph.getGeoReference();
        session.sceneGraph.setGeoReference({
          ...current,
          extent: normalizeProjectExtent(args),
        });
        return mcpJson({
          success: true,
          data: session.sceneGraph.getGeoReference(),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "set_drawing_scale",
    {
      description:
        "Set a drawing scale factor between local drawing units and world coordinates.",
      inputSchema: {
        scale: z.number().positive(),
      },
    },
    async (args) => {
      try {
        const current = session.sceneGraph.getGeoReference();
        session.sceneGraph.setGeoReference({
          ...current,
          drawingScale: args.scale,
        });
        return mcpJson({
          success: true,
          data: session.sceneGraph.getGeoReference(),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "transform_coords",
    {
      description:
        "Transform coordinates between local drawing space and world space using project origin and drawing scale.",
      inputSchema: {
        point: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number().optional(),
        }),
        direction: z.enum(["local_to_world", "world_to_local"]),
      },
    },
    async (args) => {
      try {
        return mcpJson({
          success: true,
          data: {
            point: transformBetweenLocalAndWorld(
              args.point,
              session.sceneGraph.getGeoReference(),
              args.direction,
            ),
            georef: session.sceneGraph.getGeoReference(),
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "reproject_point",
    {
      description:
        "Reproject a single point between two CRSes using proj4. `from`/`to` accept EPSG codes (e.g. 'EPSG:4326', '4326') or full proj4 strings. Common CN CRSes (EPSG:4326/3857/4490/4513-4533) are pre-registered.",
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        point: z.object({
          x: z.number(),
          y: z.number(),
          z: z.number().optional(),
        }),
      },
    },
    async (args) => {
      try {
        const from = normalizeCrsKey(args.from);
        const to = normalizeCrsKey(args.to);
        const [x, y] = proj4(from, to, [args.point.x, args.point.y]);
        return mcpJson({
          success: true,
          data: {
            point: { x, y, z: args.point.z },
            from,
            to,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "reproject_points",
    {
      description:
        "Reproject many points between two CRSes in one call. Same `from`/`to` semantics as reproject_point.",
      inputSchema: {
        from: z.string().min(1),
        to: z.string().min(1),
        points: z
          .array(
            z.object({
              x: z.number(),
              y: z.number(),
              z: z.number().optional(),
            }),
          )
          .min(1),
      },
    },
    async (args) => {
      try {
        const from = normalizeCrsKey(args.from);
        const to = normalizeCrsKey(args.to);
        const out = args.points.map((p) => {
          const [x, y] = proj4(from, to, [p.x, p.y]);
          return { x, y, z: p.z };
        });
        return mcpJson({
          success: true,
          data: { points: out, count: out.length, from, to },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "register_crs_definition",
    {
      description:
        "Register an EPSG-style CRS definition with proj4 so future reprojection tools can use it. `code` should be like 'EPSG:4548' and `definition` is a proj4 string.",
      inputSchema: {
        code: z.string().min(1),
        definition: z.string().min(1),
      },
    },
    async (args) => {
      try {
        const key = normalizeCrsKey(args.code);
        proj4.defs(key, args.definition);
        return mcpJson({
          success: true,
          data: { code: key, definition: args.definition },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_known_crs",
    {
      description:
        "List CRS codes currently registered with proj4 in this session (pre-registered defaults plus any added via register_crs_definition).",
      inputSchema: {},
    },
    async () => {
      try {
        const defs = (proj4 as unknown as { defs: { [k: string]: unknown } }).defs;
        const codes = Object.keys(defs).filter((k) => k !== "self");
        return mcpJson({
          success: true,
          data: { codes, count: codes.length },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
