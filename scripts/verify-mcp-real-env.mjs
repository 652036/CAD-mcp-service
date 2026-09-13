import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import shpwrite from "shp-write";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { REGISTERED_TOOL_NAMES } from "../dist/tools/register.js";

const root = process.cwd();
const configPath = path.join(root, "mcp.config.json");
const reportDir = path.join(root, "tmp");
const reportPath = path.join(reportDir, "mcp-real-env-report.json");

function parseToolPayload(result) {
  const first = result?.content?.[0];
  if (!first || first.type !== "text") {
    return { success: false, error: "Tool did not return text content", raw: result };
  }
  try {
    return JSON.parse(first.text);
  } catch {
    return { success: false, error: "Tool text content is not JSON", text: first.text };
  }
}

function shortValue(value) {
  const json = JSON.stringify(value);
  return json && json.length > 600 ? `${json.slice(0, 600)}...` : value;
}

async function callTool(client, name, args = {}, options = {}) {
  const startedAt = Date.now();
  try {
    const result = await client.callTool({ name, arguments: args });
    const payload = parseToolPayload(result);
    const ok = payload.success === true || options.optionalEnv === true;
    return {
      name,
      ok,
      optionalEnv: options.optionalEnv === true,
      durationMs: Date.now() - startedAt,
      payload: shortValue(payload),
    };
  } catch (error) {
    return {
      name,
      ok: options.optionalEnv === true,
      optionalEnv: options.optionalEnv === true,
      durationMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function firstId(step) {
  const ids = step?.payload?.entity_ids;
  if (!Array.isArray(ids) || ids.length === 0) {
    throw new Error(`Tool ${step?.name} did not return entity_ids`);
  }
  return ids[0];
}

function data(step) {
  return step?.payload?.data;
}

async function writeGeoTiffFixture(filePath) {
  const buffer = await sharp({
    create: {
      width: 4,
      height: 4,
      channels: 3,
      background: { r: 96, g: 128, b: 160 },
    },
  })
    .tiff()
    .toBuffer();
  await writeFile(filePath, buffer);
}

function writeShapefile(rows, geometryType, geometries) {
  return new Promise((resolve, reject) => {
    shpwrite.write(rows, geometryType, geometries, (err, result) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(result);
    });
  });
}

async function writeShapefileFixture(outputDir) {
  await mkdir(outputDir, { recursive: true });
  const shape = await writeShapefile(
    [{ name: "SP-1", kind: "sampling_point" }],
    "POINT",
    [[120.5, 30.2]],
  );
  const shpPath = path.join(outputDir, "points.shp");
  const shxPath = path.join(outputDir, "points.shx");
  const dbfPath = path.join(outputDir, "points.dbf");
  await writeFile(shpPath, Buffer.from(shape.shp.buffer));
  await writeFile(shxPath, Buffer.from(shape.shx.buffer));
  await writeFile(dbfPath, Buffer.from(shape.dbf.buffer));
  return {
    shpPath,
    dbfPath,
  };
}

const MINIMAL_DXF = [
  "0",
  "SECTION",
  "2",
  "ENTITIES",
  "0",
  "LINE",
  "8",
  "0",
  "10",
  "0",
  "20",
  "0",
  "11",
  "10",
  "21",
  "0",
  "0",
  "ENDSEC",
  "0",
  "EOF",
].join("\n");

async function verifyServer(serverName, params) {
  const stderrChunks = [];
  const transport = new StdioClientTransport({
    command: params.command,
    args: params.args ?? [],
    cwd: params.cwd ?? root,
    env: params.env,
    stderr: "pipe",
  });
  transport.stderr?.on("data", (chunk) => {
    stderrChunks.push(Buffer.from(chunk).toString("utf8"));
  });

  const client = new Client(
    { name: "cad-mcp-real-env-verifier", version: "1.0.0" },
    { capabilities: {} },
  );

  const result = {
    serverName,
    command: params.command,
    args: params.args ?? [],
    cwd: params.cwd ?? root,
    ok: false,
    serverVersion: null,
    capabilities: null,
    counts: {},
    mismatches: {},
    resources: [],
    prompts: [],
    toolCalls: [],
    optionalEnvironment: [],
    stderr: "",
  };

  try {
    await client.connect(transport);
    await client.ping();
    result.serverVersion = client.getServerVersion();
    result.capabilities = client.getServerCapabilities();

    const listedTools = await client.listTools();
    const toolNames = listedTools.tools.map((tool) => tool.name).sort();
    const expectedToolNames = [...REGISTERED_TOOL_NAMES].sort();
    result.counts.tools = toolNames.length;
    result.mismatches.toolsMissingFromMcp = expectedToolNames.filter(
      (name) => !toolNames.includes(name),
    );
    result.mismatches.toolsUnexpectedFromMcp = toolNames.filter(
      (name) => !expectedToolNames.includes(name),
    );

    const resources = await client.listResources();
    result.counts.resources = resources.resources.length;
    for (const resource of resources.resources) {
      const read = await client.readResource({ uri: resource.uri });
      result.resources.push({
        uri: resource.uri,
        ok: read.contents.length > 0,
        mimeType: read.contents[0]?.mimeType,
        bytes:
          read.contents[0]?.text?.length ??
          read.contents[0]?.blob?.length ??
          0,
      });
    }

    const templates = await client.listResourceTemplates();
    result.counts.resourceTemplates = templates.resourceTemplates.length;

    const prompts = await client.listPrompts();
    result.counts.prompts = prompts.prompts.length;
    for (const prompt of prompts.prompts) {
      const promptResult = await client.getPrompt({ name: prompt.name, arguments: {} });
      result.prompts.push({
        name: prompt.name,
        ok: promptResult.messages.length > 0,
        messages: promptResult.messages.length,
      });
    }

    const tmpProject = path.join(reportDir, "cad-mcp-real-env-project.json");
    const tmpPdf = path.join(reportDir, "cad-mcp-real-env-drawing.pdf");
    const tmpBatch = path.join(reportDir, "mcp-batch-output");
    const tmpShapeZip = path.join(reportDir, "cad-mcp-real-env-shapefile.zip");
    const tmpShapeDir = path.join(reportDir, "cad-mcp-real-env-shapefile");
    const tmpTiff = path.join(reportDir, "cad-mcp-real-env-raster.tif");
    const tmpRasterPng = path.join(reportDir, "cad-mcp-real-env-raster.png");

    const call = async (name, args = {}, options = {}) => {
      const step = await callTool(client, name, args, options);
      result.toolCalls.push(step);
      if (!step.ok && !options.optionalEnv) {
        throw new Error(`${name} failed: ${step.error ?? JSON.stringify(step.payload)}`);
      }
      return step;
    };

    await call("new_project", { name: "real-env-verification" });
    await call("geometry_backend_status");
    await call("create_layer", { name: "survey", color: "#2b6cb0" });
    await call("set_layer_color", { name: "survey", color: "#1f7a8c" });
    await call("set_layer_visible", { name: "survey", visible: true });
    await call("set_layer_locked", { name: "survey", locked: false });
    await call("get_layer_list");
    await call("create_layer", { name: "scratch-layer", color: "#999999" });
    await call("rename_layer", { old_name: "scratch-layer", new_name: "scratch-renamed" });
    await call("delete_layer", { name: "scratch-renamed" });

    const line = await call("create_line", {
      x1: 0,
      y1: 0,
      x2: 100,
      y2: 0,
      layer: "survey",
    });
    const lineId = firstId(line);
    const secondLine = await call("create_line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: 100,
      layer: "survey",
    });
    const secondLineId = firstId(secondLine);
    const point = await call("create_point", { x: 5, y: 5, layer: "survey" });
    const pointId = firstId(point);
    await call("create_layer", { name: "moved-layer", color: "#008000" });
    await call("set_entity_layer", { entity_ids: [pointId], layer_name: "moved-layer" });
    await call("set_entity_layer", { entity_ids: [pointId], layer_name: "survey" });
    const deletable = await call("create_point", { x: -10, y: -10 });
    await call("delete_entity", { entity_id: firstId(deletable) });
    const circle = await call("create_circle", { cx: 25, cy: 25, radius: 10, layer: "survey" });
    const circleId = firstId(circle);
    const circleB = await call("create_circle", { cx: 25, cy: 25, radius: 5, layer: "survey" });
    const circleBId = firstId(circleB);
    const arc = await call("create_arc", {
      cx: 25,
      cy: 25,
      radius: 12,
      startAngle: 0,
      endAngle: 1.57079632679,
      layer: "survey",
    });
    const arcId = firstId(arc);
    await call("create_rectangle", { x: 0, y: 0, width: 40, height: 20, layer: "survey" });
    const polygon = await call("create_polygon", {
      points: [
        { x: 0, y: 0 },
        { x: 50, y: 0 },
        { x: 50, y: 30 },
        { x: 0, y: 30 },
      ],
      closed: true,
      layer: "survey",
    });
    const polygonId = firstId(polygon);
    const polyline = await call("create_polyline", {
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 20 },
        { x: 60, y: 0 },
      ],
      closed: false,
      layer: "survey",
    });
    const polylineId = firstId(polyline);

    await call("list_layers");
    await call("list_entities");
    await call("get_entity_properties", { entity_id: lineId });
    await call("get_entity_type", { entity_id: lineId });
    await call("find_entities_by_layer", { layer_name: "survey" });
    await call("find_entities_in_region", { x1: -1, y1: -1, x2: 110, y2: 40 });
    await call("set_entity_property", { entity_id: pointId, property: "qc", value: "checked" });
    await call("find_entities_by_property", { property: "qc", value: "checked" });
    await call("set_entity_color", { entity_ids: [lineId], color: "#ff0000" });
    await call("set_entity_linetype", { entity_ids: [lineId], linetype: "continuous" });
    await call("set_entity_lineweight", { entity_ids: [lineId], lineweight: 0.25 });
    await call("get_bounding_box", { entity_ids: [lineId, polygonId] });
    await call("get_curve_length", { entity_id: lineId });
    await call("measure_distance", {
      point_a: { x: 0, y: 0 },
      point_b: { x: 3, y: 4 },
    });
    await call("measure_angle", { line_a: lineId, line_b: secondLineId });
    await call("measure_area", { entity_id: polygonId });
    await call("measure_perimeter", { entity_id: polygonId });
    await call("measure_bounding_box", { entity_ids: [lineId, polygonId] });

    await call("mirror_2d", {
      entity_ids: [lineId],
      axis_start: { x: 0, y: 0 },
      axis_end: { x: 0, y: 100 },
    });
    await call("array_rectangular", { entity_ids: [pointId], rows: 2, cols: 2, dx: 10, dy: 10 });
    await call("array_polar", {
      entity_ids: [pointId],
      center: { x: 0, y: 0 },
      count: 3,
      angle: 3.14159265359,
    });
    await call("offset", { entity_id: polylineId, distance: 5, side: "left" });
    await call("create_ellipse", { cx: 10, cy: 10, rx: 8, ry: 4, rotation: 0.2, layer: "survey" });
    await call("create_spline", {
      controlPoints: [
        { x: 0, y: 0 },
        { x: 10, y: 15 },
        { x: 20, y: 0 },
      ],
      degree: 3,
      layer: "survey",
    });
    const trimLine = await call("create_line", { x1: 0, y1: 50, x2: 100, y2: 50, layer: "survey" });
    const trimLineId = firstId(trimLine);
    await call("trim", { entity_id: trimLineId, cutting_entities: [lineId] });
    await call("extend", { entity_id: trimLineId, boundary_entities: [secondLineId] });
    await call("fillet_2d", { line_id_a: lineId, line_id_b: secondLineId, radius: 3 });
    await call("chamfer_2d", { line_id_a: lineId, line_id_b: secondLineId, dist1: 2, dist2: 2 });

    await call("begin_transaction");
    await call("create_point", { x: 999, y: 999 });
    await call("rollback_transaction");
    await call("begin_transaction");
    await call("create_point", { x: 777, y: 777 });
    await call("commit_transaction");
    await call("push_undo_checkpoint");
    await call("create_point", { x: 888, y: 888 });
    await call("undo");
    await call("redo");

    const boxA = await call("create_box", { width: 10, height: 10, depth: 10, x: 0, y: 0, z: 0 });
    const boxB = await call("create_box", { width: 10, height: 10, depth: 10, x: 5, y: 5, z: 5 });
    const boxAId = firstId(boxA);
    const boxBId = firstId(boxB);
    await call("create_sphere", { radius: 5, cx: 30, cy: 0, cz: 0 });
    await call("create_cylinder", { radius: 4, height: 12 });
    await call("create_cone", { bottomRadius: 4, topRadius: 1, height: 12 });
    await call("create_torus", { majorRadius: 8, minorRadius: 2 });
    await call("create_prism", { profile_id: polygonId, height: 20 });
    await call("create_revolution", {
      profile_id: polylineId,
      axis: { x1: 0, y1: 0, x2: 0, y2: 100 },
    });
    await call("get_face_normal", { solid_id: boxAId, face_id: "top" });
    await call("get_edge_list", { solid_id: boxAId });
    await call("get_face_list", { solid_id: boxAId });
    await call("get_vertex_list", { solid_id: boxAId });
    await call("get_topology", { solid_id: boxAId });
    await call("boolean_union", { solid_id_a: boxAId, solid_id_b: boxBId });
    await call("boolean_subtract", { solid_id_a: boxAId, solid_id_b: boxBId });
    await call("boolean_intersect", { solid_id_a: boxAId, solid_id_b: boxBId });
    await call("fillet_3d", { solid_id: boxAId, edge_ids: ["e1"], radius: 1 });
    await call("chamfer_3d", { solid_id: boxAId, edge_ids: ["e1"], distance: 1 });
    await call("shell", { solid_id: boxAId, thickness: 1 });
    await call("draft_angle", { solid_id: boxAId, face_ids: ["f1"], angle: 0.05 });
    await call("loft", { profiles: [polygonId, polylineId] });
    await call("sweep", { profile_id: polygonId, path_id: polylineId });
    await call("measure_volume", { solid_id: boxAId });
    await call("measure_surface_area", { solid_id: boxAId });
    await call("measure_centroid", { solid_id: boxAId });
    await call("measure_moment_of_inertia", { solid_id: boxAId });
    await call("measure_minimum_distance", { solid_a: boxAId, solid_b: boxBId });
    await call("check_clearance", { component_a: boxAId, component_b: boxBId, min_clearance: 0 });
    await call("set_material", { solid_id: boxAId, material_name: "steel" });
    await call("get_mass_properties", { solid_id: boxAId });

    await call("set_parameter", { name: "width", value: 100 });
    await call("get_parameter", { name: "width" });
    await call("list_parameters");
    await call("update_parameter", { name: "width", new_value: 120 });
    await call("add_constraint_coincident", {
      entity_a: pointId,
      point_a: "origin",
      entity_b: lineId,
      point_b: "start",
    });
    await call("add_constraint_parallel", { line_a: lineId, line_b: trimLineId });
    await call("add_constraint_perpendicular", { line_a: lineId, line_b: secondLineId });
    await call("add_constraint_tangent", { entity_a: lineId, entity_b: circleId });
    await call("add_constraint_concentric", { circle_a: circleId, circle_b: circleBId });
    await call("add_constraint_equal", { entity_a: circleId, entity_b: circleBId });
    await call("add_constraint_symmetric", { entity_a: lineId, entity_b: secondLineId, axis: trimLineId });
    await call("add_constraint_horizontal", { line_id: lineId });
    await call("add_constraint_vertical", { line_id: secondLineId });
    await call("add_constraint_fixed", { entity_id: pointId });
    await call("add_constraint_midpoint", { point_id: pointId, line_id: lineId });
    await call("add_dimension_linear", { point_a: pointId, point_b: lineId, value: 100 });
    await call("add_dimension_angular", { line_a: lineId, line_b: secondLineId, value: 1.57079632679 });
    await call("add_dimension_radial", { circle_id: circleId, value: 10 });
    await call("add_dimension_diameter", { circle_id: circleId, value: 20 });

    await call("create_block", {
      name: "marker",
      entities: [pointId],
      base_point: { x: 0, y: 0 },
    });
    await call("list_blocks");
    await call("edit_block", { block_name: "marker" });
    await call("define_attribute", {
      block_name: "marker",
      tag: "ID",
      prompt: "Marker ID",
      default_value: "M-001",
    });
    const blockInsert = await call("insert_block", { block_name: "marker", position: { x: 10, y: 10 } });
    const blockInstanceId = data(blockInsert)?.group_id;
    if (blockInstanceId) {
      await call("explode_block", { instance_id: blockInstanceId });
    }
    const group = await call("create_group", { name: "survey-group", entity_ids: [lineId, pointId] });
    const groupId = data(group)?.group?.id;
    if (groupId) {
      await call("select_group", { group_id: groupId });
      await call("ungroup", { group_id: groupId });
    }

    const assembly = await call("create_assembly", { name: "verification-assembly" });
    const assemblyId = data(assembly)?.assembly?.id;
    if (assemblyId) {
      const compA = await call("add_component", {
        assembly_id: assemblyId,
        file_path_or_id: boxAId,
        position: [0, 0, 0],
      });
      const compB = await call("add_component", {
        assembly_id: assemblyId,
        file_path_or_id: boxBId,
        position: [5, 5, 5],
      });
      const compC = await call("add_component", {
        assembly_id: assemblyId,
        file_path_or_id: boxBId,
        position: [30, 0, 0],
      });
      await call("check_interference", { assembly_id: assemblyId });
      await call("set_component_flexible", {
        assembly_id: assemblyId,
        instance_id: data(compA)?.component?.id,
        flexible: true,
      });
      await call("mate_coincident", {
        assembly_id: assemblyId,
        a: data(compA)?.component?.id,
        b: data(compB)?.component?.id,
      });
      await call("mate_concentric", {
        assembly_id: assemblyId,
        a: data(compA)?.component?.id,
        b: data(compB)?.component?.id,
      });
      await call("mate_distance", {
        assembly_id: assemblyId,
        a: data(compA)?.component?.id,
        b: data(compB)?.component?.id,
        distance: 5,
      });
      await call("mate_angle", {
        assembly_id: assemblyId,
        a: data(compA)?.component?.id,
        b: data(compB)?.component?.id,
        angle: 0.78539816339,
      });
      await call("mate_parallel", {
        assembly_id: assemblyId,
        a: data(compA)?.component?.id,
        b: data(compB)?.component?.id,
      });
      const exploded = await call("create_exploded_view", { assembly_id: assemblyId, name: "explode" });
      const explodedId = data(exploded)?.view?.id;
      if (explodedId) {
        await call("add_explode_step", {
          assembly_id: assemblyId,
          view_id: explodedId,
          component_ids: [data(compA)?.component?.id],
          direction: [1, 0, 0],
          distance: 20,
        });
        await call("animate_explode", { assembly_id: assemblyId, view_id: explodedId, fps: 24 });
      }
      await call("remove_component", {
        assembly_id: assemblyId,
        instance_id: data(compC)?.component?.id,
      });
    }

    await call("add_text", {
      content: "MCP verification",
      position: { x: 0, y: 0 },
      height: 3,
    });
    await call("add_mtext", {
      content: "Line 1\nLine 2",
      position: { x: 0, y: 10 },
      width: 100,
      height: 20,
    });
    await call("add_leader", {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      text: "Leader",
    });
    await call("add_linear_dimension", {
      p1: { x: 0, y: 0 },
      p2: { x: 100, y: 0 },
      offset: 10,
    });
    await call("add_aligned_dimension", {
      p1: { x: 0, y: 0 },
      p2: { x: 30, y: 20 },
      offset: 8,
    });
    await call("add_angular_dimension", {
      vertex: { x: 0, y: 0 },
      p1: { x: 10, y: 0 },
      p2: { x: 0, y: 10 },
    });
    await call("add_radius_dimension", { arc_id: arcId, leader_point: { x: 30, y: 30 } });
    await call("add_diameter_dimension", { circle_id: circleId, leader_point: { x: 35, y: 25 } });
    await call("add_ordinate_dimension", {
      point: { x: 5, y: 5 },
      datum_point: { x: 0, y: 0 },
      axis: "x",
    });
    await call("add_baseline_dimension", {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
      baseline: 0,
    });
    await call("add_continued_dimension", {
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 0 },
      ],
    });
    await call("add_multileader", {
      points: [
        { x: 0, y: 0 },
        { x: 20, y: 20 },
      ],
      content: "Multi leader",
    });
    const table = await call("create_table", {
      rows: 2,
      cols: 2,
      position: { x: 0, y: 40 },
    });
    const tableId = firstId(table);
    await call("set_table_cell", { table_id: tableId, row: 0, col: 0, content: "A1" });
    await call("add_surface_finish_symbol", { position: { x: 5, y: 45 }, roughness: "Ra3.2" });
    await call("add_weld_symbol", { position: { x: 10, y: 45 }, symbol: "fillet" });
    await call("add_gdt_frame", { position: { x: 15, y: 45 }, tolerance: "0.1", datum: "A" });
    await call("add_center_mark", { circle_id: circleId, position: { x: 25, y: 25 } });
    await call("add_center_line", { entities: [circleId], position: { x: 25, y: 25 } });

    const drawing = await call("create_drawing", { name: "verification-drawing", template: "A3" });
    const drawingId = data(drawing)?.drawing?.id;
    if (drawingId) {
      await call("create_viewport", { name: "main", view_type: "top" });
      await call("set_view_standard", { view_name: "ISO" });
      await call("set_visual_style", { style: "wireframe" });
      const view = await call("add_view", {
        drawing_id: drawingId,
        solid_id: boxAId,
        view_type: "front",
        scale: 1,
        position: { x: 20, y: 20 },
      });
      await call("add_section_view", {
        drawing_id: drawingId,
        parent_view_id: data(view)?.view?.id,
        cut_line: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      });
      await call("add_detail_view", {
        drawing_id: drawingId,
        parent_view_id: data(view)?.view?.id,
        center: { x: 5, y: 5 },
        scale: 2,
        position: { x: 60, y: 20 },
      });
      await call("add_auxiliary_view", {
        drawing_id: drawingId,
        parent_view_id: data(view)?.view?.id,
        direction: "right",
        position: { x: 80, y: 20 },
      });
      await call("update_drawing_views", { drawing_id: drawingId });
      await call("generate_pdf", { drawing_id: drawingId, paper_size: "A4", path: tmpPdf });
      await call("create_map_layout", { name: "verification-map", sheet_size: "A3" });
      await call("apply_thesis_template", {
        drawing_id: drawingId,
        template_name: "thesis-a3-map.json",
        title: "Verification Map",
      });
      await call("add_north_arrow", { drawing_id: drawingId, position: { x: 10, y: 10 } });
      await call("add_scale_bar", {
        drawing_id: drawingId,
        position: { x: 10, y: 20 },
        segment_length: 10,
      });
      await call("add_legend", {
        drawing_id: drawingId,
        position: { x: 10, y: 30 },
        items: ["survey"],
      });
      await call("set_map_extent", { minX: 0, minY: 0, maxX: 100, maxY: 100 });
      await call("add_coordinate_grid", { drawing_id: drawingId, spacing: 50 });
      await call("batch_generate_svg", { drawing_ids: [drawingId], output_dir: tmpBatch });
      await call("batch_generate_pdf", { drawing_ids: [drawingId], output_dir: tmpBatch });
    }

    await call("render_preview_svg");
    await call("render_preview", { width: 256, height: 256 });
    await call("generate_svg", { entity_ids: [lineId, polygonId] });
    await call("export_dxf", { entity_ids: [lineId] });
    await call("import_dxf", { content: MINIMAL_DXF, encoding: "utf8" });
    await call("export_geojson");
    await call("import_geojson", {
      content: JSON.stringify({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: { name: "geojson-point" },
            geometry: { type: "Point", coordinates: [1, 2] },
          },
        ],
      }),
    });
    await call("import_csv_points", {
      content: "id,x,y,elevation\nS1,1,2,10\nS2,3,4,12\n",
    });
    await call("export_shapefile", { path: tmpShapeZip });
    const shapePaths = await writeShapefileFixture(tmpShapeDir);
    await call("import_shapefile", {
      shp_path: shapePaths.shpPath,
      dbf_path: shapePaths.dbfPath,
    });
    await call("dwg_tools_status", {}, { optionalEnv: true });
    await call("import_dwg", {
      content: Buffer.from("not-a-real-dwg").toString("base64"),
      encoding: "base64",
    }, { optionalEnv: true });
    await call("export_dwg", { entity_ids: [lineId] }, { optionalEnv: true });
    await call("import_step", { content: "ISO-10303-21;ENDSEC;END-ISO-10303-21;" });
    await call("import_iges", { content: "IGES-LIKE-CONTENT" });
    await call("import_stl", {
      content: "solid test\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid test",
    });
    await call("import_obj", { content: "o test\nv 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3" });
    await call("import_svg", { content: "<svg xmlns=\"http://www.w3.org/2000/svg\"><line x1=\"0\" y1=\"0\" x2=\"1\" y2=\"1\"/></svg>" });
    await call("import_pdf_as_underlay", {
      content: Buffer.from("%PDF-1.4\n% test").toString("base64"),
      encoding: "base64",
    });
    await call("export_step", { entity_ids: [boxAId] });
    await call("export_iges", { entity_ids: [boxAId] });
    await call("export_stl", { solid_id: boxAId });
    await call("export_obj", { solid_id: boxAId });
    await call("export_svg", { entity_ids: [lineId] });
    await call("export_gltf", { solid_id: boxAId });
    await call("export_3mf", { entity_ids: [boxAId] });

    await call("set_project_crs", {
      code: "EPSG:4528",
      name: "CGCS2000 / 3-degree GK zone 40",
      units: "m",
      origin: { x: 0, y: 0 },
    });
    await call("get_project_crs");
    await call("set_drawing_scale", { scale: 1000 });
    await call("transform_coords", {
      point: { x: 10, y: 20 },
      direction: "local_to_world",
    });
    await call("reproject_point", {
      from: "EPSG:4326",
      to: "EPSG:3857",
      point: { x: 120, y: 30 },
    });
    await call("reproject_points", {
      from: "EPSG:4326",
      to: "EPSG:3857",
      points: [
        { x: 120, y: 30 },
        { x: 121, y: 31 },
      ],
    });
    await call("register_crs_definition", {
      code: "EPSG:999001",
      definition: "+proj=longlat +datum=WGS84 +no_defs +type=crs",
    });
    await call("list_known_crs");

    const sample = await call("create_sampling_point", {
      x: 10,
      y: 10,
      elevation: 15,
      label: "S3",
    });
    const sampleId = firstId(sample);
    await call("create_monitoring_well", { x: 12, y: 10, well_id: "MW1", depth: 30 });
    const profile = await call("create_profile_line", {
      points: [
        { x: 0, y: 10 },
        { x: 30, y: 10 },
      ],
      name: "P1",
    });
    const profileId = firstId(profile);
    const boundary = await call("create_boundary_polygon", {
      points: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 40, y: 40 },
        { x: 0, y: 40 },
      ],
      name: "B1",
    });
    const boundaryId = firstId(boundary);
    await call("list_entities_by_domain_kind", { kind: "sampling_point" });
    await call("measure_polygon_area_stats", { entity_ids: [boundaryId], group_by: "kind" });
    await call("measure_profile_length", { profile_line_id: profileId });
    await call("compute_section_area", {
      profile_line_id: profileId,
      sample_point_ids: [sampleId],
      baseline_elevation: 10,
    });
    await call("compute_cut_fill_volume", {
      boundary_id: boundaryId,
      sample_point_ids: [sampleId],
      base_elevation: 10,
    });
    await call("compute_grid_surface_volume", {
      sample_point_ids: [sampleId],
      cell_area: 25,
      base_elevation: 10,
    });

    await writeGeoTiffFixture(tmpTiff);
    await call("import_geotiff_metadata", { path: tmpTiff });
    const raster = await call("attach_raster_layer", {
      path: tmpTiff,
      name: "verification-raster",
      id: "verification-raster",
    });
    const rasterId = data(raster)?.id ?? "verification-raster";
    await call("list_raster_layers");
    await call("get_raster_layer", { id: rasterId });
    await call("set_raster_layer_visible", { id: rasterId, visible: false });
    await call("rename_raster_layer", { id: rasterId, name: "verification-raster-renamed" });
    await call("render_raster_layer_png", {
      id: rasterId,
      max_width: 16,
      max_height: 16,
      output_path: tmpRasterPng,
    });
    await call("remove_raster_layer", { id: rasterId });
    await call("autocad_status", {}, { optionalEnv: true });
    await call("autocad_list_layers", { limit: 5 }, { optionalEnv: true });
    await call("autocad_list_modelspace_entities", { limit: 5 }, { optionalEnv: true });
    await call("autocad_send_command", { command: "_.ZOOM _E " }, { optionalEnv: true });

    await call("save_project", { path: tmpProject });
    await call("load_project", { path: tmpProject });
    await call("open_project", { path: tmpProject });
    await call("get_project_info");

    result.optionalEnvironment = result.toolCalls.filter((step) => step.optionalEnv);
    const calledToolNames = new Set(result.toolCalls.map((step) => step.name));
    result.toolCoverage = {
      registered: expectedToolNames.length,
      listed: toolNames.length,
      uniqueCalled: calledToolNames.size,
      toolsNeverCalled: expectedToolNames.filter((name) => !calledToolNames.has(name)),
      calledButNotRegistered: [...calledToolNames].filter((name) => !expectedToolNames.includes(name)).sort(),
    };
    result.ok =
      result.mismatches.toolsMissingFromMcp.length === 0 &&
      result.mismatches.toolsUnexpectedFromMcp.length === 0 &&
      result.toolCoverage.toolsNeverCalled.length === 0 &&
      result.toolCoverage.calledButNotRegistered.length === 0 &&
      result.resources.every((resource) => resource.ok) &&
      result.prompts.every((prompt) => prompt.ok) &&
      result.toolCalls.every((step) => step.ok);
  } finally {
    result.stderr = stderrChunks.join("").trim();
    await transport.close().catch(() => {});
  }

  return result;
}

async function main() {
  await mkdir(reportDir, { recursive: true });
  const config = JSON.parse(await readFile(configPath, "utf8"));
  const servers = Object.entries(config.mcpServers ?? {});
  const report = {
    generatedAt: new Date().toISOString(),
    configPath,
    serverCount: servers.length,
    results: [],
  };

  for (const [serverName, params] of servers) {
    report.results.push(await verifyServer(serverName, params));
  }

  report.ok = report.results.length > 0 && report.results.every((entry) => entry.ok);
  await writeFile(reportPath, JSON.stringify(report, null, 2), "utf8");
  console.log(JSON.stringify({
    ok: report.ok,
    serverCount: report.serverCount,
    reportPath,
    summary: report.results.map((entry) => ({
      serverName: entry.serverName,
      ok: entry.ok,
      version: entry.serverVersion,
      counts: entry.counts,
      toolCoverage: entry.toolCoverage,
      toolCalls: entry.toolCalls.length,
      failedToolCalls: entry.toolCalls.filter((step) => !step.ok),
      optionalEnvironment: entry.optionalEnvironment,
      mismatches: entry.mismatches,
      stderr: entry.stderr,
    })),
  }, null, 2));

  if (!report.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
