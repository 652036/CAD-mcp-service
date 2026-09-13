import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createCadMcpServer } from "./server/CadMcpServer.js";

async function main(): Promise<void> {
  const server = await createCadMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
