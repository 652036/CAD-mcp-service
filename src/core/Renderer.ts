import type { Entity, Entity2D } from "./types.js";
import { entitiesToSvg } from "../tools/preview/svgPreview.js";
import { is3dEntity } from "../utils/entityKinds.js";

function project3dEntityTo2d(entity: Entity): Entity2D {
  if (!is3dEntity(entity)) {
    return entity;
  }
  switch (entity.type) {
    case "box":
    case "boolean_result":
      return {
        id: entity.id,
        type: "rectangle",
        coords: [entity.coords[0], entity.coords[1], entity.coords[3], entity.coords[4]],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
    case "sphere":
      return {
        id: entity.id,
        type: "circle",
        coords: [entity.coords[0], entity.coords[1], entity.coords[3]],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
    case "cylinder":
      return {
        id: entity.id,
        type: "circle",
        coords: [entity.coords[0], entity.coords[1], entity.coords[3]],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
    case "cone":
      return {
        id: entity.id,
        type: "circle",
        coords: [entity.coords[0], entity.coords[1], Math.max(entity.coords[3], entity.coords[4])],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
    case "torus":
      return {
        id: entity.id,
        type: "circle",
        coords: [entity.coords[0], entity.coords[1], entity.coords[3] + entity.coords[4]],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
    case "prism":
      return {
        id: entity.id,
        type: "rectangle",
        coords: [entity.coords[0], entity.coords[1], entity.coords[2], entity.coords[3]],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
    case "revolution":
      return {
        id: entity.id,
        type: "circle",
        coords: [entity.coords[0], entity.coords[1], entity.coords[2]],
        layer: entity.layer,
        properties: { ...(entity.properties ?? {}), projectedFrom: entity.type },
      };
  }
  throw new Error(`Unsupported 3D entity type: ${(entity as Entity).type}`);
}

export class Renderer {
  renderSvg(entities: readonly Entity[]): string {
    const projected = entities.map(project3dEntityTo2d);
    return entitiesToSvg(projected);
  }

  renderBase64Preview(entities: readonly Entity[]): {
    mimeType: string;
    imageBase64: string;
    svg: string;
  } {
    const svg = this.renderSvg(entities);
    return {
      mimeType: "image/svg+xml",
      imageBase64: Buffer.from(svg, "utf8").toString("base64"),
      svg,
    };
  }
}
