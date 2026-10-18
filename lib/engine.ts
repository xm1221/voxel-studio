import {
  CanvasTexture,
  Group,
  Mesh,
  NearestFilter,
  PCFSoftShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { captureClip, captureStill } from "./capture";
import { drawBubble, drawTag } from "./labels";
import { motionPhaseOffset, sampleMotion } from "./motion";
import { applyJoints, buildRig, configureTexture, type Rig } from "./rig/build";
import { voxelPieces, type VoxelParent } from "./rig/layers";
import { applyLook } from "./rig/look";
import { applyLights, createLights } from "./lighting";
import { buildProp } from "./prop-mesh";
import { propSpec } from "./props";
import { applyStage, createStage } from "./stage";
import { loadImage, loadSkinToCanvas } from "./skin-image";
import { FOOT_Y } from "./rig/layout";
import type { CameraSnapshot, Joints, SceneDraft } from "./types";

export type MoveTarget = { kind: "player" | "prop"; id: string };

type ClipSampleState = {
  joints: Joints;
  bob: number;
  sway: number;
  roll: number;
  cape: number;
  ready: boolean;
};

export class StudioEngine {
  readonly renderer: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera: PerspectiveCamera;
  readonly controls: OrbitControls;
  private readonly rigs = new Map<string, Rig>();
  private readonly holder = new Group();
  private readonly lights;
  private readonly stage;
  private readonly gradient: CanvasTexture;
  private frame = 0;
  private observer: ResizeObserver;
  private draft: SceneDraft | null = null;
  private lastTick = 0;
  private held = false;
  private moveTarget: MoveTarget | null = null;
  private transformHandler: ((target: MoveTarget & { x: number; z: number }) => void) | null = null;
  private readonly propRoot = new Group();
  private readonly propGroups = new Map<string, Group>();
  private markersHidden = false;
  private scrub: { id: string; time: number } | null = null;
  private drag:
    | {
        pointerId: number;
        startX: number;
        startY: number;
        startPosition: { x: number; z: number };
      }
    | null = null;
  private readonly shown = new Map<string, ClipSampleState>();

  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-label", "Pixelstage");
    container.appendChild(canvas);
    canvas.addEventListener("pointerdown", this.onPointerDown);
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
    canvas.addEventListener("pointercancel", this.onPointerUp);

    this.camera = new PerspectiveCamera(32, 1, 0.1, 400);
    this.camera.position.set(26, 10, 64);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 2, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.minDistance = 16;
    this.controls.maxDistance = 180;
    this.controls.maxPolarAngle = Math.PI * 0.92;
    this.controls.update();

    this.scene.add(this.holder);
    this.scene.add(this.propRoot);
    this.lights = createLights(this.scene);
    this.stage = createStage(this.scene);

    const gradientCanvas = document.createElement("canvas");
    gradientCanvas.width = 4;
    gradientCanvas.height = 1;
    const gradientContext = gradientCanvas.getContext("2d");
    if (gradientContext) {
      const image = gradientContext.createImageData(4, 1);
      [70, 130, 190, 255].forEach((value, index) => {
        image.data[index * 4] = value;
        image.data[index * 4 + 1] = value;
        image.data[index * 4 + 2] = value;
        image.data[index * 4 + 3] = 255;
      });
      gradientContext.putImageData(image, 0, 0);
    }
    this.gradient = new CanvasTexture(gradientCanvas);
    this.gradient.magFilter = NearestFilter;
    this.gradient.minFilter = NearestFilter;
    this.gradient.generateMipmaps = false;

    this.resize = this.resize.bind(this);
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(container);
    this.resize();
    this.loop();
  }

  private movedPosition() {
    const target = this.moveTarget;
    const draft = this.draft;
    if (!target || !draft) return null;
    if (target.kind === "prop") {
      const prop = draft.props.find((item) => item.id === target.id);
      return prop ? { x: prop.position.x, z: prop.position.z } : null;
    }
    const player = draft.players.find((item) => item.id === target.id);
    return player ? { x: player.position.x, z: player.position.z } : null;
  }

  private onPointerDown = (event: PointerEvent) => {
    if (!this.moveTarget || event.button !== 0) return;
    const startPosition = this.movedPosition();
    if (!startPosition) return;
    event.preventDefault();
    this.drag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startPosition,
    };
    this.renderer.domElement.setPointerCapture(event.pointerId);
    this.renderer.domElement.style.cursor = "grabbing";
  };

  private onPointerMove = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const target = this.moveTarget;
    if (!target) return;
    event.preventDefault();
    const canvas = this.renderer.domElement;
    const height = Math.max(canvas.clientHeight, 1);
    const distance = this.camera.position.distanceTo(this.controls.target);
    const unit = (2 * distance * Math.tan((this.camera.fov * Math.PI) / 360)) / height;
    const right = new Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    right.y = 0;
    if (right.lengthSq() < 1e-8) right.set(1, 0, 0);
    else right.normalize();
    const forward = this.camera.getWorldDirection(new Vector3());
    forward.y = 0;
    if (forward.lengthSq() < 1e-8) {
      forward.setFromMatrixColumn(this.camera.matrixWorld, 1);
      forward.y = 0;
    }
    if (forward.lengthSq() < 1e-8) forward.set(0, 0, -1);
    else forward.normalize();
    const dx = event.clientX - this.drag.startX;
    const dy = event.clientY - this.drag.startY;
    const clamp = (value: number) => Math.max(-32, Math.min(32, value));
    this.transformHandler?.({
      kind: target.kind,
      id: target.id,
      x: clamp(this.drag.startPosition.x + dx * unit * right.x - dy * unit * forward.x),
      z: clamp(this.drag.startPosition.z + dx * unit * right.z - dy * unit * forward.z),
    });
  };

  private onPointerUp = (event: PointerEvent) => {
    if (!this.drag || this.drag.pointerId !== event.pointerId) return;
    const canvas = this.renderer.domElement;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    this.drag = null;
    canvas.style.cursor = this.moveTarget ? "grab" : "default";
  };

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    if (this.held) return;
    const now = performance.now();
    const dt = this.lastTick === 0 ? 0 : Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.controls.update();
    this.poseAll(dt);
    for (const rig of this.rigs.values()) {
      rig.nametag.quaternion.copy(this.camera.quaternion);
      rig.bubble.quaternion.copy(this.camera.quaternion);
    }
    this.stage.present(this.scene, this.renderer);
    this.renderer.render(this.scene, this.camera);
  };

  resize = () => {
    const canvas = this.renderer.domElement;
    const width = canvas.parentElement?.clientWidth ?? 1;
    const height = canvas.parentElement?.clientHeight ?? 1;
    if (width < 2 || height < 2) return;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  sync(draft: SceneDraft) {
    this.draft = draft;
    const ids = new Set(draft.players.map((player) => player.id));
    for (const [id, rig] of this.rigs) {
      if (ids.has(id)) continue;
      this.disposeRig(rig);
      this.holder.remove(rig.root);
      this.rigs.delete(id);
      this.shown.delete(id);
    }

    draft.players.forEach((player) => {
      let rig = this.rigs.get(player.id);
      if (!rig || rig.model !== player.model) {
        if (rig) {
          this.disposeRig(rig);
          this.holder.remove(rig.root);
          this.rigs.delete(player.id);
        }
        rig = buildRig(player.model, this.gradient);
        rig.id = player.id;
        this.holder.add(rig.root);
        this.rigs.set(player.id, rig);
      }
      rig.ring.visible = player.id === draft.activeId;
      applyLook(rig, draft.grade, draft.outline, player.showOuter, player.layerMode);
      this.applyLabels(rig, player.nametag, player.bubble);
      if (player.skinUrl && rig.skinUrl !== player.skinUrl) {
        const token = ++rig.token;
        rig.skinUrl = player.skinUrl;
        void this.applySkin(rig, player.skinUrl, token);
      }
      rig.cape.visible = Boolean(player.capeUrl && player.showCape);
      if (player.capeUrl !== rig.capeUrl) {
        rig.capeUrl = player.capeUrl;
        if (player.capeUrl) {
          const token = ++rig.capeToken;
          void this.applyCape(rig, player.capeUrl, token);
        }
      }
    });

    this.syncProps(draft);
    applyLights(this.lights, draft);
    applyStage(this.stage, this.scene, this.renderer, draft);
    this.poseAll(0);
  }

  private syncProps(draft: SceneDraft) {
    const ids = new Set(draft.props.map((prop) => prop.id));
    for (const [id, group] of this.propGroups) {
      if (ids.has(id)) continue;
      this.propRoot.remove(group);
      this.propGroups.delete(id);
    }
    for (const prop of draft.props) {
      let group = this.propGroups.get(prop.id);
      if (!group || group.userData.catalogId !== prop.catalogId) {
        const spec = propSpec(prop.catalogId);
        if (!spec) continue;
        if (group) this.propRoot.remove(group);
        group = buildProp(spec);
        group.userData.catalogId = prop.catalogId;
        this.propRoot.add(group);
        this.propGroups.set(prop.id, group);
      }
      group.position.set(prop.position.x, FOOT_Y + prop.position.y, prop.position.z);
      group.rotation.y = (prop.rotationY * Math.PI) / 180;
      group.scale.setScalar(prop.scale);
      const marker = group.getObjectByName("marker");
      if (marker) marker.visible = !this.markersHidden && prop.id === draft.activePropId;
    }
  }

  private poseAll(dt: number, exactTime?: number) {
    const draft = this.draft;
    if (!draft) return;
    draft.players.forEach((player, index) => {
      const rig = this.rigs.get(player.id);
      if (!rig) return;
      const clipChanged = rig.lastClip !== player.clip;
      if (clipChanged) {
        rig.lastClip = player.clip;
        rig.clipTime = 0;
      }
      rig.lastAnimation = player.customAnimation;
      const speed = Number.isFinite(player.clipSpeed) && player.clipSpeed > 0 ? player.clipSpeed : 1;
      const scrubbing = exactTime === undefined && this.scrub?.id === player.id && player.clip === "custom" && player.customAnimation;
      if (scrubbing) rig.clipTime = this.scrub?.time ?? rig.clipTime;
      else if (exactTime === undefined && player.clip !== "none") rig.clipTime += dt * speed;
      const time = exactTime === undefined ? rig.clipTime : exactTime * speed;
      const sampled = sampleMotion(player, time + (scrubbing ? 0 : motionPhaseOffset(index, player)), player.joints);
      let shown = this.shown.get(player.id);
      if (!shown || exactTime !== undefined || clipChanged || scrubbing) {
        shown = { joints: { ...sampled.joints }, bob: sampled.bob, sway: sampled.sway, roll: sampled.roll, cape: sampled.cape, ready: true };
        if (exactTime === undefined) this.shown.set(player.id, shown);
      } else {
        const follow = 1 - Math.exp(-(player.clip === "none" ? 12 : 18) * Math.max(dt, 0));
        if (follow > 0) {
          const mix = (current: number, target: number) => current + (target - current) * follow;
          const joints = shown.joints;
          (Object.keys(joints) as (keyof Joints)[]).forEach((key) => {
            joints[key] = mix(joints[key], sampled.joints[key]);
          });
          shown.bob = mix(shown.bob, sampled.bob);
          shown.sway = mix(shown.sway, sampled.sway);
          shown.roll = mix(shown.roll, sampled.roll);
          shown.cape = mix(shown.cape, sampled.cape);
        }
      }
      const x = (index - (draft.players.length - 1) / 2) * 22;
      applyJoints(rig, shown.joints, x, shown, player);
    });
  }

  private applyLabels(rig: Rig, nametag: string, bubble: string) {
    const tag = nametag.trim();
    const line = bubble.trim();
    rig.nametag.visible = tag.length > 0;
    rig.bubble.visible = line.length > 0;
    if (tag !== rig.lastTag) {
      rig.lastTag = tag;
      if (tag) {
        drawTag(rig.nameCanvas, tag);
        rig.nameTex.needsUpdate = true;
        const width = Math.min(28, 8 + tag.length * 1.7);
        rig.nametag.scale.set(width / 18, 1, 1);
      }
    }
    if (line !== rig.lastBubble) {
      rig.lastBubble = line;
      if (line) {
        drawBubble(rig.bubbleCanvas, line);
        rig.bubbleTex.needsUpdate = true;
      }
    }
  }

  private async applySkin(rig: Rig, url: string, token: number) {
    try {
      const image = await loadImage(url);
      if (rig.token !== token) return;
      const canvas = document.createElement("canvas");
      loadSkinToCanvas(canvas, image);
      this.bindTexture(rig, canvas);
    } catch {
      // Keep the url so a bad file does not retry every frame.
    }
  }

  private bindTexture(rig: Rig, canvas: HTMLCanvasElement) {
    if (!rig.texture) {
      rig.texture = new CanvasTexture(canvas);
      configureTexture(rig.texture);
    } else {
      rig.texture.image = canvas;
    }
    rig.texture.needsUpdate = true;
    const materials = [
      rig.inner,
      rig.limb,
      rig.limbLower,
      rig.outer,
      rig.outerLimb,
      rig.outerLimbLower,
      rig.toonInner,
      rig.toonLimb,
      rig.toonLimbLower,
      rig.toonOuter,
      rig.toonOuterLimb,
      rig.toonOuterLimbLower,
      rig.voxel,
      rig.toonVoxel,
    ];
    for (const material of materials) {
      material.map = rig.texture;
      if (material.emissiveMap) material.emissiveMap = rig.texture;
      material.needsUpdate = true;
    }
    this.rebuildVoxels(rig, canvas);
    const player = this.draft?.players.find((item) => item.id === rig.id);
    if (this.draft && player) applyLook(rig, this.draft.grade, this.draft.outline, player.showOuter, player.layerMode);
  }

  private rebuildVoxels(rig: Rig, canvas: HTMLCanvasElement) {
    for (const mesh of rig.voxels) {
      mesh.geometry.dispose();
      mesh.parent?.remove(mesh);
    }
    rig.voxels = [];
    rig.parts = rig.parts.filter((part) => part.kind !== "voxel");
    rig.bends = rig.bends.filter((bend) => bend.source !== "voxel");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) return;
    let image: ImageData;
    try {
      image = context.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      return;
    }
    const parents: Record<VoxelParent, Rig["head"]> = {
      head: rig.head,
      body: rig.body,
      rArm: rig.rArm,
      lArm: rig.lArm,
      rLeg: rig.rHip,
      lLeg: rig.lHip,
    };
    for (const piece of voxelPieces(rig.model, { width: image.width, height: image.height, data: image.data })) {
      const mesh = new Mesh(piece.geometry, rig.voxel);
      mesh.castShadow = false;
      mesh.visible = false;
      parents[piece.parent].add(mesh);
      rig.parts.push({ mesh, kind: "voxel" });
      rig.voxels.push(mesh);
      if (piece.pivotY !== undefined && piece.joint) {
        rig.bends.push({ geometry: piece.geometry, pivotY: piece.pivotY, joint: piece.joint, source: "voxel" });
      }
    }
  }

  private async applyCape(rig: Rig, url: string, token: number) {
    try {
      const image = await loadImage(url);
      if (rig.capeToken !== token) return;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.imageSmoothingEnabled = false;
      context.drawImage(image, 0, 0);
      if (!rig.capeTexture) {
        rig.capeTexture = new CanvasTexture(canvas);
        configureTexture(rig.capeTexture);
      } else {
        rig.capeTexture.image = canvas;
      }
      rig.capeTexture.needsUpdate = true;
      rig.capeMat.map = rig.capeTexture;
      rig.capeMat.needsUpdate = true;
    } catch {
      if (rig.capeToken === token) rig.cape.visible = false;
    }
  }

  setMoveTarget(target: MoveTarget | null) {
    this.moveTarget = target;
    this.controls.enabled = !target;
    this.renderer.domElement.style.cursor = target ? "grab" : "default";
    if (!target && this.drag) {
      const canvas = this.renderer.domElement;
      if (canvas.hasPointerCapture(this.drag.pointerId)) canvas.releasePointerCapture(this.drag.pointerId);
      this.drag = null;
    }
  }

  setTransformHandler(handler: ((target: MoveTarget & { x: number; z: number }) => void) | null) {
    this.transformHandler = handler;
  }

  setScrub(id: string | null, time?: number) {
    if (!id || time === undefined || !Number.isFinite(time)) {
      this.scrub = null;
      return;
    }
    this.scrub = { id, time: Math.max(0, time) };
  }

  getMotionTime(id: string) {
    const rig = this.rigs.get(id);
    const player = this.draft?.players.find((item) => item.id === id);
    if (!rig || !player) return 0;
    if (player.clip === "custom" && player.customAnimation) {
      const duration = player.customAnimation.duration;
      if (duration <= 0) return 0;
      const wrapped = rig.clipTime % duration;
      return wrapped < 0 ? wrapped + duration : wrapped;
    }
    return rig.clipTime;
  }

  setMarkersVisible(visible: boolean) {
    this.markersHidden = !visible;
    const active = this.draft?.activePropId;
    for (const [id, group] of this.propGroups) {
      const marker = group.getObjectByName("marker");
      if (marker) marker.visible = visible && id === active;
    }
  }

  frameBody(count: number) {
    const distance = Math.max(64, 46 + count * 16);
    this.camera.position.set(distance * 0.38, 9, distance);
    this.controls.target.set(0, 2, 0);
    this.controls.update();
  }

  frameHead() {
    this.camera.position.set(0, 16, 34);
    this.controls.target.set(0, 12, 0);
    this.controls.update();
  }

  getCamera(): CameraSnapshot {
    const position = this.camera.position;
    const target = this.controls.target;
    return { p: [position.x, position.y, position.z], t: [target.x, target.y, target.z] };
  }

  setCamera(snapshot: CameraSnapshot) {
    this.camera.position.set(snapshot.p[0], snapshot.p[1], snapshot.p[2]);
    this.controls.target.set(snapshot.t[0], snapshot.t[1], snapshot.t[2]);
    this.controls.update();
  }

  capture(options: { width: number; height: number; round: boolean; transparent: boolean }) {
    return captureStill(this.host(), options);
  }

  captureClip(options: { width: number; height: number; round: boolean; transparent: boolean; frames: number; seconds: number }) {
    return captureClip(this.host(), options);
  }

  private host() {
    return {
      renderer: this.renderer,
      scene: this.scene,
      camera: this.camera,
      holder: this.holder,
      stage: this.stage,
      draft: this.draft,
      rigs: this.rigs.values(),
      poseAll: this.poseAll.bind(this),
      setHeld: (held: boolean) => {
        this.held = held;
      },
      setMarkersVisible: (visible: boolean) => this.setMarkersVisible(visible),
    };
  }

  private disposeRig(rig: Rig) {
    const geometries = new Set<{ dispose: () => void }>();
    const materials = new Set<Material>();
    rig.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((entry) => materials.add(entry));
      else materials.add(object.material);
    });
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    rig.texture?.dispose();
    rig.capeTexture?.dispose();
    rig.nameTex.dispose();
    rig.bubbleTex.dispose();
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener("pointerdown", this.onPointerDown);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);
    canvas.removeEventListener("pointercancel", this.onPointerUp);
    for (const rig of this.rigs.values()) this.disposeRig(rig);
    this.propRoot.clear();
    this.propGroups.clear();
    this.gradient.dispose();
    this.stage.dispose();
    this.renderer.dispose();
    canvas.remove();
  }
}
