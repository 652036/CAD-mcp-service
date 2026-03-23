import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

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

  server.registerPrompt(
    "design_part",
    {
      title: "Design a mechanical part",
      description:
        "Guide the model through requirements, material choice, critical dimensions, and CAD-friendly modeling steps.",
      argsSchema: {
        requirements: z
          .string()
          .optional()
          .describe("Functional requirements, environment, or standards (e.g. load, temperature)."),
        target_process: z
          .string()
          .optional()
          .describe("Intended manufacturing process (e.g. CNC milling, 3D printing, sheet metal)."),
      },
    },
    async ({ requirements, target_process }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are assisting with mechanical part design in a CAD workflow connected to cad-mcp-server.",
              "",
              requirements
                ? `Requirements / constraints:\n${requirements}`
                : "Infer reasonable requirements if the user has not specified them; state assumptions clearly.",
              "",
              target_process
                ? `Target manufacturing process: ${target_process}`
                : "Discuss suitable manufacturing processes and how they affect geometry and tolerances.",
              "",
              "Deliver: (1) a concise concept, (2) main dimensions and tolerances to model, (3) layering/naming suggestions, (4) next MCP tool or resource steps (e.g. read cad://project/current, list entities).",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "generate_drawing",
    {
      title: "Generate a 2D drawing from the model",
      description:
        "Produce drawing views, sheet layout, and annotation strategy from the current 3D or 2D scene.",
      argsSchema: {
        sheet_size: z.string().optional().describe("Drawing sheet (e.g. A3, ANSI B)."),
        primary_views: z
          .string()
          .optional()
          .describe("Requested views (e.g. front, top, section A-A)."),
      },
    },
    async ({ sheet_size, primary_views }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are preparing a 2D engineering drawing based on the active CAD scene (cad-mcp-server).",
              "",
              sheet_size ? `Target sheet: ${sheet_size}.` : "Choose an appropriate sheet size and justify briefly.",
              primary_views
                ? `Required views: ${primary_views}.`
                : "Propose orthographic views, sections, and detail views as needed.",
              "",
              "Include: title block fields to fill, scale per view, dimensioning scheme, datums, surface/finish notes, and ballooning if assemblies apply.",
              "Use resources cad://entities/list and cad://layers/list where helpful; for preview output remind to use the render_preview_svg tool when available.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "dimension_drawing",
    {
      title: "Dimension an existing drawing",
      description:
        "Plan complete, standards-aware dimensions and notes for the current drawing or layout.",
      argsSchema: {
        standard: z
          .string()
          .optional()
          .describe("Dimensioning standard hint (e.g. ISO, ASME)."),
        focus: z
          .string()
          .optional()
          .describe("Areas or features to emphasize (e.g. bores, weldments)."),
      },
    },
    async ({ standard, focus }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are dimensioning a CAD drawing in cad-mcp-server.",
              "",
              standard
                ? `Follow this dimensioning standard where applicable: ${standard}.`
                : "State which dimensioning standard you are applying (e.g. ISO or ASME) and stay consistent.",
              focus ? `Pay special attention to: ${focus}.` : "Cover all features needed for fabrication and inspection.",
              "",
              "Output: datum reference frame, size vs. location dimensions, tolerances (general and specific), hole callouts, threads, welds if relevant, and a short checklist the drafter can verify against the model.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
