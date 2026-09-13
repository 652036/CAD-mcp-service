import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { readDrawingTemplate } from "../resources/templates.js";
import { mcpJson } from "./mcpJson.js";

const pointSchema = z.object({ x: z.number(), y: z.number() });

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function ensureLayer(session: CadSession, layer?: string): string {
  const name = layer && layer !== "" ? layer : "map_layout";
  if (!session.sceneGraph.getLayers().has(name)) {
    session.sceneGraph.createLayer(name, { color: "#666666" });
  }
  return name;
}

export const MAP_DRAWING_TOOL_NAMES = [
  "create_map_layout",
  "apply_thesis_template",
  "add_north_arrow",
  "add_scale_bar",
  "add_legend",
  "add_coordinate_grid",
  "batch_generate_svg",
  "batch_generate_pdf",
] as const;

function minimalPdf(text: string): string {
  const safe = text.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
  return `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${stream.length} >> stream
${stream}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
xref
0 6
0000000000 65535 f 
0000000010 00000 n 
0000000060 00000 n 
0000000117 00000 n 
0000000243 00000 n 
0000000337 00000 n 
trailer << /Size 6 /Root 1 0 R >>
startxref
407
%%EOF`;
}

function renderDrawingSummarySvg(
  session: CadSession,
  drawingId: string,
): string {
  const drawing = session.drawingManager.getDrawing(drawingId);
  if (!drawing) {
    throw new Error(`Drawing not found: ${drawingId}`);
  }
  const svg = session.renderer.renderSvg(session.sceneGraph.listEntities());
  const summary = [
    `Drawing: ${drawing.name}`,
    `Template: ${drawing.template ?? "none"}`,
    `Sheet: ${drawing.sheetSize ?? "unspecified"}`,
    `Views: ${drawing.views.length}`,
    `Annotations: ${drawing.annotations.length}`,
  ].join(" | ");
  return svg.replace(
    "</svg>",
    `<text x="4" y="12" font-size="6" fill="#444">${summary}</text></svg>`,
  );
}

export function registerMapDrawingTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "create_map_layout",
    {
      description:
        "Create a map-oriented drawing layout using current project extent and drawing scale metadata.",
      inputSchema: {
        name: z.string().min(1),
        sheet_size: z.string().default("A3"),
        template: z.string().optional(),
        margin: z.number().positive().optional(),
      },
    },
    async (args) => {
      try {
        const drawing = session.drawingManager.createDrawing(
          args.name,
          args.template ?? "resource-map",
        );
        const withSheet = session.drawingManager.setSheetSize(
          drawing.id,
          args.sheet_size,
        );
        const georef = session.sceneGraph.getGeoReference();
        const viewport = session.drawingManager.addView(
          drawing.id,
          "scene",
          "map_layout",
          georef.drawingScale ?? 1,
          [args.margin ?? 20, args.margin ?? 20],
          {
            extent: georef.extent,
            crs: georef.crs,
            margin: args.margin ?? 20,
          },
        );
        return mcpJson({
          success: true,
          data: {
            drawing: withSheet,
            viewport,
            georef,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "apply_thesis_template",
    {
      description:
        "Apply a stored thesis/map template to an existing drawing and persist layout/export metadata.",
      inputSchema: {
        drawing_id: z.string().min(1),
        template_name: z.string().min(1),
        title: z.string().optional(),
        figure_no: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const template = await readDrawingTemplate(args.template_name);
        session.drawingManager.setTemplate(args.drawing_id, args.template_name);
        const drawing = session.drawingManager.setLayoutOptions(args.drawing_id, {
          template,
          title: args.title,
          figureNo: args.figure_no,
        });
        session.drawingManager.setExportOptions(args.drawing_id, {
          preferredFormat: "svg",
          templateName: args.template_name,
        });
        return mcpJson({ success: true, data: { drawing, template } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "add_north_arrow",
    {
      description: "Add a north arrow symbol annotation for a map drawing.",
      inputSchema: {
        drawing_id: z.string().min(1),
        position: pointSchema,
        size: z.number().positive().optional(),
        layer: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const layer = ensureLayer(session, args.layer);
        const symbolId = session.sceneGraph.addEntity({
          type: "symbol",
          coords: [args.position.x, args.position.y, args.size ?? 10],
          layer,
          properties: { kind: "north_arrow", size: args.size ?? 10 },
        });
        const textId = session.sceneGraph.addEntity({
          type: "text",
          coords: [args.position.x, args.position.y + (args.size ?? 10) + 3],
          layer,
          properties: { content: "N", kind: "north_arrow_label" },
        });
        session.drawingManager.addAnnotation(args.drawing_id, symbolId);
        session.drawingManager.addAnnotation(args.drawing_id, textId);
        return mcpJson({ success: true, entity_ids: [symbolId, textId] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "add_scale_bar",
    {
      description: "Add a simple scale bar annotation to a map drawing.",
      inputSchema: {
        drawing_id: z.string().min(1),
        position: pointSchema,
        segment_length: z.number().positive(),
        segments: z.number().int().positive().max(12).optional(),
        label: z.string().optional(),
        layer: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const layer = ensureLayer(session, args.layer);
        const segments = args.segments ?? 4;
        const ids: string[] = [];
        for (let i = 0; i < segments; i++) {
          const x0 = args.position.x + i * args.segment_length;
          const x1 = x0 + args.segment_length;
          ids.push(
            session.sceneGraph.createLine([x0, args.position.y, x1, args.position.y], {
              layer,
              properties: { kind: "scale_bar_segment", segmentIndex: i },
            }),
          );
        }
        const labelId = session.sceneGraph.addEntity({
          type: "text",
          coords: [args.position.x, args.position.y - 4],
          layer,
          properties: {
            kind: "scale_bar_label",
            content:
              args.label ??
              `${segments * args.segment_length} units`,
          },
        });
        ids.push(labelId);
        ids.forEach((id) => session.drawingManager.addAnnotation(args.drawing_id, id));
        return mcpJson({ success: true, entity_ids: ids });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "add_legend",
    {
      description: "Add a simple map legend annotation listing domain layers or categories.",
      inputSchema: {
        drawing_id: z.string().min(1),
        position: pointSchema,
        title: z.string().optional(),
        items: z.array(z.string()).min(1),
        layer: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const layer = ensureLayer(session, args.layer);
        const id = session.sceneGraph.addEntity({
          type: "mtext",
          coords: [args.position.x, args.position.y],
          layer,
          properties: {
            kind: "legend",
            content: [args.title ?? "Legend", ...args.items].join("\n"),
            items: args.items,
          },
        });
        session.drawingManager.addAnnotation(args.drawing_id, id);
        return mcpJson({ success: true, entity_ids: [id] });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "add_coordinate_grid",
    {
      description: "Add a coordinate grid using the provided extent and spacing.",
      inputSchema: {
        drawing_id: z.string().min(1),
        extent: z
          .object({
            minX: z.number(),
            minY: z.number(),
            maxX: z.number(),
            maxY: z.number(),
          })
          .optional(),
        spacing: z.number().positive(),
        layer: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const layer = ensureLayer(session, args.layer);
        const extent = args.extent ?? session.sceneGraph.getGeoReference().extent;
        if (!extent) {
          return mcpJson({ success: false, error: "An extent is required to generate a coordinate grid" });
        }
        const ids: string[] = [];
        for (let x = extent.minX; x <= extent.maxX; x += args.spacing) {
          ids.push(
            session.sceneGraph.createLine([x, extent.minY, x, extent.maxY], {
              layer,
              properties: { kind: "coordinate_grid", axis: "x" },
            }),
          );
        }
        for (let y = extent.minY; y <= extent.maxY; y += args.spacing) {
          ids.push(
            session.sceneGraph.createLine([extent.minX, y, extent.maxX, y], {
              layer,
              properties: { kind: "coordinate_grid", axis: "y" },
            }),
          );
        }
        ids.forEach((id) => session.drawingManager.addAnnotation(args.drawing_id, id));
        return mcpJson({ success: true, entity_ids: ids, data: { count: ids.length } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "batch_generate_svg",
    {
      description:
        "Generate SVG files for one or more drawings and write them into an output directory.",
      inputSchema: {
        drawing_ids: z.array(z.string()).min(1),
        output_dir: z.string().min(1),
      },
    },
    async (args) => {
      try {
        await mkdir(args.output_dir, { recursive: true });
        const files: string[] = [];
        for (const drawingId of args.drawing_ids) {
          const drawing = session.drawingManager.getDrawing(drawingId);
          if (!drawing) {
            throw new Error(`Drawing not found: ${drawingId}`);
          }
          const filename = `${drawing.name.replace(/[^a-z0-9_-]+/gi, "_") || drawing.id}.svg`;
          const filePath = path.join(args.output_dir, filename);
          await writeFile(filePath, renderDrawingSummarySvg(session, drawingId), "utf8");
          files.push(filePath);
        }
        return mcpJson({ success: true, data: { files, count: files.length } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "batch_generate_pdf",
    {
      description:
        "Generate summary PDF files for one or more drawings and write them into an output directory.",
      inputSchema: {
        drawing_ids: z.array(z.string()).min(1),
        output_dir: z.string().min(1),
      },
    },
    async (args) => {
      try {
        await mkdir(args.output_dir, { recursive: true });
        const files: string[] = [];
        for (const drawingId of args.drawing_ids) {
          const drawing = session.drawingManager.getDrawing(drawingId);
          if (!drawing) {
            throw new Error(`Drawing not found: ${drawingId}`);
          }
          const filename = `${drawing.name.replace(/[^a-z0-9_-]+/gi, "_") || drawing.id}.pdf`;
          const filePath = path.join(args.output_dir, filename);
          const summary = [
            drawing.name,
            drawing.template ?? "no-template",
            drawing.sheetSize ?? "no-sheet",
            `views:${drawing.views.length}`,
            `annotations:${drawing.annotations.length}`,
          ].join(" | ");
          await writeFile(filePath, minimalPdf(summary), "utf8");
          files.push(filePath);
        }
        return mcpJson({ success: true, data: { files, count: files.length } });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
