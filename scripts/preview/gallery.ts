/* “添加卡片”面板原型（阶段 2，只用于确认设计，不进插件）。
 * 页面上是真实的看板（编辑模式），“添加卡片”从底部弹起；面板里每张卡一个真实预览（用它的默认大小，推荐里的卡用配好的大小，再整体缩小）。
 * 点一张卡：添加到看板并滚到那张卡；已在看板上的有强调框加对勾，再点一下取消添加。大小靠看板上的拖角调。
 * 参数：?theme=dark  ?lang=en  ?scale=0.5（预览缩放）  ?sheet=0（一开始不弹出面板）
 * 卡片集合和分类是草案，等用户在验收清单里确认。 */
import { mk, q, stats } from "./sample";
import { DashboardView } from "../../src/view";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { L, setLanguage } from "../../src/i18n";
import { GUIDE_VERSION } from "../../src/tour-logic";
import { COLS, GAP, addItem, rowsToPx } from "../../src/grid";
import { WidgetId, WidgetLayout, widgetInfo, withItems } from "../../src/widgets";
import { reducedMotion } from "../../src/motion";

const lang = (q.get("lang") === "en" ? "en" : "zh") as "en" | "zh";
setLanguage(lang);
const SCALE = Number(q.get("scale")) > 0 ? Number(q.get("scale")) : 0.5;

interface Entry {
  id: WidgetId;
  name: () => string;
}
interface Group {
  name: () => string;
  entries: Entry[];
}

/** 草案：19 张卡，推荐加五类；库体检类里有一张合并卡和它包含的 6 张单卡，想合在一起或分开的用户都能选。添加时用每张卡现有的默认大小 */
/**
 * 推荐：新装用户默认看到的卡片，按阅读顺序，每张配好最合适的大小（12 列拼满，没有空位）。
 *   y0   今日写作 8×6 | 接下来 4×6
 *   y6   本月写作 4×3 | 总字数 4×3 | 任务完成率 4×3
 *   y9   写作热力图 12×5
 *   y14  每周写作 8×7 | 常用标签 4×7
 *   y21  库体检 12×5
 *   y26  写作回顾 12×4
 * 这个大小在面板里所有分类中通用：同一张卡不管从哪一类添加，大小一样。
 */
const RECOMMENDED: { id: WidgetId; w: number; h: number }[] = [
  { id: "hero", w: 8, h: 6 },
  { id: "tasks", w: 4, h: 6 },
  { id: "month", w: 4, h: 3 },
  { id: "words", w: 4, h: 3 },
  { id: "taskRate", w: 4, h: 3 },
  { id: "heat", w: 12, h: 5 },
  { id: "trend", w: 8, h: 7 },
  { id: "tags", w: 4, h: 7 },
  { id: "checkupHub", w: 12, h: 5 },
  { id: "reports", w: 12, h: 4 },
];
const RECOMMENDED_NAME: Record<string, () => string> = {
  hero: () => L("今日写作", "Today"),
  tasks: () => L("接下来", "Next up"),
  month: () => L("本月写作", "This month"),
  words: () => L("总字数", "Words"),
  taskRate: () => L("任务完成率", "Tasks done"),
  heat: () => L("写作热力图", "Writing heatmap"),
  trend: () => L("每周写作", "Weekly writing"),
  tags: () => L("常用标签", "Top tags"),
  checkupHub: () => L("库体检", "Vault checkup"),
  reports: () => L("写作回顾", "Writing review"),
};

const GROUPS: Group[] = [
  {
    name: () => L("推荐", "Recommended"),
    entries: RECOMMENDED.map((r) => ({ id: r.id, name: RECOMMENDED_NAME[r.id] })),
  },
  {
    name: () => L("写作进度", "Writing progress"),
    entries: [
      { id: "hero", name: () => L("今日写作", "Today") },
      { id: "month", name: () => L("本月写作", "This month") },
      { id: "words", name: () => L("总字数", "Words") },
    ],
  },
  {
    name: () => L("趋势与回顾", "Trends and review"),
    entries: [
      { id: "heat", name: () => L("写作热力图", "Writing heatmap") },
      { id: "trend", name: () => L("每周写作", "Weekly writing") },
      { id: "reports", name: () => L("写作回顾", "Writing review") },
    ],
  },
  {
    name: () => L("任务", "Tasks"),
    entries: [
      { id: "tasks", name: () => L("接下来", "Next up") },
      { id: "taskRate", name: () => L("任务完成率", "Tasks done") },
      { id: "calendar", name: () => L("日历", "Calendar") },
    ],
  },
  {
    name: () => L("笔记", "Notes"),
    entries: [
      { id: "tags", name: () => L("常用标签", "Top tags") },
      { id: "topLinked", name: () => L("最常被链接", "Most linked") },
      { id: "recent", name: () => L("最近编辑", "Recently edited") },
    ],
  },
  {
    name: () => L("库体检", "Vault checkup"),
    entries: [
      { id: "checkupHub", name: () => L("库体检", "Vault checkup") },
      { id: "brokenLinks", name: () => L("断链", "Broken links") },
      { id: "orphans", name: () => L("孤立笔记", "Orphans") },
      { id: "sameName", name: () => L("同名笔记", "Same name") },
      { id: "emptyBig", name: () => L("空笔记与超大笔记", "Empty and oversized") },
      { id: "unusedFiles", name: () => L("未引用的附件", "Unused attachments") },
      { id: "dupes", name: () => L("重复内容", "Duplicates") },
    ],
  },
];

const sizeOf = (id: WidgetId) => {
  const rec = RECOMMENDED.find((r) => r.id === id);
  if (rec) return { w: rec.w, h: rec.h };
  const info = widgetInfo(id);
  return { w: info?.w ?? 4, h: info?.h ?? 4 };
};

/* ---------- 页面上的真实看板（编辑模式） ---------- */

const app = {
  vault: { getName: () => "我的知识库", getMarkdownFiles: () => [], getAbstractFileByPath: (p: string) => mk(p, 0) },
  metadataCache: { getFileCache: () => null },
  workspace: { openLinkText: async () => undefined, on: () => ({}) },
  fileManager: { trashFile: async () => undefined },
};
const dedupe = { scanning: false, stale: false, analysis: null as unknown, ignoredSet: () => new Set<string>(), openReport: async () => undefined, startCleanup: () => undefined };
const baseSettings = { ...DEFAULT_SETTINGS, language: lang, dailyWordGoal: 500, weeklyWordGoal: 10000, onboarded: true, guideSeen: GUIDE_VERSION };
const pluginStub = (settings: typeof baseSettings, onSave: () => void) => ({
  settings, lastStats: stats, dedupe,
  requestRefresh: async () => undefined, openSettings: () => undefined, openFile: async () => undefined, openSearch: () => undefined,
  revealFolder: () => undefined, saveSettings: async () => undefined, saveViewSetting: async () => onSave(), openWritingReport: async () => undefined,
  setClippingFolder: async () => undefined, excludeFolder: async () => undefined, dismissHint: async () => undefined, setOutlierExclusion: async () => undefined,
});

const boardSettings = {
  ...baseSettings,
  layout: withItems([
    { id: "hero", x: 0, y: 0, w: 8, h: 6 },
    { id: "tasks", x: 8, y: 0, w: 4, h: 6 },
    { id: "heat", x: 0, y: 6, w: 12, h: 5 },
  ]) as WidgetLayout,
};
const boardHost = document.getElementById("app") as HTMLElement;
boardHost.classList.add("workspace-leaf-content");
const boardView = new DashboardView({ app, host: boardHost } as never, pluginStub(boardSettings, () => refresh()) as never);

/** 和真实插件一样走 applyLayout（存设置、撤销栈、卡片滑动）；它是私有方法，原型里直接调 */
const applyLayout = (next: WidgetLayout) => (boardView as unknown as { applyLayout(l: WidgetLayout): void }).applyLayout(next);

/** 滚到那张卡并闪一下；面板盖住了下半屏，所以让卡片停在上半屏 */
function revealOnBoard(id: string) {
  window.setTimeout(() => {
    const el = boardHost.querySelector<HTMLElement>(`.vp-grid > .vp-card[data-widget="${id}"]`);
    if (!el) return;
    window.scrollTo({ top: Math.max(0, el.getBoundingClientRect().top + window.scrollY - 110), behavior: reducedMotion(window) ? "auto" : "smooth" });
    el.classList.add("is-flash");
    window.setTimeout(() => el.classList.remove("is-flash"), 1400);
  }, 80);
}

/* ---------- 面板 ---------- */

interface TileRef {
  id: WidgetId;
  btn: HTMLElement;
}
const tiles: TileRef[] = [];

/** 已在看板上的卡（不管后来拖成多大）强调出来 */
function refresh() {
  const on = new Set(boardSettings.layout.items.map((i) => i.id));
  for (const r of tiles) {
    const picked = on.has(r.id);
    r.btn.classList.toggle("is-picked", picked);
    r.btn.setAttribute("aria-pressed", String(picked));
  }
}

function onTile(id: WidgetId) {
  const items = boardSettings.layout.items;
  if (items.some((i) => i.id === id)) {
    applyLayout(withItems(items.filter((i) => i.id !== id)));
    return;
  }
  const { w, h } = sizeOf(id);
  applyLayout(withItems(addItem(items, { id, x: 0, y: 0, w, h })));
  revealOnBoard(id);
}

// pathLength="1"：勾线的虚线长度按 0 到 1 算，CSS 用它把勾从左到右描出来
const CHECK = '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path pathLength="1" d="M3 8.5l3.2 3.2L13 4.8"/></svg>';

async function renderCard(host: HTMLElement, id: WidgetId, w: number, h: number, boardW: number): Promise<void> {
  const settings = { ...baseSettings, motion: false, layout: withItems([{ id, x: 0, y: 0, w, h }]) as WidgetLayout };
  host.classList.add("workspace-leaf-content");
  host.style.width = `${boardW}px`;
  const view = new DashboardView({ app, host } as never, pluginStub(settings, () => undefined) as never);
  await view.onOpen();
  view.render(stats);
}

const root = document.getElementById("gallery") as HTMLElement;
const sheet = root.createDiv({ cls: "gal-sheet vp-root" });
const top = sheet.createDiv({ cls: "gal-top" });
top.createDiv({ cls: "gal-title", text: L("添加卡片", "Add cards") });
const done = top.createEl("button", { cls: "gal-done", text: L("完成", "Done"), attr: { type: "button" } });
const main = sheet.createDiv({ cls: "gal-main" });
const nav = main.createEl("nav", { cls: "gal-nav has-ind", attr: { "aria-label": L("卡片分类", "Card categories") } });
// 选中底色单独一块，放在按钮前面（按钮是 position: relative，画在它上面）
const navInd = nav.createDiv({ cls: "gal-nav-ind", attr: { "aria-hidden": "true" } });
const content = main.createDiv({ cls: "gal-content" });

/** 把选中底色移到这个按钮下面；instant 时直接到位（第一次放置、窗口尺寸变了） */
function placeInd(btn: HTMLElement, instant: boolean) {
  navInd.classList.toggle("is-instant", instant);
  navInd.style.transform = `translate(${btn.offsetLeft}px, ${btn.offsetTop}px)`;
  navInd.style.width = `${btn.offsetWidth}px`;
  navInd.style.height = `${btn.offsetHeight}px`;
  if (instant) {
    void navInd.offsetWidth;
    navInd.classList.remove("is-instant");
  }
}

/** 让这一类的预览依次浮起；delay 是整组推迟多久（弹起面板时等面板先动一拍） */
function riseTiles(pane: HTMLElement, delay: string) {
  pane.classList.remove("is-entering");
  pane.style.setProperty("--gal-delay", delay);
  void pane.offsetWidth; // 去掉再加回类名之间强制排版一次，动画才会重新播放
  pane.classList.add("is-entering");
}

const setOpen = (open: boolean) => {
  const wasOpen = sheet.classList.contains("is-open");
  sheet.classList.toggle("is-open", open);
  document.body.classList.toggle("gal-open", open);
  const pane = panes[current];
  if (open && !wasOpen && pane && rendered[current] && !pane.classList.contains("is-loading")) riseTiles(pane, "var(--vp-t-fast)");
};
done.addEventListener("click", () => setOpen(false));
// 看板编辑栏里的“添加卡片”按钮：打开（或收起）这个面板，不再打开顶部那个旧面板
boardHost.addEventListener(
  "click",
  (e) => {
    const b = (e.target as Element).closest(".vp-editbar button");
    if (b && /添加卡片|Add a card/.test(b.textContent ?? "")) {
      e.stopImmediatePropagation();
      e.preventDefault();
      setOpen(!sheet.classList.contains("is-open"));
    }
  },
  true
);

const groupJobs: (() => Promise<void>)[][] = GROUPS.map(() => []);
const panes: HTMLElement[] = [];
const navBtns: HTMLElement[] = [];
const rendered: boolean[] = GROUPS.map(() => false);
let current = -1;

async function activate(gi: number): Promise<void> {
  const first = current < 0;
  if (gi === current) return;
  current = gi;
  panes.forEach((p, i) => p.classList.toggle("is-active", i === gi));
  navBtns.forEach((b, i) => {
    b.classList.toggle("is-active", i === gi);
    b.setAttribute("aria-current", i === gi ? "page" : "false");
  });
  placeInd(navBtns[gi], first);
  content.scrollTop = 0;
  const pane = panes[gi];
  const open = sheet.classList.contains("is-open");
  if (rendered[gi]) {
    if (open) riseTiles(pane, "0ms");
    return;
  }
  rendered[gi] = true;
  pane.classList.add("is-loading");
  for (const job of groupJobs[gi]) {
    try {
      await job();
    } catch (err) {
      console.error(err);
    }
  }
  refresh();
  pane.classList.remove("is-loading");
  // 面板还没弹起时不播，等 setOpen 弹起时再一起浮起；渲染期间用户已切到别的类也不播
  if (sheet.classList.contains("is-open") && current === gi) riseTiles(pane, "0ms");
  document.body.dataset.ready = String(gi);
}

function buildPanel(boardW: number) {
  const colW = (boardW - GAP * (COLS - 1)) / COLS;
  for (const [gi, g] of GROUPS.entries()) {
    const navBtn = nav.createEl("button", { cls: "gal-nav-item", attr: { type: "button" } });
    navBtn.createSpan({ text: g.name() });
    navBtn.createSpan({ cls: "gal-nav-count", text: String(g.entries.length) });
    navBtn.addEventListener("click", () => void activate(gi));
    navBtns.push(navBtn);
    const pane = content.createDiv({ cls: "gal-pane" });
    panes.push(pane);
    for (const [ti, e] of g.entries.entries()) {
      const { w, h } = sizeOf(e.id);
      const wpx = Math.round(w * colW + (w - 1) * GAP);
      const hpx = rowsToPx(h);
      const btn = pane.createEl("button", { cls: "gal-tile", attr: { type: "button", "aria-pressed": "false", "aria-label": e.name() } });
      btn.style.setProperty("--gal-i", String(Math.min(8, ti))); // 浮起次序，最多错开 8 步
      btn.createSpan({ cls: "gal-check", attr: { "aria-hidden": "true" } }).innerHTML = CHECK;
      const frame = btn.createDiv({ cls: "gal-frame" });
      frame.style.width = `${Math.round(wpx * SCALE)}px`;
      frame.style.height = `${Math.round(hpx * SCALE)}px`;
      const host = frame.createDiv({ cls: "gal-host" });
      host.style.transform = `scale(${SCALE})`;
      btn.createDiv({ cls: "gal-cap", text: e.name() });
      btn.addEventListener("click", () => onTile(e.id));
      tiles.push({ id: e.id, btn });
      groupJobs[gi].push(() => renderCard(host, e.id, w, h, boardW));
    }
  }
  const first = Number((location.hash || "#0").slice(1));
  void activate(Number.isInteger(first) && first >= 0 && first < GROUPS.length ? first : 0);
  window.addEventListener("resize", () => {
    if (current >= 0) placeInd(navBtns[current], true);
  });
}

void boardView.onOpen().then(async () => {
  boardView.render(stats);
  // 进入编辑模式，和用户点铅笔一样；之后点编辑栏里的“添加卡片”就弹出面板
  boardHost.querySelector<HTMLElement>('button[aria-label="编辑看板"], button[aria-label="Edit dashboard"]')?.click();
  const grid = boardHost.querySelector<HTMLElement>(".vp-grid");
  buildPanel(grid?.clientWidth || 1200);
  if (q.get("sheet") !== "0") window.setTimeout(() => setOpen(true), 500);
});
