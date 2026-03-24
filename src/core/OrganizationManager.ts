import { randomUUID } from "node:crypto";
import type {
  BlockDefinition,
  GroupRecord,
  OrganizationState,
} from "./types.js";

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export class OrganizationManager {
  private readonly blocks = new Map<string, BlockDefinition>();
  private readonly groups = new Map<string, GroupRecord>();

  exportState(): OrganizationState {
    return {
      blocks: Array.from(this.blocks.values()).map(clone),
      groups: Array.from(this.groups.values()).map(clone),
    };
  }

  restoreState(state: OrganizationState): void {
    this.blocks.clear();
    this.groups.clear();
    for (const block of state.blocks) {
      this.blocks.set(block.name, clone(block));
    }
    for (const group of state.groups) {
      this.groups.set(group.id, clone(group));
    }
  }

  createBlock(definition: BlockDefinition): BlockDefinition {
    this.blocks.set(definition.name, clone(definition));
    return clone(definition);
  }

  listBlocks(): BlockDefinition[] {
    return Array.from(this.blocks.values()).map(clone);
  }

  getBlock(name: string): BlockDefinition | undefined {
    const block = this.blocks.get(name);
    return block ? clone(block) : undefined;
  }

  defineAttribute(
    blockName: string,
    tag: string,
    prompt: string,
    defaultValue: string,
  ): BlockDefinition {
    const block = this.blocks.get(blockName);
    if (!block) {
      throw new Error(`Block not found: ${blockName}`);
    }
    const next = clone(block);
    next.attributes = [...(next.attributes ?? []), { tag, prompt, defaultValue }];
    this.blocks.set(blockName, next);
    return clone(next);
  }

  createGroup(entityIds: string[], name?: string): GroupRecord {
    const group: GroupRecord = { id: randomUUID(), name, entityIds: [...entityIds] };
    this.groups.set(group.id, group);
    return clone(group);
  }

  removeGroup(groupId: string): boolean {
    return this.groups.delete(groupId);
  }

  getGroup(groupId: string): GroupRecord | undefined {
    const group = this.groups.get(groupId);
    return group ? clone(group) : undefined;
  }
}
