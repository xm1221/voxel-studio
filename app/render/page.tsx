/**
 * Headless render page. The CLI opens this route in Chrome, sends a scene
 * document through `window.pixelstage`, and writes the result to disk. It is
 * not linked from the studio: the UI is untouched, and the page shows only a
 * blank stage while it works.
 */
"use client";

import { useEffect, useRef, useState } from "react";
import { StudioEngine } from "@/lib/engine";
import { loadCatalog } from "@/lib/catalog";
import { installPixelstage, registerPixelstage, unregisterPixelstage, type PixelstageHandlers } from "@/lib/render-api";
import { builtinSkins, stageHandlers } from "@/lib/stage-hooks";
import { defaultScene } from "@/lib/studio-state";
import { EMPTY_POSTER_TEXT, type PosterText } from "@/lib/poster";
import { DEFAULT_MOTION_EXPORT, type MotionExportOptions } from "@/lib/motion-export";
import type { CameraSnapshot, SceneDraft } from "@/lib/types";

declare global {
  interface Window {
    __pixelstageRender?: { ready: boolean; error: string | null };
  }
}

export default function RenderPage() {
  const viewRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    installPixelstage();
    const element = viewRef.current;
    if (!element) return;
    let engine: StudioEngine;
    try {
      engine = new StudioEngine(element);
    } catch {
      const message = "fatalWebgl";
      window.__pixelstageRender = { ready: false, error: message };
      // Deferred so the effect body itself never sets state.
      queueMicrotask(() => setError(message));
      return;
    }
    const sceneRef: { current: SceneDraft } = { current: defaultScene(builtinSkins().steve) };
    const cameraRef: { current: CameraSnapshot } = { current: engine.getCamera() };
    const posterRef: { current: PosterText } = { current: EMPTY_POSTER_TEXT };
    const motionRef: { current: MotionExportOptions } = { current: DEFAULT_MOTION_EXPORT };

    const handlers: PixelstageHandlers = stageHandlers({
      engine,
      getScene: () => sceneRef.current,
      getCamera: () => engine.getCamera(),
      setCamera: (camera) => {
        cameraRef.current = camera;
        engine.setCamera(camera);
      },
      getPoster: () => posterRef.current,
      setPoster: (poster) => {
        posterRef.current = poster;
      },
      getMotion: () => motionRef.current,
      setMotion: (motion) => {
        motionRef.current = motion;
      },
      applyScene: (next, camera) => {
        sceneRef.current = next;
        engine.sync(next);
        if (camera) engine.setCamera(camera);
      },
    });

    void loadCatalog()
      .then(() => engine.reloadProps())
      .catch(() => undefined)
      .finally(() => {
        engine.sync(sceneRef.current);
        registerPixelstage(handlers);
        setReady(true);
        window.__pixelstageRender = { ready: true, error: null };
      });

    return () => {
      unregisterPixelstage();
      engine.dispose();
    };
  }, []);

  return (
    <div style={{ position: "fixed", inset: 0, background: "#0b1020" }}>
      <div ref={viewRef} style={{ position: "absolute", inset: 0 }} aria-hidden />
      {error ? <p style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", color: "#fff" }}>{error}</p> : null}
      {!ready && !error ? <span style={{ display: "none" }}>booting</span> : null}
    </div>
  );
}
