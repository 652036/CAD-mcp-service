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

  server.registerPrompt(
    "create_assembly",
    {
      title: "Create an assembly plan",
      description:
        "Plan component structure, mates, and assembly order from a parts list or current scene.",
      argsSchema: {
        parts_list: z
          .string()
          .optional()
          .describe("Known parts, quantities, or purchased components."),
        target_behavior: z
          .string()
          .optional()
          .describe("How the assembly should move or behave."),
      },
    },
    async ({ parts_list, target_behavior }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are planning a CAD assembly using cad-mcp-server.",
              "",
              parts_list
                ? `Known parts list:\n${parts_list}`
                : "Infer a practical part breakdown and state assumptions clearly.",
              "",
              target_behavior
                ? `Required behavior or motion:\n${target_behavior}`
                : "Describe fixed, moving, and flexible subassemblies if relevant.",
              "",
              "Output: (1) assembly tree, (2) reference datums/origins, (3) suggested mate strategy, (4) likely interference risks, (5) next MCP actions or resources to inspect.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "optimize_design",
    {
      title: "Optimize the current design",
      description:
        "Review the model for weight, manufacturability, maintainability, and simplification opportunities.",
      argsSchema: {
        objective: z
          .string()
          .optional()
          .describe("Primary goal such as lower mass, lower cost, or higher stiffness."),
      },
    },
    async ({ objective }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are analyzing the active CAD design connected to cad-mcp-server.",
              "",
              objective
                ? `Primary optimization objective: ${objective}.`
                : "Balance performance, manufacturability, and modeling simplicity.",
              "",
              "Use current entities, layers, and drawing context where helpful.",
              "Deliver: bottlenecks, specific geometry changes, tradeoffs, and a short prioritized action list.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "check_manufacturability",
    {
      title: "Check manufacturability",
      description:
        "Review the design for process-specific manufacturing risks and documentation gaps.",
      argsSchema: {
        process: z
          .string()
          .optional()
          .describe("Manufacturing process such as CNC, sheet metal, casting, or FDM."),
        material: z
          .string()
          .optional()
          .describe("Target material or material family."),
      },
    },
    async ({ process, material }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are performing a manufacturability review for a CAD model in cad-mcp-server.",
              "",
              process
                ? `Target process: ${process}.`
                : "Select the most likely manufacturing process and explain why.",
              material ? `Material: ${material}.` : "Infer a reasonable candidate material if not provided.",
              "",
              "Output: process risks, geometry changes to reduce risk, tolerance/documentation concerns, and what the drafter should add before release.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "create_parametric",
    {
      title: "Convert a design to parametric form",
      description:
        "Identify driving dimensions and propose a reusable parameter scheme for the current design.",
      argsSchema: {
        product_family: z
          .string()
          .optional()
          .describe("Variant family or SKU range this parameterization should support."),
      },
    },
    async ({ product_family }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are converting the active design in cad-mcp-server into a more parametric workflow.",
              "",
              product_family
                ? `Target product family: ${product_family}.`
                : "Assume the design should support multiple size variants.",
              "",
              "Deliver: core parameters, dependencies between them, naming conventions, safe limits, and a migration plan from static geometry to parametric geometry.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
