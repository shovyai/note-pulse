import { test } from "node:test";
import assert from "node:assert/strict";
import { OVERDUE_DAYS, classifyDue, dueDateOf } from "../src/task-logic";

test("截止日只认 📅 和 due::，⏳（计划开始日）不算", () => {
  assert.equal(dueDateOf("- [ ] 写周报 📅 2026-10-21"), "2026-10-21");
  assert.equal(dueDateOf("- [ ] 写周报 [due:: 2026-10-21]"), "2026-10-21");
  assert.equal(dueDateOf("- [ ] 写周报 due:: 2026-10-21"), "2026-10-21");
  assert.equal(dueDateOf("- [ ] 写周报 ⏳ 2026-10-21"), null);
  assert.equal(dueDateOf("- [ ] 写周报 🛫 2026-10-01"), null);
});

test("同一行有 ⏳ 和 📅 时取 📅", () => {
  assert.equal(dueDateOf("- [ ] 事 ⏳ 2026-10-01 📅 2026-10-21"), "2026-10-21");
});

test("没有日期、日期写错时没有截止日", () => {
  assert.equal(dueDateOf("- [ ] 没有日期"), null);
  assert.equal(dueDateOf("- [ ] 📅 2026-13-40"), null);
  assert.equal(dueDateOf(""), null);
});

const today = new Date(2026, 9, 24); // 2026-10-24

test("到期状态：逾期、7 天内、更晚", () => {
  assert.equal(classifyDue("2026-10-23", today), "overdue");
  assert.equal(classifyDue("2026-10-24", today), "soon");
  assert.equal(classifyDue("2026-10-31", today), "soon");
  assert.equal(classifyDue("2026-11-01", today), "later");
});

test("逾期超过下限的不再算逾期", () => {
  assert.equal(OVERDUE_DAYS, 30);
  assert.equal(classifyDue("2026-09-24", today), "overdue"); // 刚好 30 天
  assert.equal(classifyDue("2026-09-23", today), "stale"); // 31 天
  assert.equal(classifyDue("2024-01-01", today), "stale");
});

test("日期写错时不分类", () => {
  assert.equal(classifyDue("2026-13-40", today), null);
});
