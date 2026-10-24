/*
 * 小组件快照：把看板上“今天最该看的几样东西”整理成一份版本化的 JSON，
 * 给以后的 macOS 桌面小组件（WidgetKit，Swift 写）读。纯函数，不依赖 Obsidian API，便于单元测试。
 *
 * 字段约定（Swift 端按这个解析，version 不变就不能改名、改类型或改单位）：
 * - 日期一律是本地日期字符串 "YYYY-MM-DD"，不带时区；只有 generatedAt 是带时区的 ISO 8601（UTC）。
 * - 字数一律是整数“字”（汉字按字、英文按词，和看板一致）。
 * - 目标为 0 表示用户没设目标；这时“打卡”的意思是当天写了任何字（或写了日记）。
 * - 周一在前：week.days 固定 7 项，下标 0 是周一，6 是周日；还没到的日子 words 为 0。
 * - 任务文字已去掉日期、优先级之类的标记，并截断到 TASK_TEXT_MAX 个字符。
 */
import { cleanTaskText, currentStreak, dayContext, weekStart } from "./dashboard-logic";
import { computeAlerts, alertText, greetingTitle } from "./moments";
import type { Say } from "./moments";
import { itemsOn } from "./agenda";
import type { Agenda } from "./agenda";
import { addDays, dayKey, isCheckinDay, startOfDay } from "./stats";
import type { TaskInfo, VaultStats } from "./stats";

export const SNAPSHOT_VERSION = 1;
/** 逾期 + 今天到期的任务里，最多带几条文字 */
export const TOP_TASKS = 3;
/** 一条任务文字最多多少个字符（超出的用 … 收尾） */
export const TASK_TEXT_MAX = 80;
/** 今天的日程最多带几条 */
export const AGENDA_MAX = 20;

export interface SnapshotDay {
  /** 本地日期 "YYYY-MM-DD" */
  date: string;
  /** ISO 星期：1 = 周一 … 7 = 周日 */
  weekday: number;
  /** 当天写的字数（单位：字；今天之后为 0） */
  words: number;
  /** 当天是否算打卡（达到每日目标，或写了日记） */
  checkedIn: boolean;
  isToday: boolean;
}

export interface SnapshotTask {
  text: string;
  /** 到期日 "YYYY-MM-DD" */
  due: string;
  /** 是否已逾期（到期日早于今天） */
  overdue: boolean;
}

export interface SnapshotAgendaItem {
  text: string;
  done: boolean;
}

export interface WidgetSnapshot {
  version: typeof SNAPSHOT_VERSION;
  /** 这份内容生成的时间，ISO 8601 UTC，例如 "2026-10-24T13:00:00.000Z"。内容没变时插件不重写文件，所以它是“内容最近一次变化的时间” */
  generatedAt: string;
  /** 文字用的语言："zh" 或 "en" */
  language: "zh" | "en";
  /** 快照所说的“今天”，本地日期 */
  date: string;
  /** 问候语加今天的状态，一整句，例如“晚上好，今天的目标达成了，写了 520 字” */
  greeting: string;
  /** 最需要留意的一件事（逾期、今天到期、连续打卡快断了……）；没有就是 null */
  hint: string | null;
  today: {
    /** 今天写了多少字 */
    words: number;
    /** 每日目标（字）；0 = 没设 */
    goal: number;
    /** 今天是否已打卡 */
    checkedIn: boolean;
    /** 当前连续打卡天数（今天还没打卡时从昨天往回数） */
    streak: number;
  };
  week: {
    /** 本周一的日期 */
    start: string;
    /** 本周已写的字数（周一到今天） */
    words: number;
    /** 每周目标（字）；0 = 没设 */
    goal: number;
    /** 周一到周日，固定 7 项 */
    days: SnapshotDay[];
  };
  tasks: {
    /** 已逾期的任务数 */
    overdue: number;
    /** 今天到期的任务数 */
    dueToday: number;
    /** 最急的几条：先逾期（最早到期的在前），再今天到期，最多 TOP_TASKS 条 */
    top: SnapshotTask[];
  };
  agenda: {
    /** 日程所属的日期，就是 date */
    date: string;
    /** 今天的日程，按添加顺序，最多 AGENDA_MAX 条 */
    items: SnapshotAgendaItem[];
  };
}

export interface SnapshotInput {
  stats: VaultStats;
  /** 每日目标（字），0 = 没设 */
  dailyGoal: number;
  /** 每周目标（字），0 = 没设 */
  weeklyGoal: number;
  /** 用户在日历卡片里记的日程（settings.agenda） */
  agenda: Agenda;
  now: Date;
  language: "zh" | "en";
}

function clip(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length > max ? `${chars.slice(0, max - 1).join("")}…` : text;
}

function taskLine(t: TaskInfo, overdue: boolean): SnapshotTask {
  const cleaned = cleanTaskText(t.text) || t.text.trim();
  return { text: clip(cleaned, TASK_TEXT_MAX), due: t.due ?? "", overdue };
}

export function buildWidgetSnapshot(input: SnapshotInput): WidgetSnapshot {
  const { stats, dailyGoal, weeklyGoal, agenda, now, language } = input;
  const say: Say = (zh, en) => (language === "zh" ? zh : en);
  const ctx = dayContext(stats, dailyGoal, weeklyGoal, now);
  const today = startOfDay(now);
  const todayKey = ctx.todayKey;

  const start = weekStart(now);
  const days: SnapshotDay[] = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const key = dayKey(d);
    const future = d.getTime() > today.getTime();
    days.push({
      date: key,
      weekday: i + 1,
      words: future ? 0 : stats.dayWords[key] || 0,
      checkedIn: !future && isCheckinDay(stats, dailyGoal, key),
      isToday: key === todayKey,
    });
  }

  const dueToday = stats.tasks.dueSoon.filter((t) => t.due === todayKey);
  const top = [...stats.tasks.overdue.map((t) => taskLine(t, true)), ...dueToday.map((t) => taskLine(t, false))].slice(0, TOP_TASKS);

  const alerts = computeAlerts(ctx);

  return {
    version: SNAPSHOT_VERSION,
    generatedAt: now.toISOString(),
    language,
    date: todayKey,
    greeting: greetingTitle(ctx, say),
    hint: alerts.length ? alertText(alerts[0], say) : null,
    today: { words: ctx.todayWords, goal: dailyGoal, checkedIn: ctx.todayDone, streak: currentStreak(stats, dailyGoal, now) },
    week: { start: dayKey(start), words: ctx.weekWords, goal: weeklyGoal, days },
    tasks: { overdue: ctx.overdue, dueToday: ctx.dueToday, top },
    agenda: { date: todayKey, items: itemsOn(agenda, todayKey).slice(0, AGENDA_MAX).map((i) => ({ text: i.text, done: i.done })) },
  };
}

/** 写到文件里的样子（带缩进，方便人看；末尾换行） */
export function serializeSnapshot(s: WidgetSnapshot): string {
  return `${JSON.stringify(s, null, 2)}\n`;
}

/**
 * 判断“内容有没有变”用的指纹：忽略 generatedAt（每次生成都不同），其余字段逐字比较。
 * 传入刚生成的快照，或从磁盘读回来解析过的对象。
 */
export function snapshotFingerprint(s: unknown): string {
  return JSON.stringify({ ...(s as Record<string, unknown>), generatedAt: "" });
}
