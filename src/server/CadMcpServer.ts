import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../prompts/register.js";
import { registerResources } from "../resources/register.js";
import { registerTools } from "../tools/register.js";
import { SceneGraph } from "../core/SceneGraph.js";

export async function createCadMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    { name: "cad-mcp-server", version: "0.1.0" },
    {},
  );
  const sceneGraph = new SceneGraph();
  registerTools(server, sceneGraph);
  registerResources(server, sceneGraph);
  registerPrompts(server);
  return server;
}
