"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createAlexSkin, createSteveSkin } from "@/lib/defaults";
import { StudioEngine } from "@/lib/engine";
import { FORMATS, formatById, gifFrameSize } from "@/lib/formats";
import { CLIPS, clipExportSpanForPlayers } from "@/lib/motion";
import { backgroundImageFrom, decodePayload, encodePayload, toPayload } from "@/lib/persist";
import { POSES } from "@/lib/poses";
import { PRESET_STORAGE_KEY, mergePresets, newPresetId, parsePresetDocument, presetDocument, type UserPreset } from "@/lib/presets";
import { inferModelType, loadImage, loadSkinToCanvas } from "@/lib/skin-image";
import { STORAGE_KEY, defaultScene, makePlayer, requestPlayer, resetPlayer, resetSceneLook, sceneFromPayload } from "@/lib/studio-state";
import type { CameraSnapshot, Joints, PlayerDraft, SceneDraft } from "@/lib/types";

let builtinSkins: { steve: string; alex: string } | null = null;
let bootCamera: CameraSnapshot | undefined;
let bootRefetch: string[] = [];

function ensureSkins() {
  if (!builtinSkins && typeof document !== "undefined") {
    builtinSkins = { steve: createSteveSkin(), alex: createAlexSkin() };
  }
  return builtinSkins;
}

const BACKGROUNDS = [
  ["studio", "棚拍"],
  ["noon", "正午"],
  ["sunset", "黄昏"],
  ["night", "夜晚"],
  ["nether", "下界"],
  ["none", "透明"],
] as const;

const GRADES = [
  ["clean", "干净"],
  ["hologram", "全息"],
  ["ice", "冰"],
  ["comic", "漫画"],
] as const;

const OUTLINES = [
  ["none", "无描边"],
  ["ink", "墨线"],
  ["sticker", "贴纸"],
] as const;

const LIGHTS = [
  ["soft", "柔光"],
  ["hard", "硬光"],
  ["neon", "霓虹"],
  ["moon", "月光"],
] as const;

const SLIDERS: Array<{ key: keyof Joints; label: string; min: number; max: number }> = [
  { key: "headX", label: "头俯仰", min: -40, max: 40 },
  { key: "headY", label: "头转向", min: -55, max: 55 },
  { key: "bodyX", label: "身体", min: -30, max: 30 },
  { key: "rArmX", label: "右肩前后", min: -170, max: 170 },
  { key: "rArmZ", label: "右肩张开", min: -180, max: 40 },
  { key: "rElbow", label: "右肘", min: -150, max: 30 },
  { key: "lArmX", label: "左肩前后", min: -170, max: 170 },
  { key: "lArmZ", label: "左肩张开", min: -40, max: 180 },
  { key: "lElbow", label: "左肘", min: -150, max: 30 },
  { key: "rLegX", label: "右髋", min: -120, max: 70 },
  { key: "rKnee", label: "右膝", min: -15, max: 150 },
  { key: "lLegX", label: "左髋", min: -120, max: 70 },
  { key: "lKnee", label: "左膝", min: -15, max: 150 },
];

export function Studio() {
  const viewRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngine | null>(null);
  const sceneRef = useRef<SceneDraft | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const backgroundFileRef = useRef<HTMLInputElement>(null);
  const presetFileRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);
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
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

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

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const element = viewRef.current;
    if (!element) return;
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(element);
    } catch {
      queueMicrotask(() => setFatal("这个环境开不了 WebGL，渲染台起不来。"));
      return;
    }
    engineRef.current = engine;
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
          setError("链接里的皮肤没有重新取到，先用 Steve 站着。");
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
    engine.setTransformHandler((id, position) => {
      setScene((current) =>
        current
          ? {
              ...current,
              players: current.players.map((player) =>
                player.id === id ? { ...player, position: { ...player.position, x: position.x, z: position.z } } : player,
              ),
            }
          : current,
      );
    });
    return () => engine.setTransformHandler(null);
  }, []);

  useEffect(() => {
    engineRef.current?.setMoveTarget(moveMode ? active?.id ?? null : null);
  }, [active?.id, moveMode]);

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
    return POSES.find((pose) => pose.id === active.poseId)?.name ?? presets.find((preset) => `user:${preset.id}` === active.poseId)?.name ?? "自定义";
  }, [active, presets]);

  function writePresets(next: UserPreset[]) {
    setPresets(next);
    try {
      localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(presetDocument(next)));
    } catch {
      setError("浏览器没有把姿势存下来。");
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
      setError("姿势名字要在 1–24 个字。");
      return;
    }
    if (presets.length >= 40) {
      setError("最多保存 40 个姿势。");
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
    setMessage(`已保存「${name}」。`);
    updateActive({ poseId: `user:${preset.id}` });
  }

  function commitRename(id: string) {
    const name = renameValue.trim();
    if (!name || name.length > 24) {
      setError("姿势名字要在 1–24 个字。");
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
      setError("这不是姿势 JSON。");
      return;
    }
    const parsed = parsePresetDocument(value);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    const merged = mergePresets(presets, parsed.presets);
    if (!merged.ok) {
      setError(merged.error);
      return;
    }
    writePresets(merged.presets);
    setPresetJson("");
    setMessage(`导入了 ${parsed.presets.length} 个姿势。`);
  }

  function resetActivePlayer() {
    patch((current) => ({
      ...current,
      players: current.players.map((player) => (player.id === current.activeId ? resetPlayer(player) : player)),
    }));
    setMessage("已恢复这个角色的姿势、动作和位置。");
  }

  function resetSceneToDefault() {
    patch((current) => resetSceneLook(current));
    setMessage("场景灯光和背景已恢复默认。");
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
      setError("请放 PNG、JPG 或 WebP 背景图。");
      return;
    }
    if (file.size > 12 * 1024 * 1024) {
      setError("背景图请小于 12MB。");
      return;
    }
    try {
      const url = await fileToDataUrl(file);
      const image = await loadBackground(url);
      const stored = compressBackground(image, url);
      if (!backgroundImageFrom(stored)) {
        setError("这张背景图读不了。");
        return;
      }
      patch((current) => ({ ...current, backgroundImage: stored }));
      setMessage("背景图已换上。它只留在这台浏览器，分享链接里没有。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "这张背景图读不了。");
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
      setMessage(`已换上 ${data.name} 的皮肤。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "没有取到皮肤。");
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
      setError("请放 PNG 皮肤，64×64 或旧版 64×32。");
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
            name: file.name.replace(/\.png$/i, "") || "上传",
            source: "upload",
            skinUrl: canvas.toDataURL("image/png"),
            model,
          }),
        );
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "这张 PNG 读不了。");
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
    setMessage(loaded.length > 1 ? `放进了 ${Math.min(4, loaded.length)} 张皮肤。` : "已换上这张皮肤。");
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
      setError(reason instanceof Error ? reason.message : "导出失败了。");
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
      setMessage(`已导出 ${size.width}×${size.height} 的 GIF。`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "动图没有导出来。");
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
      const note = [
        uploaded ? "上传的皮肤只留在这台设备上" : "",
        background ? "背景图只留在这台设备上" : "",
      ].filter(Boolean);
      setMessage(note.length ? `链接已复制。${note.join("，")}。` : "链接已复制，姿势、灯光和机位都在里面。");
    } catch {
      setMessage("链接已经写进地址栏，复制地址就能分享。");
    }
  }

  if (fatal) {
    return <div className="boot">{fatal}</div>;
  }

  return (
    <div className="studio">
      <header className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden />
          <div>
            <strong>Pixelstage</strong>
            <span>皮肤渲染台</span>
          </div>
        </div>
        <form className="search" onSubmit={onSearch}>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入玩家名，比如 Notch"
            aria-label="Minecraft 玩家名"
            maxLength={16}
          />
          <button className="btn" type="submit" disabled={busy}>
            取皮肤
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
            上传
          </button>
          <button className="btn ghost" type="button" onClick={() => void share()}>
            复制链接
          </button>
          <button className="btn" type="button" disabled={busy} onClick={() => void download(true)}>
            透明 PNG
          </button>
          <button className="btn" type="button" disabled={busy || !scene} onClick={() => void downloadGif()}>
            {busy ? "处理中…" : "导出 GIF"}
          </button>
          <button className="btn primary" type="button" disabled={busy || !scene} onClick={() => void download(false)}>
            {busy ? "处理中…" : "下载"}
          </button>
        </div>
        <button
          className="btn ghost mobile-menu"
          type="button"
          aria-expanded={drawerOpen}
          aria-controls="studio-drawer"
          onClick={() => setDrawerOpen((open) => !open)}
        >
          {drawerOpen ? "收起" : "面板"}
        </button>
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
          {error ? <div className="toast error">{error}</div> : message ? <div className="toast">{message}</div> : null}
          <div className="hud">
            <span>{moveMode ? "拖动角色" : "拖拽旋转"}</span>
            <span>双指缩放</span>
          </div>
        </div>
        <button
          type="button"
          className={drawerOpen ? "drawer-backdrop show" : "drawer-backdrop"}
          aria-label="关闭控制面板"
          onClick={() => setDrawerOpen(false)}
        />
        <aside id="studio-drawer" className={drawerOpen ? "aside open" : "aside"}>
          {scene && active ? (
            <>
              <div className="drawer-head">
                <strong>控制面板</strong>
                <button className="btn ghost" type="button" onClick={() => setDrawerOpen(false)}>
                  关闭
                </button>
              </div>
              <section className="block mobile-tools">
                <h2>取皮肤</h2>
                <div className="row">
                  <button className="btn ghost" type="button" onClick={() => { const skins = ensureSkins(); if (skins) updateActive({ name: "Steve", source: "builtin", username: null, skinUrl: skins.steve, capeUrl: null, model: "default" }); }}>
                    Steve
                  </button>
                  <button className="btn ghost" type="button" onClick={() => { const skins = ensureSkins(); if (skins) updateActive({ name: "Alex", source: "builtin", username: null, skinUrl: skins.alex, capeUrl: null, model: "slim" }); }}>
                    Alex
                  </button>
                  <button className="btn ghost" type="button" onClick={() => fileRef.current?.click()}>
                    上传
                  </button>
                  <button className="btn ghost" type="button" onClick={() => void share()}>
                    复制链接
                  </button>
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" type="button" disabled={busy} onClick={() => void download(true)}>
                    透明 PNG
                  </button>
                  <button className="btn" type="button" disabled={busy || !scene} onClick={() => void downloadGif()}>
                    {busy ? "处理中…" : "导出 GIF"}
                  </button>
                  <button className="btn primary" type="button" disabled={busy || !scene} onClick={() => void download(false)}>
                    {busy ? "处理中…" : "下载"}
                  </button>
                </div>
              </section>
              <section className="block">
                <div className="section-head">
                  <h2>场景</h2>
                  <button className="btn ghost" type="button" onClick={resetSceneToDefault}>
                    恢复场景
                  </button>
                </div>
                <p className="hint scene-hint">
                  {scene.backgroundImage
                    ? "正在铺上传的背景图，预设地面先藏起来，脚下还留着影子。图片只存在这台浏览器，分享链接和透明 PNG 都不带它。"
                    : "地面和天空会一起换。上传的背景图只留在这台浏览器，不会进分享链接。"}
                </p>
                <div className="row scene-chips">
                  {BACKGROUNDS.map(([id, label]) => (
                    <button key={id} type="button" className={scene.background === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, background: id }))}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn" type="button" onClick={() => backgroundFileRef.current?.click()}>
                    上传背景图
                  </button>
                  <button
                    className="btn ghost"
                    type="button"
                    disabled={!scene.backgroundImage}
                    onClick={() => patch((current) => ({ ...current, backgroundImage: null }))}
                  >
                    移除
                  </button>
                  <button type="button" className={scene.backgroundFit === "cover" ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, backgroundFit: "cover" }))}>
                    铺满
                  </button>
                  <button type="button" className={scene.backgroundFit === "contain" ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, backgroundFit: "contain" }))}>
                    完整
                  </button>
                </div>
                <input
                  ref={backgroundFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  hidden
                  aria-label="上传背景图"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (file) void ingestBackground(file);
                  }}
                />
              </section>
              <section className="block">
                <div className="section-head">
                  <h2>角色</h2>
                  <button className="btn reset" type="button" onClick={resetActivePlayer} title="姿势回到站立，动作回到呼吸，速度、位置、缩放复原，并清掉名牌和气泡">
                    恢复默认
                  </button>
                </div>
                <div className="player-list">
                  {scene.players.map((player) => (
                    <div key={player.id} className={player.id === scene.activeId ? "player active" : "player"}>
                      <button type="button" className="icon-btn" onClick={() => patch((current) => ({ ...current, activeId: player.id }))} style={{ textAlign: "left", flex: 1 }}>
                        <strong>{player.name}</strong>
                        <small>
                          {player.model === "slim" ? "细臂" : "宽臂"} · {player.id === active.id ? poseName : POSES.find((pose) => pose.id === player.poseId)?.name ?? "自定义"}
                        </small>
                      </button>
                      {scene.players.length > 1 ? (
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label={`移除 ${player.name}`}
                          onClick={() =>
                            patch((current) => {
                              const players = current.players.filter((item) => item.id !== player.id);
                              return { ...current, players, activeId: current.activeId === player.id ? players[0].id : current.activeId };
                            })
                          }
                        >
                          移除
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
                    加一个人
                  </button>
                  <button className="btn ghost" type="button" onClick={() => engineRef.current?.frameBody(scene.players.length)}>
                    全身机位
                  </button>
                  <button className="btn ghost" type="button" onClick={() => engineRef.current?.frameHead()}>
                    头像机位
                  </button>
                </div>
                {active.capeUrl ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className={active.showCape ? "chip active" : "chip"} type="button" onClick={() => updateActive({ showCape: !active.showCape })}>
                      {active.showCape ? "披风开着" : "披风关着"}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="block">
                <h2>位置</h2>
                <div className="row">
                  <button className={moveMode ? "chip active" : "chip"} type="button" onClick={() => setMoveMode((value) => !value)}>
                    {moveMode ? "移动中" : "移动角色"}
                  </button>
                  <button className="btn ghost" type="button" onClick={() => updateActive({ position: { x: 0, y: 0, z: 0 }, scale: 1 })}>
                    归位
                  </button>
                </div>
                <div className="sliders" style={{ marginTop: 10 }}>
                  {([
                    ["x", "左右", -32, 32, 0.1],
                    ["y", "高度", -12, 16, 0.1],
                    ["z", "前后", -32, 32, 0.1],
                  ] as const).map(([key, label, min, max, step]) => (
                    <label className="slider" key={key}>
                      <span>{label}</span>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={active.position[key]}
                        aria-label={`${label}位置`}
                        onChange={(event) => updateActive({ position: { ...active.position, [key]: Number(event.target.value) } })}
                      />
                      <strong>{active.position[key].toFixed(1)}</strong>
                    </label>
                  ))}
                  <label className="slider">
                    <span>缩放</span>
                    <input
                      type="range"
                      min={0.5}
                      max={1.6}
                      step={0.05}
                      value={active.scale}
                      aria-label="角色缩放"
                      onChange={(event) => updateActive({ scale: Number(event.target.value) })}
                    />
                    <strong>{active.scale.toFixed(2)}</strong>
                  </label>
                </div>
              </section>

              <section className="block">
                <div className="section-head">
                  <h2>姿势</h2>
                  <button className="btn ghost" type="button" onClick={resetActivePlayer}>
                    恢复默认
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
                      {pose.name}
                    </button>
                  ))}
                </div>
                <div className="preset-tools">
                  <label className="field">
                    <span>存成我的姿势</span>
                    <input value={presetName} maxLength={24} placeholder="姿势名字" aria-label="姿势名字" onChange={(event) => setPresetName(event.target.value)} />
                  </label>
                  <label className="check">
                    <input type="checkbox" checked={keepLook} onChange={(event) => setKeepLook(event.target.checked)} />
                    连灯光和机位
                  </label>
                  <div className="row">
                    <button className="btn" type="button" onClick={saveUserPreset}>
                      保存姿势
                    </button>
                    <button className="btn ghost" type="button" disabled={!presets.length} onClick={() => downloadPresets(presets)}>
                      导出 JSON
                    </button>
                    <button className="btn ghost" type="button" onClick={() => presetFileRef.current?.click()}>
                      导入文件
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
                              aria-label="新的姿势名字"
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
                              完成
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
                              改名
                            </button>
                          )}
                          <button className="btn ghost" type="button" onClick={() => writePresets(presets.filter((item) => item.id !== preset.id))}>
                            删除
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : null}
                  <label className="field">
                    <span>粘贴 JSON</span>
                    <textarea className="preset-json" value={presetJson} aria-label="姿势 JSON" placeholder='{"v":1,"presets":[]}' onChange={(event) => setPresetJson(event.target.value)} />
                  </label>
                  <div className="row">
                    <button className="btn" type="button" disabled={!presetJson.trim()} onClick={() => importPresetText(presetJson)}>
                      粘贴导入
                    </button>
                  </div>
                  <input
                    ref={presetFileRef}
                    type="file"
                    accept="application/json,.json"
                    hidden
                    aria-label="导入姿势文件"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (!file) return;
                      void file.text().then((text) => importPresetText(text)).catch(() => setError("姿势文件没有读出来。"));
                    }}
                  />
                </div>
              </section>

              <section className="block">
                <h2>动作</h2>
                <div className="poses">
                  {CLIPS.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      className={active.clip === clip.id ? "pose active" : "pose"}
                      onClick={() => updateActive({ clip: clip.id })}
                    >
                      {clip.name}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {[
                    [0.65, "慢"],
                    [1, "正常"],
                    [1.45, "快"],
                  ].map(([speed, label]) => (
                    <button
                      key={label}
                      type="button"
                      className={active.clipSpeed === speed ? "chip active" : "chip"}
                      onClick={() => updateActive({ clipSpeed: Number(speed) })}
                    >
                      {label}
                    </button>
                  ))}
                  <button className="btn" type="button" disabled={busy} onClick={() => void downloadGif()}>
                    导出 GIF
                  </button>
                </div>
              </section>

              <section className="block">
                <h2>外层</h2>
                <div className="row">
                  <button type="button" className={active.showOuter ? "chip active" : "chip"} onClick={() => updateActive({ showOuter: !active.showOuter })}>
                    第二层
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
                    3D 外层
                  </button>
                </div>
              </section>

              <section className="block">
                <h2>关节</h2>
                <div className="sliders">
                  {SLIDERS.map((slider) => (
                    <label className="slider" key={slider.key}>
                      <span>{slider.label}</span>
                      <input
                        type="range"
                        min={slider.min}
                        max={slider.max}
                        value={active.joints[slider.key]}
                        aria-label={slider.label}
                        onChange={(event) => updateActive({ poseId: "custom", joints: { ...active.joints, [slider.key]: Number(event.target.value) } })}
                      />
                      <strong>{Math.round(active.joints[slider.key])}°</strong>
                    </label>
                  ))}
                </div>
              </section>

              <section className="block">
                <h2>名字</h2>
                <label className="field">
                  <span>名牌</span>
                  <input value={active.nametag} maxLength={16} onChange={(event) => updateActive({ nametag: event.target.value })} placeholder="头顶那行字" />
                </label>
                <label className="field">
                  <span>气泡</span>
                  <input value={active.bubble} maxLength={28} onChange={(event) => updateActive({ bubble: event.target.value })} placeholder="一句短对白" />
                </label>
                <div className="row" style={{ marginTop: 8 }}>
                  <button className="btn ghost" type="button" onClick={() => updateActive({ nametag: active.username || active.name })}>
                    用玩家名
                  </button>
                </div>
              </section>

              <section className="block">
                <h2>灯光和效果</h2>
                <div className="row">
                  {LIGHTS.map(([id, label]) => (
                    <button key={id} type="button" className={scene.light === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, light: id }))}>
                      {label}
                    </button>
                  ))}
                </div>
                <label className="slider" style={{ marginTop: 12 }}>
                  <span>主光</span>
                  <input
                    type="range"
                    min={0.45}
                    max={1.6}
                    step={0.05}
                    value={scene.keyIntensity}
                    aria-label="主光强度"
                    onChange={(event) => patch((current) => ({ ...current, keyIntensity: Number(event.target.value) }))}
                  />
                  <strong>{scene.keyIntensity.toFixed(2)}</strong>
                </label>
                <div className="row" style={{ marginTop: 12 }}>
                  {GRADES.map(([id, label]) => (
                    <button key={id} type="button" className={scene.grade === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, grade: id }))}>
                      {label}
                    </button>
                  ))}
                </div>
                <div className="row" style={{ marginTop: 8 }}>
                  {OUTLINES.map(([id, label]) => (
                    <button key={id} type="button" className={scene.outline === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, outline: id }))}>
                      {label}
                    </button>
                  ))}
                  <button type="button" className={scene.godrays ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, godrays: !current.godrays }))}>
                    体积光
                  </button>
                </div>
              </section>

              <section className="block">
                <h2>导出尺寸</h2>
                <div className="formats">
                  {FORMATS.map((format) => (
                    <button key={format.id} type="button" className={scene.formatId === format.id ? "format active" : "format"} onClick={() => patch((current) => ({ ...current, formatId: format.id }))}>
                      <strong>{format.name}</strong>
                      <small>{format.detail}</small>
                    </button>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <p className="hint">正在摆好棚灯…</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function loadBackground(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("这张背景图读不了。"));
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
  if (!context) throw new Error("画布不可用。");
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
    reader.onerror = () => reject(new Error("文件没有读出来。"));
    reader.readAsDataURL(file);
  });
}
