import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const ASSEMBLY_TOOL_NAMES = [
  "create_assembly",
  "add_component",
  "remove_component",
  "mate_coincident",
  "mate_concentric",
  "mate_distance",
  "mate_angle",
  "mate_parallel",
  "set_component_flexible",
  "create_exploded_view",
  "add_explode_step",
  "animate_explode",
] as const;

export function registerAssemblyTools(
  server: McpServer,
  session: CadSession,
): void {
  const assemblies = session.assemblyManager;

  server.registerTool(
    "create_assembly",
    {
      description: "Create an empty assembly.",
      inputSchema: { name: z.string().min(1) },
    },
    async (args) => mcpJson({ success: true, data: { assembly: assemblies.createAssembly(args.name) } }),
  );

  server.registerTool(
    "add_component",
    {
      description: "Add a component reference to an assembly.",
      inputSchema: {
        assembly_id: z.string().min(1),
        file_path_or_id: z.string().min(1),
        position: z.tuple([z.number(), z.number(), z.number()]),
        rotation: z.tuple([z.number(), z.number(), z.number()]).optional(),
      },
    },
    async (args) => {
      try {
        const component = assemblies.addComponent(
          args.assembly_id,
          args.file_path_or_id,
          args.position,
          args.rotation ?? [0, 0, 0],
        );
        return mcpJson({ success: true, data: { component } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "remove_component",
    {
      description: "Remove a component instance from an assembly.",
      inputSchema: {
        assembly_id: z.string().min(1),
        instance_id: z.string().min(1),
      },
    },
    async (args) => {
      try {
        return mcpJson({
          success: assemblies.removeComponent(args.assembly_id, args.instance_id),
          data: { instance_id: args.instance_id },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const registerMate = (name: string, type: string, valueKey?: string) => {
    server.registerTool(
      name,
      {
        description: `Create a ${type} mate between two references.`,
        inputSchema: {
          assembly_id: z.string().min(1),
          a: z.string().optional(),
          b: z.string().optional(),
          face_a: z.string().optional(),
          face_b: z.string().optional(),
          axis_a: z.string().optional(),
          axis_b: z.string().optional(),
          [valueKey ?? "value"]: z.number().optional(),
        },
      },
      async (args) => {
        try {
          const left = args.a ?? args.face_a ?? args.axis_a;
          const right = args.b ?? args.face_b ?? args.axis_b;
          if (!left || !right) {
            return mcpJson({ success: false, error: "Two mate references are required" });
          }
          const mate = assemblies.addMate(
            args.assembly_id,
            type,
            left,
            right,
            valueKey ? (args[valueKey] as number | undefined) : undefined,
          );
          return mcpJson({ success: true, data: { mate } });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerMate("mate_coincident", "coincident");
  registerMate("mate_concentric", "concentric");
  registerMate("mate_distance", "distance", "distance");
  registerMate("mate_angle", "angle", "angle");
  registerMate("mate_parallel", "parallel");

  server.registerTool(
    "set_component_flexible",
    {
      description: "Mark a component as flexible or rigid.",
      inputSchema: {
        assembly_id: z.string().min(1),
        instance_id: z.string().min(1),
        flexible: z.boolean(),
      },
    },
    async (args) => {
      try {
        const component = assemblies.setComponentFlexible(
          args.assembly_id,
          args.instance_id,
          args.flexible,
        );
        return mcpJson({ success: true, data: { component } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_exploded_view",
    {
      description: "Create an exploded view definition for an assembly.",
      inputSchema: { assembly_id: z.string().min(1), name: z.string().min(1) },
    },
    async (args) => {
      try {
        return mcpJson({
          success: true,
          data: { view: assemblies.createExplodedView(args.assembly_id, args.name) },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "add_explode_step",
    {
      description: "Add an explode step to an exploded view.",
      inputSchema: {
        assembly_id: z.string().min(1),
        view_id: z.string().min(1),
        component_ids: z.array(z.string()).min(1),
        direction: z.tuple([z.number(), z.number(), z.number()]),
        distance: z.number().positive(),
      },
    },
    async (args) => {
      try {
        return mcpJson({
          success: true,
          data: {
            view: assemblies.addExplodeStep(
              args.assembly_id,
              args.view_id,
              args.component_ids,
              args.direction,
              args.distance,
            ),
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "animate_explode",
    {
      description: "Return a simple explode animation plan.",
      inputSchema: {
        assembly_id: z.string().min(1),
        view_id: z.string().min(1),
        fps: z.number().int().positive().optional(),
      },
    },
    async (args) => {
      try {
        const assembly = assemblies.getAssembly(args.assembly_id);
        if (!assembly) {
          return mcpJson({ success: false, error: `Assembly not found: ${args.assembly_id}` });
        }
        const view = assembly.explodedViews.find((item) => item.id === args.view_id);
        if (!view) {
          return mcpJson({ success: false, error: `Exploded view not found: ${args.view_id}` });
        }
        return mcpJson({
          success: true,
          data: {
            fps: args.fps ?? 24,
            keyframes: view.steps.map((step, index) => ({
              frame: index,
              component_ids: step.componentIds,
              direction: step.direction,
              distance: step.distance,
            })),
          },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );
}
