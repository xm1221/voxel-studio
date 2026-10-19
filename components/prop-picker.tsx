"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";
import { isMessageKey, type Locale, type MessageKey } from "@/lib/i18n";
import { columnsFor, gridWindow } from "@/lib/virtual-grid";

export type PropKind = "block" | "item" | "entity";
export type PropKindFilter = PropKind | "all";

/** One row of `/vanilla/gen/catalog.json`. Mirrors `lib/catalog.ts` without importing it. */
export type CatalogEntry = {
  /** Stable id such as `block:stone`. */
  id: string;
  kind: PropKind;
  category: string;
  /** Texture path such as `block/stone.png`. */
  icon: string;
  en: string;
  zh: string;
  texW?: number;
  texH?: number;
  /** Entity face crop in texels: x, y, w, h. */
  crop?: [number, number, number, number];
};

export type PickerSearchOptions = {
  query: string;
  kind: PropKindFilter;
  /** `null` means every category. */
  category: string | null;
  lang: Locale;
};

export type PropPickerProps = {
  entries: CatalogEntry[];
  loading: boolean;
  locale: Locale;
  tr: (key: MessageKey, vars?: Record<string, string | number>) => string;
  textureUrl: (path: string) => string;
  onAdd: (id: string) => void;
  search: (entries: CatalogEntry[], opts: PickerSearchOptions) => CatalogEntry[];
};

export const RECENT_PROPS_KEY = "pixelstage.recentProps";

const KINDS: PropKindFilter[] = ["all", "block", "item", "entity"];

const KIND_LABEL: Record<PropKindFilter, MessageKey> = {
  all: "pickerAll",
  block: "pickerBlocks",
  item: "pickerItems",
  entity: "pickerMobs",
};

const CATEGORY_ORDER: Record<PropKind, string[]> = {
  block: ["building", "colored", "natural", "plants", "functional", "redstone"],
  item: ["tools", "combat", "food", "materials", "spawn_eggs", "misc"],
  entity: ["passive", "neutral", "hostile", "water", "ambient"],
};

const TILE_MIN = 64;
const GAP = 8;
/** Inner padding of the scroll box, kept out of the window math by subtracting it. */
const PAD = 8;
const ICON_SIZE = 40;
const TILE_HEIGHT = 72;
const ROW_HEIGHT = TILE_HEIGHT + GAP;
const VIEWPORT_HEIGHT = 360;
const OVERSCAN = 3;
const RECENT_ICON_SIZE = 24;
const RECENT_LIMIT = 8;

export function PropPicker({ entries, loading, locale, tr, textureUrl, onAdd, search }: PropPickerProps) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<PropKindFilter>("all");
  const [category, setCategory] = useState<string | null>(null);
  const recents = useSyncExternalStore(subscribeRecents, readRecentsSnapshot, serverRecents);
  const [scrollTop, setScrollTop] = useState(0);
  const [size, setSize] = useState({ width: 320, height: VIEWPORT_HEIGHT });
  const [activeIndex, setActiveIndex] = useState(0);
  const [focusTick, setFocusTick] = useState(0);

  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef(false);

  const trimmed = query.trim();

  const kindCounts = useMemo(() => {
    const counts: Record<PropKindFilter, number> = { all: 0, block: 0, item: 0, entity: 0 };
    if (!trimmed) {
      for (const entry of entries) {
        counts[entry.kind] += 1;
        counts.all += 1;
      }
      return counts;
    }
    for (const itemKind of ["block", "item", "entity"] as const) {
      counts[itemKind] = search(entries, { query: trimmed, kind: itemKind, category: null, lang: locale }).length;
      counts.all += counts[itemKind];
    }
    return counts;
  }, [entries, trimmed, locale, search]);

  const categories = useMemo(() => {
    if (kind === "all") return [] as string[];
    const present = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === kind) present.add(entry.category);
    }
    const known = CATEGORY_ORDER[kind];
    const ordered = known.filter((name) => present.has(name));
    const extra = [...present].filter((name) => !known.includes(name)).sort();
    return [...ordered, ...extra];
  }, [entries, kind]);

  const results = useMemo(
    () => search(entries, { query: trimmed, kind, category, lang: locale }),
    [entries, search, trimmed, kind, category, locale],
  );

  const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
  const recentEntries = useMemo(
    () => recents.map((id) => entryById.get(id)).filter((entry): entry is CatalogEntry => Boolean(entry)),
    [recents, entryById],
  );

  const columns = columnsFor(size.width - PAD * 2, TILE_MIN, GAP);
  const win = gridWindow({
    count: results.length,
    columns,
    rowHeight: ROW_HEIGHT,
    viewportHeight: Math.max(0, size.height - PAD * 2),
    scrollTop: Math.max(0, scrollTop - PAD),
    overscan: OVERSCAN,
  });

  // Measure the scroll box for the virtual window and react to panel resizes.
  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const measure = () => setSize({ width: element.clientWidth, height: element.clientHeight });
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Filters change the result set, so start reading from the top again.
  const resetScroll = () => {
    setScrollTop(0);
    setActiveIndex(0);
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  };

  // `/` jumps to search from anywhere outside a text field.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Move focus after keyboard navigation has rendered the target row.
  useEffect(() => {
    if (!focusTick || !pendingFocus.current) return;
    pendingFocus.current = false;
    scrollRef.current?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`)?.focus({ preventScroll: true });
  }, [focusTick, activeIndex]);

  const addEntry = (id: string) => {
    const next = [id, ...recents.filter((recent) => recent !== id)].slice(0, RECENT_LIMIT);
    writeRecents(next);
    onAdd(id);
  };

  const moveFocus = (index: number) => {
    setActiveIndex(index);
    const element = scrollRef.current;
    if (element) {
      const rowTop = PAD + Math.floor(index / columns) * ROW_HEIGHT;
      const rowBottom = rowTop + TILE_HEIGHT;
      if (rowTop < element.scrollTop) element.scrollTop = rowTop - PAD;
      else if (rowBottom > element.scrollTop + element.clientHeight) element.scrollTop = rowBottom - element.clientHeight + PAD;
      setScrollTop(element.scrollTop);
    }
    pendingFocus.current = true;
    setFocusTick((tick) => tick + 1);
  };

  const onGridKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!results.length) return;
    let next = currentIndex;
    switch (event.key) {
      case "ArrowRight":
        next = Math.min(results.length - 1, currentIndex + 1);
        break;
      case "ArrowLeft":
        next = Math.max(0, currentIndex - 1);
        break;
      case "ArrowDown":
        next = Math.min(results.length - 1, currentIndex + columns);
        break;
      case "ArrowUp":
        next = Math.max(0, currentIndex - columns);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = results.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    moveFocus(next);
  };

  const showSkeleton = loading && entries.length === 0;
  const showEmpty = !loading && results.length === 0;
  const visible = results.slice(win.startIndex, win.endIndex);
  const showRecents = !trimmed && recentEntries.length > 0;
  // The stored index can outlive a shrinking result set, so clamp it at render time.
  const currentIndex = activeIndex < results.length ? activeIndex : 0;
  // Keep one tab stop in the grid even when the active item scrolled out of the window.
  const rovingIndex = currentIndex >= win.startIndex && currentIndex < win.endIndex ? currentIndex : win.startIndex;

  return (
    <div className="prop-picker">
      <div className="prop-picker-search">
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={tr("pickerSearch")}
          aria-label={tr("pickerSearch")}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => {
            setQuery(event.target.value);
            resetScroll();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              if (query) {
                event.preventDefault();
                setQuery("");
                resetScroll();
              } else {
                inputRef.current?.blur();
              }
            }
          }}
        />
        {query ? (
          <button
            type="button"
            className="prop-picker-clear"
            aria-label={tr("pickerClear")}
            title={tr("pickerClear")}
            onClick={() => {
              setQuery("");
              resetScroll();
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        ) : null}
      </div>

      <div className="prop-picker-kinds" role="group" aria-label={tr("pickerKinds")}>
        {KINDS.map((itemKind) => (
          <button
            key={itemKind}
            type="button"
            className={kind === itemKind ? "active" : undefined}
            aria-pressed={kind === itemKind}
            onClick={() => {
              setKind(itemKind);
              setCategory(null);
              resetScroll();
            }}
          >
            {tr("pickerKindCount", { label: tr(KIND_LABEL[itemKind]), count: kindCounts[itemKind] })}
          </button>
        ))}
      </div>

      {kind !== "all" && categories.length > 0 ? (
        <div className="prop-picker-cats" role="group" aria-label={tr("pickerCategories")}>
          <button
            type="button"
            className={category === null ? "chip active" : "chip"}
            aria-pressed={category === null}
            onClick={() => {
              setCategory(null);
              resetScroll();
            }}
          >
            {tr("pickerCatAll")}
          </button>
          {categories.map((name) => (
            <button
              key={name}
              type="button"
              className={category === name ? "chip active" : "chip"}
              aria-pressed={category === name}
              onClick={() => {
                setCategory(name);
                resetScroll();
              }}
            >
              {tr(categoryLabel(kind, name))}
            </button>
          ))}
        </div>
      ) : null}

      <p className="prop-picker-count" aria-live="polite">
        {showSkeleton ? tr("pickerLoading") : tr("pickerResults", { count: results.length })}
      </p>

      {showRecents ? (
        <div className="prop-picker-recent">
          <p className="prop-picker-recent-head">{tr("pickerRecent")}</p>
          <div className="prop-picker-recent-row">
            {recentEntries.map((entry) => {
              const name = entryName(entry, locale);
              return (
                <button
                  key={entry.id}
                  type="button"
                  className="prop-picker-recent-tile"
                  title={`${name} · ${entry.id}`}
                  aria-label={tr("pickerAdd", { name })}
                  onClick={() => addEntry(entry.id)}
                >
                  <span className="prop-picker-icon" style={iconStyle(entry, textureUrl, RECENT_ICON_SIZE)} aria-hidden />
                  <span className="prop-picker-recent-name">{name}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="prop-picker-scroll"
        style={{ height: VIEWPORT_HEIGHT }}
        role={showSkeleton || showEmpty ? undefined : "listbox"}
        aria-label={tr("pickerGrid")}
        aria-busy={showSkeleton}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={onGridKeyDown}
      >
        {showSkeleton ? (
          <div
            className="prop-picker-rows prop-picker-skeleton"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
            aria-hidden
          >
            {Array.from({ length: columns * 3 }, (_, index) => (
              <div key={index} className="prop-picker-tile skeleton">
                <span className="prop-picker-skeleton-icon" />
                <span className="prop-picker-skeleton-line" />
              </div>
            ))}
          </div>
        ) : showEmpty ? (
          <div className="prop-picker-empty">{tr("pickerNoMatches")}</div>
        ) : (
          <div className="prop-picker-canvas" style={{ height: win.totalHeight + PAD * 2 }}>
            <div
              className="prop-picker-rows"
              style={{
                gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
                gridAutoRows: `${TILE_HEIGHT}px`,
                padding: PAD,
                transform: `translateY(${win.offsetTop}px)`,
              }}
            >
              {visible.map((entry, offset) => {
                const index = win.startIndex + offset;
                const name = entryName(entry, locale);
                return (
                  <div
                    key={entry.id}
                    role="option"
                    aria-selected={index === currentIndex}
                    aria-label={tr("pickerAdd", { name })}
                    title={`${name} · ${entry.id}`}
                    tabIndex={index === rovingIndex ? 0 : -1}
                    data-index={index}
                    className={index === currentIndex ? "prop-picker-tile active" : "prop-picker-tile"}
                    onClick={() => {
                      setActiveIndex(index);
                      addEntry(entry.id);
                    }}
                    onFocus={() => setActiveIndex(index)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        addEntry(entry.id);
                      }
                    }}
                  >
                    <span className="prop-picker-icon" style={iconStyle(entry, textureUrl, ICON_SIZE)} aria-hidden />
                    <span className="prop-picker-name">{name}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function entryName(entry: CatalogEntry, locale: Locale) {
  return (locale === "zh" ? entry.zh : entry.en) || entry.en || entry.zh || entry.id;
}

function categoryLabel(kind: PropKind, category: string): MessageKey {
  const key = `cat.${kind}.${category}`;
  return isMessageKey(key) ? key : "pickerCatAll";
}

/**
 * Blocks and items are square 16×16 textures; `100% auto` also crops animated
 * strips to their first frame. Entities use the catalog's face crop, scaled so
 * the crop fills the icon box.
 */
function iconStyle(entry: CatalogEntry, textureUrl: (path: string) => string, size: number): CSSProperties {
  const url = textureUrl(entry.icon);
  const style: CSSProperties = {
    width: size,
    height: size,
    imageRendering: "pixelated",
    backgroundRepeat: "no-repeat",
    backgroundImage: url ? `url("${url.replace(/"/g, "%22")}")` : undefined,
  };
  const crop = entry.crop;
  if (crop && entry.texW && entry.texH && crop[2] > 0 && crop[3] > 0) {
    const [x, y, w] = crop;
    const scale = size / w;
    style.backgroundSize = `${entry.texW * scale}px ${entry.texH * scale}px`;
    style.backgroundPosition = `${-x * scale}px ${-y * scale}px`;
  } else {
    style.backgroundSize = "100% auto";
    style.backgroundPosition = "0 0";
  }
  return style;
}

const EMPTY_RECENTS: string[] = [];
let recentsCache: string[] | null = null;
const recentsListeners = new Set<() => void>();

function serverRecents() {
  return EMPTY_RECENTS;
}

/** Cached so `useSyncExternalStore` gets a stable snapshot between renders. */
function readRecentsSnapshot(): string[] {
  if (recentsCache) return recentsCache;
  let ids: string[] = EMPTY_RECENTS;
  try {
    const raw = localStorage.getItem(RECENT_PROPS_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed)) {
      ids = parsed.filter((value): value is string => typeof value === "string").slice(0, RECENT_LIMIT);
    }
  } catch {
    ids = EMPTY_RECENTS;
  }
  recentsCache = ids;
  return ids;
}

function subscribeRecents(listener: () => void) {
  recentsListeners.add(listener);
  // Keep a second tab's picks in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== RECENT_PROPS_KEY) return;
    recentsCache = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    recentsListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writeRecents(ids: string[]) {
  try {
    localStorage.setItem(RECENT_PROPS_KEY, JSON.stringify(ids));
  } catch {
    // A blocked or full localStorage should not break adding props.
  }
  recentsCache = ids;
  for (const listener of recentsListeners) listener();
}
