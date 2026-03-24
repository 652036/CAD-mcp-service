import { writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

const pointSchema = z.object({ x: z.number(), y: z.number() });

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function minimalPdf(text: string): string {
  const safe = text.replace(/[()\\]/g, "");
  const stream = `BT /F1 12 Tf 72 720 Td (${safe}) Tj ET`;
  const pdf = `%PDF-1.4
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
  return pdf;
}

export const DRAWING_TOOL_NAMES = [
  "create_viewport",
  "set_view_standard",
  "set_visual_style",
  "create_drawing",
  "add_view",
  "add_section_view",
  "add_detail_view",
  "add_auxiliary_view",
  "update_drawing_views",
  "render_preview",
  "generate_pdf",
  "generate_svg",
] as const;

export function registerDrawingTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "create_viewport",
    {
      description: "Create a viewport entity.",
      inputSchema: { name: z.string(), view_type: z.string() },
    },
    async (args) =>
      mcpJson({
        success: true,
        entity_ids: [
          session.sceneGraph.addEntity({
            type: "viewport",
            coords: [0, 0, 100, 100],
            properties: { name: args.name, viewType: args.view_type },
          } as never),
        ],
      }),
  );

  server.registerTool(
    "set_view_standard",
    {
      description: "Store active drawing standard in parameter state.",
      inputSchema: { view_name: z.string() },
    },
    async (args) => {
      session.parametricEngine.setParameter("view_standard", args.view_name);
      return mcpJson({ success: true });
    },
  );

  server.registerTool(
    "set_visual_style",
    {
      description: "Store active visual style in parameter state.",
      inputSchema: { style: z.string() },
    },
    async (args) => {
      session.parametricEngine.setParameter("visual_style", args.style);
      return mcpJson({ success: true });
    },
  );

  server.registerTool(
    "create_drawing",
    {
      description: "Create a drawing sheet.",
      inputSchema: { name: z.string(), template: z.string().optional() },
    },
    async (args) =>
      mcpJson({
        success: true,
        data: { drawing: session.drawingManager.createDrawing(args.name, args.template) },
      }),
  );

  const registerView = (
    name: string,
    buildOptions: (args: Record<string, unknown>) => Record<string, unknown>,
  ) => {
    server.registerTool(
      name,
      {
        description: `Add a ${name} to a drawing.`,
        inputSchema: {
          drawing_id: z.string().min(1),
          solid_id: z.string().optional(),
          parent_view_id: z.string().optional(),
          view_type: z.string().optional(),
          scale: z.number().optional(),
          position: pointSchema.optional(),
          cut_line: z.array(pointSchema).optional(),
          center: pointSchema.optional(),
          direction: z.string().optional(),
        },
      },
      async (args) => {
        try {
          const view = session.drawingManager.addView(
            args.drawing_id,
            args.solid_id ?? args.parent_view_id ?? "scene",
            args.view_type ?? name,
            args.scale ?? 1,
            [args.position?.x ?? 0, args.position?.y ?? 0],
            buildOptions(args as Record<string, unknown>),
          );
          return mcpJson({ success: true, data: { view } });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerView("add_view", (args) => ({ viewType: args.view_type }));
  registerView("add_section_view", (args) => ({ cutLine: args.cut_line }));
  registerView("add_detail_view", (args) => ({ center: args.center }));
  registerView("add_auxiliary_view", (args) => ({ direction: args.direction }));

  server.registerTool(
    "update_drawing_views",
    {
      description: "Return current drawing state after a logical refresh.",
      inputSchema: { drawing_id: z.string().min(1) },
    },
    async (args) => {
      const drawing = session.drawingManager.getDrawing(args.drawing_id);
      if (!drawing) {
        return mcpJson({ success: false, error: `Drawing not found: ${args.drawing_id}` });
      }
      return mcpJson({ success: true, data: { drawing } });
    },
  );

  server.registerTool(
    "render_preview",
    {
      description: "Render current scene or selected entities to a base64 image payload.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
        view: z.string().optional(),
        width: z.number().int().positive().optional(),
        height: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      const set = args.entity_ids?.length ? new Set(args.entity_ids) : null;
      const entities = session.sceneGraph
        .listEntities()
        .filter((entity) => (set ? set.has(entity.id) : true));
      const preview = await session.renderer.renderImagePreview(
        entities,
        args.width ?? 512,
        args.height ?? 512,
      );
      return mcpJson({
        success: true,
        data: {
          ...preview,
          view: args.view ?? "isometric",
          width: args.width ?? 512,
          height: args.height ?? 512,
        },
      });
    },
  );

  server.registerTool(
    "generate_pdf",
    {
      description: "Generate a minimal PDF summary for a drawing.",
      inputSchema: {
        drawing_id: z.string().min(1),
        paper_size: z.string(),
        scale: z.number().optional(),
        path: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const drawing = session.drawingManager.getDrawing(args.drawing_id);
        if (!drawing) {
          return mcpJson({ success: false, error: `Drawing not found: ${args.drawing_id}` });
        }
        const pdf = minimalPdf(`Drawing ${drawing.name} (${args.paper_size})`);
        if (args.path) {
          await writeFile(args.path, pdf, "utf8");
        }
        return mcpJson({
          success: true,
          data: {
            pdf_base64: Buffer.from(pdf, "utf8").toString("base64"),
            path: args.path,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "generate_svg",
    {
      description: "Generate SVG for selected entities or the full scene.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
        viewport: z.string().optional(),
      },
    },
    async (args) => {
      const set = args.entity_ids?.length ? new Set(args.entity_ids) : null;
      const entities = session.sceneGraph
        .listEntities()
        .filter((entity) => (set ? set.has(entity.id) : true));
      const svg = session.renderer.renderSvg(entities);
      return mcpJson({
        success: true,
        data: {
          svg,
          svg_base64: Buffer.from(svg, "utf8").toString("base64"),
          viewport: args.viewport,
        },
      });
    },
  );
}
