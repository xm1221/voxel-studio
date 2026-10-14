"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createAlexSkin, createSteveSkin } from "@/lib/defaults";
import { StudioEngine } from "@/lib/engine";
import { FORMATS, formatById, gifFrameSize } from "@/lib/formats";
import { CLIPS, clipExportSpan } from "@/lib/motion";
import { decodePayload, encodePayload, toPayload } from "@/lib/persist";
import { POSES } from "@/lib/poses";
import { inferModelType, loadImage, loadSkinToCanvas } from "@/lib/skin-image";
import { STORAGE_KEY, defaultScene, makePlayer, requestPlayer, sceneFromPayload } from "@/lib/studio-state";
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
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [dropping, setDropping] = useState(false);
  const [fatal, setFatal] = useState<string | null>(null);

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
    if (!message && !error) return;
    const handle = window.setTimeout(() => {
      setMessage(null);
      setError(null);
    }, 4200);
    return () => window.clearTimeout(handle);
  }, [message, error]);

  const active = scene?.players.find((player) => player.id === scene.activeId) ?? scene?.players[0];

  const poseName = useMemo(() => {
    if (!active) return "";
    return POSES.find((pose) => pose.id === active.poseId)?.name ?? "自定义";
  }, [active]);

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
      const players = current.players.map((player) => (player.id === current.activeId ? { ...loaded[0], id: player.id, poseId: player.poseId, joints: player.joints, nametag: player.nametag, bubble: player.bubble } : player));
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
    const span = clipExportSpan(scene.clip);
    setBusy(true);
    try {
      const blob = await engineRef.current.captureClip({
        width: size.width,
        height: size.height,
        round: format.round,
        transparent: scene.background === "none",
        frames: span.frames,
        seconds: span.seconds,
      });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.href = url;
      const who = (active?.name || "skin").toLowerCase().replace(/[^a-z0-9_-]+/gi, "-");
      link.download = `pixelstage-${who}-${scene.clip}.gif`;
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
      setMessage(uploaded ? "链接已复制。上传的皮肤只留在这台设备上，别人打开会看到 Steve。" : "链接已复制，姿势、灯光和机位都在里面。");
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
        <div className="actions">
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
            <span>拖拽旋转</span>
            <span>滚轮缩放</span>
            <span>把 PNG 丢进来</span>
          </div>
        </div>
        <aside className="aside">
          {scene && active ? (
            <>
              <section className="block">
                <h2>角色</h2>
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
                <p className="hint">最多四个人。披风会跟着正版账号一起下来。</p>
                {active.capeUrl ? (
                  <div className="row" style={{ marginTop: 8 }}>
                    <button className={active.showCape ? "chip active" : "chip"} type="button" onClick={() => updateActive({ showCape: !active.showCape })}>
                      {active.showCape ? "披风开着" : "披风关着"}
                    </button>
                  </div>
                ) : null}
              </section>

              <section className="block">
                <h2>姿势</h2>
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
                <p className="hint">{POSES.find((pose) => pose.id === active.poseId)?.hint ?? "滑块已经离开预设，肘和膝还按你拉的角度弯。"}</p>
              </section>

              <section className="block">
                <h2>动作</h2>
                <div className="poses">
                  {CLIPS.map((clip) => (
                    <button
                      key={clip.id}
                      type="button"
                      className={scene.clip === clip.id ? "pose active" : "pose"}
                      onClick={() => patch((current) => ({ ...current, clip: clip.id }))}
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
                      className={scene.clipSpeed === speed ? "chip active" : "chip"}
                      onClick={() => patch((current) => ({ ...current, clipSpeed: Number(speed) }))}
                    >
                      {label}
                    </button>
                  ))}
                  <button className="btn" type="button" disabled={busy} onClick={() => void downloadGif()}>
                    导出 GIF
                  </button>
                </div>
                <p className="hint">
                  {CLIPS.find((clip) => clip.id === scene.clip)?.hint} 动图跟着当前比例，长边 480。
                </p>
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
                  <button type="button" className={scene.showOuter ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, showOuter: !current.showOuter }))}>
                    第二层
                  </button>
                </div>
              </section>

              <section className="block">
                <h2>场景</h2>
                <div className="row">
                  {BACKGROUNDS.map(([id, label]) => (
                    <button key={id} type="button" className={scene.background === id ? "chip active" : "chip"} onClick={() => patch((current) => ({ ...current, background: id }))}>
                      {label}
                    </button>
                  ))}
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
                <p className="hint">尺寸按平台规格取整。下载会按当前机位重渲再缩小。GIF 用同一比例，长边收到 480。4K 在较弱的设备上可能失败，那时用桌面尺寸。</p>
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

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("文件没有读出来。"));
    reader.readAsDataURL(file);
  });
}
