"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { PropPicker, type PickerSearchOptions } from "@/components/prop-picker";
import {
  LEGACY_IDS,
  catalogTextureUrl,
  entryName,
  loadedCatalog,
  loadCatalog,
  searchCatalog,
  type CatalogEntry,
} from "@/lib/catalog";
import { isMessageKey, t, type Locale, type MessageKey } from "@/lib/i18n";
import type { SceneProp } from "@/lib/types";

/** The picker passes `null` for "every category"; the catalog search calls that "all". */
function pickerSearch(entries: CatalogEntry[], options: PickerSearchOptions): CatalogEntry[] {
  return searchCatalog(entries, { ...options, category: options.category ?? "all" });
}

/** Icons are 16px PNGs; draw them large and crisp instead of smoothing. */
const iconStyle = (entry: CatalogEntry): CSSProperties => ({
  backgroundImage: `url("${catalogTextureUrl(entry.icon)}")`,
  backgroundSize: "cover",
  imageRendering: "pixelated",
});

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
  const [catalog, setCatalog] = useState(() => loadedCatalog());
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    folderRef.current?.setAttribute("webkitdirectory", "");
    folderRef.current?.setAttribute("directory", "");
  }, []);
  useEffect(() => {
    if (catalog) return;
    let cancel = false;
    void loadCatalog()
      .then((next) => {
        if (!cancel) setCatalog(next);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [catalog]);

  const entries = useMemo(() => catalog?.entries ?? [], [catalog]);
  const label = (entry: CatalogEntry | undefined) => entryName(entry, locale);
  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);

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
          {props.map((prop) => {
            const entry = entryById.get(prop.catalogId);
            return (
              <div key={prop.id} className={prop.id === activeId ? "player active" : "player"}>
                <button type="button" className="icon-btn prop-name" onClick={() => onSelect(prop.id)}>
                  {entry ? <i className="swatch" style={iconStyle(entry)} aria-hidden /> : <i className="swatch" aria-hidden />}
                  <strong>{label(entry) || prop.catalogId}</strong>
                </button>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={tr("removeNamed", { name: label(entry) || prop.catalogId })}
                  onClick={() => onRemove(prop.id)}
                >
                  {tr("remove")}
                </button>
              </div>
            );
          })}
        </div>
      ) : null}
      <PropPicker
        entries={entries}
        loading={!catalog}
        locale={locale}
        tr={tr}
        textureUrl={catalogTextureUrl}
        onAdd={onAdd}
        search={pickerSearch}
      />
      {active ? (
        <div className="sliders" style={{ marginTop: 14 }}>
          <p className="hint" style={{ marginTop: 0 }}>
            {tr("propSelected")} · {label(entryById.get(active.catalogId)) || active.catalogId}
          </p>
          {(
            [
              ["x", "axisX", -32, 32],
              ["y", "axisY", -2, 32],
              ["z", "axisZ", -32, 32],
            ] as const
          ).map(([key, axisLabel, min, max]) => (
            <label className="slider" key={key}>
              <span>{tr(axisLabel)}</span>
              <input
                type="range"
                min={min}
                max={max}
                step={0.1}
                value={active.position[key]}
                aria-label={tr("axisAria", { label: tr(axisLabel) })}
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

/** Names for the old share-link ids, used by notes in studio.tsx. */
export function legacyPropNameKey(catalogId: string): MessageKey | null {
  const legacy = Object.entries(LEGACY_IDS).find(([, id]) => id === catalogId);
  if (!legacy) return null;
  const key = `prop.${legacy[0]}`;
  return isMessageKey(key) ? key : null;
}
