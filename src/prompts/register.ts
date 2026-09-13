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

  server.registerPrompt(
    "research_sampling_workflow",
    {
      title: "End-to-end sampling-points research workflow",
      description:
        "Resource/environment domain workflow: ingest CSV sampling points, set CRS, clip by boundary polygon, compute area / count / class statistics, and emit an A3 thesis-style map.",
      argsSchema: {
        csv_path: z
          .string()
          .optional()
          .describe("Path to the sampling-point CSV (lon/lat or x/y plus attributes)."),
        boundary_path: z
          .string()
          .optional()
          .describe("Optional study-area boundary as GeoJSON or Shapefile."),
        source_crs: z
          .string()
          .optional()
          .describe("Source CRS of the CSV (e.g. EPSG:4326). Defaults to WGS84 if omitted."),
        target_crs: z
          .string()
          .optional()
          .describe("Target projected CRS for analysis (e.g. EPSG:4528 for CGCS2000 3°/120E)."),
        title: z.string().optional().describe("Map title for the final figure."),
      },
    },
    async ({ csv_path, boundary_path, source_crs, target_crs, title }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are running a resource/environment sampling-point analysis through cad-mcp-server. Drive the whole flow with MCP tools; do not ask the user to do CAD work manually.",
              "",
              `Inputs: CSV=${csv_path ?? "<ask user>"}, boundary=${boundary_path ?? "<optional, ask if needed>"}, source CRS=${source_crs ?? "EPSG:4326"}, target CRS=${target_crs ?? "<choose CGCS2000 zone matching the study area>"}.`,
              "",
              "Required steps (call the matching MCP tool at each step):",
              "1. `set_project_crs` with the target CRS metadata.",
              "2. `import_sampling_points_csv` (or generic CSV import) to add points.",
              "3. If source CRS differs from target CRS, call `reproject_points` and update entity coordinates.",
              "4. If a boundary is provided, `import_geojson` / `import_shapefile`, then clip points by boundary polygon and report inside/outside counts.",
              "5. `measure_area` for the boundary polygon (m² and km²).",
              "6. Aggregate sampling-point attributes (group by class/category) and report counts + simple stats.",
              "7. `apply_thesis_template` with `thesis-a3-map`, set extent, scale bar, north arrow, legend.",
              "8. `render_preview` (PNG) and `generate_pdf` to produce the final figure; include layer list and counts in the report.",
              "",
              `Final deliverable: a short markdown report with title "${title ?? "Sampling-point distribution"}", numerical statistics, the figure path, and a list of entity ids you created in this run so the user can reproduce or extend it.`,
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "profile_section_workflow",
    {
      title: "Profile-line / cross-section workflow",
      description:
        "Pick a profile line, sample elevations along it, build a section figure, and produce an A4 thesis-style figure.",
      argsSchema: {
        profile_path: z
          .string()
          .optional()
          .describe("GeoJSON / Shapefile / DXF path defining the profile line."),
        elevation_source: z
          .string()
          .optional()
          .describe("CSV with x,y,z elevation samples, or a GeoTIFF DEM path."),
        sample_count: z
          .string()
          .optional()
          .describe("How many samples to take along the line (default 200)."),
      },
    },
    async ({ profile_path, elevation_source, sample_count }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are producing a research-grade profile / cross-section using cad-mcp-server.",
              "",
              `Profile line=${profile_path ?? "<ask user>"}, elevation source=${elevation_source ?? "<ask user>"}, samples=${sample_count ?? "200"}.`,
              "",
              "Steps:",
              "1. Import the profile line as a polyline entity (use `import_geojson` / `import_shapefile` / `import_dxf` as appropriate).",
              "2. Load the elevation source: CSV via `import_sampling_points_csv`, or GeoTIFF via `attach_raster_layer` + `render_raster_layer_png` for visual context.",
              "3. Call `compute_section_area` / terrain helpers to sample elevations along the profile at the requested density.",
              "4. Compute total length (`get_curve_length`), elevation range, slope statistics.",
              "5. Build a 2D section figure: polyline of (chainage, elevation) on an A4 layout via `apply_thesis_template` with `thesis-a4-figure`.",
              "6. Add labelled vertical exaggeration, scale bar, north arrow on the inset map, and a small legend.",
              "7. Export PNG + PDF with `render_preview` / `generate_pdf` and report key numbers.",
              "",
              "Deliverable: figure path(s), profile length (m), min/max/mean elevation, mean slope, and a short paragraph the user can paste into a thesis chapter.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "cut_fill_report",
    {
      title: "Cut/fill volume estimation report",
      description:
        "Estimate simplified cut/fill between an existing-surface DEM and a design-surface DEM (or a flat target elevation) within a boundary, and produce a short report.",
      argsSchema: {
        existing_surface: z
          .string()
          .optional()
          .describe("Existing surface: GeoTIFF DEM path or CSV grid."),
        design_surface: z
          .string()
          .optional()
          .describe("Design surface: GeoTIFF DEM path, CSV grid, or a flat target elevation as a number."),
        boundary_path: z
          .string()
          .optional()
          .describe("Boundary polygon (GeoJSON or Shapefile) limiting the calculation area."),
        grid_size: z
          .string()
          .optional()
          .describe("Grid cell size in metres for the simplified estimate (default 5)."),
      },
    },
    async ({ existing_surface, design_surface, boundary_path, grid_size }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are producing a simplified cut/fill estimate via cad-mcp-server. State up front that the result is a research-grade approximation, not a survey-grade engineering volume.",
              "",
              `Existing surface=${existing_surface ?? "<ask user>"}, design surface=${design_surface ?? "<ask user>"}, boundary=${boundary_path ?? "<ask user>"}, grid=${grid_size ?? "5m"}.`,
              "",
              "Steps:",
              "1. Load the boundary polygon (`import_geojson` / `import_shapefile`). Compute its area with `measure_area`.",
              "2. Load the existing surface. If it is a GeoTIFF, `attach_raster_layer` first and use it as a basemap; sample elevations at the grid centres.",
              "3. Load the design surface (DEM or constant elevation).",
              "4. Call `compute_cut_fill_volume` (or `compute_grid_surface_volume`) with the requested cell size, restricted to the boundary.",
              "5. Report total cut volume, fill volume, net volume, and the assumed cell size.",
              "6. Render an A3 figure with both surfaces colour-banded and the boundary outlined.",
              "",
              "Deliverable: short markdown report with the four volumes, area, cell size, figure paths, and an explicit caveat about the approximation.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "georeferenced_basemap_setup",
    {
      title: "Set up a georeferenced basemap from a GeoTIFF",
      description:
        "Walk through attaching a GeoTIFF as a raster basemap, aligning it with the project CRS, and overlaying vector layers on top.",
      argsSchema: {
        geotiff_path: z.string().optional().describe("Path to the GeoTIFF basemap."),
        target_crs: z
          .string()
          .optional()
          .describe("CRS the rest of the project should use (e.g. EPSG:3857 for tile alignment)."),
      },
    },
    async ({ geotiff_path, target_crs }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are configuring a raster basemap and a matching project CRS in cad-mcp-server.",
              "",
              `GeoTIFF=${geotiff_path ?? "<ask user>"}, target CRS=${target_crs ?? "<ask user, default EPSG:4326 if WGS84 imagery>"}.`,
              "",
              "Steps:",
              "1. `import_geotiff_metadata` to inspect the file's bbox, origin, resolution, and embedded CRS.",
              "2. If the GeoTIFF CRS differs from the requested project CRS, call `reproject_point` on the bbox corners to confirm overlap with the working area; if drastically different, advise the user to reproject the raster offline (gdalwarp).",
              "3. `attach_raster_layer` to bind it to the session. Note the assigned id.",
              "4. `set_project_crs` and `set_map_extent` so vector layers align with the raster.",
              "5. `render_raster_layer_png` to verify the basemap renders.",
              "6. Suggest concrete vector tools the user can run next (e.g. `import_sampling_points_csv`, `import_geojson`).",
              "",
              "Deliverable: confirmed raster id, project CRS, map extent, basemap PNG path, and an annotated step list for the next analysis stage.",
            ].join("\n"),
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "dwg_dxf_round_trip",
    {
      title: "DWG/DXF round-trip check",
      description:
        "Verify that a DWG file can be imported via LibreDWG, edited, and exported back without losing layers or core entities.",
      argsSchema: {
        dwg_path: z.string().optional().describe("Path to the source DWG."),
        export_path: z
          .string()
          .optional()
          .describe("Where to write the round-tripped DWG (defaults to *_roundtrip.dwg)."),
      },
    },
    async ({ dwg_path, export_path }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "You are validating DWG round-trip support in cad-mcp-server (LibreDWG-backed).",
              "",
              `Source=${dwg_path ?? "<ask user>"}, export target=${export_path ?? "<auto>"}.`,
              "",
              "Steps:",
              "1. `dwg_tools_status` first; if not available, instruct the user how to install LibreDWG and stop.",
              "2. `import_dwg` with the source path. Capture warnings and skipped entity types.",
              "3. `list_layers` and `list_entities` (with a small kind filter) to confirm core data survived.",
              "4. Apply a single benign edit (e.g. `create_layer` with a marker name) so the round-trip is observable.",
              "5. `export_dwg` to the target path.",
              "6. Re-`import_dwg` the exported file in a fresh session and compare layer / entity counts.",
              "",
              "Deliverable: source counts vs round-tripped counts, list of skipped types, list of warnings, and a verdict: lossless / lossy-but-acceptable / broken.",
            ].join("\n"),
          },
        },
      ],
    }),
  );
}
