/**
 * Poster text layers. A poster is drawn on a 2D canvas after the WebGL frame
 * is painted, so titles are crisp at 4K and work the same in the studio and
 * in the headless renderer. Layouts only move the text; they never touch the
 * stage, camera, or the skin.
 */

export type PosterAlign = "left" | "center" | "right";
export type PosterAnchor = "top" | "bottom";

export type PosterTemplateId =
  | "clean"
  | "mod-promo"
  | "x-header"
  | "vertical-card"
  | "wallpaper"
  | "lower-third";

export type PosterTemplate = {
  id: PosterTemplateId;
  name: string;
  hint: string;
  /** Where the title block sits. */
  anchor: PosterAnchor;
  align: PosterAlign;
  /** Scale of the title type relative to the short edge. */
  titleScale: number;
  subtitleScale: number;
  /** Safe margin as a fraction of the short edge. */
  margin: number;
  /** Vertical position of the block, 0 = top edge, 1 = bottom edge. */
  position: number;
  /** Nudges the 3D subject away from the text on wide frames. */
  subjectShift: number;
  /** Panel behind the text: "none", "scrim", "solid". */
  panel: "none" | "scrim" | "solid";
  panelColor: string;
  textColor: string;
  accent: string;
  /** Uppercase the subtitle for the editorial layouts. */
  upper: boolean;
};

export const POSTER_TEMPLATES: PosterTemplate[] = [
  {
    id: "clean",
    name: "简洁标题",
    hint: "标题在左下角，细副标题紧跟其下，不挡人物。",
    anchor: "bottom",
    align: "left",
    titleScale: 0.085,
    subtitleScale: 0.032,
    margin: 0.075,
    position: 0.9,
    subjectShift: 0,
    panel: "none",
    panelColor: "#0b1020",
    textColor: "#ffffff",
    accent: "#7cc6ff",
    upper: false,
  },
  {
    id: "mod-promo",
    name: "Mod 宣传",
    hint: "顶部大标题加一行标语，底部一条细色带，像宣传图。",
    anchor: "top",
    align: "left",
    titleScale: 0.11,
    subtitleScale: 0.036,
    margin: 0.08,
    position: 0.16,
    subjectShift: 0,
    panel: "none",
    panelColor: "#0b1020",
    textColor: "#ffffff",
    accent: "#ffb347",
    upper: false,
  },
  {
    id: "x-header",
    name: "X 头图",
    hint: "人物偏右，标题压在左边，横版头图常用。",
    anchor: "top",
    align: "left",
    titleScale: 0.12,
    subtitleScale: 0.042,
    margin: 0.07,
    position: 0.5,
    subjectShift: 0.16,
    panel: "none",
    panelColor: "#0b1020",
    textColor: "#ffffff",
    accent: "#8ef0d0",
    upper: true,
  },
  {
    id: "vertical-card",
    name: "竖版角色卡",
    hint: "竖屏居中，标题在下三分之一，人物头顶留白。",
    anchor: "bottom",
    align: "center",
    titleScale: 0.1,
    subtitleScale: 0.038,
    margin: 0.08,
    position: 0.78,
    subjectShift: 0,
    panel: "scrim",
    panelColor: "#0b1020",
    textColor: "#ffffff",
    accent: "#ffd166",
    upper: false,
  },
  {
    id: "wallpaper",
    name: "壁纸角标",
    hint: "右下角小字，适合当桌面壁纸的署名。",
    anchor: "bottom",
    align: "right",
    titleScale: 0.04,
    subtitleScale: 0.02,
    margin: 0.035,
    position: 0.94,
    subjectShift: 0,
    panel: "none",
    panelColor: "#0b1020",
    textColor: "#ffffff",
    accent: "#ffffff",
    upper: false,
  },
  {
    id: "lower-third",
    name: "下三分之一",
    hint: "标题坐在半透明色条上，像访谈字幕条。",
    anchor: "bottom",
    align: "left",
    titleScale: 0.075,
    subtitleScale: 0.03,
    margin: 0.06,
    position: 0.83,
    subjectShift: 0,
    panel: "solid",
    panelColor: "#101a33",
    textColor: "#ffffff",
    accent: "#7cc6ff",
    upper: false,
  },
];

export const POSTER_TEMPLATE_IDS = new Set(POSTER_TEMPLATES.map((template) => template.id));

export function posterTemplateById(id: string | null | undefined): PosterTemplate {
  return POSTER_TEMPLATES.find((template) => template.id === id) ?? POSTER_TEMPLATES[0];
}

export type PosterText = {
  title: string;
  subtitle: string;
  /** Extra small line, such as a version or a server address. */
  kicker: string;
  template: PosterTemplateId;
  /** Multiplies the template's type size. */
  scale: number;
  /** Suppress the rounded panel behind text even on layouts that use one. */
  panel: boolean;
};

export const EMPTY_POSTER_TEXT: PosterText = {
  title: "",
  subtitle: "",
  kicker: "",
  template: "clean",
  scale: 1,
  panel: true,
};

export const POSTER_LIMITS = {
  title: 64,
  subtitle: 96,
  kicker: 48,
  scale: { min: 0.5, max: 2 },
} as const;

const TEMPLATE_IDS = POSTER_TEMPLATE_IDS;

function text(value: unknown, limit: number) {
  return typeof value === "string" ? value.replace(/[\r\n\t]+/g, " ").trim().slice(0, limit) : "";
}

/** Anything unreadable falls back to the empty poster, never to an error. */
export function parsePosterText(value: unknown): PosterText {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...EMPTY_POSTER_TEXT };
  const record = value as Record<string, unknown>;
  const template = typeof record.template === "string" && TEMPLATE_IDS.has(record.template as PosterTemplateId)
    ? (record.template as PosterTemplateId)
    : EMPTY_POSTER_TEXT.template;
  const rawScale = record.scale;
  const scale =
    typeof rawScale === "number" && Number.isFinite(rawScale)
      ? Math.min(POSTER_LIMITS.scale.max, Math.max(POSTER_LIMITS.scale.min, rawScale))
      : 1;
  return {
    title: text(record.title, POSTER_LIMITS.title),
    subtitle: text(record.subtitle, POSTER_LIMITS.subtitle),
    kicker: text(record.kicker, POSTER_LIMITS.kicker),
    template,
    scale,
    panel: record.panel === false ? false : true,
  };
}

export function posterHasText(poster: PosterText | null | undefined) {
  return Boolean(poster && (poster.title || poster.subtitle || poster.kicker));
}

const FONT_STACK = `"Outfit", "Noto Sans CJK SC", "Noto Sans SC", "WenQuanYi Micro Hei", "PingFang SC", system-ui, sans-serif`;
/** A heavy serif for the title reads more like a poster than the UI font. */
const TITLE_STACK = `"Fraunces", "Outfit", "Noto Serif CJK SC", "Noto Serif SC", Georgia, serif`;

function font(size: number, weight: number, stack: string) {
  return `${weight} ${Math.round(size)}px ${stack}`;
}

/** Break a long line to fit `maxWidth`, keeping explicit spaces. */
function wrap(context: CanvasRenderingContext2D, value: string, maxWidth: number, maxLines: number) {
  const words = value.split(/\s+/).filter(Boolean);
  if (!words.length) return [] as string[];
  const lines: string[] = [];
  let line = "";
  const pushChar = (chars: string[]) => {
    for (const char of chars) {
      const next = line + char;
      if (line && context.measureText(next).width > maxWidth) {
        lines.push(line);
        line = char;
      } else {
        line = next;
      }
    }
  };
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    if (context.measureText(word).width <= maxWidth) {
      line = word;
    } else {
      line = "";
      // CJK and other long runs: split per character.
      pushChar([...word]);
    }
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines.slice(0, maxLines);
}

function roundRect(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.max(0, Math.min(r, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + radius, y);
  context.arcTo(x + w, y, x + w, y + h, radius);
  context.arcTo(x + w, y + h, x, y + h, radius);
  context.arcTo(x, y + h, x, y, radius);
  context.arcTo(x, y, x + w, y, radius);
  context.closePath();
}

export type PosterDrawOptions = {
  width: number;
  height: number;
  /** Device-space scale for crisp text when the target canvas is oversized. */
  pixelRatio?: number;
};

/**
 * Draw the title block onto an already-painted 2D canvas. The frame is assumed
 * to fill the whole canvas. Returns the bounding box that was used, in CSS
 * pixels, so callers (and tests) can check that text stayed inside the frame.
 */
export function drawPosterText(
  context: CanvasRenderingContext2D,
  poster: PosterText,
  options: PosterDrawOptions,
): { x: number; y: number; width: number; height: number } | null {
  if (!posterHasText(poster)) return null;
  const template = posterTemplateById(poster.template);
  const { width, height } = options;
  const ratio = Math.min(3, Math.max(1, options.pixelRatio ?? 1));
  const short = Math.min(width, height);
  const margin = short * template.margin;
  const titleSize = short * template.titleScale * poster.scale;
  const subtitleSize = short * template.subtitleScale * poster.scale;
  const kickerSize = Math.max(11, subtitleSize * 0.62);
  const usable = template.align === "left" || template.align === "right" ? width * 0.62 : width - margin * 2;

  context.save();
  context.scale(ratio, ratio);
  const cssW = width / ratio;
  const cssH = height / ratio;

  const titleFont = font(titleSize, 700, TITLE_STACK);
  const subtitleFont = font(subtitleSize, 500, FONT_STACK);
  const kickerFont = font(kickerSize, 700, FONT_STACK);
  const subtitle = template.upper ? poster.subtitle.toUpperCase() : poster.subtitle;

  context.font = titleFont;
  const titleLines = poster.title ? wrap(context, poster.title, usable, 3) : [];
  context.font = subtitleFont;
  const subtitleLines = subtitle ? wrap(context, subtitle, usable, 3) : [];
  context.font = kickerFont;
  const kickerLines = poster.kicker ? wrap(context, poster.kicker, usable, 1) : [];

  const titleStep = titleSize * 1.06;
  const subtitleStep = subtitleSize * 1.36;
  const kickerStep = kickerSize * 1.2;
  const gapAfterKicker = kickerLines.length ? kickerSize * 0.9 : 0;
  const gapAfterTitle = subtitleLines.length ? subtitleSize * 0.75 : 0;
  const contentH =
    kickerLines.length * kickerStep +
    gapAfterKicker +
    titleLines.length * titleStep +
    gapAfterTitle +
    subtitleLines.length * subtitleStep;

  const x = template.align === "center" ? cssW / 2 : template.align === "left" ? margin : cssW - margin;
  const blockTop = template.position * cssH - contentH / 2;
  const top = Math.max(margin, Math.min(cssH - margin - contentH, blockTop));

  if (poster.panel && template.panel !== "none") {
    const pad = subtitleSize * 0.9;
    const boxW = Math.min(cssW - margin * 2, usable + pad * 2);
    const boxX = template.align === "center" ? cssW / 2 - boxW / 2 : template.align === "left" ? margin - pad * 0.6 : cssW - margin - boxW + pad * 0.6;
    context.globalAlpha = template.panel === "scrim" ? 0.42 : 0.92;
    context.fillStyle = template.panelColor;
    roundRect(context, boxX, top - pad, boxW, contentH + pad * 2, Math.min(28, subtitleSize * 0.9));
    context.fill();
    context.globalAlpha = 1;
  }

  context.textAlign = template.align === "center" ? "center" : template.align === "left" ? "left" : "right";
  context.textBaseline = "top";
  let y = top;

  if (kickerLines.length) {
    context.font = kickerFont;
    context.fillStyle = template.accent;
    for (const line of kickerLines) {
      context.fillText(line, x, y);
      y += kickerStep;
    }
    y += gapAfterKicker;
  }

  if (titleLines.length) {
    context.font = titleFont;
    context.fillStyle = template.textColor;
    context.shadowColor = "rgba(6, 10, 22, 0.45)";
    context.shadowBlur = subtitleSize * 0.5;
    context.shadowOffsetY = subtitleSize * 0.08;
    for (const line of titleLines) {
      context.fillText(line, x, y);
      y += titleStep;
    }
    context.shadowColor = "transparent";
    context.shadowBlur = 0;
    context.shadowOffsetY = 0;
    // A short accent rule under the title.
    if (subtitleLines.length && template.align !== "center") {
      const ruleW = Math.min(usable * 0.4, titleSize * 3.2);
      context.fillStyle = template.accent;
      context.fillRect(template.align === "left" ? x : x - ruleW, y - titleStep * 0.24, ruleW, Math.max(2, titleSize * 0.06));
    }
    y += gapAfterTitle;
  }

  if (subtitleLines.length) {
    context.font = subtitleFont;
    context.fillStyle = template.textColor;
    context.globalAlpha = 0.86;
    for (const line of subtitleLines) {
      context.fillText(line, x, y);
      y += subtitleStep;
    }
    context.globalAlpha = 1;
  }

  context.restore();

  const boxWidth = usable;
  const boxX = template.align === "center" ? x - boxWidth / 2 : template.align === "left" ? x : x - boxWidth;
  return { x: boxX, y: top, width: boxWidth, height: contentH };
}

/**
 * Text baked into exported video/GIF frames must not cover the skin. Layouts
 * with `subjectShift` move the 3D subject horizontally before rendering.
 */
export function posterSubjectShift(poster: PosterText | null | undefined, width: number, height: number) {
  if (!posterHasText(poster) || !poster) return 0;
  const template = posterTemplateById(poster.template);
  if (!template.subjectShift) return 0;
  return width * template.subjectShift * (width >= height ? 1 : 0.35);
}
