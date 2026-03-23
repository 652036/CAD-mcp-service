import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "cad-session-intro",
    {
      description:
        "Starter context for working with the CAD MCP server (placeholder).",
    },
    async () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: "You are connected to the cad-mcp-server. Tools and resources will be added in later iterations.",
          },
        },
      ],
    }),
  );
}
