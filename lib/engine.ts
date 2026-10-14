import {
  CanvasTexture,
  Group,
  Mesh,
  NearestFilter,
  PCFShadowMap,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
  type Material,
} from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { captureClip, captureStill } from "./capture";
import { drawBubble, drawTag } from "./labels";
import { phaseOffset, sampleClip } from "./motion";
import { applyJoints, buildRig, configureTexture, type Rig } from "./rig/build";
import { applyLook } from "./rig/look";
import { applyLights, createLights } from "./lighting";
import { applyStage, createStage } from "./stage";
import { loadImage, loadSkinToCanvas } from "./skin-image";
import type { CameraSnapshot, Joints, SceneDraft } from "./types";

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
  private clipTime = 0;
  private lastClip = "";
  private lastTick = 0;
  private held = false;
  private readonly shown = new Map<string, ClipSampleState>();

  constructor(container: HTMLElement) {
    this.renderer = new WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    const canvas = this.renderer.domElement;
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.display = "block";
    canvas.style.position = "absolute";
    canvas.style.inset = "0";
    canvas.style.touchAction = "none";
    canvas.setAttribute("aria-label", "皮肤预览");
    container.appendChild(canvas);

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
    if (draft.clip !== this.lastClip) {
      this.clipTime = 0;
      this.lastClip = draft.clip;
    }
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
      applyLook(rig, draft.grade, draft.outline, draft.showOuter);
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

    applyLights(this.lights, draft);
    applyStage(this.stage, this.scene, this.renderer, draft);
    this.poseAll(0);
  }

  private poseAll(dt: number, exactTime?: number) {
    const draft = this.draft;
    if (!draft) return;
    const speed = Number.isFinite(draft.clipSpeed) && draft.clipSpeed > 0 ? draft.clipSpeed : 1;
    if (exactTime === undefined && draft.clip !== "none") this.clipTime += dt * speed;
    const time = exactTime ?? this.clipTime;
    const follow = exactTime === undefined ? 1 - Math.exp(-(draft.clip === "none" ? 12 : 18) * Math.max(dt, 0)) : 1;
    draft.players.forEach((player, index) => {
      const rig = this.rigs.get(player.id);
      if (!rig) return;
      const sampled = sampleClip(draft.clip, time + phaseOffset(index, draft.clip), player.joints);
      let shown = this.shown.get(player.id);
      if (!shown || exactTime !== undefined) {
        shown = { joints: { ...sampled.joints }, bob: sampled.bob, sway: sampled.sway, roll: sampled.roll, cape: sampled.cape, ready: true };
        if (exactTime === undefined) this.shown.set(player.id, shown);
      } else if (follow > 0) {
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
      const x = (index - (draft.players.length - 1) / 2) * 22;
      applyJoints(rig, shown.joints, x, shown);
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
      rig.limbJoint,
      rig.outer,
      rig.outerLimb,
      rig.outerJoint,
      rig.toonInner,
      rig.toonLimb,
      rig.toonLimbJoint,
      rig.toonOuter,
      rig.toonOuterLimb,
      rig.toonOuterJoint,
    ];
    for (const material of materials) {
      material.map = rig.texture;
      if (material.emissiveMap) material.emissiveMap = rig.texture;
      material.needsUpdate = true;
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
    for (const rig of this.rigs.values()) this.disposeRig(rig);
    this.gradient.dispose();
    this.stage.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
