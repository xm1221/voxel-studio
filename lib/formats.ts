export type ExportFormat = {
  id: string;
  name: string;
  detail: string;
  width: number;
  height: number;
  round: boolean;
};

export const FORMATS: ExportFormat[] = [
  { id: "pfp", name: "圆形头像", detail: "1024", width: 1024, height: 1024, round: true },
  { id: "square", name: "方图", detail: "1080", width: 1080, height: 1080, round: false },
  { id: "thumb", name: "YouTube", detail: "1280×720", width: 1280, height: 720, round: false },
  { id: "story", name: "故事", detail: "1080×1920", width: 1080, height: 1920, round: false },
  { id: "phone", name: "手机壁纸", detail: "1080×1920", width: 1080, height: 1920, round: false },
  { id: "desktop", name: "桌面", detail: "1920×1080", width: 1920, height: 1080, round: false },
  { id: "uhd", name: "4K", detail: "3840×2160", width: 3840, height: 2160, round: false },
  { id: "banner", name: "横幅", detail: "1500×500", width: 1500, height: 500, round: false },
];

export function formatById(id: string): ExportFormat {
  return FORMATS.find((format) => format.id === id) ?? FORMATS[2];
}
