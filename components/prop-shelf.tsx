"use client";

import { useEffect, useRef, useState } from "react";
import { isMessageKey, t, type Locale, type MessageKey } from "@/lib/i18n";
import { PROP_SPECS, type PropKind } from "@/lib/props";
import type { SceneProp } from "@/lib/types";

const FILTERS: Array<PropKind | "all"> = ["all", "block", "item", "entity"];

export function PropShelf({
  locale,
  props,
  activeId,
  onAdd,
  onSelect,
  onRemove,
  onClear,
  onTransform,
  moveMode,
  onToggleMove,
  pack,
  onImportPack,
  onClearPack,
}: {
  locale: Locale;
  props: SceneProp[];
  activeId: string | null;
  onAdd: (catalogId: string) => void;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  moveMode: boolean;
  onToggleMove: () => void;
  pack: { name: string; count: number } | null;
  onImportPack: (files: File[], mode: "zip" | "folder") => void;
  onClearPack: () => void;
  onTransform: (
    id: string,
    partial: { position?: Partial<SceneProp["position"]>; rotationY?: number; scale?: number },
  ) => void;
}) {
  const tr = (key: MessageKey, vars?: Record<string, string | number>) => t(locale, key, vars);
  const active = props.find((prop) => prop.id === activeId) ?? null;
  const [filter, setFilter] = useState<PropKind | "all">("all");
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);

  return (
    <section className="block">
      <div className="section-head">
        <h2>{tr("props")}</h2>
        <div className="row">
          <button className={moveMode ? "chip active" : "chip"} type="button" disabled={!activeId} onClick={onToggleMove}>
            {moveMode ? tr("moving") : tr("move")}
          </button>
          <button className="btn ghost" type="button" disabled={!props.length} onClick={onClear}>
            {tr("propClear")}
          </button>
        </div>
      </div>
      <p className="hint scene-hint">{props.length ? tr("propsHint") : tr("propsEmpty")}</p>
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
      {props.length ? (
        <div className="player-list" style={{ marginBottom: 12 }}>
          {props.map((prop) => (
            <div key={prop.id} className={prop.id === activeId ? "player active" : "player"}>
              <button type="button" className="icon-btn prop-name" onClick={() => onSelect(prop.id)}>
                <i className="swatch" style={{ background: swatchFor(prop.catalogId) }} aria-hidden />
                <strong>{tr(propLabel(prop.catalogId))}</strong>
              </button>
              <button type="button" className="icon-btn" aria-label={tr("removeNamed", { name: tr(propLabel(prop.catalogId)) })} onClick={() => onRemove(prop.id)}>
                {tr("remove")}
              </button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="row" role="group" aria-label={tr("props")}>
        {FILTERS.map((kind) => (
          <button key={kind} type="button" className={filter === kind ? "chip active" : "chip"} onClick={() => setFilter(kind)}>
            {tr(kind === "all" ? "propAll" : kind === "block" ? "propBlocks" : kind === "item" ? "propItems" : "propEntities")}
          </button>
        ))}
      </div>
      <div className="prop-grid">
        {PROP_SPECS.filter((spec) => filter === "all" || spec.kind === filter).map((spec) => (
          <button key={spec.id} type="button" className="prop-tile" onClick={() => onAdd(spec.id)}>
            <i className="swatch" style={{ background: spec.swatch }} aria-hidden />
            <span>{tr(propLabel(spec.id))}</span>
          </button>
        ))}
      </div>
      {active ? (
        <div className="sliders" style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {tr("propSelected")} · {tr(propLabel(active.catalogId))}
          </p>
          {(
            [
              ["x", "axisX", -32, 32],
              ["y", "axisY", -2, 32],
              ["z", "axisZ", -32, 32],
            ] as const
          ).map(([key, label, min, max]) => (
            <label className="slider" key={key}>
              <span>{tr(label)}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={0.1}
                value={active.position[key]}
                aria-label={tr("axisAria", { label: tr(label) })}
                onChange={(event) => onTransform(active.id, { position: { [key]: Number(event.target.value) } })}
              />
              <strong>{active.position[key].toFixed(1)}</strong>
            </label>
          ))}
          <label className="slider">
            <span>{tr("propRotate")}</span>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={active.rotationY}
              aria-label={tr("propRotate")}
              onChange={(event) => onTransform(active.id, { rotationY: Number(event.target.value) })}
            />
            <strong>{Math.round(active.rotationY)}°</strong>
          </label>
          <label className="slider">
            <span>{tr("propScale")}</span>
            <input
              type="range"
              min={0.4}
              max={2.2}
              step={0.05}
              value={active.scale}
              aria-label={tr("propScale")}
              onChange={(event) => onTransform(active.id, { scale: Number(event.target.value) })}
            />
            <strong>{active.scale.toFixed(2)}</strong>
          </label>
        </div>
      ) : null}
    </section>
  );
}

function swatchFor(id: string) {
  return PROP_SPECS.find((spec) => spec.id === id)?.swatch ?? "#8b8b8b";
}

function propLabel(id: string): MessageKey {
  const key = `prop.${id}`;
  return isMessageKey(key) ? key : "props";
}
