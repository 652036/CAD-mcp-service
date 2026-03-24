import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CadSession } from "../session/index.js";
import {
  ansiStandardResource,
  blocksLibraryPlaceholder,
  dimensionStylesLibrary,
  isoStandardResource,
  linetypesLibrary,
  materialsLibraryPlaceholder,
  textStylesLibrary,
} from "./libraries.js";
import { SERVER_VERSION } from "../version.js";

function jsonResourceBody(data: unknown): string {
  return JSON.stringify(data, null, 0);
}

function visibleEntities(session: CadSession) {
  const layers = session.sceneGraph.getLayers();
  return session.sceneGraph.listEntities().filter((entity) => {
    const layerName = entity.layer ?? "0";
    return layers.get(layerName)?.visible !== false;
  });
}

export function registerResources(server: McpServer, session: CadSession): void {
  const sceneGraph = session.sceneGraph;
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
          text: jsonResourceBody(visibleEntities(session)),
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
      description: "Current SVG preview for the active scene",
      mimeType: "image/svg+xml",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "image/svg+xml",
          text: session.renderer.renderSvg(visibleEntities(session)),
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
          text: jsonResourceBody({
            parameters: session.parametricEngine.listParameters(),
            constraints: session.constraintSolver.listConstraints(),
          }),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-history-undo-stack",
    "cad://history/undo_stack",
    {
      title: "Undo / redo stack depths",
      description: "Current undo and redo stack sizes (JSON)",
      mimeType: "application/json",
    },
    async (uri) => {
      const d = session.getUndoRedoDepths();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: jsonResourceBody({
              undo_depth: d.undo,
              redo_depth: d.redo,
            }),
          },
        ],
      };
    },
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
          text: jsonResourceBody({
            ...blocksLibraryPlaceholder,
            blocks: [
              ...blocksLibraryPlaceholder.blocks,
              ...session.organizationManager.listBlocks(),
            ],
          }),
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

  server.registerResource(
    "cad-linetypes-list",
    "cad://linetypes/list",
    {
      title: "Linetypes",
      description: "Built-in line type definitions (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(linetypesLibrary),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-text-styles",
    "cad://styles/text",
    {
      title: "Text styles",
      description: "Built-in text styles (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(textStylesLibrary),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-dimension-styles",
    "cad://styles/dimension",
    {
      title: "Dimension styles",
      description: "Built-in dimension styles (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(dimensionStylesLibrary),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-standards-iso",
    "cad://standards/iso",
    {
      title: "ISO drafting guidance",
      description: "Starter ISO drafting rules (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(isoStandardResource),
        },
      ],
    }),
  );

  server.registerResource(
    "cad-standards-ansi",
    "cad://standards/ansi",
    {
      title: "ANSI drafting guidance",
      description: "Starter ANSI drafting rules (JSON)",
      mimeType: "application/json",
    },
    async (uri) => ({
      contents: [
        {
          uri: uri.href,
          mimeType: "application/json",
          text: jsonResourceBody(ansiStandardResource),
        },
      ],
    }),
  );
}
