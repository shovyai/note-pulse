/* 排版方案原型：用真实的卡片代码和示例数据渲染看板，再把卡片挪进 10 种不同的排版结构里比较。
 * 只改排列和每张卡的档位，不改卡片内容。node scripts/preview/build-layouts.mjs，然后打开 scripts/preview/layouts.html?v=1 */
import { mk, q, stats } from "./sample";
import { DashboardView } from "../../src/view";
import { DEFAULT_SETTINGS } from "../../src/settings";
import { setLanguage } from "../../src/i18n";
import { defaultLayout, type WidgetId, type WidgetSize } from "../../src/widgets";

const lang = (q.get("lang") === "en" ? "en" : "zh") as "en" | "zh";
setLanguage(lang);

/* ---------- 搭结构的小工具 ---------- */

type Cards = Map<WidgetId, HTMLElement>;
interface Ctx {
  root: HTMLElement;
  cards: Cards;
}
function grid(parent: HTMLElement, cls = ""): HTMLElement {
  return parent.createDiv({ cls: `lx-grid ${cls}` });
}
function put(ctx: Ctx, parent: HTMLElement, id: WidgetId, span: number, extra = ""): HTMLElement | null {
  const el = ctx.cards.get(id);
  if (!el) return null;
  el.style.gridColumn = `span ${span}`;
  if (extra) el.addClass(...extra.split(" "));
  parent.appendChild(el);
  return el;
}
/** 一列里竖着叠几张卡：和旁边的高卡等高，最后一张拉伸填满 */
function stack(ctx: Ctx, parent: HTMLElement, span: number, ids: WidgetId[], cls = ""): HTMLElement {
  const s = parent.createDiv({ cls: `lx-stack ${cls}` });
  s.style.gridColumn = `span ${span}`;
  for (const id of ids) {
    const el = ctx.cards.get(id);
    if (el) s.appendChild(el);
  }
  return s;
}
/** 两张卡并排放进一个格子（S 卡两两一组） */
function pair(ctx: Ctx, parent: HTMLElement, span: number, ids: WidgetId[]): HTMLElement {
  const s = parent.createDiv({ cls: "lx-pair" });
  s.style.gridColumn = `span ${span}`;
  for (const id of ids) {
    const el = ctx.cards.get(id);
    if (el) s.appendChild(el);
  }
  return s;
}
function section(parent: HTMLElement, title: string, note = ""): HTMLElement {
  const s = parent.createDiv({ cls: "lx-section" });
  const h = s.createDiv({ cls: "lx-section-title" });
  h.createSpan({ text: title });
  if (note) h.createSpan({ cls: "lx-section-note", text: note });
  return s;
}

/* ---------- 10 种排版 ---------- */

interface Variant {
  name: string;
  idea: string;
  sizes: Partial<Record<WidgetId, WidgetSize>>;
  /** 整页额外的类（紧凑、窄栏等） */
  cls?: string;
  build: (ctx: Ctx) => void;
}

const VARIANTS: Variant[] = [
  {
    name: "按主题分区",
    idea: "卡片分成写作、任务、知识库、维护四组，每组带小标题；短卡叠在高卡旁边，不留空列。",
    sizes: { activity: "s", rhythm: "m", density: "s" },
    build(c) {
      let g = grid(section(c.root, "写作"));
      put(c, g, "hero", 8);
      stack(c, g, 4, ["month", "activity"]);
      put(c, g, "heat", 12);
      put(c, g, "trend", 8);
      stack(c, g, 4, ["rhythm", "words"]);
      g = grid(section(c.root, "任务"));
      put(c, g, "tasks", 6);
      stack(c, g, 6, ["taskRate", "taskNotes"]);
      g = grid(section(c.root, "知识库"));
      put(c, g, "tags", 4);
      stack(c, g, 4, ["topLinked", "notes"]);
      stack(c, g, 4, ["folders", "density"]);
      g = grid(section(c.root, "维护"));
      put(c, g, "checkup", 12);
      put(c, g, "reports", 12);
    },
  },
  {
    name: "便当格",
    idea: "今日写作和四个数字拼成首屏的一大块，下面大小卡交错拼接，每行都严丝合缝。",
    sizes: { hero: "m", activity: "m", rhythm: "m" },
    build(c) {
      const g = grid(c.root);
      put(c, g, "hero", 6);
      stack(c, g, 3, ["notes", "words"]);
      stack(c, g, 3, ["taskRate", "month"]);
      put(c, g, "heat", 12);
      put(c, g, "trend", 8);
      put(c, g, "tags", 4);
      put(c, g, "tasks", 4);
      stack(c, g, 4, ["rhythm", "density"]);
      stack(c, g, 4, ["activity", "folders"]);
      put(c, g, "topLinked", 6);
      put(c, g, "taskNotes", 6);
      put(c, g, "checkup", 12);
      put(c, g, "reports", 12);
    },
  },
  {
    name: "主栏 + 侧栏",
    idea: "左边宽栏放大图（今日写作、热力图、每周写作、体检），右边窄栏放数字和清单，像报纸版面。",
    sizes: { hero: "l", heat: "l", trend: "l", checkup: "l", reports: "l", activity: "m", rhythm: "m" },
    build(c) {
      const g = grid(c.root, "lx-top");
      const main = stack(c, g, 8, ["hero", "heat", "trend", "taskNotes", "checkup", "reports"], "is-loose");
      main.addClass("lx-main");
      const side = g.createDiv({ cls: "lx-stack lx-side is-loose" });
      side.style.gridColumn = "span 4";
      const k = grid(side, "lx-kpi-2");
      put(c, k, "notes", 6);
      put(c, k, "words", 6);
      put(c, k, "taskRate", 6);
      put(c, k, "month", 6);
      for (const id of ["tasks", "tags", "rhythm", "activity", "topLinked", "folders", "density"] as WidgetId[]) {
        const el = c.cards.get(id);
        if (el) side.appendChild(el);
      }
    },
  },
  {
    name: "瀑布流",
    idea: "热力图横跨顶部，下面三列按卡片自身高度往下流，不按行对齐，短卡不再被拉高留白。",
    sizes: { hero: "m", tags: "m", trend: "l", activity: "m", rhythm: "m" },
    build(c) {
      const g = grid(c.root);
      put(c, g, "heat", 12);
      const cols = c.root.createDiv({ cls: "lx-masonry" });
      const order: WidgetId[] = ["hero", "tasks", "notes", "words", "rhythm", "trend", "taskRate", "month", "tags", "activity", "topLinked", "density", "folders", "taskNotes"];
      for (const id of order) {
        const el = c.cards.get(id);
        if (el) cols.appendChild(el);
      }
      const g2 = grid(c.root);
      put(c, g2, "checkup", 12);
      put(c, g2, "reports", 12);
    },
  },
  {
    name: "数字条 + 标签页",
    idea: "顶部一条关键数字，下面用标签页切换写作 / 任务 / 知识库 / 维护，一次只看一组，页面最短。",
    sizes: { activity: "s", rhythm: "s", trend: "xl" },
    build(c) {
      const strip = grid(c.root, "lx-strip");
      for (const id of ["notes", "words", "taskRate", "month"] as WidgetId[]) put(c, strip, id, 3);
      const tabs: [string, (g: HTMLElement) => void][] = [
        ["写作", (g) => {
          put(c, g, "hero", 8);
          stack(c, g, 4, ["rhythm", "activity"]);
          put(c, g, "heat", 12);
          put(c, g, "trend", 12);
        }],
        ["任务", (g) => {
          put(c, g, "tasks", 6);
          put(c, g, "taskNotes", 6);
        }],
        ["知识库", (g) => {
          put(c, g, "tags", 4);
          put(c, g, "topLinked", 4);
          stack(c, g, 4, ["folders", "density"]);
        }],
        ["维护", (g) => {
          put(c, g, "checkup", 12);
          put(c, g, "reports", 12);
        }],
      ];
      const bar = c.root.createDiv({ cls: "lx-tabs", attr: { role: "tablist" } });
      const panes: HTMLElement[] = [];
      tabs.forEach(([name, fill], i) => {
        const b = bar.createEl("button", { cls: "lx-tab" + (i === 0 ? " is-active" : ""), text: name, attr: { role: "tab" } });
        const pane = grid(c.root, "lx-pane" + (i === 0 ? "" : " is-hidden"));
        fill(pane);
        panes.push(pane);
        b.addEventListener("click", () => {
          bar.querySelectorAll(".lx-tab").forEach((x) => x.removeClass("is-active"));
          b.addClass("is-active");
          panes.forEach((p, j) => p.toggleClass("is-hidden", j !== i));
        });
      });
    },
  },
  {
    name: "单列简报",
    idea: "一栏 760px 居中，从上往下像读一份日报；小卡两两并排。适合放在侧栏或窄窗口。",
    cls: "is-narrow",
    sizes: { hero: "l", heat: "xl", trend: "xl", tags: "l", checkup: "l", reports: "l", activity: "m", rhythm: "m", tasks: "l", topLinked: "l", taskNotes: "l", folders: "l" },
    build(c) {
      const g = grid(c.root);
      put(c, g, "hero", 12);
      put(c, g, "notes", 6);
      put(c, g, "words", 6);
      put(c, g, "taskRate", 6);
      put(c, g, "month", 6);
      put(c, g, "tasks", 12);
      put(c, g, "heat", 12);
      put(c, g, "trend", 12);
      put(c, g, "rhythm", 6);
      put(c, g, "activity", 6);
      put(c, g, "tags", 12);
      put(c, g, "topLinked", 12);
      put(c, g, "folders", 6);
      put(c, g, "density", 6);
      put(c, g, "taskNotes", 12);
      put(c, g, "checkup", 12);
      put(c, g, "reports", 12);
    },
  },
  {
    name: "按时间尺度",
    idea: "左侧一条时间轴：今天 → 近 30 天 → 近一年 → 全库 → 维护，每一层回答一个时间范围的问题。",
    sizes: { activity: "s", rhythm: "s", folders: "l" },
    cls: "is-timeline",
    build(c) {
      const band = (label: string, sub: string) => {
        const b = c.root.createDiv({ cls: "lx-band" });
        const l = b.createDiv({ cls: "lx-band-label" });
        l.createDiv({ cls: "lx-band-name", text: label });
        l.createDiv({ cls: "lx-band-sub", text: sub });
        return grid(b);
      };
      let g = band("今天", "写了多少、接下来做什么");
      put(c, g, "hero", 8);
      put(c, g, "tasks", 4);
      g = band("近 30 天", "节奏和产出");
      put(c, g, "month", 3);
      put(c, g, "rhythm", 3);
      put(c, g, "activity", 3);
      put(c, g, "taskRate", 3);
      g = band("近一年", "长期趋势");
      put(c, g, "heat", 12);
      put(c, g, "trend", 8);
      put(c, g, "tags", 4);
      g = band("全库", "规模和结构");
      put(c, g, "notes", 4);
      put(c, g, "words", 4);
      put(c, g, "density", 4);
      put(c, g, "topLinked", 6);
      put(c, g, "taskNotes", 6);
      put(c, g, "folders", 12);
      g = band("维护", "该整理什么");
      put(c, g, "checkup", 12);
      put(c, g, "reports", 12);
    },
  },
  {
    name: "紧凑数字墙",
    idea: "收紧间距和内边距，顶部一排 6 个小数字，下面三列清单，一屏能看到更多。",
    cls: "is-compact",
    sizes: { hero: "xl", rhythm: "s", trend: "xl", activity: "m" },
    build(c) {
      const g = grid(c.root);
      put(c, g, "hero", 12);
      for (const id of ["notes", "words", "taskRate", "month", "density", "rhythm"] as WidgetId[]) put(c, g, id, 2);
      put(c, g, "tasks", 4);
      put(c, g, "tags", 4);
      stack(c, g, 4, ["topLinked", "folders"]);
      put(c, g, "taskNotes", 6);
      put(c, g, "activity", 6);
      put(c, g, "heat", 12);
      put(c, g, "trend", 12);
      put(c, g, "checkup", 12);
      put(c, g, "reports", 12);
    },
  },
  {
    name: "左右两栏",
    idea: "两栏等宽，左边是“我写了什么”，右边是“我的库和任务”，两栏各自往下排，不强求每行对齐。",
    sizes: { hero: "m", heat: "l", trend: "l", tags: "l", tasks: "l", topLinked: "l", folders: "l", taskNotes: "l", activity: "m", rhythm: "m" },
    build(c) {
      const g = grid(c.root, "lx-top");
      stack(c, g, 6, ["hero", "heat", "trend", "rhythm", "activity"], "is-loose");
      const right = g.createDiv({ cls: "lx-stack is-loose" });
      right.style.gridColumn = "span 6";
      const k = grid(right);
      for (const id of ["notes", "words", "taskRate", "month"] as WidgetId[]) put(c, k, id, 6);
      for (const id of ["tasks", "tags", "topLinked", "folders", "taskNotes", "density"] as WidgetId[]) {
        const el = c.cards.get(id);
        if (el) right.appendChild(el);
      }
      const g2 = grid(c.root);
      put(c, g2, "checkup", 12);
      put(c, g2, "reports", 12);
    },
  },
  {
    name: "大图 + 指标清单",
    idea: "大卡只留今日写作、接下来、热力图、每周写作；其余小指标改成横排的一行一项，收进一张清单。",
    sizes: { activity: "m", rhythm: "m", topLinked: "m", folders: "m", taskNotes: "m", density: "s" },
    build(c) {
      const g = grid(c.root);
      put(c, g, "hero", 8);
      put(c, g, "tasks", 4);
      put(c, g, "heat", 12);
      put(c, g, "trend", 8);
      put(c, g, "tags", 4);
      const list = section(c.root, "其他指标");
      const rows = list.createDiv({ cls: "lx-rows" });
      for (const id of ["notes", "words", "taskRate", "month", "density", "activity", "rhythm", "folders", "topLinked", "taskNotes"] as WidgetId[]) {
        const el = c.cards.get(id);
        if (!el) continue;
        el.addClass("lx-row");
        rows.appendChild(el);
      }
      const g2 = grid(c.root);
      put(c, g2, "checkup", 12);
      put(c, g2, "reports", 12);
    },
  },
];

/* ---------- 渲染 ---------- */

const vi = Math.min(VARIANTS.length, Math.max(0, Number(q.get("v") || "0")));
const variant = vi > 0 ? VARIANTS[vi - 1] : null;
document.body.addClass("lx-page");

// 顶部切换条（不属于看板，只在原型里）
const nav = document.body.createDiv({ cls: "lx-nav" });
const link = (label: string, v: number) => {
  const p = new URLSearchParams(location.search);
  p.set("v", String(v));
  nav.createEl("a", { cls: "lx-nav-item" + (v === vi ? " is-active" : ""), text: label, attr: { href: `?${p.toString()}` } });
};
link("现在", 0);
VARIANTS.forEach((v, i) => link(`${i + 1} ${v.name}`, i + 1));
const idea = document.body.createDiv({ cls: "lx-idea", text: variant ? `${vi}. ${variant.name}：${variant.idea}` : "0. 现在的默认布局（对照）" });
document.body.insertBefore(idea, document.getElementById("app"));
document.body.insertBefore(nav, idea);

const base = defaultLayout();
const settings = {
  ...DEFAULT_SETTINGS, language: lang, dailyWordGoal: 500, weeklyWordGoal: 10000, onboarded: true, weekStyle: "dots" as const,
  layout: { version: 1 as const, items: base.items.map((it) => ({ id: it.id, size: variant?.sizes[it.id] ?? it.size })) },
};
const dedupe = { scanning: false, stale: false, analysis: null as unknown, ignoredSet: () => new Set<string>(), openReport: async () => undefined, startCleanup: () => undefined };
const app = {
  vault: { getName: () => "我的知识库", getMarkdownFiles: () => [], getAbstractFileByPath: (p: string) => mk(p, 0) },
  metadataCache: { getFileCache: () => null },
  workspace: { openLinkText: async () => undefined },
  fileManager: { trashFile: async () => undefined },
};
const noop = async () => undefined;
const plugin = {
  settings, lastStats: stats, dedupe, requestRefresh: noop, openSettings: () => undefined, openFile: noop, openSearch: () => undefined,
  revealFolder: () => undefined, saveSettings: noop, saveViewSetting: noop, openWritingReport: noop,
  setClippingFolder: noop, excludeFolder: noop, dismissHint: noop, setOutlierExclusion: noop,
};
const host = document.getElementById("app") as HTMLElement;
host.classList.add("workspace-leaf-content");
const view = new DashboardView({ app, host } as never, plugin as never);
void view.onOpen().then(() => {
  view.render(stats);
  const oldGrid = host.querySelector<HTMLElement>(".vp-grid");
  if (variant && oldGrid) {
    const cards: Cards = new Map();
    oldGrid.querySelectorAll<HTMLElement>(":scope > [data-widget]").forEach((el) => cards.set(el.dataset.widget as WidgetId, el));
    const root = createDiv({ cls: `lx-root ${variant.cls ?? ""}` });
    oldGrid.replaceWith(root);
    variant.build({ root, cards });
    const left = [...cards.keys()].filter((id) => !root.contains(cards.get(id) as HTMLElement));
    if (left.length) root.createDiv({ cls: "lx-missing", text: `没放进去的卡：${left.join(", ")}` });
  }
  document.body.dataset.ready = "1";
});
