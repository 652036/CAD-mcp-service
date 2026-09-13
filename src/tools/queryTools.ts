import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity, Entity2D } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import {
  distance,
  pointsFromCoords,
} from "../utils/math2d.js";
import { computeBBox } from "./preview/svgPreview.js";
import { mcpJson } from "./mcpJson.js";
import { is2dEntity } from "../utils/entityKinds.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function isClosedEntity(entity: Entity2D): boolean {
  if (entity.type === "polygon") {
    return entity.properties?.closed !== false;
  }
  return entity.type === "polyline" && entity.closed === true;
}

function getEntityPropertyValue(entity: Entity, property: string): unknown {
  if (property in entity) {
    return entity[property as keyof Entity];
  }
  return entity.properties?.[property];
}

function valuesMatch(left: unknown, right: unknown): boolean {
  if (
    typeof left === "object" &&
    left !== null &&
    typeof right === "object" &&
    right !== null
  ) {
    return JSON.stringify(left) === JSON.stringify(right);
  }
  return Object.is(left, right);
}

export function getCurveLengthValue(entity: Entity2D): number {
  switch (entity.type) {
    case "point":
      return 0;
    case "line":
      return entity.coords.length >= 4
        ? distance(
            { x: entity.coords[0], y: entity.coords[1] },
            { x: entity.coords[2], y: entity.coords[3] },
          )
        : 0;
    case "circle":
      return entity.coords.length >= 3 ? 2 * Math.PI * entity.coords[2] : 0;
    case "arc": {
      if (entity.coords.length < 5) {
        return 0;
      }
      let delta = entity.coords[4] - entity.coords[3];
      while (delta <= 0) {
        delta += Math.PI * 2;
      }
      return entity.coords[2] * delta;
    }
    case "rectangle":
      return entity.coords.length >= 4
        ? 2 * (Math.abs(entity.coords[2]) + Math.abs(entity.coords[3]))
        : 0;
    case "polygon":
    case "polyline": {
      const points = pointsFromCoords(entity.coords);
      let sum = 0;
      for (let i = 1; i < points.length; i++) {
        sum += distance(points[i - 1], points[i]);
      }
      if (points.length >= 2 && isClosedEntity(entity)) {
        sum += distance(points[points.length - 1], points[0]);
      }
      return sum;
    }
    default:
      return 0;
  }
}

export function patchEntityProperties(
  entity: Entity,
  patch: Record<string, unknown>,
): Entity {
  return {
    ...entity,
    properties: {
      ...(entity.properties ?? {}),
      ...patch,
    },
  };
}

export const QUERY_TOOL_NAMES = [
  "get_entity_type",
  "find_entities_by_layer",
  "find_entities_in_region",
  "find_entities_by_property",
  "get_bounding_box",
  "get_curve_length",
  "set_entity_property",
  "set_entity_color",
  "set_entity_linetype",
  "set_entity_lineweight",
] as const;

export function registerQueryTools(
  server: McpServer,
  session: CadSession,
): void {
  const sceneGraph = session.sceneGraph;

  server.registerTool(
    "get_entity_type",
    {
      description: "Get the entity type string for a specific entity id.",
      inputSchema: {
        entity_id: z.string().min(1),
      },
    },
    async (args) => {
      const entity = sceneGraph.getEntity(args.entity_id);
      if (!entity) {
        return mcpJson({
          success: false,
          error: `Entity not found: ${args.entity_id}`,
        });
      }
      return mcpJson({
        success: true,
        data: {
          entity_id: args.entity_id,
          type: entity.type,
        },
      });
    },
  );

  server.registerTool(
    "find_entities_by_layer",
    {
      description: "Return entities assigned to a specific layer name.",
      inputSchema: {
        layer_name: z.string().min(1),
      },
    },
    async (args) => {
      const entities = sceneGraph
        .listEntities()
        .filter((entity) => entity.layer === args.layer_name);
      return mcpJson({
        success: true,
        entity_ids: entities.map((entity) => entity.id),
        data: {
          entities,
          count: entities.length,
          layer_name: args.layer_name,
        },
      });
    },
  );

  server.registerTool(
    "find_entities_in_region",
    {
      description:
        "Find entities whose bounding boxes intersect the given region.",
      inputSchema: {
        x1: z.number(),
        y1: z.number(),
        x2: z.number(),
        y2: z.number(),
      },
    },
    async (args) => {
      const minX = Math.min(args.x1, args.x2);
      const minY = Math.min(args.y1, args.y2);
      const maxX = Math.max(args.x1, args.x2);
      const maxY = Math.max(args.y1, args.y2);
      const entities = sceneGraph.listEntities().filter((entity) => {
        if (!is2dEntity(entity)) {
          return false;
        }
        const bbox = computeBBox([entity]);
        if (!bbox) {
          return false;
        }
        return !(
          bbox.maxX < minX ||
          bbox.minX > maxX ||
          bbox.maxY < minY ||
          bbox.minY > maxY
        );
      });
      return mcpJson({
        success: true,
        entity_ids: entities.map((entity) => entity.id),
        data: {
          entities,
          count: entities.length,
          region: { minX, minY, maxX, maxY },
        },
      });
    },
  );

  server.registerTool(
    "find_entities_by_property",
    {
      description:
        "Find entities by direct field or property-bag value using exact matching.",
      inputSchema: {
        property: z.string().min(1),
        value: z.unknown(),
      },
    },
    async (args) => {
      const entities = sceneGraph.listEntities().filter((entity) =>
        valuesMatch(getEntityPropertyValue(entity, args.property), args.value),
      );
      return mcpJson({
        success: true,
        entity_ids: entities.map((entity) => entity.id),
        data: {
          entities,
          count: entities.length,
          property: args.property,
          value: args.value,
        },
      });
    },
  );

  server.registerTool(
    "get_bounding_box",
    {
      description:
        "Compute a bounding box for all entities or a selected subset.",
      inputSchema: {
        entity_ids: z.array(z.string()).optional(),
      },
    },
    async (args) => {
      let entities = sceneGraph.listEntities().filter(is2dEntity);
      if (args.entity_ids?.length) {
        const selected = new Set(args.entity_ids);
        entities = entities.filter((entity) => selected.has(entity.id));
      }
      const bbox = computeBBox(entities);
      return mcpJson({
        success: true,
        entity_ids: entities.map((entity) => entity.id),
        data: {
          bbox,
          entity_count: entities.length,
        },
      });
    },
  );

  server.registerTool(
    "get_curve_length",
    {
      description:
        "Measure length or perimeter for a 2D entity in internal millimetres.",
      inputSchema: {
        entity_id: z.string().min(1),
      },
    },
    async (args) => {
      const entity = sceneGraph.getEntity(args.entity_id);
      if (!entity) {
        return mcpJson({
          success: false,
          error: `Entity not found: ${args.entity_id}`,
        });
      }
      if (!is2dEntity(entity)) {
        return mcpJson({
          success: false,
          error: `Curve length is only supported for 2D entities: ${args.entity_id}`,
        });
      }
      return mcpJson({
        success: true,
        data: {
          entity_id: args.entity_id,
          type: entity.type,
          length: getCurveLengthValue(entity),
        },
      });
    },
  );

  server.registerTool(
    "set_entity_property",
    {
      description:
        "Set a mutable entity field (`layer`, `coords`, `closed`, `properties`) or a custom property-bag value. Reserved fields id and type cannot be changed.",
      inputSchema: {
        entity_id: z.string().min(1),
        property: z.string().min(1),
        value: z.unknown(),
      },
    },
    async (args) => {
      try {
        if (args.property === "id" || args.property === "type") {
          return mcpJson({
            success: false,
            error: `Cannot modify reserved field: ${args.property}`,
          });
        }
        const entity = sceneGraph.getEntity(args.entity_id);
        if (!entity) {
          return mcpJson({
            success: false,
            error: `Entity not found: ${args.entity_id}`,
          });
        }
        let next: Entity;
        if (args.property === "layer") {
          const result = sceneGraph.setEntityLayer(
            [args.entity_id],
            String(args.value),
          );
          if (result.missingLayer) {
            return mcpJson({
              success: false,
              error: `Layer not found: ${String(args.value)}`,
            });
          }
          next = sceneGraph.getEntity(args.entity_id)!;
        } else if (args.property === "coords") {
          if (
            !Array.isArray(args.value) ||
            args.value.some((value) => typeof value !== "number")
          ) {
            return mcpJson({
              success: false,
              error: "coords must be an array of numbers",
            });
          }
          next = {
            ...entity,
            coords: [...args.value],
          };
          sceneGraph.replaceEntity(next);
        } else if (args.property === "closed") {
          if (entity.type !== "polyline") {
            return mcpJson({
              success: false,
              error: "closed can only be set on polyline entities",
            });
          }
          if (typeof args.value !== "boolean") {
            return mcpJson({
              success: false,
              error: "closed must be a boolean value",
            });
          }
          next = {
            ...entity,
            closed: args.value,
          };
          sceneGraph.replaceEntity(next);
        } else if (args.property === "properties") {
          if (
            args.value === null ||
            typeof args.value !== "object" ||
            Array.isArray(args.value)
          ) {
            return mcpJson({
              success: false,
              error: "properties must be an object",
            });
          }
          next = {
            ...entity,
            properties: args.value as Record<string, unknown>,
          };
          sceneGraph.replaceEntity(next);
        } else {
          next = patchEntityProperties(entity, { [args.property]: args.value });
          sceneGraph.replaceEntity(next);
        }
        return mcpJson({
          success: true,
          entity_ids: [args.entity_id],
          data: { entity: next },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  const registerBatchPropertyTool = (
    name: string,
    property: "color" | "linetype" | "lineweight",
  ): void => {
    server.registerTool(
      name,
      {
        description: `Set entity ${property} display metadata on one or more entities.`,
        inputSchema: {
          entity_ids: z.array(z.string()).min(1),
          [property]:
            property === "lineweight" ? z.number() : z.string().min(1),
        },
      },
      async (args) => {
        try {
          const updated: Entity[] = [];
          const notFound: string[] = [];
          for (const id of args.entity_ids) {
            const entity = sceneGraph.getEntity(id);
            if (!entity) {
              notFound.push(id);
              continue;
            }
            updated.push(
              patchEntityProperties(entity, { [property]: args[property] }),
            );
          }
          if (updated.length) {
            sceneGraph.replaceEntities(updated);
          }
          return mcpJson({
            success: true,
            entity_ids: updated.map((entity) => entity.id),
            data: {
              updated: updated.map((entity) => entity.id),
              not_found: notFound,
            },
            warnings:
              notFound.length > 0
                ? [`Unknown entity ids: ${notFound.join(", ")}`]
                : undefined,
          });
        } catch (err) {
          return toolError(err);
        }
      },
    );
  };

  registerBatchPropertyTool("set_entity_color", "color");
  registerBatchPropertyTool("set_entity_linetype", "linetype");
  registerBatchPropertyTool("set_entity_lineweight", "lineweight");
}
