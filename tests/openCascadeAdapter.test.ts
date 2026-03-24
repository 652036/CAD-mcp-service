import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { OpenCascadeAdapter } from "../src/core/OpenCascadeAdapter.js";

test("OpenCascadeAdapter falls back to the legacy Node loader", async () => {
  const adapter = new OpenCascadeAdapter({
    importPackage: async () => {
      throw new Error("root import failed");
    },
    resolveFromHere: (specifier) => {
      assert.equal(specifier, "opencascade.js/package.json");
      return "/virtual/opencascade.js/package.json";
    },
    readTextFile: async (filePath) => {
      assert.equal(
        filePath,
        path.join("/virtual/opencascade.js", "dist", "opencascade.wasm.js"),
      );
      return [
        "const opencascade = function (options) {",
        "  return Promise.resolve({",
        '    OCC_VERSION_COMPLETE: "7.8.1",',
        "    wasmBinaryLength: options.wasmBinary.length,",
        '    wasmPath: options.locateFile("opencascade.wasm.wasm"),',
        "  });",
        "};",
        "export default opencascade;",
      ].join("\n");
    },
    readBinaryFile: async (filePath) => {
      assert.equal(
        filePath,
        path.join("/virtual/opencascade.js", "dist", "opencascade.wasm.wasm"),
      );
      return new Uint8Array([1, 2, 3]);
    },
  });

  const status = await adapter.getStatus();

  assert.deepEqual(status, {
    backend: "occt",
    available: true,
    version: "7.8.1",
  });
  assert.deepEqual(adapter.getLoadedModule(), {
    OCC_VERSION_COMPLETE: "7.8.1",
    wasmBinaryLength: 3,
    wasmPath: path.join("/virtual/opencascade.js", "dist", "opencascade.wasm.wasm"),
  });
});

test("OpenCascadeAdapter prefers the package entrypoint when it works", async () => {
  let usedLegacyLoader = false;
  const adapter = new OpenCascadeAdapter({
    importPackage: async () => ({
      initOpenCascade: async () => ({ OCC_VERSION_COMPLETE: "7.9.0" }),
    }),
    readTextFile: async () => {
      usedLegacyLoader = true;
      return "";
    },
  });

  const status = await adapter.getStatus();

  assert.deepEqual(status, {
    backend: "occt",
    available: true,
    version: "7.9.0",
  });
  assert.equal(usedLegacyLoader, false);
});

test("OpenCascadeAdapter reports both failure paths when loading fails", async () => {
  const adapter = new OpenCascadeAdapter({
    importPackage: async () => {
      throw new Error("root import failed");
    },
    resolveFromHere: () => "/virtual/opencascade.js/package.json",
    readTextFile: async () => {
      throw new Error("legacy loader failed");
    },
  });

  const status = await adapter.getStatus();

  assert.equal(status.backend, "occt-error");
  assert.equal(status.available, false);
  assert.match(status.reason, /root import failed/);
  assert.match(status.reason, /legacy loader failed/);
});
