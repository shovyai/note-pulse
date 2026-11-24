/* “外观”的本地预览：真实看板代码（src/view.ts 的编辑栏、底部面板、src/appearance-panel.ts 的背景和主题）加示例数据。
 * 只用于浏览器里的预览检查，不算验收（Obsidian 实机才算）。
 * node scripts/preview/build-appearance.mjs，再在仓库根目录起本地服务（python3 -m http.server 端口 --bind 127.0.0.1）打开 /scripts/preview/appearance.html
 * 参数：?theme=dark（Obsidian 的浅色深色）  ?look=craft  ?bg=gradient|paper|c:1E2A44（加一个颜色并选中）|img（加一张示意图片并选中）
 *       ?op=70（卡片透明度）  ?group=add  ?sheet=0（一开始不弹面板）  ?phone=1（390 宽、手机，只看不改）  ?lang=en  ?json=1（左上角显示会存进 data.json 的内容）
 * 没有真实的库：添加的图片存在内存里，路径和库里一样（Note Pulse/backgrounds/…），刷新后就没了，页面按“文件找不到”退回主题底色。 */
import icons from "./icons.json";
import { mk, q, stats } from "./sample";
import { Platform, TFile } from "obsidian";
import { DashboardView } from "../../src/view";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { setLanguage } from "../../src/i18n";
import { GUIDE_VERSION } from "../../src/tour-logic";
import { Appearance, addMine, sanitizeAppearance } from "../../src/appearance";

(icons as Record<string, string>).image =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>';

const lang = (q.get("lang") === "en" ? "en" : "zh") as "en" | "zh";
setLanguage(lang);
if (q.get("theme") === "dark") document.body.classList.add("theme-dark");
else document.body.classList.add("theme-light");
const phone = q.get("phone") === "1";
(Platform as { isMobile: boolean }).isMobile = phone;

/* ---------- 假的库：只有背景图片（内存里的 data URL） ---------- */
const blobs = new Map<string, string>();
const listeners = new Map<string, ((...a: unknown[]) => void)[]>();
const emit = (ev: string, ...a: unknown[]) => (listeners.get(ev) ?? []).forEach((f) => f(...a));
const fileAt = (path: string) => Object.assign(new TFile(), { path, extension: path.split(".").pop() ?? "" });
const vault = {
  getName: () => "我的知识库",
  getMarkdownFiles: () => [],
  getAbstractFileByPath: (p: string) => (blobs.has(p) ? fileAt(p) : p.endsWith(".md") ? mk(p, 0) : p === "Note Pulse" || p === "Note Pulse/backgrounds" ? {} : null),
  getResourcePath: (f: TFile) => blobs.get(f.path) ?? "",
  createFolder: async () => undefined,
  createBinary: async (path: string, buf: ArrayBuffer) => {
    const url = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
    blobs.set(path, url);
    emit("create", fileAt(path));
  },
  on: (ev: string, fn: (...a: unknown[]) => void) => {
    listeners.set(ev, [...(listeners.get(ev) ?? []), fn]);
    return {};
  },
};
(window as unknown as Record<string, unknown>).__vault = { blobs, emit, fileAt };
const app = {
  vault,
  metadataCache: { getFileCache: () => null },
  workspace: { openLinkText: async () => undefined, on: () => ({}) },
  fileManager: { trashFile: async () => undefined },
};

/* ---------- 起始外观：从网址参数来 ---------- */
let look: Appearance = sanitizeAppearance({ theme: q.get("look") ?? "default", cardOpacity: Number(q.get("op") ?? 100) });
const bg = q.get("bg");
if (bg === "gradient" || bg === "paper") look = { ...look, background: { kind: "preset", preset: bg } };
else if (bg?.startsWith("c:")) look = addMine(look, { id: "c1", color: `#${bg.slice(2).toUpperCase()}` });

const settings = { ...DEFAULT_SETTINGS, language: lang, dailyWordGoal: 500, weeklyWordGoal: 10000, onboarded: true, guideSeen: GUIDE_VERSION, appearance: look };
const jsonEl = q.get("json") === "1" ? document.body.createEl("pre", { cls: "proto-json" }) : null;
const showJson = () => {
  if (jsonEl) jsonEl.textContent = JSON.stringify({ appearance: settings.appearance }, null, 2);
};
const dedupe = { scanning: false, stale: false, analysis: null as unknown, ignoredSet: () => new Set<string>(), openReport: async () => undefined, startCleanup: () => undefined };
const plugin = {
  settings,
  lastStats: stats,
  dedupe,
  requestRefresh: async () => undefined,
  openSettings: () => undefined,
  openFile: async () => undefined,
  openSearch: () => undefined,
  revealFolder: () => undefined,
  saveSettings: async () => undefined,
  saveViewSetting: async () => showJson(),
  openWritingReport: async () => undefined,
  setClippingFolder: async () => undefined,
  excludeFolder: async () => undefined,
  dismissHint: async () => undefined,
  setOutlierExclusion: async () => undefined,
};

/** 一张示意图片：上半暗、下半亮的渐变加几块色斑，1600×1000，压缩、写进假库，和“添加图片”走同一条路 */
async function demoImage(): Promise<File> {
  const c = document.createElement("canvas");
  c.width = 2400;
  c.height = 1500;
  const g = c.getContext("2d");
  if (!g) throw new Error("canvas");
  const lin = g.createLinearGradient(0, 0, 0, 1500);
  lin.addColorStop(0, "#1b2a4a");
  lin.addColorStop(1, "#d98c5f");
  g.fillStyle = lin;
  g.fillRect(0, 0, 2400, 1500);
  for (const [x, y, r, col] of [[500, 400, 380, "#3c6e9e"], [1800, 300, 300, "#7a4f8f"], [1200, 1200, 500, "#f2c38a"]] as const) {
    g.fillStyle = col;
    g.globalAlpha = 0.55;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"));
  return new File([blob ?? new Blob()], "demo.png", { type: "image/png" });
}

const host = document.getElementById("app") as HTMLElement;
host.classList.add("workspace-leaf-content");
if (phone) host.classList.add("is-phone");
const view = new DashboardView({ app, host } as never, plugin as never);
(window as unknown as Record<string, unknown>).__view = view;
(window as unknown as Record<string, unknown>).__demoImage = demoImage;

void view.onOpen().then(async () => {
  view.render(stats);
  showJson();
  if (bg === "img") {
    const { importImage } = await import("../../src/appearance-panel");
    const m = await importImage(app as never, await demoImage());
    if (m) {
      settings.appearance = addMine(settings.appearance, m);
      view.applyLook();
      showJson();
    }
  }
  if (phone || q.get("sheet") === "0") return;
  // 进入编辑模式，和用户点铅笔一样，再点调色盘（或“添加卡片”）
  let tries = 0;
  const t = window.setInterval(() => {
    const edit = host.querySelector<HTMLElement>('button[aria-label="编辑看板"], button[aria-label="Edit dashboard"]');
    const tools = host.querySelector<HTMLElement>(".vp-editing .vp-edit-tools");
    if (tools || ++tries > 40) {
      window.clearInterval(t);
      const target = q.get("group") === "add" ? tools?.querySelector<HTMLElement>(".vp-edit-add") : tools?.querySelector<HTMLElement>('button[aria-label="外观"], button[aria-label="Appearance"]');
      window.setTimeout(() => target?.click(), 300);
      return;
    }
    edit?.click();
  }, 150);
});
