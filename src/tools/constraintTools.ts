import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { CadSession } from "../session/index.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

export const CONSTRAINT_TOOL_NAMES = [
  "set_parameter",
  "get_parameter",
  "list_parameters",
  "update_parameter",
  "add_constraint_coincident",
  "add_constraint_parallel",
  "add_constraint_perpendicular",
  "add_constraint_tangent",
  "add_constraint_concentric",
  "add_constraint_equal",
  "add_constraint_symmetric",
  "add_constraint_horizontal",
  "add_constraint_vertical",
  "add_constraint_fixed",
  "add_constraint_midpoint",
  "add_dimension_linear",
  "add_dimension_angular",
  "add_dimension_radial",
  "add_dimension_diameter",
] as const;

export function registerConstraintTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "set_parameter",
    {
      description: "Create or replace a named parameter.",
      inputSchema: {
        name: z.string().min(1),
        value: z.union([z.number(), z.string(), z.boolean()]),
        unit: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const parameter = session.parametricEngine.setParameter(
          args.name,
          args.value,
          args.unit,
        );
        return mcpJson({ success: true, data: { parameter } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "get_parameter",
    {
      description: "Get a parameter by name.",
      inputSchema: { name: z.string().min(1) },
    },
    async (args) => {
      const parameter = session.parametricEngine.getParameter(args.name);
      if (!parameter) {
        return mcpJson({ success: false, error: `Parameter not found: ${args.name}` });
      }
      return mcpJson({ success: true, data: { parameter } });
    },
  );

  server.registerTool(
    "list_parameters",
    {
      description: "List all named parameters.",
      inputSchema: {},
    },
    async () =>
      mcpJson({
        success: true,
        data: { parameters: session.parametricEngine.listParameters() },
      }),
  );

  server.registerTool(
    "update_parameter",
    {
      description: "Update an existing parameter value.",
      inputSchema: {
        name: z.string().min(1),
        new_value: z.union([z.number(), z.string(), z.boolean()]),
        unit: z.string().optional(),
      },
    },
    async (args) => {
      try {
        const existing = session.parametricEngine.getParameter(args.name);
        if (!existing) {
          return mcpJson({ success: false, error: `Parameter not found: ${args.name}` });
        }
        const parameter = session.parametricEngine.setParameter(
          args.name,
          args.new_value,
          args.unit ?? existing.unit,
          existing.expression,
        );
        return mcpJson({ success: true, data: { parameter } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const registerConstraint = (
    name: string,
    type: string,
    schema: Record<string, z.ZodTypeAny>,
    entityKeys: string[],
  ) => {
    server.registerTool(
      name,
      {
        description: `Add a ${type} constraint.`,
        inputSchema: schema,
      },
      async (args) => {
        try {
          const entities = entityKeys
            .map((key) => args[key])
            .flatMap((value) => (Array.isArray(value) ? value : [value]))
            .filter((value): value is string => typeof value === "string");
          const record = session.constraintSolver.addConstraint(type, entities, args);
          return mcpJson({ success: true, data: { constraint: record } });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerConstraint(
    "add_constraint_coincident",
    "coincident",
    {
      entity_a: z.string(),
      point_a: z.string(),
      entity_b: z.string(),
      point_b: z.string(),
    },
    ["entity_a", "entity_b"],
  );
  registerConstraint("add_constraint_parallel", "parallel", { line_a: z.string(), line_b: z.string() }, ["line_a", "line_b"]);
  registerConstraint("add_constraint_perpendicular", "perpendicular", { line_a: z.string(), line_b: z.string() }, ["line_a", "line_b"]);
  registerConstraint("add_constraint_tangent", "tangent", { entity_a: z.string(), entity_b: z.string() }, ["entity_a", "entity_b"]);
  registerConstraint("add_constraint_concentric", "concentric", { circle_a: z.string(), circle_b: z.string() }, ["circle_a", "circle_b"]);
  registerConstraint("add_constraint_equal", "equal", { entity_a: z.string(), entity_b: z.string() }, ["entity_a", "entity_b"]);
  registerConstraint("add_constraint_symmetric", "symmetric", { entity_a: z.string(), entity_b: z.string(), axis: z.string() }, ["entity_a", "entity_b", "axis"]);
  registerConstraint("add_constraint_horizontal", "horizontal", { line_id: z.string() }, ["line_id"]);
  registerConstraint("add_constraint_vertical", "vertical", { line_id: z.string() }, ["line_id"]);
  registerConstraint("add_constraint_fixed", "fixed", { entity_id: z.string() }, ["entity_id"]);
  registerConstraint("add_constraint_midpoint", "midpoint", { point_id: z.string(), line_id: z.string() }, ["point_id", "line_id"]);
  registerConstraint("add_dimension_linear", "dimension_linear", { point_a: z.string(), point_b: z.string(), value: z.number(), label: z.string().optional() }, ["point_a", "point_b"]);
  registerConstraint("add_dimension_angular", "dimension_angular", { line_a: z.string(), line_b: z.string(), value: z.number() }, ["line_a", "line_b"]);
  registerConstraint("add_dimension_radial", "dimension_radial", { circle_id: z.string(), value: z.number() }, ["circle_id"]);
  registerConstraint("add_dimension_diameter", "dimension_diameter", { circle_id: z.string(), value: z.number() }, ["circle_id"]);
}
