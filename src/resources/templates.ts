import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const TEMPLATE_DIR = path.resolve("assets/templates");

export type DrawingTemplateResource = {
  name: string;
  paperSize?: string;
  orientation?: string;
  titleBlock?: Record<string, unknown>;
  [key: string]: unknown;
};

export async function listDrawingTemplates(): Promise<string[]> {
  const entries = await readdir(TEMPLATE_DIR, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => entry.name)
    .sort();
}

export async function readDrawingTemplate(
  filename: string,
): Promise<DrawingTemplateResource> {
  const filePath = path.join(TEMPLATE_DIR, filename);
  const text = await readFile(filePath, "utf8");
  return JSON.parse(text) as DrawingTemplateResource;
}
