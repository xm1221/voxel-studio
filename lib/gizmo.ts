import {
  BoxGeometry,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  TorusGeometry,
  Vector3,
  type Camera,
  type Object3D,
} from "three";
import type { Axis, Space } from "./transform-math.ts";

export type GizmoMode = "move" | "rotate" | "scale";
export type GizmoHandleKind = "translate" | "plane" | "rotate" | "scale";
export type GizmoAxis = Axis | "xy" | "xz" | "yz" | "all";

const COLORS: Record<Axis | "all", number> = {
  x: 0xe5484d,
  y: 0x30a46c,
  z: 0x3b82f6,
  all: 0xf4f1ea,
};

export type GizmoHandle = { kind: GizmoHandleKind; axis: GizmoAxis };

function tag(object: Object3D, handle: GizmoHandle) {
  object.traverse((child) => {
    child.userData.gizmo = true;
    child.userData.kind = handle.kind;
    child.userData.axis = handle.axis;
    child.renderOrder = 30;
    child.frustumCulled = false;
  });
}

function material(color: number, opacity = 1) {
  return new MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    fog: false,
    side: DoubleSide,
  });
}

function arrow(axis: Axis, color: number) {
  const group = new Group();
  const visible = material(color, 0.95);
  const shaft = new Mesh(new CylinderGeometry(0.035, 0.035, 1.05, 8), visible);
  shaft.position.y = 0.62;
  const head = new Mesh(new ConeGeometry(0.12, 0.32, 10), visible);
  head.position.y = 1.28;
  const pick = new Mesh(new CylinderGeometry(0.14, 0.14, 1.5, 6), material(color, 0));
  pick.position.y = 0.75;
  group.add(shaft, head, pick);
  if (axis === "x") group.rotation.z = -Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  tag(group, { kind: "translate", axis });
  return group;
}

function plane(axis: "xy" | "xz" | "yz", color: number) {
  const mesh = new Mesh(new BoxGeometry(0.36, 0.36, 0.05), material(color, 0.45));
  if (axis === "xy") mesh.position.set(0.52, 0.52, 0);
  if (axis === "xz") {
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(0.52, 0, 0.52);
  }
  if (axis === "yz") {
    mesh.rotation.y = Math.PI / 2;
    mesh.position.set(0, 0.52, 0.52);
  }
  tag(mesh, { kind: "plane", axis });
  return mesh;
}

function ring(axis: Axis, color: number) {
  const group = new Group();
  const mesh = new Mesh(new TorusGeometry(1.32, 0.035, 8, 48), material(color, 0.95));
  const pick = new Mesh(new TorusGeometry(1.32, 0.2, 8, 32), material(color, 0));
  group.add(mesh, pick);
  if (axis === "x") group.rotation.y = Math.PI / 2;
  if (axis === "y") group.rotation.x = Math.PI / 2;
  tag(group, { kind: "rotate", axis });
  return group;
}

function scaleHandle(axis: Axis | "all", color: number) {
  const group = new Group();
  const mesh = new Mesh(new BoxGeometry(axis === "all" ? 0.22 : 0.16, axis === "all" ? 0.22 : 0.16, axis === "all" ? 0.22 : 0.16), material(color, 0.95));
  if (axis !== "all") mesh.position.y = 1.28;
  const pick = new Mesh(new BoxGeometry(0.28, 0.28, 0.28), material(color, 0));
  pick.position.copy(mesh.position);
  group.add(mesh, pick);
  if (axis === "x") group.rotation.z = -Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  tag(group, { kind: "scale", axis });
  return group;
}

export class TransformGizmo {
  readonly root = new Group();
  private mode: GizmoMode = "move";
  private wanted = false;
  private captureHidden = false;
  private readonly moveParts: Object3D[] = [];
  private readonly rotateParts: Object3D[] = [];
  private readonly scaleParts: Object3D[] = [];

  constructor() {
    this.root.name = "gizmo";
    this.root.visible = false;
    this.moveParts.push(arrow("x", COLORS.x), arrow("y", COLORS.y), arrow("z", COLORS.z), plane("xy", COLORS.z), plane("xz", COLORS.y), plane("yz", COLORS.x));
    this.rotateParts.push(ring("x", COLORS.x), ring("y", COLORS.y), ring("z", COLORS.z));
    this.scaleParts.push(scaleHandle("x", COLORS.x), scaleHandle("y", COLORS.y), scaleHandle("z", COLORS.z), scaleHandle("all", COLORS.all));
    this.root.add(...this.moveParts, ...this.rotateParts, ...this.scaleParts);
    this.applyMode();
  }

  setMode(mode: GizmoMode) {
    this.mode = mode;
    this.applyMode();
  }

  setVisible(visible: boolean) {
    this.wanted = visible;
    this.root.visible = visible && !this.captureHidden;
  }

  setCaptureHidden(hidden: boolean) {
    this.captureHidden = hidden;
    this.root.visible = this.wanted && !hidden;
  }

  place(position: Vector3, quaternion: Quaternion, space: Space) {
    this.root.position.copy(position);
    if (space === "local") this.root.quaternion.copy(quaternion);
    else this.root.quaternion.identity();
    this.root.updateMatrixWorld(true);
  }

  update(camera: Camera) {
    if (!this.root.visible) return;
    const distance = camera.position.distanceTo(this.root.position);
    this.root.scale.setScalar(Math.max(2.2, distance * 0.052));
  }

  handleOf(object: Object3D | null): GizmoHandle | null {
    let current = object;
    while (current) {
      if (current.userData.gizmo && current.userData.kind && current.userData.axis) {
        return { kind: current.userData.kind as GizmoHandleKind, axis: current.userData.axis as GizmoAxis };
      }
      current = current.parent;
    }
    return null;
  }

  worldAxis(axis: Axis): Vector3 {
    const vector = new Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
    return vector.applyQuaternion(this.root.quaternion).normalize();
  }

  worldNormal(axis: "xy" | "xz" | "yz"): Vector3 {
    const vector = new Vector3(axis === "yz" ? 1 : 0, axis === "xz" ? 1 : 0, axis === "xy" ? 1 : 0);
    return vector.applyQuaternion(this.root.quaternion).normalize();
  }

  dispose() {
    this.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      object.geometry.dispose();
      const material = object.material;
      if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
      else material.dispose();
    });
  }

  private applyMode() {
    const showMove = this.mode === "move";
    const showRotate = this.mode === "rotate";
    const showScale = this.mode === "scale";
    for (const part of this.moveParts) part.visible = showMove;
    for (const part of this.rotateParts) part.visible = showRotate;
    for (const part of this.scaleParts) part.visible = showScale;
  }
}
