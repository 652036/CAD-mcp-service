import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { AutoCadComBridge } from "../integrations/AutoCadComBridge.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return { ...mcpJson({ success: false, error: msg }), isError: true };
}

export const AUTOCAD_TOOL_NAMES = [
  "autocad_status",
  "autocad_list_documents",
  "autocad_attach",
  "autocad_detach",
  "autocad_activate_document",
  "autocad_get_variables",
  "autocad_list_layers",
  "autocad_list_modelspace_entities",
  "autocad_send_command",
] as const;

type AutoCadToolsBridge = Pick<
  AutoCadComBridge,
  | "getStatus"
  | "listDocuments"
  | "attach"
  | "detach"
  | "activateDocument"
  | "getVariables"
  | "listLayers"
  | "listModelSpaceEntities"
  | "sendCommand"
>;

const documentSchema = z.string().trim().min(1).max(4096);

export function registerAutoCadTools(
  server: McpServer,
  bridge: AutoCadToolsBridge = new AutoCadComBridge(),
): void {
  server.registerTool(
    "autocad_status",
    {
      description:
        "Inspect a running AutoCAD application through COM: window/process identity, current binding, active document and idle state. This does not establish a persistent binding or operate on the internal CAD session.",
      inputSchema: {},
    },
    async () => {
      try {
        const data = await bridge.getStatus();
        return mcpJson({ success: true, data });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_list_documents",
    {
      description:
        "List COM-reachable AutoCAD applications and their open documents. Returns data.applications and data.documents with window/process identity for target selection. COM may not expose every same-version AutoCAD process.",
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJson({ success: true, data: await bridge.listDocuments() });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_attach",
    {
      description:
        "Bind this MCP server to a COM-reachable AutoCAD application window/process and document. Use a decimal windowHandle and document name/full path returned by status/list calls; omit them to select the current target. activate defaults to true and activates the selected document; false only establishes the binding without activating it. Later commands reject if the bound document is no longer active. COM may not expose every same-version AutoCAD process.",
      inputSchema: {
        windowHandle: z.string().regex(/^[0-9]{1,20}$/).optional(),
        document: documentSchema.optional(),
        activate: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        return mcpJson({ success: true, data: await bridge.attach(args) });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_detach",
    {
      description:
        "Clear this MCP server's AutoCAD binding. Does not close AutoCAD, close a document, or discard drawing changes.",
      inputSchema: {},
    },
    async () => {
      try {
        return mcpJson({ success: true, data: await bridge.detach() });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_activate_document",
    {
      description:
        "Activate an already-open AutoCAD document by its exact name or full path and update the binding to that document. Does not open files. Use autocad_list_documents to identify the target.",
      inputSchema: { document: documentSchema },
    },
    async (args) => {
      try {
        return mcpJson({
          success: true,
          data: await bridge.activateDocument(args.document),
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_get_variables",
    {
      description:
        "Read 1–50 AutoCAD system variables from the live document, for example CMDACTIVE, CMDNAMES, CLAYER or INSUNITS. Use readback to verify command effects; an idle state alone does not prove command success.",
      inputSchema: {
        names: z
          .array(z.string().trim().min(1).max(64).regex(/^[A-Za-z][A-Za-z0-9_]*$/))
          .min(1)
          .max(50),
      },
    },
    async (args) => {
      try {
        return mcpJson({ success: true, data: await bridge.getVariables(args.names) });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_list_layers",
    {
      description:
        "List layers from the live AutoCAD document through COM, respecting the current application/document binding. Separate from the internal CAD session's list_layers.",
      inputSchema: {
        limit: z.number().int().positive().max(500).optional(),
      },
    },
    async (args) => {
      try {
        const layers = await bridge.listLayers(args.limit);
        return mcpJson({
          success: true,
          data: {
            layers,
            count: layers.length,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_list_modelspace_entities",
    {
      description:
        "List entities from the live AutoCAD document's ModelSpace, respecting the current binding. Optional filters: layer, objectName, limit. Separate from the internal CAD session's list_entities.",
      inputSchema: {
        limit: z.number().int().positive().max(1000).optional(),
        layer: z.string().trim().min(1).max(255).optional(),
        objectName: z.string().trim().min(1).max(256).optional(),
      },
    },
    async (args) => {
      try {
        const entities = await bridge.listModelSpaceEntities({
          limit: args.limit,
          layer: args.layer,
          objectName: args.objectName,
        });
        return mcpJson({
          success: true,
          data: {
            entities,
            count: entities.length,
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "autocad_send_command",
    {
      description:
        "Submit a raw command to the live AutoCAD document. Rejects a busy document or a bound document that is no longer active. Example: `_.ZOOM _E`. waitForIdle defaults to false; true polls for idle for timeoutMs (1000–30000 ms) after the COM SendCommand call returns. A separate 45-second bridge timeout bounds blocking COM calls. Result state is submitted, idle_observed or timeout; none proves semantic command success. timeout is an MCP error with result data. Query intended results afterward. Submission is not retried; after an error or timeout do not resend before inspecting the drawing.",
      inputSchema: {
        command: z.string().min(1).max(16000).refine((value) => value.trim().length > 0),
        waitForIdle: z.boolean().optional(),
        timeoutMs: z.number().int().min(1000).max(30000).optional(),
      },
    },
    async (args) => {
      try {
        const data = await bridge.sendCommand(args.command, {
          waitForIdle: args.waitForIdle,
          timeoutMs: args.timeoutMs,
        });
        if (data.state === "timeout") {
          return {
            ...mcpJson({
              success: false,
              data,
              error:
                "AUTOCAD_IDLE_TIMEOUT: The command was submitted, but idle was not observed before the polling deadline. Do not resend the command before inspecting the drawing and command state; it may still be running or may already have changed the document.",
            }),
            isError: true,
          };
        }
        return mcpJson({ success: true, data });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
