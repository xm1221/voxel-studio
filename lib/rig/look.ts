import type { GradeId, OutlineId } from "../types";
import type { PartKind, Rig } from "./build";

export function applyLook(rig: Rig, grade: GradeId, outline: OutlineId, showOuter: boolean) {
  const comic = grade === "comic";
  const materialFor = (kind: PartKind) => {
    if (kind === "inner") return comic ? rig.toonInner : rig.inner;
    if (kind === "limb") return comic ? rig.toonLimb : rig.limb;
    if (kind === "outer") return comic ? rig.toonOuter : rig.outer;
    return comic ? rig.toonOuterLimb : rig.outerLimb;
  };
  for (const part of rig.parts) {
    part.mesh.material = materialFor(part.kind);
    part.mesh.visible = showOuter || part.kind === "inner" || part.kind === "limb";
  }
  const standards = [rig.inner, rig.limb, rig.outer, rig.outerLimb];
  for (const material of standards) {
    material.color.set(grade === "hologram" ? 0x9af6ff : grade === "ice" ? 0xd9f4ff : 0xffffff);
    material.emissive.set(grade === "hologram" ? 0x1c6cff : grade === "ice" ? 0x7ec8ea : 0x000000);
    material.emissiveIntensity = grade === "hologram" ? 0.85 : grade === "ice" ? 0.35 : 0;
    material.emissiveMap = grade === "hologram" || grade === "ice" ? material.map : null;
    material.roughness = grade === "ice" ? 0.18 : grade === "hologram" ? 0.28 : 0.94;
    const shell = material === rig.outer || material === rig.outerLimb;
    if (grade === "hologram") {
      material.transparent = true;
      material.opacity = 0.86;
      material.alphaTest = 0.05;
    } else if (shell) {
      material.transparent = true;
      material.opacity = 1;
      material.alphaTest = 0.5;
    } else {
      material.transparent = false;
      material.opacity = 1;
      material.alphaTest = 0;
    }
    material.needsUpdate = true;
  }
  const scale = outline === "sticker" ? 1.14 : outline === "ink" ? 1.045 : 1;
  rig.outlineMat.color.set(outline === "sticker" ? 0xf7f4ee : 0x16130f);
  rig.outlineMat.visible = outline !== "none";
  for (const mesh of rig.outlines) {
    mesh.visible = outline !== "none";
    mesh.scale.setScalar(scale);
  }
}
