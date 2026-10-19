"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { catalogCounts, catalogEntries, catalogEntry, catalogLabel, type CatalogEntry } from "@/lib/catalog";
import { customFromPng, parseCustomFile, type CustomAsset } from "@/lib/custom-import";
import { isMessageKey, t, type Locale, type MessageKey } from "@/lib/i18n";
import { withBasePath } from "@/lib/paths";
import type { PropClip } from "@/lib/prop-clip";
import type { SceneProp } from "@/lib/types";
import type { GizmoMode } from "@/lib/gizmo";
import type { Space } from "@/lib/transform-math";
import { FACE_NAMES, type FaceName } from "@/lib/model-types";

const KINDS = ["all", "block", "item", "entity"] as const;
const CATEGORIES: Record<(typeof KINDS)[number], string[]> = {
  all: ["all"],
  block: ["all", "building", "natural", "redstone", "functional"],
  item: ["all", "combat", "food", "tools", "materials"],
  entity: ["all", "passive", "hostile", "ambient"],
};

const ROW = 44;

export function PropShelf({
  locale,
  props,
  activeId,
  selectedIds,
  mode,
  space,
  snap,
  clip,
  catalogTick,
  canUndo,
  canRedo,
  pack,
  onAdd,
  onSelect,
  onRemove,
  onClear,
  onRename,
  onToggleHidden,
  onToggleLocked,
  onDuplicate,
  onTransform,
  onPivot,
  onEditStart,
  onEditEnd,
  onMode,
  onSpace,
  onSnap,
  onUndo,
  onRedo,
  onAutoKey,
  onImportCustom,
  onExportProject,
  onImportProject,
  onExportGltf,
  onExportBbmodel,
  onImportAnim,
  onError,
  onImportPack,
  onClearPack,
}: {
  locale: Locale;
  props: SceneProp[];
  activeId: string | null;
  selectedIds: string[];
  mode: GizmoMode;
  space: Space;
  snap: boolean;
  clip: PropClip | null;
  catalogTick: number;
  canUndo: boolean;
  canRedo: boolean;
  pack: { name: string; count: number } | null;
  onAdd: (catalogId: string) => void;
  onSelect: (id: string, shift: boolean) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onRename: (id: string, name: string) => void;
  onToggleHidden: (id: string) => void;
  onToggleLocked: (id: string) => void;
  onDuplicate: (id: string) => void;
  onTransform: (id: string, partial: { position?: Partial<SceneProp["position"]>; rotation?: Partial<SceneProp["rotation"]>; scale?: Partial<SceneProp["scale"]> }) => void;
  onPivot: (id: string, axis: "x" | "y" | "z", value: number) => void;
  onEditStart: () => void;
  onEditEnd: () => void;
  onMode: (mode: GizmoMode) => void;
  onSpace: (space: Space) => void;
  onSnap: (snap: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onAutoKey: (enabled: boolean) => void;
  onImportCustom: (asset: CustomAsset) => void;
  onExportProject: () => void;
  onImportProject: (file: File) => void;
  onExportGltf: () => void;
  onExportBbmodel: () => void;
  onImportAnim: (file: File) => void;
  onError: (error: unknown) => void;
  onImportPack: (files: File[], mode: "zip" | "folder") => void;
  onClearPack: () => void;
}) {
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
  const active = props.find((prop) => prop.id === activeId) ?? null;
  const [kind, setKind] = useState<(typeof KINDS)[number]>("all");
  const [category, setCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [scroll, setScroll] = useState(0);
  const [faces, setFaces] = useState<Partial<Record<FaceName, string>>>({});
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  const itemRef = useRef<HTMLInputElement>(null);
  const blockRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<HTMLInputElement>(null);
  const faceRef = useRef<HTMLInputElement>(null);
  const faceSlot = useRef<FaceName>("north");
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  const counts = catalogCounts();
  const entries = useMemo(() => {
    void catalogTick;
    const needle = query.trim().toLowerCase();
    return catalogEntries().filter((entry) => {
      if (kind !== "all" && entry.kind !== kind) return false;
      if (category !== "all" && entry.category !== category) return false;
      if (!needle) return true;
      return entry.id.toLowerCase().includes(needle) || entry.en.toLowerCase().includes(needle) || entry.zh.toLowerCase().includes(needle);
    });
  }, [catalogTick, category, kind, query]);
  const start = Math.max(0, Math.floor(scroll / ROW) - 4);
  const visible = entries.slice(start, start + 14);
  const categories = CATEGORIES[kind];

  async function readPng(file: File, nextKind: "item" | "block") {
    try {
      const url = await fileToDataUrl(file);
      onImportCustom(customFromPng({ name: file.name.replace(/\.png$/i, ""), kind: nextKind, images: { all: url } }));
    } catch (error) {
      onError(error);
    }
  }

  async function readModel(file: File) {
    try {
      onImportCustom(parseCustomFile(file.name, await file.text()));
    } catch (error) {
      onError(error);
    }
  }

  return (
    <section className="block">
      <div className="section-head">
        <h2>{tr("props")}</h2>
        <div className="row">
          <button className="btn ghost" type="button" disabled={!canUndo} onClick={onUndo}>
            {tr("gizmoUndo")}
          </button>
          <button className="btn ghost" type="button" disabled={!canRedo} onClick={onRedo}>
            {tr("gizmoRedo")}
          </button>
          <button className="btn ghost" type="button" disabled={!props.length} onClick={onClear}>
            {tr("propClear")}
          </button>
        </div>
      </div>
      <p className="hint scene-hint">{props.length ? tr("propsHint") : tr("propsEmpty")}</p>
      <p className="hint scene-hint">{tr("gizmoKeys")}</p>
      <div className="tool-row" role="group" aria-label={tr("gizmoSpace")}>
        {(["move", "rotate", "scale"] as const).map((next) => (
          <button key={next} type="button" className={mode === next ? "chip active" : "chip"} onClick={() => onMode(next)}>
            {tr(next === "move" ? "gizmoMove" : next === "rotate" ? "gizmoRotate" : "gizmoScale")}
          </button>
        ))}
        <button type="button" className={space === "local" ? "chip active" : "chip"} onClick={() => onSpace(space === "local" ? "world" : "local")}>
          {space === "local" ? tr("gizmoLocal") : tr("gizmoWorld")}
        </button>
        <button type="button" className={snap ? "chip active" : "chip"} onClick={() => onSnap(!snap)}>
          {tr("gizmoSnap")}
        </button>
        <button type="button" className={clip?.autoKey ? "chip active" : "chip"} onClick={() => onAutoKey(!clip?.autoKey)}>
          {tr("propAutoKey")}
        </button>
      </div>

      <h2 style={{ marginTop: 16 }}>{tr("outliner")}</h2>
      {props.length ? (
        <div className="outliner">
          {props.map((prop) => {
            const label = prop.name || catalogLabel(prop.catalogId, locale);
            const selected = selectedIds.includes(prop.id);
            return (
              <div key={prop.id} className={prop.id === activeId ? "outliner-row active" : selected ? "outliner-row picked" : "outliner-row"}>
                <button type="button" className="icon-btn prop-name" onClick={(event) => onSelect(prop.id, event.shiftKey)}>
                  <PropIcon entry={entryFor(prop.catalogId)} />
                  <strong>{label}</strong>
                </button>
                <div className="row">
                  <button type="button" className="btn ghost" onClick={() => onToggleHidden(prop.id)}>
                    {prop.hidden ? tr("propShow") : tr("propHide")}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => onToggleLocked(prop.id)}>
                    {prop.locked ? tr("propUnlock") : tr("propLock")}
                  </button>
                  <button type="button" className="btn ghost" onClick={() => onDuplicate(prop.id)}>
                    {tr("propDuplicate")}
                  </button>
                  <button type="button" className="icon-btn" aria-label={tr("removeNamed", { name: label })} onClick={() => onRemove(prop.id)}>
                    {tr("remove")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-state">{tr("outlinerEmpty")}</p>
      )}

      {active ? (
        <div>
          <label className="field">
            <span>{tr("propRename")}</span>
            <input
              value={active.name}
              placeholder={catalogLabel(active.catalogId, locale)}
              maxLength={48}
              onFocus={onEditStart}
              onBlur={onEditEnd}
              onChange={(event) => onRename(active.id, event.target.value)}
            />
          </label>
          <NumberAxes
            label={tr("propPos")}
            axes={["x", "y", "z"]}
            values={active.position}
            step={0.1}
            onStart={onEditStart}
            onEnd={onEditEnd}
            onChange={(axis, value) => onTransform(active.id, { position: { [axis]: value } })}
          />
          <NumberAxes
            label={tr("propRot")}
            axes={["x", "y", "z"]}
            values={active.rotation}
            step={1}
            onStart={onEditStart}
            onEnd={onEditEnd}
            onChange={(axis, value) => onTransform(active.id, { rotation: { [axis]: value } })}
          />
          <NumberAxes
            label={tr("propScale")}
            axes={["x", "y", "z"]}
            values={active.scale}
            step={0.05}
            onStart={onEditStart}
            onEnd={onEditEnd}
            onChange={(axis, value) => onTransform(active.id, { scale: { [axis]: value } })}
          />
          <NumberAxes
            label={tr("propPivot")}
            axes={["x", "y", "z"]}
            values={active.pivot}
            step={0.5}
            onStart={onEditStart}
            onEnd={onEditEnd}
            onChange={(axis, value) => onPivot(active.id, axis, value)}
          />
        </div>
      ) : null}

      <h2 style={{ marginTop: 16 }}>{tr("library")}</h2>
      <p className="hint scene-hint">
        {counts.source === "file" ? `${counts.version} · ` : ""}
        {counts.blocks} / {counts.items} / {counts.entities}
      </p>
      <label className="field">
        <span>{tr("librarySearch")}</span>
        <input value={query} placeholder={tr("librarySearch")} aria-label={tr("librarySearch")} onChange={(event) => setQuery(event.target.value)} />
      </label>
      <div className="row" role="group" aria-label={tr("props")}>
        {KINDS.map((next) => (
          <button
            key={next}
            type="button"
            className={kind === next ? "chip active" : "chip"}
            onClick={() => {
              setKind(next);
              setCategory("all");
            }}
          >
            {tr(next === "all" ? "propAll" : next === "block" ? "propBlocks" : next === "item" ? "propItems" : "propEntities")}
          </button>
        ))}
      </div>
      {categories.length > 1 ? (
        <div className="row" role="group" aria-label={tr("library")}>
          {categories.map((next) => (
            <button key={next} type="button" className={category === next ? "chip active" : "chip"} onClick={() => setCategory(next)}>
              {catLabel(tr, next)}
            </button>
          ))}
        </div>
      ) : null}
      {entries.length ? (
        <div className="prop-library" onScroll={(event) => setScroll(event.currentTarget.scrollTop)}>
          <div style={{ height: entries.length * ROW, position: "relative" }}>
            {visible.map((entry, index) => (
              <button key={entry.id} type="button" className="prop-row" style={{ position: "absolute", top: (start + index) * ROW, left: 0, right: 0 }} onClick={() => onAdd(entry.id)}>
                <PropIcon entry={entry} />
                <span>{locale === "zh" ? entry.zh : entry.en}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="empty-state">{tr("libraryEmpty")}</p>
      )}

      <h2 style={{ marginTop: 16 }}>{tr("customBb")}</h2>
      <p className="hint scene-hint">{tr("customHint")}</p>
      <div className="tool-row">
        <button className="btn" type="button" onClick={() => itemRef.current?.click()}>
          {tr("customItem")}
        </button>
        <button className="btn" type="button" onClick={() => blockRef.current?.click()}>
          {tr("customBlock")}
        </button>
        <button className="btn ghost" type="button" onClick={() => modelRef.current?.click()}>
          {tr("customModel")}
        </button>
        <button className="btn ghost" type="button" onClick={onExportProject}>
          {tr("customExport")}
        </button>
        <button className="btn ghost" type="button" onClick={() => projectRef.current?.click()}>
          {tr("customImportProject")}
        </button>
        <button className="btn ghost" type="button" onClick={onExportGltf}>
          {tr("exportGltf")}
        </button>
        <button className="btn ghost" type="button" onClick={onExportBbmodel}>
          {tr("exportBbmodel")}
        </button>
        <button className="btn ghost" type="button" onClick={() => animRef.current?.click()}>
          {tr("importAnim")}
        </button>
      </div>
      <details className="advanced">
        <summary>{tr("customFaces")}</summary>
        <p className="hint">{tr("customAll")}</p>
        <div className="tool-row">
          {FACE_NAMES.map((face) => (
            <button
              key={face}
              type="button"
              className={faces[face] ? "chip active" : "chip"}
              onClick={() => {
                faceSlot.current = face;
                faceRef.current?.click();
              }}
            >
              {face}
              {faces[face] ? " ·" : ""}
            </button>
          ))}
          <button
            className="btn"
            type="button"
            disabled={!Object.keys(faces).length}
            onClick={() => {
              try {
                onImportCustom(customFromPng({ name: "Block", kind: "block", images: faces }));
                setFaces({});
              } catch (error) {
                onError(error);
              }
            }}
          >
            {tr("customBlock")}
          </button>
        </div>
      </details>
      <input ref={itemRef} type="file" accept="image/png,.png" hidden aria-label={tr("customItem")} onChange={(event) => takeFile(event, (file) => void readPng(file, "item"))} />
      <input ref={blockRef} type="file" accept="image/png,.png" hidden aria-label={tr("customBlock")} onChange={(event) => takeFile(event, (file) => void readPng(file, "block"))} />
      <input ref={modelRef} type="file" accept=".json,.bbmodel,application/json" hidden aria-label={tr("customModel")} onChange={(event) => takeFile(event, (file) => void readModel(file))} />
      <input ref={projectRef} type="file" accept="application/json,.json" hidden aria-label={tr("customImportProject")} onChange={(event) => takeFile(event, onImportProject)} />
      <input ref={animRef} type="file" accept=".bbmodel,.glb,.gltf,application/json" hidden aria-label={tr("importAnim")} onChange={(event) => takeFile(event, onImportAnim)} />
      <input
        ref={faceRef}
        type="file"
        accept="image/png,.png"
        hidden
        aria-label={tr("customFaces")}
        onChange={(event) =>
          takeFile(event, (file) => {
            void fileToDataUrl(file)
              .then((url) => setFaces((current) => ({ ...current, [faceSlot.current]: url })))
              .catch((error) => onError(error));
          })
        }
      />

      <h2 style={{ marginTop: 16 }}>{tr("packImport")}</h2>
      <p className="hint scene-hint">{pack ? tr("packUsing", { name: pack.name, count: pack.count }) : tr("packHint")}</p>
      <div className="row">
        <button className="btn" type="button" onClick={() => zipRef.current?.click()}>
          {tr("packImport")}
        </button>
        <button className="btn ghost" type="button" onClick={() => folderRef.current?.click()}>
          {tr("packFolder")}
        </button>
        {pack ? (
          <button className="btn ghost" type="button" onClick={onClearPack}>
            {tr("packClear")}
          </button>
        ) : null}
      </div>
      <input
        ref={zipRef}
        type="file"
        accept=".zip,.mcpack,application/zip"
        hidden
        aria-label={tr("packImport")}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) onImportPack(files, "zip");
        }}
      />
      <input
        ref={folderRef}
        type="file"
        multiple
        hidden
        aria-label={tr("packFolder")}
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = "";
          if (files.length) onImportPack(files, "folder");
        }}
      />
    </section>
  );
}

function NumberAxes({
  label,
  axes,
  values,
  step,
  onStart,
  onEnd,
  onChange,
}: {
  label: string;
  axes: Array<"x" | "y" | "z">;
  values: { x: number; y: number; z: number };
  step: number;
  onStart: () => void;
  onEnd: () => void;
  onChange: (axis: "x" | "y" | "z", value: number) => void;
}) {
  return (
    <div className="num-grid">
      <span>{label}</span>
      {axes.map((axis) => (
        <input
          key={axis}
          type="number"
          aria-label={`${label} ${axis.toUpperCase()}`}
          step={step}
          value={formatNum(values[axis])}
          onFocus={onStart}
          onBlur={onEnd}
          onChange={(event) => {
            const next = Number(event.target.value);
            if (Number.isFinite(next)) onChange(axis, next);
          }}
        />
      ))}
    </div>
  );
}

function formatNum(value: number) {
  if (!Number.isFinite(value)) return "0";
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function PropIcon({ entry }: { entry: CatalogEntry | undefined }) {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const icon = entry?.icon ?? "";
  const crop = entry?.crop;
  useEffect(() => {
    if (!icon || !crop) return;
    const image = new Image();
    image.onload = () => setSize({ w: image.naturalWidth, h: image.naturalHeight });
    image.src = withBasePath(`/vanilla/26.3/${icon}`);
  }, [crop, icon]);
  if (!icon) return <i className="swatch" style={{ background: "#8b8b8b" }} aria-hidden />;
  const url = withBasePath(`/vanilla/26.3/${icon}`);
  if (!crop || !size) return <span className="prop-icon" style={{ backgroundImage: `url(${url})` }} />;
  const scale = 28 / Math.max(crop[2], crop[3], 1);
  return (
    <span
      className="prop-icon"
      style={{
        backgroundImage: `url(${url})`,
        backgroundRepeat: "no-repeat",
        backgroundPosition: `${-crop[0] * scale}px ${-crop[1] * scale}px`,
        backgroundSize: `${size.w * scale}px ${size.h * scale}px`,
      }}
    />
  );
}

function entryFor(id: string) {
  return catalogEntry(id);
}

function catLabel(tr: (key: MessageKey) => string, category: string) {
  const key = `cat.${category}`;
  return isMessageKey(key) ? tr(key) : category;
}

function takeFile(event: { target: HTMLInputElement }, done: (file: File) => void) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (file) done(file);
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("err.customRead"));
    reader.readAsDataURL(file);
  });
}
