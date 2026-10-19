"use client";

import { useEffect, useRef } from "react";
import { setCustomAssets } from "@/lib/custom-assets";
import { createSteveSkin } from "@/lib/defaults";
import { StudioEngine } from "@/lib/engine";
import { setCustomTextures } from "@/lib/prop-mesh";
import { parseProject } from "@/lib/project";
import { sceneFromPayload } from "@/lib/studio-state";
import type { SceneDraft } from "@/lib/types";

type RenderApi = {
  load: (value: unknown) => Promise<void>;
  png: (time: number, width: number, height: number) => Promise<string>;
};

declare global {
  interface Window {
    __pixelstageReady?: boolean;
    __pixelstage?: RenderApi;
  }
}

export default function RenderPage() {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const engine = new StudioEngine(host);
    let scene: SceneDraft | null = null;
    const api: RenderApi = {
      async load(value) {
        const parsed = parseProject(value);
        if (!parsed) throw new Error("bad project");
        setCustomAssets(parsed.customs);
        const textures = Object.assign({}, ...parsed.customs.map((asset) => asset.textures));
        setCustomTextures(textures);
        const steve = createSteveSkin();
        const next = sceneFromPayload(parsed.payload, steve, steve);
        scene = next.scene;
        engine.setMarkersVisible(false);
        engine.sync(scene);
        if (next.camera) engine.setCamera(next.camera);
        else engine.frameBody(Math.max(1, scene.players.length));
      },
      async png(time, width, height) {
        if (!scene) throw new Error("load a project first");
        engine.setScrub(scene.activeId, time);
        engine.sync(scene);
        const blob = await engine.capture({ width, height, round: false, transparent: false });
        const buffer = new Uint8Array(await blob.arrayBuffer());
        let binary = "";
        for (const byte of buffer) binary += String.fromCharCode(byte);
        return `data:image/png;base64,${btoa(binary)}`;
      },
    };
    window.__pixelstage = api;
    window.__pixelstageReady = true;
    return () => {
      window.__pixelstageReady = false;
      engine.dispose();
    };
  }, []);

  return <div ref={hostRef} style={{ position: "fixed", inset: 0 }} />;
}
