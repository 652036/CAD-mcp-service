import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SceneGraph } from "../core/SceneGraph.js";
import {
  blocksLibraryPlaceholder,
  materialsLibraryPlaceholder,
} from "./libraries.js";
import { SERVER_VERSION } from "../version.js";

function jsonResourceBody(data: unknown): string {
  return JSON.stringify(data, null, 0);
}

export function registerResources(server: McpServer, sceneGraph: SceneGraph): void {
  server.registerResource(
    "cad-project-current",
    "cad://project/current",
    {
      title: "Current project",
      description: "Project metadata and server version (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody({
            ...sceneGraph.getProjectMetadata(),
            version: SERVER_VERSION,
          }),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-entities-list",
    "cad://entities/list",
    {
      title: "Entities list",
      description: "All entities in the current scene (JSON array)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody([...sceneGraph.listEntities()]),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-layers-list",
    "cad://layers/list",
    {
      title: "Layers list",
      description: "Layer definitions for the current scene (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody([...sceneGraph.listLayers()]),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-preview-current",
    "cad://preview/current",
    {
      title: "Current preview",
      description: "Raster/SVG preview hint for the active view",
      mimeType: "text/plain",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "text/plain",
          text: "use render_preview_svg tool",
        },
      ],
    }),
  );

  server.registerResource(
    "cad-parametrics-variables",
    "cad://parametrics/variables",
    {
      title: "Parametric variables",
      description: "Named parameters driving the model (JSON object)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody({}),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-blocks-library",
    "cad://blocks/library",
    {
      title: "Block library",
      description: "Static block catalog placeholder (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(blocksLibraryPlaceholder),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-materials-library",
    "cad://materials/library",
    {
      title: "Materials library",
      description: "Static materials catalog placeholder (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(materialsLibraryPlaceholder),
        },
      ],
    }),
  );
}
