import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerPrompts } from "../prompts/register.js";
import { registerResources } from "../resources/register.js";
import { registerTools } from "../tools/register.js";
import { CadSession } from "../session/index.js";
import { SERVER_VERSION } from "../version.js";

export async function createCadMcpServer(): Promise<McpServer> {
  const server = new McpServer(
    { name: "cad-mcp-server", version: SERVER_VERSION },
    {},
  );
  const session = new CadSession();
  registerTools(server, session);
  registerResources(server, session);
  registerPrompts(server);
  return server;
}
