/**
 * 外观：主题和背景（编辑看板 → 外观）。
 *
 * data.json 只存 settings.appearance（主题编号、背景选择、我的背景、卡片透明度），令牌值写在这里的主题表和预设表里。
 * 样式规则由 buildCss() 从主题表生成，写进 styles.css 的 themes:start … themes:end 之间（node scripts/build-themes.mjs；
 * tests/appearance.test.ts 检查两边一致）。不在运行时往页面里插 <style>：社区插件审查不允许。
 * 读取时不认识的主题编号、损坏的值一律退回默认：别的设备装的版本可能有这台没有的主题。
 * 设计记录：docs/design/2026-11-24-外观与主题.md。
 *
 * 这个文件不引用 obsidian，测试和生成样式的脚本可以直接用。
 */

type Tokens = Record<string, string>;

export interface ThemeDef {
  id: string;
  /** 浅色下覆盖的令牌；深色必须覆盖同一批令牌（测试会查），不然浅色的值会漏到深色里 */
  light: Tokens;
  dark: Tokens;
}

export interface BackgroundDef {
  id: string;
  /** 只管页面底色：--vp-page（底色）和 --vp-glow（强调色光晕的强度，0 到 1） */
  light: { page: string; glow: number };
  dark: { page: string; glow: number };
}

/** 用户自己添加的背景：颜色或图片二选一。图片是库里的路径，ink 是添加时按图片上部的明暗算好的，页首文字用它选深浅 */
export interface MyBackground {
  id: string;
  color?: string;
  image?: string;
  ink?: "dark" | "light";
}

export interface Appearance {
  /** 主题编号；不认识的退回 default */
  theme: string;
  /** theme：跟随主题自带的底色；preset：预设（渐变、纸）；mine：我的背景里的某一项 */
  background: { kind: "theme" | "preset" | "mine"; preset?: string; id?: string };
  backgrounds: MyBackground[];
  /** 卡片透明度，百分比，0 到 100；100 是原来的样子 */
  cardOpacity: number;
}

export const MAX_MINE = 8;
export const OPACITY_MIN = 0;
/** 添加图片：长边压到 1920 像素以内，JPEG 质量 0.82，原图超过 20MB 直接拒绝 */
export const MAX_IMAGE_EDGE = 1920;
export const JPEG_QUALITY = 0.82;
export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
/** 图片复制进库里的这个文件夹 */
export const BG_FOLDER = "Note Pulse/backgrounds";
/** 新加的自选颜色从这个颜色开始 */
export const START_COLOR = "#E8DFD0";

/** 没有 appearance 字段时的样子：默认主题、跟随主题的底色、没有我的背景、卡片不透明（已有用户升级后外观不变）。
 * 共享的对象：改外观一律生成新对象，不要原地改它 */
export const DEFAULT_APPEARANCE: Appearance = { theme: "default", background: { kind: "theme" }, backgrounds: [], cardOpacity: 100 };

/** 主题表。顺序就是面板里的顺序；将来的第四套接在后面（data.json 只存编号，加一套不改格式） */
export const THEMES: ThemeDef[] = [
  // 默认：现在的样子，什么都不覆盖（已有用户升级后外观不变）
  { id: "default", light: {}, dark: {} },
  {
    // Craft：暖纸色页面、白色平涂卡片、16px 圆角、暖色阴影；字体 Avenir Next（2026-11-08 的决定），强调色仍跟随 Obsidian
    id: "craft",
    light: {
      "--text-normal": "#1d1c1a",
      "--text-muted": "#7a746c",
      "--text-faint": "#a8a299",
      "--vp-page": "#efeae0",
      "--vp-glow": "0",
      "--vp-surface": "#ffffff",
      "--vp-border": "rgba(60, 45, 20, 0.06)",
      "--vp-line": "rgba(60, 45, 20, 0.08)",
      "--vp-line-strong": "rgba(60, 45, 20, 0.16)",
      "--vp-track": "rgba(60, 45, 20, 0.07)",
      "--vp-heat-empty": "#f1ede4",
      "--vp-shadow": "0 1px 2px rgba(60, 45, 20, 0.05), 0 8px 24px rgba(60, 45, 20, 0.06)",
      "--vp-shadow-raise": "0 2px 4px rgba(60, 45, 20, 0.06), 0 16px 36px rgba(60, 45, 20, 0.11)",
      "--vp-card-bg": "none",
      "--vp-hero-bg": "color-mix(in srgb, var(--vp-accent) 8%, var(--vp-surface))",
      "--vp-chip-bg": "color-mix(in srgb, var(--vp-accent) 10%, transparent)",
      "--vp-r-m": "16px",
      "--vp-r-s": "8px",
    },
    dark: {
      "--text-normal": "#f2f0ef",
      "--text-muted": "#a9a4a2",
      "--text-faint": "#7a7573",
      "--vp-page": "#1f1d1e",
      "--vp-glow": "0",
      "--vp-surface": "#2d2a2c",
      "--vp-border": "rgba(255, 255, 255, 0.06)",
      "--vp-line": "rgba(255, 255, 255, 0.08)",
      "--vp-line-strong": "rgba(255, 255, 255, 0.16)",
      "--vp-track": "rgba(255, 255, 255, 0.09)",
      "--vp-heat-empty": "#38353a",
      "--vp-shadow": "0 1px 2px rgba(0, 0, 0, 0.3), 0 8px 24px rgba(0, 0, 0, 0.28)",
      "--vp-shadow-raise": "0 2px 4px rgba(0, 0, 0, 0.34), 0 16px 36px rgba(0, 0, 0, 0.4)",
      "--vp-card-bg": "none",
      "--vp-hero-bg": "color-mix(in srgb, var(--vp-accent) 8%, var(--vp-surface))",
      "--vp-chip-bg": "color-mix(in srgb, var(--vp-accent) 10%, transparent)",
      "--vp-r-m": "16px",
      "--vp-r-s": "8px",
    },
  },
];

/** 预设背景只有两款：渐变（默认主题本来的样子）和纸。别的颜色、图片由用户自己添加 */
export const BACKGROUNDS: BackgroundDef[] = [
  { id: "gradient", light: { page: "var(--background-secondary)", glow: 1 }, dark: { page: "var(--background-primary)", glow: 1 } },
  { id: "paper", light: { page: "#efeae0", glow: 0 }, dark: { page: "#1f1d1e", glow: 0 } },
];

const HEX = /^#[0-9a-f]{6}$/i;
export const isHex = (s: unknown): s is string => typeof s === "string" && HEX.test(s);

/** 图片路径只认库里的相对路径：不以 / 开头、不含 .. 这一段、不含反斜杠、不带协议或盘符 */
export function isSafeImagePath(p: unknown): p is string {
  if (typeof p !== "string" || p.length === 0 || p.length > 300) return false;
  if (p.startsWith("/") || p.includes("\\") || /^[a-z][a-z0-9+.-]*:/i.test(p)) return false;
  return !p.split("/").some((seg) => seg === ".." || seg === ".");
}

/** 读 data.json 里的 appearance：任何不认识或损坏的值都退回默认 */
export function sanitizeAppearance(raw: unknown): Appearance {
  const r = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const theme = typeof r.theme === "string" && THEMES.some((t) => t.id === r.theme) ? r.theme : "default";
  const mine: MyBackground[] = [];
  if (Array.isArray(r.backgrounds)) {
    for (const v of r.backgrounds as unknown[]) {
      if (mine.length >= MAX_MINE) break;
      if (!v || typeof v !== "object") continue;
      const it = v as Record<string, unknown>;
      const id = it.id;
      if (typeof id !== "string" || !id || id.length > 32 || mine.some((m) => m.id === id)) continue;
      if (isHex(it.color) && it.image === undefined) mine.push({ id, color: it.color.toUpperCase() });
      else if (isSafeImagePath(it.image) && it.color === undefined) mine.push({ id, image: it.image, ink: it.ink === "light" ? "light" : "dark" });
    }
  }
  const b = (r.background && typeof r.background === "object" ? r.background : {}) as Record<string, unknown>;
  let background: Appearance["background"] = { kind: "theme" };
  if (b.kind === "preset" && BACKGROUNDS.some((p) => p.id === b.preset)) background = { kind: "preset", preset: b.preset as string };
  else if (b.kind === "mine" && mine.some((m) => m.id === b.id)) background = { kind: "mine", id: b.id as string };
  const op = typeof r.cardOpacity === "number" && Number.isFinite(r.cardOpacity) ? Math.round(r.cardOpacity) : 100;
  return { theme, background, backgrounds: mine, cardOpacity: Math.min(100, Math.max(OPACITY_MIN, op)) };
}

/** 加一项我的背景并选中它；已经满 8 个时原样返回 */
export function addMine(a: Appearance, m: MyBackground): Appearance {
  if (a.backgrounds.length >= MAX_MINE || a.backgrounds.some((x) => x.id === m.id)) return a;
  return { ...a, backgrounds: [...a.backgrounds, m], background: { kind: "mine", id: m.id } };
}

/** 从我的背景里去掉一项（库里的图片文件不删）；删的是选中的那项就退回“跟随主题” */
export function removeMine(a: Appearance, id: string): Appearance {
  const sel = a.background.kind === "mine" && a.background.id === id;
  return { ...a, backgrounds: a.backgrounds.filter((x) => x.id !== id), background: sel ? { kind: "theme" } : a.background };
}

/** 库里的图片被改名或移动：记录跟着改。新路径不安全时保持原样（页面会按找不到文件退回主题底色） */
export function renameImage(a: Appearance, oldPath: string, newPath: string): Appearance {
  if (!a.backgrounds.some((m) => m.image === oldPath) || !isSafeImagePath(newPath)) return a;
  return { ...a, backgrounds: a.backgrounds.map((m) => (m.image === oldPath ? { ...m, image: newPath } : m)) };
}

export const mineOf = (a: Appearance): MyBackground | null => (a.background.kind === "mine" ? (a.backgrounds.find((m) => m.id === a.background.id) ?? null) : null);

/** 这个颜色是亮是暗：亮底配深色字，暗底配浅色字（页面上直接显示的标题文字用） */
export function inkFor(hex: string): "dark" | "light" {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => ((c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lum = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return lum > 0.3 ? "dark" : "light";
}

/** 一组 RGBA 像素的平均颜色（不管透明度）；没有像素时是中灰 */
export function averageHex(px: Uint8ClampedArray): string {
  const n = Math.floor(px.length / 4);
  if (n === 0) return "#808080";
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < n * 4; i += 4) {
    r += px[i];
    g += px[i + 1];
    b += px[i + 2];
  }
  return `#${[r, g, b].map((x) => Math.round(x / n).toString(16).padStart(2, "0")).join("")}`.toUpperCase();
}

/** 按比例缩到长边不超过 max，不放大 */
export function fitWithin(w: number, h: number, max = MAX_IMAGE_EDGE): { w: number; h: number } {
  const k = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/** 看板根元素上外观会挂的类名前缀，换外观前先把旧的摘掉 */
export const LOOK_CLASS = /^vp-(theme|bg|ink)-|^vp-translucent$/;

/**
 * 外观落到看板根元素上的类名和自定义属性；样式由 styles.css 管。
 * urlOf 把库里的图片路径换成能显示的地址（插件里是 vault.getResourcePath）；文件找不到时返回 null，页面退回主题自带的底色。
 */
export function appearanceLook(a: Appearance, urlOf: (path: string) => string | null): { classes: string[]; props: Record<string, string> } {
  const classes = [`vp-theme-${a.theme}`];
  const props: Record<string, string> = {};
  if (a.background.kind === "preset") classes.push(`vp-bg-${a.background.preset}`);
  const m = mineOf(a);
  if (m?.color) {
    classes.push("vp-bg-color", `vp-ink-${inkFor(m.color)}`);
    props["--vp-custom"] = m.color;
  } else if (m?.image) {
    const url = urlOf(m.image);
    if (url) {
      classes.push("vp-bg-image", `vp-ink-${m.ink ?? "dark"}`);
      props["--vp-page-image"] = `url("${url.replace(/"/g, "%22")}")`;
    }
  }
  if (a.cardOpacity < 100) {
    classes.push("vp-translucent");
    props["--vp-card-op"] = String(a.cardOpacity / 100);
  }
  return { classes, props };
}

const rule = (sel: string, t: Tokens) => `${sel} {\n${Object.entries(t).map(([k, v]) => `  ${k}: ${v};`).join("\n")}\n}`;

/** 把主题表和预设表变成样式规则：浅色一条，深色一条（.theme-dark 下）。背景规则排在主题规则后面，同样的优先级下后写的赢 */
export function buildCss(): string {
  const out: string[] = [];
  for (const t of THEMES) {
    if (Object.keys(t.light).length === 0) continue;
    out.push(rule(`.vp-root.vp-theme-${t.id}`, t.light), rule(`.theme-dark .vp-root.vp-theme-${t.id}`, t.dark));
  }
  const bg = (v: { page: string; glow: number }) => ({ "--vp-page": v.page, "--vp-glow": String(v.glow) });
  for (const b of BACKGROUNDS) out.push(rule(`.vp-root.vp-bg-${b.id}`, bg(b.light)), rule(`.theme-dark .vp-root.vp-bg-${b.id}`, bg(b.dark)));
  out.push(rule(".vp-root.vp-bg-color,\n.theme-dark .vp-root.vp-bg-color", { "--vp-page": "var(--vp-custom)", "--vp-glow": "0" }));
  return out.join("\n");
}

/** styles.css 里 themes:start 到 themes:end 这一段应有的全文 */
export function themeBlock(): string {
  return `/* themes:start */\n/* 由 src/appearance.ts 的主题表和预设表生成（node scripts/build-themes.mjs），不要手改 */\n${buildCss()}\n/* themes:end */`;
}

/** 取色界面用：色相 0–360、饱和度和明度 0–1 → #RRGGBB */
export function hsvToHex(h: number, s: number, v: number): string {
  const f = (n: number) => {
    const k = (n + h / 60) % 6;
    return v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
  };
  const to = (x: number) => Math.round(x * 255).toString(16).padStart(2, "0");
  return `#${to(f(5))}${to(f(3))}${to(f(1))}`.toUpperCase();
}

export function hexToHsv(hex: string): { h: number; s: number; v: number } {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255;
  const g = ((n >> 8) & 255) / 255;
  const b = (n & 255) / 255;
  const max = Math.max(r, g, b);
  const d = max - Math.min(r, g, b);
  let h = 0;
  if (d) h = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return { h: h * 60, s: max ? d / max : 0, v: max };
}
