import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_SETTINGS, DashboardSettings, SETTINGS_VERSION, migrateAlertSettings } from "../src/settings";

const fresh = (): DashboardSettings => ({ ...DEFAULT_SETTINGS });

test("全新安装：任务到期提醒开，连续打卡和周目标提醒关", () => {
  const s = fresh();
  migrateAlertSettings(s, false, 1);
  assert.equal(s.alertTasks, true);
  assert.equal(s.alertStreak, false);
  assert.equal(s.alertWeekly, false);
});

test("升级的老用户：保存过设置、版本低于 7，三种提醒都保持原样开着", () => {
  for (const v of [1, 3, 5, 6]) {
    const s = fresh();
    migrateAlertSettings(s, true, v);
    assert.deepEqual([s.alertTasks, s.alertStreak, s.alertWeekly], [true, true, true], `版本 ${v}`);
  }
});

test("版本 7 之后用户自己的选择保留", () => {
  const s = { ...fresh(), alertTasks: false, alertStreak: true, alertWeekly: false };
  migrateAlertSettings(s, true, 7);
  assert.deepEqual([s.alertTasks, s.alertStreak, s.alertWeekly], [false, true, false]);
});

test("读到不是布尔值的内容时回到默认", () => {
  const s = { ...fresh(), alertTasks: "yes", alertStreak: 1, alertWeekly: null } as unknown as DashboardSettings;
  migrateAlertSettings(s, true, 7);
  assert.deepEqual([s.alertTasks, s.alertStreak, s.alertWeekly], [true, false, false]);
});

test("设置版本号是 7", () => {
  assert.equal(SETTINGS_VERSION, 7);
});
