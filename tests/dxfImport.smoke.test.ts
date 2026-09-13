import test from "node:test";
import assert from "node:assert/strict";
import { importDxfToSceneData } from "../src/parsers/dxfImport.js";

/** Minimal DXF with one LINE in ENTITIES (dxf-parser compatible). */
const MINIMAL_LINE_DXF = `0
SECTION
2
ENTITIES
0
LINE
8
0
10
0.0
20
0.0
11
10.0
21
10.0
0
ENDSEC
0
EOF
`;

test("importDxfToSceneData parses minimal LINE DXF", () => {
  const result = importDxfToSceneData(MINIMAL_LINE_DXF);
  assert.equal(result.success, true);
  assert.ok(result.newEntities.length >= 1);
  assert.equal(result.newEntities[0]?.type, "line");
});
