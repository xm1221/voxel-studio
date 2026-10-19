"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  CATALOG_CATEGORIES,
  LEGACY_IDS,
  catalogTextureUrl,
  entryName,
  loadedCatalog,
  loadCatalog,
  searchCatalog,
  type CatalogEntry,
  type PropKind,
} from "@/lib/catalog";
import { isMessageKey, t, type Locale, type MessageKey } from "@/lib/i18n";
import type { SceneProp } from "@/lib/types";

const FILTERS: Array<PropKind | "all"> = ["all", "block", "item", "entity"];

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
  const [filter, setFilter] = useState<PropKind | "all">("all");
  const [category, setCategory] = useState<string>("all");
  const [query, setQuery] = useState("");
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
  const categories = useMemo(() => {
    if (filter === "all") return [];
    const counts = new Map<string, number>();
    for (const entry of entries) {
      if (entry.kind !== filter) continue;
      counts.set(entry.category, (counts.get(entry.category) ?? 0) + 1);
    }
    return CATALOG_CATEGORIES[filter].filter((item) => counts.has(item.id));
  }, [entries, filter]);
  const shown = useMemo(
    () => searchCatalog(entries, { query, kind: filter, category, lang: locale }).slice(0, 240),
    [entries, query, filter, category, locale],
  );
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
      <div className="row" role="group" aria-label={tr("props")}>
        {FILTERS.map((kind) => (
          <button
            key={kind}
            type="button"
            className={filter === kind ? "chip active" : "chip"}
            onClick={() => {
              setFilter(kind);
              setCategory("all");
            }}
          >
            {tr(kind === "all" ? "propAll" : kind === "block" ? "propBlocks" : kind === "item" ? "propItems" : "propEntities")}
          </button>
        ))}
      </div>
      <div className="field">
        <input
          type="search"
          value={query}
          placeholder={tr("propSearch")}
          aria-label={tr("propSearch")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      {categories.length > 1 ? (
        <div className="row" role="group" aria-label={tr("propCategory")} style={{ marginTop: 8 }}>
          <button type="button" className={category === "all" ? "chip active" : "chip"} onClick={() => setCategory("all")}>
            {tr("propAllCategories")}
          </button>
          {categories.map((item) => (
            <button key={item.id} type="button" className={category === item.id ? "chip active" : "chip"} onClick={() => setCategory(item.id)}>
              {isMessageKey(item.key) ? tr(item.key as MessageKey) : item.id}
            </button>
          ))}
        </div>
      ) : null}
      {shown.length ? (
        <div className="prop-grid">
          {shown.map((entry) => (
            <button key={entry.id} type="button" className="prop-tile" onClick={() => onAdd(entry.id)} title={entry.id}>
              <i className="swatch" style={iconStyle(entry)} aria-hidden />
              <span>{label(entry)}</span>
            </button>
          ))}
        </div>
      ) : (
        <p className="hint" style={{ marginTop: 12 }}>
          {catalog ? tr("propNoMatches") : tr("propLoading")}
        </p>
      )}
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
