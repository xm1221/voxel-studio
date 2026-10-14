import type { GradeId, LayerMode, OutlineId } from "../types";
import type { PartKind, Rig } from "./build";

const OUTER: PartKind[] = ["outer", "outerLimb", "outerLimbLower"];

export function applyLook(rig: Rig, grade: GradeId, outline: OutlineId, showOuter: boolean, layerMode: LayerMode) {
  const comic = grade === "comic";
  const voxelsOn = layerMode === "voxel" && showOuter && rig.voxels.length > 0;
  const materialFor = (kind: PartKind) => {
    if (kind === "inner") return comic ? rig.toonInner : rig.inner;
    if (kind === "limb") return comic ? rig.toonLimb : rig.limb;
    if (kind === "limbLower") return comic ? rig.toonLimbLower : rig.limbLower;
    if (kind === "outer") return comic ? rig.toonOuter : rig.outer;
    if (kind === "outerLimb") return comic ? rig.toonOuterLimb : rig.outerLimb;
    if (kind === "voxel") return comic ? rig.toonVoxel : rig.voxel;
    return comic ? rig.toonOuterLimbLower : rig.outerLimbLower;
  };
  for (const part of rig.parts) {
    part.mesh.material = materialFor(part.kind);
    if (part.kind === "voxel") part.mesh.visible = voxelsOn;
    else if (OUTER.includes(part.kind)) part.mesh.visible = showOuter && !voxelsOn;
    else part.mesh.visible = true;
  }
  const standards = [rig.inner, rig.limb, rig.limbLower, rig.outer, rig.outerLimb, rig.outerLimbLower, rig.voxel];
  for (const material of standards) {
    material.color.set(grade === "hologram" ? 0x9af6ff : grade === "ice" ? 0xd9f4ff : 0xffffff);
    material.emissive.set(grade === "hologram" ? 0x1c6cff : grade === "ice" ? 0x7ec8ea : 0x000000);
    material.emissiveIntensity = grade === "hologram" ? 0.85 : grade === "ice" ? 0.35 : 0;
    material.emissiveMap = grade === "hologram" || grade === "ice" ? material.map : null;
    material.roughness = grade === "ice" ? 0.18 : grade === "hologram" ? 0.28 : 0.94;
    const shell = material === rig.outer || material === rig.outerLimb || material === rig.outerLimbLower || material === rig.voxel;
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
