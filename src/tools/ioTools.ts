import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity } from "../core/types.js";
import { exportStepLikeContent, parseStepLikeContent } from "../parsers/StepParser.js";
import { exportStlLikeContent, parseStlLikeContent } from "../parsers/StlParser.js";
import { importDxfToSceneData } from "../parsers/dxfImport.js";
import { exportDxfFromEntities } from "../parsers/DxfParser.js";
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
  "dwg_tools_status",
] as const;

type DwgToolBinaries = {
  dwg2dxf?: string;
  dxf2dwg?: string;
};

async function detectDwgTools(): Promise<DwgToolBinaries> {
  const out: DwgToolBinaries = {};
  for (const name of ["dwg2dxf", "dxf2dwg"] as const) {
    const found = await new Promise<string | undefined>((resolve) => {
      const proc = spawn("which", [name]);
      let buf = "";
      proc.stdout.on("data", (chunk) => (buf += chunk.toString()));
      proc.on("close", (code) => {
        const line = buf.trim().split(/\s+/).filter(Boolean)[0];
        resolve(code === 0 && line ? line : undefined);
      });
      proc.on("error", () => resolve(undefined));
    });
    if (found) out[name] = found;
  }
  return out;
}

async function runConverter(
  binary: string,
  inputPath: string,
  outputPath: string,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(binary, ["-o", outputPath, inputPath]);
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (chunk) => (stdout += chunk.toString()));
    proc.stderr.on("data", (chunk) => (stderr += chunk.toString()));
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `${path.basename(binary)} exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
          ),
        );
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

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
      description:
        "Import DWG by piping through LibreDWG's `dwg2dxf`. Provide either `path` (DWG on disk) or base64 `content`. Falls back with an error if `dwg2dxf` is not installed (run `dwg_tools_status` to check).",
      inputSchema: {
        path: z.string().optional(),
        content: z.string().optional(),
        encoding: z.enum(["utf8", "base64"]).optional(),
      },
    },
    async (args) => {
      const tools = await detectDwgTools();
      if (!tools.dwg2dxf) {
        return mcpJson({
          success: false,
          error:
            "dwg2dxf binary not found on PATH. Install LibreDWG (e.g. `apt install libredwg-tools` on distros that ship it, or build from https://github.com/LibreDWG/libredwg) and try again.",
        });
      }

      let dwgPath = args.path;
      let scratch: string | undefined;
      try {
        if (!dwgPath) {
          if (!args.content) {
            throw new Error("Either `path` or base64 `content` is required.");
          }
          if ((args.encoding ?? "base64") !== "base64") {
            throw new Error("DWG payloads must be supplied as base64 `content`.");
          }
          scratch = await mkdtemp(path.join(tmpdir(), "dwg-import-"));
          dwgPath = path.join(scratch, "input.dwg");
          await writeFile(dwgPath, Buffer.from(args.content, "base64"));
        }

        const dxfDir = scratch ?? (await mkdtemp(path.join(tmpdir(), "dwg-import-")));
        if (!scratch) scratch = dxfDir;
        const dxfPath = path.join(dxfDir, "out.dxf");
        await runConverter(tools.dwg2dxf, dwgPath, dxfPath);
        const dxfText = await readFile(dxfPath, "utf8");

        const result = importDxfToSceneData(dxfText);
        if (!result.success) {
          return mcpJson({
            success: false,
            error: result.error ?? "DXF parse failed after DWG conversion",
            data: { skippedTypes: result.skippedTypes },
          });
        }
        for (const name of result.layerNames) {
          try {
            session.sceneGraph.createLayer(name, {});
          } catch {
            /* duplicate */
          }
        }
        const ids: string[] = [];
        for (const ent of result.newEntities) {
          ids.push(session.sceneGraph.addEntity(ent));
        }
        return mcpJson({
          success: true,
          entity_ids: ids,
          warnings: result.warnings.length ? result.warnings : undefined,
          data: { imported: result.imported, skippedTypes: result.skippedTypes },
        });
      } catch (err) {
        return toolError(err);
      } finally {
        if (scratch) {
          await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    },
  );

  server.registerTool(
    "export_dwg",
    {
      description:
        "Export the current 2D scene to DWG by writing a DXF and converting via LibreDWG's `dxf2dwg`. Returns base64 DWG bytes; pass `path` to also write to disk. Run `dwg_tools_status` to confirm `dxf2dwg` is installed.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
        path: z.string().optional(),
      },
    },
    async (args) => {
      const tools = await detectDwgTools();
      if (!tools.dxf2dwg) {
        return mcpJson({
          success: false,
          error:
            "dxf2dwg binary not found on PATH. Install LibreDWG (e.g. `apt install libredwg-tools` on distros that ship it, or build from https://github.com/LibreDWG/libredwg) and try again.",
        });
      }

      let scratch: string | undefined;
      try {
        const list = collectEntities(session, args.entity_ids).filter(is2dEntity);
        const dxfText = exportDxfFromEntities(list);
        scratch = await mkdtemp(path.join(tmpdir(), "dwg-export-"));
        const dxfPath = path.join(scratch, "in.dxf");
        const dwgPath = path.join(scratch, "out.dwg");
        await writeFile(dxfPath, dxfText, "utf8");
        await runConverter(tools.dxf2dwg, dxfPath, dwgPath);
        const dwgBytes = await readFile(dwgPath);
        if (args.path) {
          await writeFile(args.path, dwgBytes);
        }
        return mcpJson({
          success: true,
          data: {
            dwg_base64: dwgBytes.toString("base64"),
            byte_length: dwgBytes.byteLength,
            entity_count: list.length,
            path: args.path,
          },
        });
      } catch (err) {
        return toolError(err);
      } finally {
        if (scratch) {
          await rm(scratch, { recursive: true, force: true }).catch(() => undefined);
        }
      }
    },
  );

  server.registerTool(
    "dwg_tools_status",
    {
      description:
        "Report whether LibreDWG's `dwg2dxf` / `dxf2dwg` binaries are available on PATH so import_dwg / export_dwg can actually convert. Returns the resolved binary paths when present.",
      inputSchema: {},
    },
    async () => {
      const tools = await detectDwgTools();
      const available = Boolean(tools.dwg2dxf && tools.dxf2dwg);
      return mcpJson({
        success: true,
        data: {
          available,
          dwg2dxf: tools.dwg2dxf ?? null,
          dxf2dwg: tools.dxf2dwg ?? null,
          install_hint: available
            ? undefined
            : "Install LibreDWG: `apt install libredwg-tools` (where available) or build from https://github.com/LibreDWG/libredwg",
        },
      });
    },
  );
}
