import { readFile, writeFile } from "node:fs/promises";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity } from "../core/types.js";
import { exportStepLikeContent, parseStepLikeContent } from "../parsers/StepParser.js";
import { exportStlLikeContent, parseStlLikeContent } from "../parsers/StlParser.js";
import type { CadSession } from "../session/index.js";
import { is2dEntity, is3dEntity } from "../utils/entityKinds.js";
import { mcpJson } from "./mcpJson.js";

async function loadInput(args: {
  content?: string;
  path?: string;
  encoding?: "utf8" | "base64";
}): Promise<string> {
  if (args.path) {
    return readFile(args.path, "utf8");
  }
  if (!args.content) {
    throw new Error("Either path or content is required");
  }
  if (args.encoding === "base64") {
    return Buffer.from(args.content, "base64").toString("utf8");
  }
  return args.content;
}

function encodeOutput(
  text: string,
  path?: string,
): Promise<{ content: string; base64: string; path?: string }> {
  const base64 = Buffer.from(text, "utf8").toString("base64");
  if (!path) {
    return Promise.resolve({ content: text, base64 });
  }
  return writeFile(path, text, "utf8").then(() => ({ content: text, base64, path }));
}

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function collectEntities(session: CadSession, ids?: string[]): Entity[] {
  const set = ids?.length ? new Set(ids) : null;
  return session.sceneGraph.listEntities().filter((entity) => (set ? set.has(entity.id) : true));
}

export const IO_TOOL_NAMES = [
  "import_step",
  "import_iges",
  "import_stl",
  "import_obj",
  "import_svg",
  "import_pdf_as_underlay",
  "export_step",
  "export_iges",
  "export_stl",
  "export_obj",
  "export_svg",
  "export_gltf",
  "export_3mf",
  "import_dwg",
  "export_dwg",
] as const;

export function registerIoTools(server: McpServer, session: CadSession): void {
  const inputSchema = {
    content: z.string().optional(),
    path: z.string().optional(),
    encoding: z.enum(["utf8", "base64"]).optional(),
  };

  const registerImport = (
    name: string,
    parser: (text: string) => Array<{ type: string; coords: number[]; properties?: Record<string, unknown> }>,
  ) => {
    server.registerTool(
      name,
      { description: `Import ${name.replace("import_", "").toUpperCase()} content.`, inputSchema },
      async (args) => {
        try {
          const text = await loadInput(args);
          const entities = parser(text);
          const ids = entities.map((entity) => session.sceneGraph.addEntity(entity as never));
          return mcpJson({ success: true, entity_ids: ids, data: { imported: ids.length } });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerImport("import_step", parseStepLikeContent);
  registerImport("import_iges", parseStepLikeContent);
  registerImport("import_stl", parseStlLikeContent);
  registerImport("import_obj", (text) => parseStlLikeContent(text));
  registerImport("import_svg", (text) => [{ type: "mtext", coords: [0, 0], properties: { source: "svg-underlay", svg: text } }]);
  registerImport("import_pdf_as_underlay", (text) => [{ type: "mtext", coords: [0, 0], properties: { source: "pdf-underlay", pdf: text.slice(0, 256) } }]);

  const registerExport = (name: string, encoder: (entities: Entity[]) => string) => {
    server.registerTool(
      name,
      {
        description: `Export entities to ${name.replace("export_", "").toUpperCase()}-like text.`,
        inputSchema: {
          entity_ids: z.array(z.string()).optional(),
          path: z.string().optional(),
        },
      },
      async (args) => {
        try {
          const entities = collectEntities(session, args.entity_ids);
          const text = encoder(entities);
          const out = await encodeOutput(text, args.path);
          return mcpJson({ success: true, data: out });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerExport("export_step", (entities) => exportStepLikeContent(entities.filter(is3dEntity)));
  registerExport("export_iges", (entities) => exportStepLikeContent(entities.filter(is3dEntity)));
  registerExport("export_stl", (entities) => exportStlLikeContent(entities.filter(is3dEntity)));
  registerExport("export_obj", (entities) => entities.map((entity, index) => `o ${entity.type}_${index}\n# ${entity.coords.join(" ")}`).join("\n"));
  registerExport("export_svg", (entities) => session.renderer.renderSvg(entities));
  registerExport("export_gltf", (entities) => JSON.stringify({ asset: { version: "2.0" }, nodes: entities.map((e) => ({ name: e.id, type: e.type })) }, null, 2));
  registerExport("export_3mf", (entities) => JSON.stringify({ model: entities.map((e) => ({ id: e.id, type: e.type, coords: e.coords })) }, null, 2));

  server.registerTool(
    "import_dwg",
    {
      description: "DWG import requires ODA or another external library and is not bundled.",
      inputSchema,
    },
    async () =>
      mcpJson({
        success: false,
        error: "DWG import is not available in this build. It requires an external ODA-compatible converter.",
      }),
  );

  server.registerTool(
    "export_dwg",
    {
      description: "DWG export requires ODA or another external library and is not bundled.",
      inputSchema: { entity_ids: z.array(z.string()).optional(), path: z.string().optional() },
    },
    async () =>
      mcpJson({
        success: false,
        error: "DWG export is not available in this build. It requires an external ODA-compatible converter.",
      }),
  );
}
