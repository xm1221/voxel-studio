export type ExportFormat = {
  id: string;
  name: string;
  detail: string;
  width: number;
  height: number;
  round: boolean;
};

/** 常见平台的画布规格。detail 一律写成宽×高。 */
export const FORMATS: ExportFormat[] = [
  { id: "avatar", name: "头像", detail: "800×800", width: 800, height: 800, round: true },
  { id: "square", name: "方图", detail: "1080×1080", width: 1080, height: 1080, round: false },
  { id: "xhs", name: "小红书", detail: "1080×1440", width: 1080, height: 1440, round: false },
  { id: "youtube", name: "YouTube", detail: "1280×720", width: 1280, height: 720, round: false },
  { id: "story", name: "竖屏", detail: "1080×1920", width: 1080, height: 1920, round: false },
  { id: "desktop", name: "桌面", detail: "1920×1080", width: 1920, height: 1080, round: false },
  { id: "banner", name: "横幅", detail: "1500×500", width: 1500, height: 500, round: false },
  { id: "uhd", name: "4K", detail: "3840×2160", width: 3840, height: 2160, round: false },
];

const FORMAT_ALIAS: Record<string, string> = {
  pfp: "avatar",
  thumb: "youtube",
  phone: "story",
};

/** Ids scene JSON accepts. Aliases follow the canonical sizes in `FORMATS`. */
export const EXPORT_FORMAT_IDS: readonly string[] = [...FORMATS.map((format) => format.id), ...Object.keys(FORMAT_ALIAS)];

export function formatById(id: string): ExportFormat {
  const canonical = FORMAT_ALIAS[id] ?? id;
  return FORMATS.find((format) => format.id === canonical) ?? FORMATS[3];
}
