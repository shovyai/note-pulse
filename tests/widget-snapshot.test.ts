import { test } from "node:test";
import assert from "node:assert/strict";
import type { TFile } from "obsidian";
import { AGENDA_MAX, SNAPSHOT_VERSION, TASK_TEXT_MAX, TOP_TASKS, buildWidgetSnapshot, serializeSnapshot, snapshotFingerprint } from "../src/widget-snapshot";
import type { SnapshotInput } from "../src/widget-snapshot";
import { DEFAULT_SETTINGS, migrateWritingSettings } from "../src/settings";
import type { TaskInfo, VaultStats } from "../src/stats";

// 2026-10-24 是星期六，晚上 9 点
const NOW = new Date(2026, 9, 24, 21, 0);

function stats(over: Partial<VaultStats> = {}): VaultStats {
  return {
    generatedAt: NOW.getTime(), durationMs: 1, totalNotes: 0, totalWords: 0, writeWordsTotal: 0,
    created7: 0, created30: 0, modified7: 0, modified30: 0, totalLinks: 0, uniqueTags: 0, tagOccurrences: 0,
    files: [], dayWords: {}, estimatedBefore: null, logStartDay: null, dayModified: {}, dayCreated: {}, dailyNotes: {},
    outliers: { count: 0, words: 0, top: [], threshold: 20000, mode: "exclude" }, hints: [],
    tasks: { total: 0, done: 0, pending: 0, cancelled: 0, overdue: [], dueSoon: [], byFolder: [], byNote: [] },
    tags: [], links: { topLinked: [], orphans: [], unresolvedCount: 0, topUnresolved: [] }, folders: [],
    ...over,
  };
}
const task = (text: string, due: string): TaskInfo => ({ file: { path: "a.md" } as unknown as TFile, line: 0, text, status: "pending", due });
function input(over: Partial<SnapshotInput> = {}): SnapshotInput {
  return { stats: stats(), dailyGoal: 500, weeklyGoal: 2000, agenda: {}, now: NOW, language: "zh", ...over };
}

test("字段齐全，版本是 1", () => {
  const snap = buildWidgetSnapshot(input({ stats: stats({ dayWords: { "2026-10-24": 520, "2026-10-19": 600 } }) }));
  assert.equal(snap.version, SNAPSHOT_VERSION);
  assert.equal(snap.version, 1);
  assert.deepEqual(Object.keys(snap), ["version", "generatedAt", "language", "date", "greeting", "hint", "today", "week", "tasks", "agenda"]);
  assert.deepEqual(Object.keys(snap.today), ["words", "goal", "checkedIn", "streak"]);
  assert.deepEqual(Object.keys(snap.week), ["start", "words", "goal", "days"]);
  assert.deepEqual(Object.keys(snap.tasks), ["overdue", "dueToday", "top"]);
  assert.deepEqual(Object.keys(snap.agenda), ["date", "items"]);
  assert.equal(snap.generatedAt, NOW.toISOString());
  assert.equal(snap.language, "zh");
  assert.equal(snap.date, "2026-10-24");
  assert.equal(snap.today.words, 520);
  assert.equal(snap.today.goal, 500);
  assert.equal(snap.today.checkedIn, true);
  assert.equal(snap.week.words, 1120);
  assert.equal(snap.week.goal, 2000);
  assert.equal(snap.week.start, "2026-10-19");
  assert.match(snap.greeting, /^晚上好，/);
  // 能被 JSON 来回，没有 undefined 之类丢不掉的东西
  assert.deepEqual(JSON.parse(serializeSnapshot(snap)), snap);
});

test("连续打卡：今天已打卡从今天数，没打卡从昨天数", () => {
  const done = buildWidgetSnapshot(input({ stats: stats({ dayWords: { "2026-10-22": 500, "2026-10-23": 500, "2026-10-24": 500 } }) }));
  assert.equal(done.today.streak, 3);
  const notYet = buildWidgetSnapshot(input({ stats: stats({ dayWords: { "2026-10-22": 500, "2026-10-23": 500, "2026-10-24": 100 } }) }));
  assert.equal(notYet.today.checkedIn, false);
  assert.equal(notYet.today.streak, 2);
  assert.equal(notYet.hint?.includes("连续 2 天"), true, "晚上 6 点后没打卡，提示连续打卡快断了");
});

test("没设目标：目标为 0，写了任何字就算打卡，提示为空", () => {
  const empty = buildWidgetSnapshot(input({ dailyGoal: 0, weeklyGoal: 0 }));
  assert.equal(empty.today.goal, 0);
  assert.equal(empty.week.goal, 0);
  assert.equal(empty.today.words, 0);
  assert.equal(empty.today.checkedIn, false);
  assert.equal(empty.today.streak, 0);
  assert.equal(empty.hint, null);
  assert.deepEqual(empty.week.days.map((d) => d.words), [0, 0, 0, 0, 0, 0, 0]);
  const wrote = buildWidgetSnapshot(input({ dailyGoal: 0, weeklyGoal: 0, stats: stats({ dayWords: { "2026-10-24": 3 } }) }));
  assert.equal(wrote.today.checkedIn, true);
  assert.equal(wrote.today.streak, 1);
});

test("本周七天：周一在前，周日在后，今天之后为 0", () => {
  const s = stats({
    dayWords: { "2026-10-19": 600, "2026-10-21": 380, "2026-10-24": 500, "2026-10-25": 999, "2026-10-18": 777 },
    dailyNotes: { "2026-10-22": { path: "日记/2026-10-22.md" } as TFile },
  });
  const { days, start, words } = buildWidgetSnapshot(input({ stats: s })).week;
  assert.equal(start, "2026-10-19");
  assert.deepEqual(days.map((d) => d.date), ["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
  assert.deepEqual(days.map((d) => d.weekday), [1, 2, 3, 4, 5, 6, 7]);
  assert.deepEqual(days.map((d) => d.words), [600, 0, 380, 0, 0, 500, 0], "上周日不算，明天写的字（不可能存在）不算");
  assert.deepEqual(days.map((d) => d.checkedIn), [true, false, false, true, false, true, false], "写了日记也算打卡");
  assert.deepEqual(days.map((d) => d.isToday), [false, false, false, false, false, true, false]);
  assert.equal(words, 1480);
});

test("本周七天：今天是周一或周日时也是周一在前", () => {
  const mon = buildWidgetSnapshot(input({ now: new Date(2026, 9, 19, 9, 0) })).week;
  assert.equal(mon.days[0].isToday, true);
  assert.equal(mon.start, "2026-10-19");
  const sun = buildWidgetSnapshot(input({ now: new Date(2026, 9, 25, 9, 0) })).week;
  assert.equal(sun.days[6].isToday, true);
  assert.equal(sun.start, "2026-10-19");
});

test("逾期和今天到期：数量、前 3 条文字、顺序", () => {
  const s = stats({
    tasks: {
      total: 6, done: 0, pending: 6, cancelled: 0, byFolder: [], byNote: [],
      overdue: [task("交报告 📅 2026-10-20", "2026-10-20"), task("回邮件 [due:: 2026-10-22]", "2026-10-22")],
      dueSoon: [task("买菜 ⏫ 📅 2026-10-24", "2026-10-24"), task("写周报 📅 2026-10-24", "2026-10-24"), task("明天的事 📅 2026-10-25", "2026-10-25")],
    },
  });
  const t = buildWidgetSnapshot(input({ stats: s })).tasks;
  assert.equal(t.overdue, 2);
  assert.equal(t.dueToday, 2, "明天到期的不算");
  assert.equal(t.top.length, TOP_TASKS);
  assert.deepEqual(t.top, [
    { text: "交报告", due: "2026-10-20", overdue: true },
    { text: "回邮件", due: "2026-10-22", overdue: true },
    { text: "买菜", due: "2026-10-24", overdue: false },
  ]);
});

test("任务文字过长会截断，没有任务时是空数组", () => {
  const long = "字".repeat(TASK_TEXT_MAX + 30);
  const s = stats({ tasks: { total: 1, done: 0, pending: 1, cancelled: 0, byFolder: [], byNote: [], overdue: [task(long, "2026-10-01")], dueSoon: [] } });
  const [first] = buildWidgetSnapshot(input({ stats: s })).tasks.top;
  assert.equal(Array.from(first.text).length, TASK_TEXT_MAX);
  assert.equal(first.text.endsWith("…"), true);
  assert.deepEqual(buildWidgetSnapshot(input()).tasks, { overdue: 0, dueToday: 0, top: [] });
});

test("日程只取今天，保持添加顺序，带完成状态", () => {
  const agenda = {
    "2026-10-23": [{ id: "a", text: "昨天的会", done: true }],
    "2026-10-24": [
      { id: "b", text: "和老师通话", done: false },
      { id: "c", text: "取快递", done: true },
    ],
    "2026-10-25": [{ id: "d", text: "明天的事", done: false }],
  };
  const a = buildWidgetSnapshot(input({ agenda })).agenda;
  assert.equal(a.date, "2026-10-24");
  assert.deepEqual(a.items, [
    { text: "和老师通话", done: false },
    { text: "取快递", done: true },
  ]);
  assert.deepEqual(buildWidgetSnapshot(input()).agenda, { date: "2026-10-24", items: [] });
  const many = { "2026-10-24": Array.from({ length: AGENDA_MAX + 5 }, (_, i) => ({ id: `i${i}`, text: `事${i}`, done: false })) };
  assert.equal(buildWidgetSnapshot(input({ agenda: many })).agenda.items.length, AGENDA_MAX);
});

test("英文：问候和提示用英文，language 字段跟着变", () => {
  const snap = buildWidgetSnapshot(input({ language: "en", stats: stats({ tasks: { total: 1, done: 0, pending: 1, cancelled: 0, byFolder: [], byNote: [], overdue: [task("File report", "2026-10-20")], dueSoon: [] } }) }));
  assert.equal(snap.language, "en");
  assert.match(snap.greeting, /^Good evening, /);
  assert.equal(snap.hint, "1 task is overdue");
});

test("内容不变时序列化结果完全相同；只有生成时间不同时指纹相同", () => {
  const s = stats({ dayWords: { "2026-10-24": 520, "2026-10-19": 600 } });
  const a = serializeSnapshot(buildWidgetSnapshot(input({ stats: s, agenda: { "2026-10-24": [{ id: "x", text: "取快递", done: false }] } })));
  const b = serializeSnapshot(buildWidgetSnapshot(input({ stats: s, agenda: { "2026-10-24": [{ id: "y", text: "取快递", done: false }] } })));
  assert.equal(a, b, "条目 id 不进快照，同样的内容序列化结果一字不差");
  // 过了几分钟，内容没变：只有 generatedAt 不同，指纹一样，不用重写
  const later = buildWidgetSnapshot(input({ stats: s, now: new Date(2026, 9, 24, 21, 7) }));
  const first = buildWidgetSnapshot(input({ stats: s }));
  assert.notEqual(serializeSnapshot(later), serializeSnapshot(first));
  assert.equal(snapshotFingerprint(later), snapshotFingerprint(first));
  // 从磁盘读回来的对象指纹也一样
  assert.equal(snapshotFingerprint(JSON.parse(serializeSnapshot(first))), snapshotFingerprint(first));
  // 内容真的变了：指纹不同
  const more = buildWidgetSnapshot(input({ stats: stats({ dayWords: { "2026-10-24": 530, "2026-10-19": 600 } }) }));
  assert.notEqual(snapshotFingerprint(more), snapshotFingerprint(first));
});

test("设置：导出小组件数据默认关，旧设置补成 false，已开的保留", () => {
  assert.equal(DEFAULT_SETTINGS.widgetExport, false);
  const old = { ...DEFAULT_SETTINGS, widgetExport: undefined } as unknown as typeof DEFAULT_SETTINGS;
  migrateWritingSettings(old);
  assert.equal(old.widgetExport, false);
  old.widgetExport = true;
  migrateWritingSettings(old);
  assert.equal(old.widgetExport, true);
  const bad = { ...DEFAULT_SETTINGS, widgetExport: "yes" } as unknown as typeof DEFAULT_SETTINGS;
  migrateWritingSettings(bad);
  assert.equal(bad.widgetExport, false);
});
