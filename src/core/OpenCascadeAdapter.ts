import { readFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { Script } from "node:vm";

type OpenCascadeModule = Record<string, unknown>;
type OpenCascadePackage = {
  initOpenCascade?: () => Promise<OpenCascadeModule>;
};
type OpenCascadeFactory = new (options?: {
  locateFile?: (file: string, prefix?: string) => string;
  wasmBinary?: Uint8Array;
}) => Promise<OpenCascadeModule>;
type CommonJsWrapper = (
  exports: unknown,
  require: NodeRequire,
  module: { exports: unknown },
  __filename: string,
  __dirname: string,
) => void;

export type OpenCascadeAdapterDependencies = {
  importPackage?: () => Promise<OpenCascadePackage>;
  readTextFile?: (filePath: string) => Promise<string>;
  readBinaryFile?: (filePath: string) => Promise<Uint8Array>;
  resolveFromHere?: (specifier: string) => string;
  evaluateCommonJs?: (source: string, filename: string) => CommonJsWrapper;
};

export type OpenCascadeStatus =
  | { backend: "mock"; available: false; reason: string }
  | { backend: "occt"; available: true; version?: string }
  | { backend: "occt-error"; available: false; reason: string };

export class OpenCascadeAdapter {
  private readonly require = createRequire(import.meta.url);
  private initPromise: Promise<OpenCascadeStatus> | null = null;
  private module: OpenCascadeModule | null = null;

  constructor(private readonly deps: OpenCascadeAdapterDependencies = {}) {}

  async getStatus(): Promise<OpenCascadeStatus> {
    if (!this.initPromise) {
      this.initPromise = this.initialize();
    }
    return this.initPromise;
  }

  getLoadedModule(): OpenCascadeModule | null {
    return this.module;
  }

  private async initialize(): Promise<OpenCascadeStatus> {
    let packageEntrypointError: unknown;
    try {
      const oc = await this.loadFromPackageEntrypoint();
      return this.setLoadedModule(oc);
    } catch (err) {
      packageEntrypointError = err;
    }

    try {
      const oc = await this.loadFromLegacyBundle();
      return this.setLoadedModule(oc);
    } catch (legacyErr) {
      return {
        backend: "occt-error",
        available: false,
        reason: this.formatCombinedError(packageEntrypointError, legacyErr),
      };
    }
  }

  private async loadFromPackageEntrypoint(): Promise<OpenCascadeModule> {
    const pkg = await this.importPackage();
    if (typeof pkg.initOpenCascade !== "function") {
      throw new Error("opencascade.js did not expose initOpenCascade");
    }
    return pkg.initOpenCascade();
  }

  private async loadFromLegacyBundle(): Promise<OpenCascadeModule> {
    const packageJsonPath = this.resolveFromHere("opencascade.js/package.json");
    const packageDir = path.dirname(packageJsonPath);
    const bundlePath = path.join(packageDir, "dist", "opencascade.wasm.js");
    const wasmPath = path.join(packageDir, "dist", "opencascade.wasm.wasm");
    const source = await this.readTextFile(bundlePath);
    const factory = this.loadLegacyFactory(source, bundlePath);
    const wasmBinary = await this.readBinaryFile(wasmPath);

    return new factory({
      wasmBinary,
      locateFile(file) {
        if (file.endsWith(".wasm")) {
          return wasmPath;
        }
        return path.join(path.dirname(bundlePath), file);
      },
    });
  }

  private loadLegacyFactory(source: string, filename: string): OpenCascadeFactory {
    const patched = source.replace(
      /export default opencascade;\s*$/m,
      "module.exports = opencascade;",
    );
    const evaluate = this.deps.evaluateCommonJs ?? this.defaultEvaluateCommonJs;
    const wrapper = evaluate(patched, filename);
    const module = { exports: {} as unknown };
    wrapper(
      module.exports,
      this.require,
      module,
      filename,
      path.dirname(filename),
    );
    if (typeof module.exports !== "function") {
      throw new Error("Legacy OpenCascade bundle did not evaluate to a factory");
    }
    return module.exports as OpenCascadeFactory;
  }

  private setLoadedModule(oc: OpenCascadeModule): OpenCascadeStatus {
    this.module = oc;
    const version =
      typeof (oc as { OCC_VERSION_COMPLETE?: string }).OCC_VERSION_COMPLETE === "string"
        ? (oc as { OCC_VERSION_COMPLETE?: string }).OCC_VERSION_COMPLETE
        : undefined;
    return {
      backend: "occt",
      available: true,
      version,
    };
  }

  private importPackage(): Promise<OpenCascadePackage> {
    return this.deps.importPackage?.() ?? import("opencascade.js");
  }

  private readTextFile(filePath: string): Promise<string> {
    return this.deps.readTextFile?.(filePath) ?? readFile(filePath, "utf8");
  }

  private async readBinaryFile(filePath: string): Promise<Uint8Array> {
    if (this.deps.readBinaryFile) {
      return this.deps.readBinaryFile(filePath);
    }
    return readFile(filePath);
  }

  private resolveFromHere(specifier: string): string {
    return this.deps.resolveFromHere?.(specifier) ?? this.require.resolve(specifier);
  }

  private readonly defaultEvaluateCommonJs = (
    source: string,
    filename: string,
  ): CommonJsWrapper => {
    const wrappedSource = `(function (exports, require, module, __filename, __dirname) {\n${source}\n})`;
    return new Script(wrappedSource, { filename }).runInThisContext() as CommonJsWrapper;
  };

  private formatCombinedError(packageErr: unknown, legacyErr: unknown): string {
    const packageMessage = this.formatError(packageErr);
    const legacyMessage = this.formatError(legacyErr);
    return `Package entrypoint failed: ${packageMessage}; legacy Node compatibility loader failed: ${legacyMessage}`;
  }

  private formatError(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }
}
