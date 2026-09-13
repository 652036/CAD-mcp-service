import { readFile, writeFile } from "node:fs/promises";
import { parseProjectFileJson } from "./codec.js";
import type { CadProjectFileV1 } from "./format.js";

export async function readProjectFile(path: string): Promise<CadProjectFileV1> {
  const body = await readFile(path, "utf8");
  return parseProjectFileJson(body);
}

export async function writeProjectFile(
  path: string,
  file: CadProjectFileV1,
): Promise<void> {
  await writeFile(path, JSON.stringify(file, null, 2), "utf8");
}
