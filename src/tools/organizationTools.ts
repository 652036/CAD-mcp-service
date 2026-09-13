import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Entity, NewEntity } from "../core/types.js";
import type { CadSession } from "../session/index.js";
import { is2dEntity } from "../utils/entityKinds.js";
import { rotateEntity2D, translateEntity2D } from "./modify2dTools.js";
import { mcpJson } from "./mcpJson.js";

function toolError(err: unknown): ReturnType<typeof mcpJson> {
  const msg = err instanceof Error ? err.message : String(err);
  return mcpJson({ success: false, error: msg });
}

function cloneEntityForBlockInsert(
  entity: Entity,
  position: { x: number; y: number },
  scaleValue: number,
  rotation: number,
): NewEntity {
  if (!is2dEntity(entity)) {
    const { id: _id, ...rest } = entity;
    return {
      ...rest,
      coords: [...entity.coords],
      properties: {
        ...(entity.properties ?? {}),
        insertedAt: position,
        scale: scaleValue,
        rotation,
      },
    } as NewEntity;
  }
  let next = translateEntity2D(entity, position.x, position.y) as NewEntity;
  if (rotation !== 0) {
    next = rotateEntity2D(next as never, position, rotation) as NewEntity;
  }
  if (scaleValue !== 1) {
    next = {
      ...next,
      coords: next.coords.map((value, index) =>
        index % 2 === 0
          ? position.x + (value - position.x) * scaleValue
          : position.y + (value - position.y) * scaleValue,
      ),
      properties: {
        ...(next.properties ?? {}),
        scale: scaleValue,
      },
    } as NewEntity;
  }
  return next;
}

export const ORGANIZATION_TOOL_NAMES = [
  "create_block",
  "insert_block",
  "explode_block",
  "list_blocks",
  "edit_block",
  "define_attribute",
  "create_group",
  "ungroup",
  "select_group",
] as const;

export function registerOrganizationTools(
  server: McpServer,
  session: CadSession,
): void {
  server.registerTool(
    "create_block",
    {
      description: "Create a block definition from entity ids.",
      inputSchema: {
        name: z.string().min(1),
        entities: z.array(z.string()).min(1),
        base_point: z.object({ x: z.number(), y: z.number(), z: z.number().optional() }),
      },
    },
    async (args) => {
      try {
        const block = session.organizationManager.createBlock({
          name: args.name,
          entities: args.entities,
          basePoint: args.base_point,
        });
        return mcpJson({ success: true, data: { block } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "insert_block",
    {
      description: "Insert a block definition by cloning its member entities.",
      inputSchema: {
        block_name: z.string().min(1),
        position: z.object({ x: z.number(), y: z.number() }),
        scale: z.number().positive().optional(),
        rotation: z.number().optional(),
      },
    },
    async (args) => {
      try {
        const block = session.organizationManager.getBlock(args.block_name);
        if (!block) {
          return mcpJson({ success: false, error: `Block not found: ${args.block_name}` });
        }
        const entityIds: string[] = [];
        for (const memberId of block.entities) {
          const entity = session.sceneGraph.getEntity(memberId);
          if (!entity) {
            continue;
          }
          entityIds.push(
            session.sceneGraph.addEntity(
              cloneEntityForBlockInsert(
                entity,
                args.position,
                args.scale ?? 1,
                args.rotation ?? 0,
              ),
            ),
          );
        }
        const group = session.organizationManager.createGroup(
          entityIds,
          `block:${args.block_name}`,
        );
        return mcpJson({
          success: true,
          entity_ids: entityIds,
          data: { group_id: group.id, block_name: args.block_name },
        });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "explode_block",
    {
      description: "Explode an inserted block group back into loose entities.",
      inputSchema: { instance_id: z.string().min(1) },
    },
    async (args) => {
      try {
        const group = session.organizationManager.getGroup(args.instance_id);
        if (!group) {
          return mcpJson({ success: false, error: `Block instance not found: ${args.instance_id}` });
        }
        session.organizationManager.removeGroup(args.instance_id);
        return mcpJson({ success: true, entity_ids: group.entityIds, data: { exploded: args.instance_id } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "list_blocks",
    {
      description: "List block definitions.",
      inputSchema: {},
    },
    async () =>
      mcpJson({
        success: true,
        data: { blocks: session.organizationManager.listBlocks() },
      }),
  );

  server.registerTool(
    "edit_block",
    {
      description: "Return a block definition for editing.",
      inputSchema: { block_name: z.string().min(1) },
    },
    async (args) => {
      const block = session.organizationManager.getBlock(args.block_name);
      if (!block) {
        return mcpJson({ success: false, error: `Block not found: ${args.block_name}` });
      }
      return mcpJson({ success: true, data: { block } });
    },
  );

  server.registerTool(
    "define_attribute",
    {
      description: "Define an attribute on a block definition.",
      inputSchema: {
        block_name: z.string().min(1),
        tag: z.string().min(1),
        prompt: z.string().min(1),
        default_value: z.string(),
      },
    },
    async (args) => {
      try {
        const block = session.organizationManager.defineAttribute(
          args.block_name,
          args.tag,
          args.prompt,
          args.default_value,
        );
        return mcpJson({ success: true, data: { block } });
      } catch (err) {
        return toolError(err);
      }
    },
  );

  server.registerTool(
    "create_group",
    {
      description: "Create a named group from entity ids.",
      inputSchema: { entity_ids: z.array(z.string()).min(1), name: z.string().optional() },
    },
    async (args) =>
      mcpJson({
        success: true,
        data: { group: session.organizationManager.createGroup(args.entity_ids, args.name) },
      }),
  );

  server.registerTool(
    "ungroup",
    {
      description: "Remove a group by id.",
      inputSchema: { group_id: z.string().min(1) },
    },
    async (args) =>
      mcpJson({
        success: session.organizationManager.removeGroup(args.group_id),
        data: { group_id: args.group_id },
      }),
  );

  server.registerTool(
    "select_group",
    {
      description: "Return entities in a group.",
      inputSchema: { group_id: z.string().min(1) },
    },
    async (args) => {
      const group = session.organizationManager.getGroup(args.group_id);
      if (!group) {
        return mcpJson({ success: false, error: `Group not found: ${args.group_id}` });
      }
      return mcpJson({ success: true, entity_ids: group.entityIds, data: { group } });
    },
  );
}
