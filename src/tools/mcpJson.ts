import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";

export type ToolPayload = {
  success: boolean;
  entity_ids?: string[];
  data?: unknown;
  error?: string;
  warnings?: string[];
};

export function mcpJson(payload: ToolPayload): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}
