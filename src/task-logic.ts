/* 任务的到期判断：纯函数，不依赖 Obsidian API，便于单元测试。 */
import { addDays, parseDateStr, startOfDay } from "./stats";

/** 逾期超过这么多天的待办不再算“已逾期”：它们多半是早就不管的旧笔记，不该一直亮红色提醒 */
export const OVERDUE_DAYS = 30;

/** “接下来”往后看几天 */
export const SOON_DAYS = 7;

/**
 * 一行任务的截止日（YYYY-MM-DD）。只认 📅 和 due::。
 * ⏳ 在 Tasks 插件里是“计划开始日”，🛫 是“开始日”，都不是截止日，不算。
 * 日期写错（如 2026-13-40）时返回 null。
 */
export function dueDateOf(raw: string): string | null {
  const m = /(?:📅|\[due::|due::)\s*(\d{4}-\d{2}-\d{2})/.exec(raw);
  if (!m) return null;
  return parseDateStr(m[1]) ? m[1] : null;
}

export type DueState = "overdue" | "stale" | "soon" | "later";

/**
 * 截止日相对今天的状态：
 * overdue 已逾期（不超过 OVERDUE_DAYS 天）；stale 逾期太久，不再提醒；
 * soon 今天起 SOON_DAYS 天内；later 更晚。日期写错时返回 null。
 */
export function classifyDue(due: string, now: Date | number): DueState | null {
  const d = parseDateStr(due);
  if (!d) return null;
  const today = startOfDay(now);
  if (d.getTime() < today.getTime()) return d.getTime() >= addDays(today, -OVERDUE_DAYS).getTime() ? "overdue" : "stale";
  return d.getTime() <= addDays(today, SOON_DAYS).getTime() ? "soon" : "later";
}
