import { test } from "node:test";
import assert from "node:assert/strict";
import { COLS, overlap } from "../src/grid";

import { GALLERY, RECOMMENDED, WIDGETS, WidgetId, addWidget, defaultLayout, hiddenWidgets, limitsOf, normalizeLayout, readingOrder, removeWidget, sameLayout, tidyLayout, widgetInfo, withItems } from "../src/widgets";

/** 默认不放在看板上、在“添加卡片”里加的卡片：不在推荐里的都是 */
const OPTIONAL: string[] = WIDGETS.map((w) => w.id).filter((id) => !RECOMMENDED.includes(id));

const at = (l: { items: { id: string; x: number; y: number; w: number; h: number }[] }, id: string) => {
  const i = l.items.find((x) => x.id === id);
  assert.ok(i, id);
  return `${i.x},${i.y} ${i.w}x${i.h}`;
};

test("默认布局：就是推荐的 10 张，正好拼满 12 列、30 行，没有空位", () => {
  const d = defaultLayout();
  assert.equal(d.version, 2);
  assert.equal(d.items.length, RECOMMENDED.length);
  assert.deepEqual(hiddenWidgets(d).map((w) => w.id).sort(), [...OPTIONAL].sort());
  const expected: Record<string, string> = {
    hero: "0,0 8x6",
    recent: "8,0 4x6",
    month: "0,6 4x3",
    words: "4,6 4x3",
    notes: "8,6 4x3",
    heat: "0,9 12x5",
    trend: "0,14 8x7",
    tags: "8,14 4x7",
    checkupHub: "0,21 12x5",
    reports: "0,26 12x4",
  };
  for (const [id, pos] of Object.entries(expected)) assert.equal(at(d, id), pos, id);
  assert.equal(Math.max(...d.items.map((i) => i.y + i.h)), 30);
  assert.equal(d.items.reduce((n, i) => n + i.w * i.h, 0), COLS * 30, "没有空位");
  // 新装用户的默认看板是知识库的卡片，不放任务卡（任务卡仍在“添加卡片”里）
  assert.ok(!d.items.some((i) => i.id === "tasks" || i.id === "taskRate"), "默认布局里没有任务卡");
  assert.deepEqual(hiddenWidgets(d).map((w) => w.id).filter((id) => id === "tasks" || id === "taskRate").sort(), ["taskRate", "tasks"]);
  // 和“推荐”按顺序加到空看板上得到的一样：新装用户看到的就是面板里推荐的那些
  let l = withItems([]);
  for (const id of RECOMMENDED) l = addWidget(l, id);
  assert.ok(sameLayout(d, l));
});

test("老用户的布局不变：2.1.1 的默认布局（23 张）存下来后读回来原样不变，不会被换成新的默认布局", () => {
  const old = [
    ["hero", 0, 0, 8, 6], ["tasks", 8, 0, 4, 6], ["notes", 0, 6, 3, 3], ["words", 3, 6, 3, 3], ["taskRate", 6, 6, 3, 3], ["month", 9, 6, 3, 3],
    ["heat", 0, 9, 12, 5], ["trend", 0, 14, 8, 7], ["tags", 8, 14, 4, 7], ["calendar", 0, 21, 4, 7], ["rhythm", 4, 21, 4, 4], ["density", 4, 25, 4, 3],
    ["activity", 8, 21, 4, 4], ["folders", 8, 25, 4, 3], ["topLinked", 0, 28, 4, 5], ["taskNotes", 4, 28, 4, 5], ["brokenLinks", 8, 28, 4, 5],
    ["orphans", 0, 33, 4, 5], ["sameName", 4, 33, 4, 5], ["emptyBig", 8, 33, 4, 5], ["unusedFiles", 0, 38, 6, 4], ["dupes", 6, 38, 6, 4], ["reports", 0, 42, 12, 4],
  ].map(([id, x, y, w, h]) => ({ id, x, y, w, h }));
  const saved = JSON.parse(JSON.stringify({ version: 2, items: old }));
  const read = normalizeLayout(saved);
  const byId = <T extends { id: string }>(l: T[]) => [...l].sort((a, b) => a.id.localeCompare(b.id));
  assert.deepEqual(byId(read.items), byId(old), "每张卡的位置和大小一点没变（读回来时只是按阅读顺序排了一下）");
  assert.ok(!sameLayout(read, defaultLayout()), "没有被换成新的默认布局");
  // 用户自己调过的布局同理
  const mine = { version: 2, items: [{ id: "month", x: 3, y: 2, w: 5, h: 4 }, { id: "notes", x: 0, y: 0, w: 3, h: 2 }] };
  assert.deepEqual(byId(normalizeLayout(JSON.parse(JSON.stringify(mine))).items), byId(mine.items));
});

test("每张卡的默认大小在它自己的范围里，范围本身合理", () => {
  for (const w of WIDGETS) {
    assert.ok(w.minW >= 1 && w.minW <= w.w && w.w <= w.maxW && w.maxW <= COLS, `${w.id} 宽`);
    assert.ok(w.minH >= 1 && w.minH <= w.h && w.h <= w.maxH, `${w.id} 高`);
    assert.deepEqual(limitsOf(w.id), { minW: w.minW, maxW: w.maxW, minH: w.minH, maxH: w.maxH });
  }
  assert.equal(new Set(WIDGETS.map((w) => w.id)).size, WIDGETS.length, "id 不重复");
});

test("读布局：合法的布局原样读回（读两遍结果也不变）", () => {
  const d = defaultLayout();
  assert.deepEqual(normalizeLayout(JSON.parse(JSON.stringify(d))), d);
  assert.deepEqual(normalizeLayout(normalizeLayout(d)), d);
});

test("读布局：没有或读不懂回到默认；用户把卡片全移除也保留", () => {
  assert.ok(sameLayout(normalizeLayout(undefined), defaultLayout()));
  assert.ok(sameLayout(normalizeLayout({ items: "x" }), defaultLayout()));
  assert.deepEqual(normalizeLayout({ version: 2, items: [] }).items, []);
});

test("读布局（坏数据）：未知卡、重复卡去掉，尺寸夹进范围，重叠的推开，越界的拉回", () => {
  const n = normalizeLayout({
    version: 2,
    items: [
      { id: "heat", x: 0, y: 0, w: 99, h: 99 },
      { id: "gone", x: 0, y: 0, w: 3, h: 3 },
      { id: "heat", x: 0, y: 5, w: 6, h: 4 },
      { id: "density", x: 11, y: 0, w: 1, h: 1 },
      { id: "notes", x: 2, y: 1, w: 3, h: 3 },
      7,
    ],
  });
  assert.deepEqual(n.items.map((i) => i.id).sort(), ["density", "heat", "notes"]);
  assert.equal(at(n, "heat"), "0,0 12x6", "heat 最大 12×6");
  const d = n.items.find((i) => i.id === "density")!;
  assert.deepEqual([d.w, d.h], [2, 2], "density 最小 2×2");
  assert.ok(d.x + d.w <= COLS);
  for (const a of n.items) for (const b of n.items) if (a !== b) assert.ok(!overlap(a, b), `${a.id} ${b.id}`);
});

test("迁移：2.0 开发中的档位布局按原来的顺序摆进网格，库体检换成拆分后的 6 张卡", () => {
  const v1 = {
    version: 1,
    items: [
      ["hero", "l"], ["tasks", "m"], ["notes", "s"], ["words", "s"], ["taskRate", "s"], ["month", "s"],
      ["heat", "xl"], ["trend", "l"], ["tags", "m"], ["rhythm", "m"], ["activity", "m"], ["topLinked", "m"],
      ["folders", "m"], ["taskNotes", "m"], ["density", "s"], ["checkup", "xl"], ["reports", "xl"],
    ].map(([id, size]) => ({ id, size })),
  };
  const m = normalizeLayout(v1);
  assert.equal(m.version, 2);
  assert.equal(at(m, "hero"), "0,0 8x6");
  assert.equal(at(m, "tasks"), "8,0 4x6");
  assert.equal(at(m, "notes"), "0,6 3x3");
  assert.equal(at(m, "heat"), "0,9 12x5");
  assert.equal(at(m, "trend"), "0,14 8x7");
  assert.equal(at(m, "rhythm"), "0,21 4x4");
  assert.equal(at(m, "density"), "8,25 3x3", "链接密度按 S 的 3 列迁移");
  for (const id of ["brokenLinks", "orphans", "sameName", "emptyBig", "unusedFiles", "dupes"]) assert.ok(widgetInfo(id), id);
  const ids = m.items.map((i) => i.id);
  for (const id of ["brokenLinks", "orphans", "sameName", "emptyBig", "unusedFiles", "dupes"]) assert.ok(ids.includes(id as WidgetId), id);
  assert.ok(!ids.includes("checkup" as WidgetId));
  assert.ok(readingOrder(m).findIndex((i) => i.id === "brokenLinks") < readingOrder(m).findIndex((i) => i.id === "reports"), "拆分后的卡还在写作回顾前面");
  for (const a of m.items) for (const b of m.items) if (a !== b) assert.ok(!overlap(a, b), `${a.id} ${b.id}`);
});

test("迁移：不带 version 但带 size 的也按档位布局处理；隐藏着的卡片迁移后仍然隐藏；档位给的列数夹进范围", () => {
  const m = normalizeLayout({ items: [{ id: "hero", size: "m" }, { id: "heat", size: "s" }, { id: "gone", size: "m" }, { id: "hero", size: "xl" }] });
  assert.equal(m.version, 2);
  assert.deepEqual(m.items.map((i) => i.id), ["hero", "heat"]);
  assert.equal(at(m, "hero"), "0,0 5x6", "hero 最窄 5 列");
  assert.equal(m.items.find((i) => i.id === "heat")!.w, 6, "heat 最窄 6 列");
  assert.deepEqual(hiddenWidgets(m).map((w) => w.id).includes("tasks"), true);
});

test("编辑：添加用这张卡的默认大小，先填最上面第一个放得下的空位；移除后空位保持空着，整理之后才补上来", () => {
  let l = removeWidget(defaultLayout(), "notes");
  assert.deepEqual(hiddenWidgets(l).map((w) => w.id).filter((id) => !OPTIONAL.includes(id)), ["notes"]);
  l = addWidget(l, "notes");
  assert.equal(at(l, "notes"), "8,6 4x3", "放回刚空出来的位置");
  assert.ok(sameLayout(addWidget(l, "notes"), l), "已经在的不重复加");
  l = removeWidget(l, "reports");
  assert.equal(hiddenWidgets(l).filter((w) => !OPTIONAL.includes(w.id)).length, 1);
  l = addWidget(l, "reports");
  assert.equal(at(l, "reports"), "0,26 12x4", "整行的卡放回它空出来的整行");
  const gone = removeWidget(defaultLayout(), "hero");
  assert.equal(at(gone, "month"), "0,6 4x3", "移除后别的卡不动，上面留着空位");
  assert.equal(at(tidyLayout(gone), "month"), "0,0 4x3", "整理之后补上来");
  for (const a of gone.items) for (const b of gone.items) if (a !== b) assert.ok(!overlap(a, b));
  assert.ok(sameLayout(tidyLayout(tidyLayout(gone)), tidyLayout(gone)), "整理两次结果不变");
});

test("sameLayout：位置或大小不同就不相同", () => {
  const a = defaultLayout();
  const b = JSON.parse(JSON.stringify(a));
  assert.ok(sameLayout(a, b));
  b.items[3].w += 1;
  assert.ok(!sameLayout(a, b));
});

test("添加面板：推荐加五类，每张卡都是真实存在的；非推荐的类里没有重复；合并卡只有库体检", () => {
  assert.deepEqual(GALLERY.map((c) => c.id), ["recommended", "progress", "trends", "tasks", "notes", "checkup"]);
  for (const c of GALLERY) {
    assert.ok(c.ids.length > 0, `${c.id} 不是空的`);
    assert.equal(new Set(c.ids).size, c.ids.length, `${c.id} 里没有重复`);
    for (const id of c.ids) assert.ok(widgetInfo(id), id);
  }
  const rest = GALLERY.filter((c) => c.id !== "recommended").flatMap((c) => c.ids);
  assert.equal(new Set(rest).size, rest.length, "一张卡只归一个主题类");
  assert.equal(rest.length, 20);
  for (const id of RECOMMENDED) assert.ok(rest.includes(id), `推荐里的 ${id} 也在某个主题类里`);
  const hubs = rest.filter((id) => ["trendHub", "overview", "habits", "structure", "tasksHub", "checkupHub"].includes(id));
  assert.deepEqual(hubs, ["checkupHub"]);
  assert.ok(GALLERY.find((c) => c.id === "progress")!.ids.includes("notes"), "笔记数卡能在“进度”类里找到");
  assert.ok(GALLERY.find((c) => c.id === "tasks")!.ids.includes("tasks") && GALLERY.find((c) => c.id === "tasks")!.ids.includes("taskRate"), "任务类里仍能加回接下来和任务完成率");
});

test("添加面板：推荐的 10 张卡按顺序加到空看板上，正好拼满 12 列、30 行，没有重叠也没有空位", () => {
  let l = withItems([]);
  for (const id of RECOMMENDED) l = addWidget(l, id);
  assert.deepEqual(
    l.items.map((i) => `${i.id} ${i.x},${i.y} ${i.w}x${i.h}`),
    ["hero 0,0 8x6", "recent 8,0 4x6", "month 0,6 4x3", "words 4,6 4x3", "notes 8,6 4x3", "heat 0,9 12x5", "trend 0,14 8x7", "tags 8,14 4x7", "checkupHub 0,21 12x5", "reports 0,26 12x4"]
  );
  assert.equal(Math.max(...l.items.map((i) => i.y + i.h)), 30);
  assert.equal(l.items.reduce((n, i) => n + i.w * i.h, 0), COLS * 30, "没有空位");
  for (const a of l.items) for (const b of l.items) if (a !== b) assert.ok(!overlap(a, b), `${a.id} ${b.id}`);
  for (const i of l.items) {
    const lim = limitsOf(i.id);
    assert.ok(i.w >= lim.minW && i.w <= lim.maxW && i.h >= lim.minH && i.h <= lim.maxH, `${i.id} 在自己的宽高范围内`);
  }
});
