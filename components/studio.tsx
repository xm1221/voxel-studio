"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PropShelf } from "@/components/prop-shelf";
import { TimelineEditor } from "@/components/timeline-editor";
import { createAlexSkin, createSteveSkin } from "@/lib/defaults";
import { StudioEngine } from "@/lib/engine";
import { LOCALE_STORAGE_KEY, code, errorNote, htmlLang, note, parseNote, readLocale, t, type Locale, type MessageKey, type Note } from "@/lib/i18n";
import { FORMATS, formatById, gifFrameSize } from "@/lib/formats";
import { animationDocument, animationDownloadName, animationForClip, CLIPS, clipExportSpanForPlayers, MAX_ANIMATION_TEXT_LENGTH, parseAnimationText } from "@/lib/motion";
import { backgroundImageFrom, decodePayload, encodePayload, toPayload } from "@/lib/persist";
import { POSES } from "@/lib/poses";
import { PRESET_STORAGE_KEY, mergePresets, newPresetId, parsePresetDocument, presetDocument, type UserPreset } from "@/lib/presets";
import { inferModelType, loadImage, loadSkinToCanvas } from "@/lib/skin-image";
import { clearStoredPropTexturePack, loadStoredPropTexturePack, storePropTexturePack } from "@/lib/pack-store";
import { catalogLabel, loadCatalog, subscribeCatalog } from "@/lib/catalog";
import { setCustomAssets } from "@/lib/custom-assets";
import type { CustomAsset } from "@/lib/custom-import";
import { loadStoredCustomAssets, storeCustomAssets } from "@/lib/custom-store";
import type { GizmoMode } from "@/lib/gizmo";
import { emptyPropClip, writePropKey } from "@/lib/prop-clip";
import { applyPropTexturePack, clearPropTexturePack, propTexturePack, setCustomTextures, subscribePropTextures } from "@/lib/prop-mesh";
import { exportProject, parseProject } from "@/lib/project";
import { MAX_PROPS, duplicateProp, placeProp } from "@/lib/props";
import { gizmoTransform, movePivot, type Space } from "@/lib/transform-math";
import { readResourcePack, texturesFromFolder, type PackTexture } from "@/lib/resource-pack";
import { STORAGE_KEY, defaultScene, makePlayer, requestPlayer, resetPlayer, resetSceneLook, sceneFromPayload } from "@/lib/studio-state";
import type { CameraSnapshot, Joints, PlayerDraft, SceneDraft, SceneProp } from "@/lib/types";

let builtinSkins: { steve: string; alex: string } | null = null;
let bootCamera: CameraSnapshot | undefined;
let bootRefetch: string[] = [];

function pngBlob(bytes: Uint8Array) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy], { type: "image/png" });
}

function ensureSkins() {
  if (!builtinSkins && typeof document !== "undefined") {
    builtinSkins = { steve: createSteveSkin(), alex: createAlexSkin() };
  }
  return builtinSkins;
}

const PANELS = ["scene", "cast", "motion", "props"] as const;
type PanelId = (typeof PANELS)[number];
const PANEL_LABEL: Record<PanelId, MessageKey> = {
  scene: "tabScene",
  cast: "tabCast",
  motion: "tabMotion",
  props: "tabProps",
};

const BACKGROUNDS = ["studio", "noon", "sunset", "night", "nether", "none"] as const;
const GRADES = ["clean", "hologram", "ice", "comic"] as const;
const OUTLINES = ["none", "ink", "sticker"] as const;
const LIGHTS = ["soft", "hard", "neon", "moon"] as const;
const SPEEDS = [
  [0.65, "slow"],
  [1, "normal"],
  [1.45, "fast"],
] as const;
const AXES = [
  ["x", "axisX", -32, 32, 0.1],
  ["y", "axisY", -12, 16, 0.1],
  ["z", "axisZ", -32, 32, 0.1],
] as const;

const SLIDERS: Array<{ key: keyof Joints; label: MessageKey; min: number; max: number }> = [
  { key: "headX", label: "joint.headX", min: -40, max: 40 },
  { key: "headY", label: "joint.headY", min: -55, max: 55 },
  { key: "bodyX", label: "joint.bodyX", min: -30, max: 30 },
  { key: "rArmX", label: "joint.rArmX", min: -170, max: 170 },
  { key: "rArmZ", label: "joint.rArmZ", min: -180, max: 40 },
  { key: "rElbow", label: "joint.rElbow", min: -150, max: 30 },
  { key: "lArmX", label: "joint.lArmX", min: -170, max: 170 },
  { key: "lArmZ", label: "joint.lArmZ", min: -40, max: 180 },
  { key: "lElbow", label: "joint.lElbow", min: -150, max: 30 },
  { key: "rLegX", label: "joint.rLegX", min: -120, max: 70 },
  { key: "rKnee", label: "joint.rKnee", min: -15, max: 150 },
  { key: "lLegX", label: "joint.lLegX", min: -120, max: 70 },
  { key: "lKnee", label: "joint.lKnee", min: -15, max: 150 },
];

export function Studio() {
  const viewRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const sceneRef = useRef<SceneDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backgroundFileRef = useRef<HTMLInputElement>(null);
  const presetFileRef = useRef<HTMLInputElement>(null);
  const animationFileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [locale, setLocale] = useState<Locale>(() => readLocale());
  const [message, setMessage] = useState<Note | null>(null);
  const [error, setError] = useState<Note | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [fatal, setFatal] = useState<MessageKey | null>(null);
  const [presets, setPresets] = useState<UserPreset[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(PRESET_STORAGE_KEY);
      if (!raw) return [];
      const parsed = parsePresetDocument(JSON.parse(raw) as unknown);
      return parsed.ok ? parsed.presets : [];
    } catch {
      return [];
    }
  });
  const [presetName, setPresetName] = useState("");
  const [keepLook, setKeepLook] = useState(false);
  const [presetJson, setPresetJson] = useState("");
  const [animationJson, setAnimationJson] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [panel, setPanel] = useState<PanelId>("cast");
  const [gizmoMode, setGizmoMode] = useState<GizmoMode>("move");
  const [gizmoSpace, setGizmoSpace] = useState<Space>("local");
  const [gizmoSnap, setGizmoSnap] = useState(true);
  const [selection, setSelection] = useState<string[]>([]);
  const [catalogTick, setCatalogTick] = useState(0);
  const [customs, setCustoms] = useState<CustomAsset[]>([]);
  const [historyCounts, setHistoryCounts] = useState({ undo: 0, redo: 0 });
  const historyRef = useRef<Array<{ props: SceneDraft["props"]; propClip: SceneDraft["propClip"] }>>([]);
  const futureRef = useRef<Array<{ props: SceneDraft["props"]; propClip: SceneDraft["propClip"] }>>([]);
  const selectionRef = useRef<string[]>([]);
  const gestureRef = useRef<SceneDraft["props"] | null>(null);
  const livePropsRef = useRef<SceneDraft["props"] | null>(null);
  const panelRef = useRef<PanelId>("cast");
  const commandsRef = useRef<{
    undo: () => void;
    redo: () => void;
    duplicate: (id: string) => void;
    remove: (id: string) => void;
  }>({
    undo: () => undefined,
    redo: () => undefined,
    duplicate: () => undefined,
    remove: () => undefined,
  });

  const [scene, setScene] = useState<SceneDraft | null>(() => {
    const skins = ensureSkins();
    if (!skins) return null;
    const hash = window.location.hash.replace(/^#/, "");
    const fromHash = hash ? decodePayload(hash) : null;
    let stored: ReturnType<typeof decodePayload> = null;
    if (!fromHash) {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        stored = raw ? decodePayload(raw) : null;
      } catch {
        stored = null;
      }
    }
    const payload = fromHash || stored;
    if (!payload) {
      bootCamera = undefined;
      bootRefetch = [];
      return defaultScene(skins.steve);
    }
    const next = sceneFromPayload(payload, skins.steve, skins.alex);
    bootCamera = next.camera;
    bootRefetch = next.refetch;
    return next.scene;
  });
  const active = scene?.players.find((player) => player.id === scene.activeId) ?? scene?.players[0];
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);

  useEffect(() => {
    document.documentElement.lang = htmlLang(locale);
    document.title = t(locale, "metaTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t(locale, "metaDescription"));
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, locale);
    } catch {
      // The choice still applies for this visit.
    }
    engineRef.current?.renderer.domElement.setAttribute("aria-label", t(locale, "preview"));
  }, [locale]);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  const [texturePack, setTexturePack] = useState<{ name: string; count: number } | null>(null);

  useEffect(() => subscribePropTextures(() => {
    engineRef.current?.reloadProps();
    setTexturePack(propTexturePack());
  }), []);

  useEffect(() => {
    let cancel = false;
    void loadStoredPropTexturePack()
      .then((stored) => {
        if (cancel || !stored) return;
        const files = new Map(stored.textures.map((texture) => [texture.key, pngBlob(texture.bytes)]));
        applyPropTexturePack(stored.name, files);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, []);

  useEffect(() => {
    const element = viewRef.current;
    if (!element) return;
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(element);
    } catch {
      queueMicrotask(() => setFatal("fatalWebgl"));
      return;
    }
    engineRef.current = engine;
    engine.renderer.domElement.setAttribute("aria-label", t(readLocale(), "preview"));
    if (bootCamera) engine.setCamera(bootCamera);
    if (sceneRef.current) engine.sync(sceneRef.current);
    const jobs = bootRefetch;
    for (const id of jobs) {
      const player = sceneRef.current?.players.find((item) => item.id === id);
      if (!player?.username) continue;
      const username = player.username;
      void requestPlayer(username)
        .then((data) => {
          setScene((current) =>
            current
              ? {
                  ...current,
                  players: current.players.map((item) =>
                    item.id === id
                      ? { ...item, name: data.name, username: data.name, source: "username", model: data.model, skinUrl: data.skin, capeUrl: data.cape, showCape: true }
                      : item,
                  ),
                }
              : current,
          );
        })
        .catch(() => {
          setError(note("err.linkSkin"));
        });
    }
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!scene) return;
    engineRef.current?.sync(scene);
    const handle = window.setTimeout(() => {
      try {
        const camera = engineRef.current?.getCamera();
        localStorage.setItem(STORAGE_KEY, encodePayload(toPayload(scene, camera, true)));
      } catch {
        // Uploaded skins can be large. The session still works without local save.
      }
    }, 400);
    return () => window.clearTimeout(handle);
  }, [scene]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setTransformHandler((target) => {
      setScene((current) => {
        if (!current) return current;
        if (target.kind === "prop") {
          return {
            ...current,
            props: current.props.map((prop) =>
              prop.id === target.id ? { ...prop, position: { ...prop.position, x: target.x, z: target.z } } : prop,
            ),
          };
        }
        return {
          ...current,
          players: current.players.map((player) =>
            player.id === target.id ? { ...player, position: { ...player.position, x: target.x, z: target.z } } : player,
          ),
        };
      });
    });
    return () => engine.setTransformHandler(null);
  }, []);

  useEffect(() => {
    void loadCatalog();
    return subscribeCatalog(() => {
      setCatalogTick((value) => value + 1);
      engineRef.current?.reloadProps();
    });
  }, []);

  useEffect(() => {
    void loadStoredCustomAssets()
      .then((stored) => {
        if (!stored.length) return;
        setCustomAssets(stored);
        setCustomTextures(Object.assign({}, ...stored.map((asset) => asset.textures)));
        setCustoms(stored);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    engine.setPickHandler((id, shift) => {
      setSelection((current) => (shift ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]));
      setScene((current) => (current ? { ...current, activePropId: id } : current));
      setPanel("props");
    });
    engine.setGizmoHandler((event) => {
      const current = sceneRef.current;
      if (!current) return;
      if (event.phase === "start") {
        historyRef.current.push({ props: structuredClone(current.props), propClip: current.propClip ? structuredClone(current.propClip) : null });
        if (historyRef.current.length > 40) historyRef.current.shift();
        futureRef.current = [];
        setHistoryCounts({ undo: historyRef.current.length, redo: 0 });
        gestureRef.current = current.props.map(cloneProp);
        return;
      }
      if (event.phase === "end") {
        const starts = gestureRef.current;
        const live = livePropsRef.current;
        gestureRef.current = null;
        livePropsRef.current = null;
        if (!starts || !live) return;
        if (!current.propClip?.autoKey) return;
        let clip = current.propClip;
        const time = engine.getMotionTime(current.activeId);
        if (time > clip.duration) clip = { ...clip, duration: Math.min(30, time) };
        for (const prop of live) {
          const start = starts.find((item) => item.id === prop.id);
          if (!start || samePropTransform(start, prop)) continue;
          clip = writePropKey(clip, time, prop.id, { position: prop.position, rotation: prop.rotation, scale: prop.scale });
        }
        setScene((scene) => (scene ? { ...scene, props: live, propClip: clip } : scene));
        return;
      }
      const starts = gestureRef.current;
      if (!starts) return;
      const selected = new Set(selectionRef.current.length ? selectionRef.current : current.activePropId ? [current.activePropId] : []);
      const next = current.props.map((prop) => {
        if (!selected.has(prop.id) || prop.locked) return prop;
        const start = starts.find((item) => item.id === prop.id);
        if (!start) return prop;
        const transformed = gizmoTransform(start, event);
        return { ...prop, position: transformed.position, rotation: transformed.rotation, scale: transformed.scale };
      });
      livePropsRef.current = next;
      setScene((scene) => (scene ? { ...scene, props: next } : scene));
    });
    return () => {
      engine.setPickHandler(null);
      engine.setGizmoHandler(null);
    };
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (panelRef.current !== "props") return;
      const key = event.key.toLowerCase();
      const meta = event.ctrlKey || event.metaKey;
      if (meta && key === "z") {
        event.preventDefault();
        if (event.shiftKey) commandsRef.current.redo();
        else commandsRef.current.undo();
        return;
      }
      if (meta && key === "y") {
        event.preventDefault();
        commandsRef.current.redo();
        return;
      }
      if (meta && key === "d") {
        event.preventDefault();
        const id = sceneRef.current?.activePropId;
        if (id) commandsRef.current.duplicate(id);
        return;
      }
      if (event.key === "Delete" || event.key === "Backspace") {
        const id = sceneRef.current?.activePropId;
        if (id) commandsRef.current.remove(id);
        return;
      }
      if (key === "v" || key === "g") setGizmoMode("move");
      if (key === "r") setGizmoMode("rotate");
      if (!meta && key === "s") setGizmoMode("scale");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeId = active?.id ?? null;
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;
    if (!moveMode || panel === "props") {
      engine.setMoveTarget(null);
      return;
    }
    if (activeId) engine.setMoveTarget({ kind: "player", id: activeId });
    else engine.setMoveTarget(null);
  }, [activeId, moveMode, panel]);

  useEffect(() => {
    const engine = engineRef.current;
    if (!engine || !scene) return;
    const current = scene.props.find((prop) => prop.id === scene.activePropId);
    engine.setGizmoOptions({
      mode: gizmoMode,
      space: gizmoSpace,
      snap: gizmoSnap,
      enabled: panel === "props" && Boolean(current && !current.hidden && !current.locked),
    });
  }, [gizmoMode, gizmoSnap, gizmoSpace, panel, scene]);

  useEffect(() => {
    if (!message && !error) return;
    const handle = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 4200);
    return () => window.clearTimeout(handle);
  }, [message, error]);

  const poseName = useMemo(() => {
    if (!active) return "";
    return poseLabel(locale, active.poseId, presets);
  }, [active, locale, presets]);

  function writePresets(next: UserPreset[]) {
    setPresets(next);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presetDocument(next)));
    } catch {
      setError(note("err.poseStore"));
    }
  }

  function applyUserPreset(preset: UserPreset) {
    patch((current) => ({
      ...current,
      light: preset.look?.light ?? current.light,
      keyIntensity: preset.look?.keyIntensity ?? current.keyIntensity,
      players: current.players.map((player) => (player.id === current.activeId ? { ...player, poseId: `user:${preset.id}`, joints: { ...preset.joints } } : player)),
    }));
    if (preset.camera) engineRef.current?.setCamera(preset.camera);
  }

  function saveUserPreset() {
    if (!active || !scene) return;
    const name = presetName.trim();
    if (!name || name.length > 24) {
      setError(note("err.poseName"));
      return;
    }
    if (presets.length >= 40) {
      setError(note("err.poseCap"));
      return;
    }
    const preset: UserPreset = {
      id: newPresetId(presets),
      name,
      joints: { ...active.joints },
      look: keepLook ? { light: scene.light, keyIntensity: scene.keyIntensity } : undefined,
      camera: keepLook ? engineRef.current?.getCamera() : undefined,
    };
    writePresets([...presets, preset]);
    setPresetName("");
    setMessage(note("savedPose", { name }));
    updateActive({ poseId: `user:${preset.id}` });
  }

  function commitRename(id: string) {
    const name = renameValue.trim();
    if (!name || name.length > 24) {
      setError(note("err.poseName"));
      return;
    }
    writePresets(presets.map((preset) => (preset.id === id ? { ...preset, name } : preset)));
    setRenamingId(null);
  }

  function importPresetText(text: string) {
    let value: unknown;
    try {
      value = JSON.parse(text) as unknown;
    } catch {
      setError(note("err.presetJson"));
      return;
    }
    const parsed = parsePresetDocument(value);
    if (!parsed.ok) {
      setError(parseNote(parsed.error) ?? note("err.presetJson"));
      return;
    }
    const merged = mergePresets(presets, parsed.presets);
    if (!merged.ok) {
      setError(parseNote(merged.error) ?? note("err.presetMerge"));
      return;
    }
    writePresets(merged.presets);
    setPresetJson("");
    setMessage(note("importedPoses", { count: parsed.presets.length }));
  }

  function importAnimationText(text: string) {
    const parsed = parseAnimationText(text);
    if (!parsed.ok) {
      setError(parseNote(parsed.error) ?? note("err.animJson"));
      return;
    }
    updateActive({ clip: "custom", customAnimation: parsed.animation });
    setAnimationJson("");
    setMessage(note("animImported", { name: parsed.animation.name }));
  }

  function exportAnimation() {
    if (!active) return;
    const builtin = active.clip === "custom" ? "none" : active.clip;
    const source = active.clip === "custom" && active.customAnimation ? active.customAnimation : animationForClip(builtin);
    const name = active.clip === "custom" && active.customAnimation ? source.name : ui(locale, `clip.${builtin}`);
    const animation = { ...source, name };
    const blob = new Blob([JSON.stringify(animationDocument(animation), null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = animationDownloadName(animation.name);
    link.click();
    URL.revokeObjectURL(url);
  }

  function resetActivePlayer() {
    patch((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === current.activeId ? resetPlayer(player) : player)),
    }));
    setMessage(note("resetPlayerDone"));
  }

  function resetSceneToDefault() {
    patch((current) => resetSceneLook(current));
    setMessage(note("resetSceneDone"));
  }

  async function ingestBackground(file: File) {
    const type = file.type.toLowerCase();
    const name = file.name.toLowerCase();
    const allowed =
      type === "image/png" ||
      type === "image/jpeg" ||
      type === "image/webp" ||
      name.endsWith(".png") ||
      name.endsWith(".jpg") ||
      name.endsWith(".jpeg") ||
      name.endsWith(".webp");
    if (!allowed) {
      setError(note("err.bgType"));
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError(note("err.bgSize"));
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      const image = await loadBackground(url);
      const stored = compressBackground(image, url);
      if (!backgroundImageFrom(stored)) {
        setError(note("err.bgRead"));
        return;
      }
      patch((current) => ({ ...current, backgroundImage: stored }));
      setMessage(note("bgApplied"));
    } catch (reason) {
      setError(errorNote(reason, "err.bgRead"));
    }
  }

  function patch(next: (current: SceneDraft) => SceneDraft) {
    setScene((current) => (current ? next(current) : current));
  }

  function updateActive(partial: Partial<PlayerDraft>) {
    patch((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === current.activeId ? { ...player, ...partial } : player)),
    }));
  }

  function adoptTexturePack(name: string, textures: PackTexture[]) {
    const files = new Map(textures.map((texture) => [texture.key, pngBlob(texture.bytes)]));
    applyPropTexturePack(name, files);
    setTexturePack({ name, count: textures.length });
  }

  async function importTexturePack(files: File[], mode: "zip" | "folder") {
    try {
      if (mode === "zip") {
        const file = files[0];
        if (!file) return;
        const result = await readResourcePack(file);
        adoptTexturePack(result.name, result.textures);
        await storePropTexturePack(result.name, result.textures);
        setMessage(note("packApplied", { name: result.name, count: result.textures.length }));
        return;
      }
      const entries = files.map((file) => ({
        name: file.webkitRelativePath || file.name,
        size: file.size,
        arrayBuffer: () => file.arrayBuffer(),
      }));
      const textures = await texturesFromFolder(entries);
      const folder = entries[0]?.name.split("/")[0] || "pack";
      adoptTexturePack(folder, textures);
      await storePropTexturePack(folder, textures);
      setMessage(note("packApplied", { name: folder, count: textures.length }));
    } catch (reason) {
      setError(errorNote(reason, "err.packRead"));
    }
  }

  function publishHistory() {
    setHistoryCounts({ undo: historyRef.current.length, redo: futureRef.current.length });
  }

  function rememberProps() {
    const current = sceneRef.current;
    if (!current) return;
    historyRef.current.push({ props: structuredClone(current.props), propClip: current.propClip ? structuredClone(current.propClip) : null });
    if (historyRef.current.length > 40) historyRef.current.shift();
    futureRef.current = [];
    publishHistory();
  }

  function undoProps() {
    const current = sceneRef.current;
    const prev = historyRef.current.pop();
    if (!current || !prev) return;
    futureRef.current.push({ props: current.props, propClip: current.propClip ?? null });
    setScene({ ...current, props: prev.props, propClip: prev.propClip ?? null });
    publishHistory();
  }

  function redoProps() {
    const current = sceneRef.current;
    const next = futureRef.current.pop();
    if (!current || !next) return;
    historyRef.current.push({ props: current.props, propClip: current.propClip ?? null });
    setScene({ ...current, props: next.props, propClip: next.propClip ?? null });
    publishHistory();
  }

  function addProp(catalogId: string) {
    const current = sceneRef.current;
    if (!current) return;
    const prop = placeProp(catalogId, current.props);
    if (!prop) {
      setError(note("err.propCap"));
      return;
    }
    rememberProps();
    patch((scene) =>
      scene.props.length >= MAX_PROPS || scene.props.some((item) => item.id === prop.id)
        ? scene
        : { ...scene, props: [...scene.props, prop], activePropId: prop.id },
    );
    setSelection([prop.id]);
    setPanel("props");
    setMessage(note("propAdded", { name: catalogLabel(catalogId, locale) }));
  }

  function removeSelected(id: string) {
    rememberProps();
    setSelection((current) => current.filter((item) => item !== id));
    patch((scene) => {
      const props = scene.props.filter((prop) => prop.id !== id);
      return { ...scene, props, activePropId: scene.activePropId === id ? (props[0]?.id ?? null) : scene.activePropId };
    });
  }

  function duplicateSelected(id: string) {
    const current = sceneRef.current;
    const prop = current?.props.find((item) => item.id === id);
    if (!current || !prop) return;
    const copy = duplicateProp(prop, current.props);
    if (!copy) {
      setError(note("err.propCap"));
      return;
    }
    rememberProps();
    patch((scene) => ({ ...scene, props: [...scene.props, copy], activePropId: copy.id }));
    setSelection([copy.id]);
  }

  useEffect(() => {
    selectionRef.current = selection;
    panelRef.current = panel;
    commandsRef.current = { undo: undoProps, redo: redoProps, duplicate: duplicateSelected, remove: removeSelected };
  });

  function transformProp(id: string, partial: { position?: Partial<SceneProp["position"]>; rotation?: Partial<SceneProp["rotation"]>; scale?: Partial<SceneProp["scale"]> }) {
    patch((scene) => ({
      ...scene,
      props: scene.props.map((prop) =>
        prop.id === id
          ? {
              ...prop,
              position: clampPosition({ ...prop.position, ...partial.position }),
              rotation: clampRotation({ ...prop.rotation, ...partial.rotation }),
              scale: clampScale({ ...prop.scale, ...partial.scale }),
            }
          : prop,
      ),
    }));
  }

  function keyProps() {
    const current = sceneRef.current;
    if (!current?.propClip?.autoKey) return;
    let clip = current.propClip;
    const time = engineRef.current?.getMotionTime(current.activeId) ?? 0;
    if (time > clip.duration) clip = { ...clip, duration: Math.min(30, time) };
    for (const prop of current.props) {
      if (prop.id !== current.activePropId && !selectionRef.current.includes(prop.id)) continue;
      clip = writePropKey(clip, time, prop.id, { position: prop.position, rotation: prop.rotation, scale: prop.scale });
    }
    setScene((scene) => (scene ? { ...scene, propClip: clip } : scene));
  }

  async function importCustom(asset: CustomAsset) {
    const next = [...customs.filter((item) => item.id !== asset.id), asset];
    if (next.length > 32) {
      setError(note("err.customCap"));
      return;
    }
    setCustomAssets(next);
    setCustomTextures(Object.assign({}, ...next.map((item) => item.textures)));
    setCustoms(next);
    await storeCustomAssets(next);
    addProp(asset.id);
    setMessage(note("customAdded", { name: asset.name }));
  }

  function downloadProject() {
    const current = sceneRef.current;
    if (!current) return;
    const blob = new Blob([JSON.stringify(exportProject(current, engineRef.current?.getCamera(), customs))], { type: "application/json" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "pixelstage-project.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importProject(file: File) {
    try {
      if (file.size > 24_000_000) {
        setError(note("err.project"));
        return;
      }
      const parsed = parseProject(JSON.parse(await file.text()) as unknown);
      const skins = ensureSkins();
      if (!parsed || !skins) {
        setError(note("err.project"));
        return;
      }
      const merged = new Map(customs.map((asset) => [asset.id, asset]));
      for (const asset of parsed.customs) merged.set(asset.id, asset);
      const nextCustoms = [...merged.values()];
      setCustomAssets(nextCustoms);
      setCustomTextures(Object.assign({}, ...nextCustoms.map((asset) => asset.textures)));
      setCustoms(nextCustoms);
      await storeCustomAssets(nextCustoms);
      const next = sceneFromPayload(parsed.payload, skins.steve, skins.alex);
      setScene(next.scene);
      setSelection(next.scene.activePropId ? [next.scene.activePropId] : []);
      if (next.camera) engineRef.current?.setCamera(next.camera);
      setMessage(note("projectApplied"));
    } catch (reason) {
      setError(errorNote(reason, "err.project"));
    }
  }

  const readPlayhead = useCallback(() => engineRef.current?.getMotionTime(sceneRef.current?.activeId ?? "") ?? 0, []);

  async function lookupInto(id: string, name: string) {
    setBusy(true);
    setError(null);
    try {
      const data = await requestPlayer(name);
      patch((current) => ({
        ...current,
        players: current.players.map((player) =>
          player.id === id
            ? {
                ...player,
                name: data.name,
                username: data.name,
                source: "username",
                model: data.model,
                skinUrl: data.skin,
                capeUrl: data.cape,
                showCape: true,
              }
            : player,
        ),
      }));
      setMessage(note("skinNamed", { name: data.name }));
    } catch (reason) {
      setError(errorNote(reason, "err.noSkin"));
    } finally {
      setBusy(false);
    }
  }

  async function onSearch(event: FormEvent) {
    event.preventDefault();
    if (!scene || !query.trim()) return;
    await lookupInto(scene.activeId, query.trim());
  }

  async function ingestFiles(files: File[]) {
    const images = files.filter((file) => file.type === "image/png" || file.name.toLowerCase().endsWith(".png"));
    if (!images.length) {
      setError(note("err.skinPng"));
      return;
    }
    if (!scene) return;
    const loaded: PlayerDraft[] = [];
    for (const file of images.slice(0, 4)) {
      try {
        const url = await fileToDataUrl(file);
        const image = await loadImage(url);
        const canvas = document.createElement("canvas");
        loadSkinToCanvas(canvas, image);
        const model = inferModelType(canvas);
        loaded.push(
          makePlayer({
            name: file.name.replace(/\.png$/i, "") || tr("upload"),
            source: "upload",
            skinUrl: canvas.toDataURL("image/png"),
            model,
          }),
        );
      } catch (reason) {
        setError(errorNote(reason, "err.pngRead"));
      }
    }
    if (!loaded.length) return;
    patch((current) => {
      const players = current.players.map((player) =>
        player.id === current.activeId
          ? {
              ...player,
              name: loaded[0].name,
              source: loaded[0].source,
              username: loaded[0].username,
              skinUrl: loaded[0].skinUrl,
              capeUrl: null,
              showCape: true,
              model: loaded[0].model,
            }
          : player,
      );
      for (const extra of loaded.slice(1)) {
        if (players.length >= 4) break;
        players.push(extra);
      }
      return { ...current, players, activeId: current.activeId };
    });
    setMessage(loaded.length > 1 ? note("skinsAdded", { count: Math.min(4, loaded.length) }) : note("skinReplaced"));
  }

  async function download(transparent: boolean) {
    if (!scene || !engineRef.current) return;
    const format = formatById(scene.formatId);
    setBusy(true);
    try {
      const blob = await engineRef.current.capture({
        width: format.width,
        height: format.height,
        round: transparent ? false : format.round,
        transparent,
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      const who = (active?.name || "skin").toLowerCase().replace(/[^a-z0-9_-]+/gi, "-");
      link.download = `pixelstage-${who}-${transparent ? "transparent" : format.id}.png`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (reason) {
      setError(errorNote(reason, "err.export"));
    } finally {
      setBusy(false);
    }
  }

  async function downloadGif() {
    if (!scene || !engineRef.current) return;
    const format = formatById(scene.formatId);
    const size = gifFrameSize(format);
    const span = clipExportSpanForPlayers(scene.players);
    setBusy(true);
    try {
      const blob = await engineRef.current.captureClip({
        width: size.width,
        height: size.height,
        round: format.round,
        transparent: scene.background === "none" && !scene.backgroundImage,
        frames: span.frames,
        seconds: span.seconds,
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      const who = (active?.name || "skin").toLowerCase().replace(/[^a-z0-9_-]+/gi, "-");
      link.download = `pixelstage-${who}-${scene.players.length > 1 ? "players" : active?.clip ?? "clip"}.gif`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(note("gifExported", { width: size.width, height: size.height }));
    } catch (reason) {
      setError(errorNote(reason, "err.gif"));
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!scene || !engineRef.current) return;
    const payload = toPayload(scene, engineRef.current.getCamera(), false);
    const hash = encodePayload(payload);
    const url = `${window.location.origin}${window.location.pathname}#${hash}`;
    window.history.replaceState(null, "", `#${hash}`);
    try {
      await navigator.clipboard.writeText(url);
      const uploaded = scene.players.some((player) => player.source === "upload");
      const background = Boolean(scene.backgroundImage);
      const notes = [uploaded ? tr("shareSkin") : "", background ? tr("shareBg") : "", scene.props.length ? tr("shareProps") : ""].filter(Boolean);
      setMessage(notes.length ? note("shareNotes", { notes: notes.join(locale === "zh" ? "，" : ", ") }) : note("shareOk"));
    } catch {
      setMessage(note("shareBar"));
    }
  }

  if (fatal) {
    return <div className="boot">{tr(fatal)}</div>;
  }

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden />
          <div>
            <strong>Pixelstage</strong>
            <span>{tr("tagline")}</span>
          </div>
        </div>
        <form className="search" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={tr("namePlaceholder")}
            aria-label={tr("nameAria")}
            maxLength={16}
          />
          <button className="btn" type="submit" disabled={busy}>
            {tr("lookup")}
          </button>
        </form>
        <div className="actions desktop-actions">
          <button className="btn ghost" type="button" onClick={() => { const skins = ensureSkins(); if (skins) updateActive({ name: "Steve", source: "builtin", username: null, skinUrl: skins.steve, capeUrl: null, model: "default" }); }}>
            Steve
          </button>
          <button className="btn ghost" type="button" onClick={() => { const skins = ensureSkins(); if (skins) updateActive({ name: "Alex", source: "builtin", username: null, skinUrl: skins.alex, capeUrl: null, model: "slim" }); }}>
            Alex
          </button>
          <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
            {tr("upload")}
          </button>
          <button className="btn ghost" type="button" onClick={() => void share()}>
            {tr("share")}
          </button>
          <div className="export-cluster">
            <button className="btn" type="button" disabled={busy} onClick={() => void download(true)}>
              {tr("transparentPng")}
            </button>
            <button className="btn" type="button" disabled={busy || !scene} onClick={() => void downloadGif()}>
              {busy ? tr("working") : tr("exportGif")}
            </button>
            <button className="btn primary" type="button" disabled={busy || !scene} onClick={() => void download(false)}>
              {busy ? tr("working") : tr("download")}
            </button>
          </div>
        </div>
        <div className="top-tools">
          <div className="lang" role="group" aria-label={tr("lang")}>
            <button type="button" className={locale === "zh" ? "active" : ""} aria-pressed={locale === "zh"} onClick={() => setLocale("zh")}>
              中
            </button>
            <button type="button" className={locale === "en" ? "active" : ""} aria-pressed={locale === "en"} onClick={() => setLocale("en")}>
              EN
            </button>
          </div>
          <button
            className="btn ghost mobile-menu"
            type="button"
            aria-expanded={drawerOpen}
            aria-controls="studio-drawer"
            onClick={() => setDrawerOpen((open) => !open)}
          >
            {drawerOpen ? tr("collapse") : tr("panel")}
          </button>
        </div>
        <input
          ref={fileRef}
          hidden
          type="file"
          accept="image/png"
          multiple
          onChange={(event) => {
            const files = [...(event.target.files ?? [])];
            event.target.value = "";
            void ingestFiles(files);
          }}
        />
      </header>
      <div className="stage">
        <div
          className={dropping ? "viewport dropping" : "viewport"}
          ref={viewRef}
          onDragOver={(event) => {
            event.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDropping(false);
            void ingestFiles([...event.dataTransfer.files]);
          }}
        >
          {error ? <div className="toast error">{t(locale, error.key, error.vars)}</div> : message ? <div className="toast">{t(locale, message.key, message.vars)}</div> : null}
          <div className="hud">
            <span>{moveMode && panel !== "props" ? tr("dragPlayer") : tr("orbit")}</span>
            <span>{tr("pinch")}</span>
          </div>
        </div>
        <button
          type="button"
          className={drawerOpen ? "drawer-backdrop show" : "drawer-backdrop"}
          aria-label={tr("closePanel")}
          onClick={() => setDrawerOpen(false)}
        />
        <aside id="studio-drawer" className={drawerOpen ? "aside open" : "aside"}>
          {scene && active ? (
            <>
              <div className="drawer-head">
                <strong>{tr("controls")}</strong>
                <button className="btn ghost" type="button" onClick={() => setDrawerOpen(false)}>
                  {tr("close")}
                </button>
              </div>
              <section className="block mobile-tools">
                <h2>{tr("skin")}</h2>
                <div className="row">
                  <button className="btn ghost" type="button" onClick={() => { const skins = ensureSkins(); if (skins) updateActive({ name: "Steve", source: "builtin", username: null, skinUrl: skins.steve, capeUrl: null, model: "default" }); }}>
                    Steve
                  </button>
                  <button className="btn ghost" type="button" onClick={() => { const skins = ensureSkins(); if (skins) updateActive({ name: "Alex", source: "builtin", username: null, skinUrl: skins.alex, capeUrl: null, model: "slim" }); }}>
                    Alex
                  </button>
                  <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
                    {tr("upload")}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => void share()}>
                    {tr("share")}
                  </button>
                </div>
                <div className="row export-cluster" style={{ marginTop: 8 }}>
                  <button className="btn" type="button" disabled={busy} onClick={() => void download(true)}>
                    {tr("transparentPng")}
                  </button>
                  <button className="btn" type="button" disabled={busy || !scene} onClick={() => void downloadGif()}>
                    {busy ? tr("working") : tr("exportGif")}
                  </button>
                  <button className="btn primary" type="button" disabled={busy || !scene} onClick={() => void download(false)}>
                    {busy ? tr("working") : tr("download")}
                  </button>
                </div>
              </section>
              <div className="tabs" role="tablist" aria-label={tr("controls")}>
                {PANELS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={panel === id}
                    className={panel === id ? "active" : ""}
                    onClick={() => setPanel(id)}
                  >
                    {tr(PANEL_LABEL[id])}
                  </button>
                ))}
              </div>
              <section className="block" hidden={panel !== "scene"}>
                <div className="section-head">
                  <h2>{tr("scene")}</h2>
                  <button className="btn ghost" type="button" onClick={resetSceneToDefault}>
                    {tr("resetScene")}
                  </button>
                </div>
                <p className="hint scene-hint">{scene.backgroundImage ? tr("sceneHintOn") : tr("sceneHintOff")}</p>
                <div className="row scene-chips">
                  {BACKGROUNDS.map((id) => (
                    <button key={id} type="button" className={scene.background === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, background: id }))}>
                      {ui(locale, `bg.${id}`)}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" type="button" onClick={() => backgroundFileRef.current?.click()}>
                    {tr("uploadBg")}
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={!scene.backgroundImage}
                    onClick={() => patch((current) => ({ ...current, backgroundImage: null }))}
                  >
                    {tr("remove")}
                  </button>
                  <button type="button" className={scene.backgroundFit === "cover" ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, backgroundFit: "cover" }))}>
                    {tr("cover")}
                  </button>
                  <button type="button" className={scene.backgroundFit === "contain" ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, backgroundFit: "contain" }))}>
                    {tr("contain")}
                  </button>
                </div>
                <input
                  ref={backgroundFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  hidden
                  aria-label={tr("uploadBg")}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void ingestBackground(file);
                  }}
                />
              </section>
              <section className="block" hidden={panel !== "cast"}>
                <div className="section-head">
                  <h2>{tr("players")}</h2>
                  <button className="btn reset" type="button" onClick={resetActivePlayer} title={tr("resetTitle")}>
                    {tr("reset")}
                  </button>
                </div>
                <div className="player-list">
                  {scene.players.map((player) => (
                    <div key={player.id} className={player.id === scene.activeId ? "player active" : "player"}>
                      <button type="button" className="icon-btn" onClick={() => patch((current) => ({ ...current, activeId: player.id }))} style={{ textAlign: "left", flex: 1 }}>
                        <strong>{player.name}</strong>
                        <small>
                          {player.model === "slim" ? tr("slim") : tr("wide")} · {player.id === active.id ? poseName : poseLabel(locale, player.poseId, presets)}
                        </small>
                      </button>
                      {scene.players.length > 1 ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={tr("removeNamed", { name: player.name })}
                          onClick={() =>
                            patch((current) => {
                              const players = current.players.filter((item) => item.id !== player.id);
                              return { ...current, players, activeId: current.activeId === player.id ? players[0].id : current.activeId };
                            })
                          }
                        >
                          {tr("remove")}
                        </button>
                      ) : null}
                    </div>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 10 }}>
                  <button
                    className="btn"
                    type="button"
                    disabled={scene.players.length >= 4}
                    onClick={() => {
                      const skins = ensureSkins();
                      if (!skins) return;
                      patch((current) => {
                        const player = makePlayer({ name: "Steve", skinUrl: skins.steve, model: "default" });
                        return { ...current, players: [...current.players, player], activeId: player.id };
                      });
                    }}
                  >
                    {tr("addPlayer")}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => engineRef.current?.frameBody(scene.players.length)}>
                    {tr("frameBody")}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => engineRef.current?.frameHead()}>
                    {tr("frameHead")}
                  </button>
                </div>
                {active.capeUrl ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className={active.showCape ? "chip active" : "chip"} type="button" onClick={() => updateActive({ showCape: !active.showCape })}>
                      {active.showCape ? tr("capeOn") : tr("capeOff")}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="block" hidden={panel !== "cast"}>
                <h2>{tr("position")}</h2>
                <div className="row">
                  <button className={moveMode ? "chip active" : "chip"} type="button" onClick={() => setMoveMode((value) => !value)}>
                    {moveMode ? tr("moving") : tr("move")}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => updateActive({ position: { x: 0, y: 0, z: 0 }, scale: 1 })}>
                    {tr("recenter")}
                  </button>
                </div>
                <div className="sliders" style={{ marginTop: 10 }}>
                  {AXES.map(([key, label, min, max, step]) => (
                    <label className="slider" key={key}>
                      <span>{tr(label)}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={active.position[key]}
                        aria-label={tr("axisAria", { label: tr(label) })}
                        onChange={(event) => updateActive({ position: { ...active.position, [key]: Number(event.target.value) } })}
                      />
                      <strong>{active.position[key].toFixed(1)}</strong>
                    </label>
                  ))}
                  <label className="slider">
                    <span>{tr("scale")}</span>
                    <input
                      type="range"
                      min={0.5}
                      max={1.6}
                      step={0.05}
                      value={active.scale}
                      aria-label={tr("scaleAria")}
                      onChange={(event) => updateActive({ scale: Number(event.target.value) })}
                    />
                    <strong>{active.scale.toFixed(2)}</strong>
                  </label>
                </div>
              </section>

              <section className="block" hidden={panel !== "cast"}>
                <div className="section-head">
                  <h2>{tr("pose")}</h2>
                  <button className="btn ghost" type="button" onClick={resetActivePlayer}>
                    {tr("reset")}
                  </button>
                </div>
                <div className="poses">
                  {POSES.map((pose) => (
                    <button
                      key={pose.id}
                      type="button"
                      className={active.poseId === pose.id ? "pose active" : "pose"}
                      onClick={() => updateActive({ poseId: pose.id, joints: pose.joints })}
                    >
                      {poseLabel(locale, pose.id, presets)}
                    </button>
                  ))}
                </div>
                <div className="preset-tools">
                  <label className="field">
                    <span>{tr("saveAs")}</span>
                    <input value={presetName} maxLength={24} placeholder={tr("poseName")} aria-label={tr("poseName")} onChange={(event) => setPresetName(event.target.value)} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={keepLook} onChange={(event) => setKeepLook(event.target.checked)} />
                    {tr("keepLook")}
                  </label>
                  <div className="row">
                    <button className="btn" type="button" onClick={saveUserPreset}>
                      {tr("savePose")}
                    </button>
                    <button className="btn ghost" type="button" disabled={!presets.length} onClick={() => downloadPresets(presets)}>
                      {tr("exportJson")}
                    </button>
                    <button className="btn ghost" type="button" onClick={() => presetFileRef.current?.click()}>
                      {tr("importFile")}
                    </button>
                  </div>
                  {presets.length ? (
                    <div className="preset-list">
                      {presets.map((preset) => (
                        <div className="preset-row" key={preset.id}>
                          {renamingId === preset.id ? (
                            <input
                              value={renameValue}
                              maxLength={24}
                              aria-label={tr("newPoseName")}
                              onChange={(event) => setRenameValue(event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") commitRename(preset.id);
                              }}
                            />
                          ) : (
                            <button type="button" className={active.poseId === `user:${preset.id}` ? "pose active" : "pose"} onClick={() => applyUserPreset(preset)}>
                              {preset.name}
                            </button>
                          )}
                          {renamingId === preset.id ? (
                            <button className="btn" type="button" onClick={() => commitRename(preset.id)}>
                              {tr("done")}
                            </button>
                          ) : (
                            <button
                              className="btn ghost"
                              type="button"
                              onClick={() => {
                                setRenamingId(preset.id);
                                setRenameValue(preset.name);
                              }}
                            >
                              {tr("rename")}
                            </button>
                          )}
                          <button className="btn ghost" type="button" onClick={() => writePresets(presets.filter((item) => item.id !== preset.id))}>
                            {tr("delete")}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <label className="field">
                    <span>{tr("pasteJson")}</span>
                    <textarea className="preset-json" value={presetJson} aria-label={tr("poseJson")} placeholder='{"v":1,"presets":[]}' onChange={(event) => setPresetJson(event.target.value)} />
                  </label>
                  <div className="row">
                    <button className="btn" type="button" disabled={!presetJson.trim()} onClick={() => importPresetText(presetJson)}>
                      {tr("pasteImport")}
                    </button>
                  </div>
                  <input
                    ref={presetFileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    aria-label={tr("importPoseFile")}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void file.text().then((text) => importPresetText(text)).catch(() => setError(note("err.poseFile")));
                    }}
                  />
                </div>
              </section>

              <section className="block" hidden={panel !== "motion"}>
                <h2>{tr("motion")}</h2>
                <div className="poses">
                  {CLIPS.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      className={active.clip === clip.id ? "pose active" : "pose"}
                      onClick={() => updateActive({ clip: clip.id })}
                    >
                      {ui(locale, `clip.${clip.id}`)}
                    </button>
                  ))}
                  <button
                    type="button"
                    className={active.clip === "custom" ? "pose active" : "pose"}
                    disabled={!active.customAnimation}
                    title={active.customAnimation?.name || tr("customAnimation")}
                    onClick={() => updateActive({ clip: "custom" })}
                  >
                    {active.customAnimation?.name || tr("customAnimation")}
                  </button>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {SPEEDS.map(([speed, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={active.clipSpeed === speed ? "chip active" : "chip"}
                      onClick={() => updateActive({ clipSpeed: speed })}
                    >
                      {tr(label)}
                    </button>
                  ))}
                  <button className="btn" type="button" disabled={busy} onClick={() => void downloadGif()}>
                    {tr("exportGif")}
                  </button>
                </div>
                {active.clip !== "custom" && active.customAnimation ? (
                  <div className="timeline-empty">
                    <p>{tr("timelinePaused")}</p>
                    <button className="btn primary" type="button" onClick={() => updateActive({ clip: "custom" })}>
                      {tr("timelineResume")}
                    </button>
                  </div>
                ) : (
                  <TimelineEditor
                    locale={locale}
                    animation={active.clip === "custom" ? active.customAnimation : null}
                    rest={active.joints}
                    playerId={active.id}
                    getPlayhead={readPlayhead}
                    onChange={(animation) => updateActive({ clip: "custom", customAnimation: animation })}
                    onCreate={(animation) => {
                      updateActive({ clip: "custom", customAnimation: animation });
                      setMessage(note("animImported", { name: animation.name }));
                    }}
                    onError={(error) => setError(parseNote(error) ?? note("err.animJson"))}
                    onScrub={(time) => engineRef.current?.setScrub(active.id, time)}
                    onScrubEnd={() => engineRef.current?.setScrub(null)}
                  />
                )}
                <details className="advanced">
                  <summary>{tr("jsonAdvanced")}</summary>
                  <div className="preset-tools">
                  <div className="row">
                    <button className="btn" type="button" onClick={exportAnimation}>
                      {tr("exportAnimation")}
                    </button>
                    <button className="btn ghost" type="button" onClick={() => animationFileRef.current?.click()}>
                      {tr("importAnimation")}
                    </button>
                  </div>
                  <label className="field">
                    <span>{tr("animationJson")}</span>
                    <textarea
                      className="preset-json"
                      value={animationJson}
                      aria-label={tr("animationJson")}
                      placeholder='{"v":1,"name":"Wave","duration":1.6,"loop":true,"keyframes":[{"time":0,"joints":{"rArmZ":-20}}]}'
                      onChange={(event) => setAnimationJson(event.target.value)}
                    />
                  </label>
                  <div className="row">
                    <button className="btn" type="button" disabled={!animationJson.trim()} onClick={() => importAnimationText(animationJson)}>
                      {tr("pasteImport")}
                    </button>
                  </div>
                  <input
                    ref={animationFileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    aria-label={tr("importAnimation")}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      if (file.size > MAX_ANIMATION_TEXT_LENGTH) {
                        setError(note("err.animSize"));
                        return;
                      }
                      void file.text().then((text) => importAnimationText(text)).catch(() => setError(note("err.animFile")));
                    }}
                  />
                </div>
                </details>
              </section>

              {panel === "props" ? (
                <PropShelf
                  locale={locale}
                  props={scene.props}
                  activeId={scene.activePropId}
                  selectedIds={selection}
                  mode={gizmoMode}
                  space={gizmoSpace}
                  snap={gizmoSnap}
                  clip={scene.propClip ?? null}
                  catalogTick={catalogTick}
                  canUndo={historyCounts.undo > 0}
                  canRedo={historyCounts.redo > 0}
                  pack={texturePack}
                  onAdd={addProp}
                  onSelect={(id, shift) => {
                    setSelection((current) => (shift ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]));
                    patch((current) => ({ ...current, activePropId: id }));
                  }}
                  onRemove={removeSelected}
                  onClear={() => {
                    rememberProps();
                    setSelection([]);
                    patch((current) => ({ ...current, props: [], activePropId: null }));
                    setMessage(note("propsCleared"));
                  }}
                  onRename={(id, name) => patch((current) => ({ ...current, props: current.props.map((prop) => (prop.id === id ? { ...prop, name: name.slice(0, 48) } : prop)) }))}
                  onToggleHidden={(id) => patch((current) => ({ ...current, props: current.props.map((prop) => (prop.id === id ? { ...prop, hidden: !prop.hidden } : prop)) }))}
                  onToggleLocked={(id) => patch((current) => ({ ...current, props: current.props.map((prop) => (prop.id === id ? { ...prop, locked: !prop.locked } : prop)) }))}
                  onDuplicate={duplicateSelected}
                  onTransform={transformProp}
                  onPivot={(id, axis, value) =>
                    patch((current) => ({
                      ...current,
                      props: current.props.map((prop) => {
                        if (prop.id !== id) return prop;
                        const next = movePivot(prop.position, prop.pivot, prop.rotation, prop.scale, { ...prop.pivot, [axis]: value });
                        return { ...prop, position: next.position, pivot: next.pivot };
                      }),
                    }))
                  }
                  onEditStart={rememberProps}
                  onEditEnd={keyProps}
                  onMode={setGizmoMode}
                  onSpace={setGizmoSpace}
                  onSnap={setGizmoSnap}
                  onUndo={undoProps}
                  onRedo={redoProps}
                  onAutoKey={(enabled) =>
                    patch((current) => ({
                      ...current,
                      propClip: enabled ? { ...(current.propClip ?? emptyPropClip()), autoKey: true } : current.propClip ? { ...current.propClip, autoKey: false } : null,
                    }))
                  }
                  onImportCustom={(asset) => void importCustom(asset)}
                  onExportProject={downloadProject}
                  onImportProject={(file) => void importProject(file)}
                  onError={(error) => setError(errorNote(error, "err.customRead"))}
                  onImportPack={(files, mode) => void importTexturePack(files, mode)}
                  onClearPack={() => {
                    clearPropTexturePack();
                    void clearStoredPropTexturePack();
                    setTexturePack(null);
                    setMessage(note("packCleared"));
                  }}
                />
              ) : null}

              <section className="block" hidden={panel !== "cast"}>
                <h2>{tr("outer")}</h2>
                <div className="row">
                  <button type="button" className={active.showOuter ? "chip active" : "chip"} onClick={() => updateActive({ showOuter: !active.showOuter })}>
                    {tr("secondLayer")}
                  </button>
                  <button
                    type="button"
                    className={active.layerMode === "voxel" ? "chip active" : "chip"}
                    onClick={() =>
                      updateActive({
                        layerMode: active.layerMode === "voxel" ? "flat" : "voxel",
                        showOuter: active.layerMode === "voxel" ? active.showOuter : true,
                      })
                    }
                  >
                    {tr("voxel")}
                  </button>
                </div>
              </section>

              <section className="block" hidden={panel !== "cast"}>
                <h2>{tr("joints")}</h2>
                <div className="sliders">
                  {SLIDERS.map((slider) => (
                    <label className="slider" key={slider.key}>
                      <span>{tr(slider.label)}</span>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        value={active.joints[slider.key]}
                        aria-label={tr(slider.label)}
                        onChange={(event) => updateActive({ poseId: "custom", joints: { ...active.joints, [slider.key]: Number(event.target.value) } })}
                      />
                      <strong>{Math.round(active.joints[slider.key])}°</strong>
                    </label>
                  ))}
                </div>
              </section>

              <section className="block" hidden={panel !== "cast"}>
                <h2>{tr("names")}</h2>
                <label className="field">
                  <span>{tr("nametag")}</span>
                  <input value={active.nametag} maxLength={16} onChange={(event) => updateActive({ nametag: event.target.value })} placeholder={tr("nametagPh")} />
                </label>
                <label className="field">
                  <span>{tr("bubble")}</span>
                  <input value={active.bubble} maxLength={28} onChange={(event) => updateActive({ bubble: event.target.value })} placeholder={tr("bubblePh")} />
                </label>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn ghost" type="button" onClick={() => updateActive({ nametag: active.username || active.name })}>
                    {tr("useName")}
                  </button>
                </div>
              </section>

              <section className="block" hidden={panel !== "scene"}>
                <h2>{tr("lights")}</h2>
                <div className="row">
                  {LIGHTS.map((id) => (
                    <button key={id} type="button" className={scene.light === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, light: id }))}>
                      {ui(locale, `light.${id}`)}
                    </button>
                  ))}
                </div>
                <label className="slider" style={{ marginTop: 12 }}>
                  <span>{tr("keyLight")}</span>
                  <input
                    type="range"
                    min={0.45}
                    max={1.6}
                    step={0.05}
                    value={scene.keyIntensity}
                    aria-label={tr("keyLightAria")}
                    onChange={(event) => patch((current) => ({ ...current, keyIntensity: Number(event.target.value) }))}
                  />
                  <strong>{scene.keyIntensity.toFixed(2)}</strong>
                </label>
                <div className="row" style={{ marginTop: 12 }}>
                  {GRADES.map((id) => (
                    <button key={id} type="button" className={scene.grade === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, grade: id }))}>
                      {ui(locale, `grade.${id}`)}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {OUTLINES.map((id) => (
                    <button key={id} type="button" className={scene.outline === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, outline: id }))}>
                      {ui(locale, `outline.${id}`)}
                    </button>
                  ))}
                  <button type="button" className={scene.godrays ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, godrays: !current.godrays }))}>
                    {tr("godrays")}
                  </button>
                </div>
              </section>

              <section className="block" hidden={panel !== "scene"}>
                <h2>{tr("exportSize")}</h2>
                <div className="formats">
                  {FORMATS.map((format) => (
                    <button key={format.id} type="button" className={scene.formatId === format.id ? "format active" : "format"} onClick={() => patch((current) => ({ ...current, formatId: format.id }))}>
                      <strong>{ui(locale, `format.${format.id}`)}</strong>
                      <small>{format.detail}</small>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <p className="hint">{tr("boot")}</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function cloneProp(prop: SceneProp): SceneProp {
  return { ...prop, position: { ...prop.position }, rotation: { ...prop.rotation }, scale: { ...prop.scale }, pivot: { ...prop.pivot } };
}

function samePropTransform(a: SceneProp, b: SceneProp) {
  return a.position.x === b.position.x && a.position.y === b.position.y && a.position.z === b.position.z && a.rotation.x === b.rotation.x && a.rotation.y === b.rotation.y && a.rotation.z === b.rotation.z && a.scale.x === b.scale.x && a.scale.y === b.scale.y && a.scale.z === b.scale.z;
}

function clampPosition(position: SceneProp["position"]): SceneProp["position"] {
  return {
    x: Math.min(64, Math.max(-64, position.x)),
    y: Math.min(64, Math.max(-16, position.y)),
    z: Math.min(64, Math.max(-64, position.z)),
  };
}

function clampRotation(rotation: SceneProp["rotation"]): SceneProp["rotation"] {
  const clamp = (value: number) => Math.min(720, Math.max(-720, value));
  return { x: clamp(rotation.x), y: clamp(rotation.y), z: clamp(rotation.z) };
}

function clampScale(scale: SceneProp["scale"]): SceneProp["scale"] {
  const clamp = (value: number) => Math.min(8, Math.max(0.05, value));
  return { x: clamp(scale.x), y: clamp(scale.y), z: clamp(scale.z) };
}

function ui(locale: Locale, key: string, vars?: Record<string, string | number>) {
  const parsed = parseNote(key);
  return parsed ? t(locale, parsed.key, vars ?? parsed.vars) : key;
}

function poseLabel(locale: Locale, id: string, presets: UserPreset[]) {
  const preset = presets.find((item) => `user:${item.id}` === id);
  if (preset) return preset.name;
  const key = `pose.${id}`;
  return parseNote(key) ? t(locale, key as MessageKey) : t(locale, "custom");
}

function loadBackground(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(code("err.bgRead")));
    image.src = url;
  });
}

function compressBackground(image: HTMLImageElement, original: string) {
  const maxEdge = 1920;
  const largest = Math.max(image.naturalWidth, image.naturalHeight);
  if (largest <= maxEdge && original.length <= 1_500_000 && backgroundImageFrom(original)) return original;
  const scale = Math.min(1, maxEdge / Math.max(largest, 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error(code("err.canvas"));
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.85);
}

function downloadPresets(presets: UserPreset[]) {
  const blob = new Blob([JSON.stringify(presetDocument(presets), null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = "pixelstage-presets.json";
  link.click();
  URL.revokeObjectURL(url);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(code("err.fileRead")));
    reader.readAsDataURL(file);
  });
}
