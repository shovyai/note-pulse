import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BACKGROUNDS,
  DEFAULT_APPEARANCE,
  MAX_IMAGE_EDGE,
  MAX_MINE,
  THEMES,
  addMine,
  appearanceLook,
  averageHex,
  buildCss,
  fitWithin,
  hexToHsv,
  hsvToHex,
  inkFor,
  isSafeImagePath,
  removeMine,
  renameImage,
  sanitizeAppearance,
  themeBlock,
} from "../src/appearance";
import { DEFAULT_SETTINGS } from "../src/settings";

test("每套主题浅色和深色覆盖同一批令牌（不然浅色的值会漏进深色）", () => {
  for (const t of THEMES) assert.deepEqual(Object.keys(t.light).sort(), Object.keys(t.dark).sort(), t.id);
});

test("主题两套：默认、Craft；默认主题不覆盖任何令牌（已有用户外观不变）", () => {
  assert.deepEqual(
    THEMES.map((t) => t.id),
    ["default", "craft"]
  );
  assert.deepEqual(THEMES[0].light, {});
  assert.deepEqual(BACKGROUNDS.map((b) => b.id), ["gradient", "paper"]);
});

test("没有 appearance 字段：默认主题、跟随主题、没有我的背景、透明度 100", () => {
  for (const raw of [undefined, null, {}, "x", 3, []]) assert.deepEqual(sanitizeAppearance(raw), DEFAULT_APPEARANCE, String(raw));
  assert.deepEqual(DEFAULT_SETTINGS.appearance, DEFAULT_APPEARANCE);
});

test("不认识的主题编号退回默认（别的设备装的版本可能多一套主题）", () => {
  assert.equal(sanitizeAppearance({ theme: "layers" }).theme, "default");
  assert.equal(sanitizeAppearance({ theme: "minimal" }).theme, "default");
  assert.equal(sanitizeAppearance({ theme: 5 }).theme, "default");
  assert.equal(sanitizeAppearance({ theme: "craft" }).theme, "craft");
});

test("坏数据退回默认：损坏的背景选择、不合法的颜色、重复和缺 id 的条目", () => {
  const a = sanitizeAppearance({
    background: { kind: "preset", preset: "neon" },
    backgrounds: [
      { id: "a1", color: "#e8dfd0" },
      { id: "a1", color: "#000000" },
      { id: "", color: "#111111" },
      { color: "#222222" },
      { id: "b2", color: "red" },
      { id: "c3", color: "#12345" },
      { id: "d4", color: "#123456", image: "Note Pulse/backgrounds/x.jpg" },
      null,
      "x",
      { id: "x".repeat(40), color: "#123456" },
    ],
  });
  assert.deepEqual(a.background, { kind: "theme" });
  assert.deepEqual(a.backgrounds, [{ id: "a1", color: "#E8DFD0" }]);
  assert.deepEqual(sanitizeAppearance({ background: { kind: "mine", id: "nope" } }).background, { kind: "theme" });
  assert.deepEqual(sanitizeAppearance({ background: { kind: "preset", preset: "paper" } }).background, { kind: "preset", preset: "paper" });
  assert.deepEqual(sanitizeAppearance({ background: "gradient" }).background, { kind: "theme" });
});

test("选中的我的背景读回来还是它；ink 只认 light，其余当 dark", () => {
  const a = sanitizeAppearance({
    background: { kind: "mine", id: "p1" },
    backgrounds: [
      { id: "p1", image: "Note Pulse/backgrounds/bg-p1.jpg", ink: "light" },
      { id: "p2", image: "Note Pulse/backgrounds/bg-p2.jpg", ink: "purple" },
    ],
  });
  assert.deepEqual(a.background, { kind: "mine", id: "p1" });
  assert.equal(a.backgrounds[0].ink, "light");
  assert.equal(a.backgrounds[1].ink, "dark");
});

test("图片路径只认库里的相对路径", () => {
  for (const p of ["/etc/passwd", "../outside.jpg", "Note Pulse/../../x.jpg", "Note Pulse\\x.jpg", "C:/x.jpg", "https://example.com/x.jpg", "file:///x.jpg", "", "a".repeat(301)])
    assert.equal(isSafeImagePath(p), false, p);
  for (const p of ["Note Pulse/backgrounds/bg-ab12cd.jpg", "图片/背景 1.png", "a..b.jpg"]) assert.equal(isSafeImagePath(p), true, p);
  const a = sanitizeAppearance({ backgrounds: [{ id: "x1", image: "/abs.jpg" }, { id: "x2", image: "../up.jpg" }, { id: "x3", image: "ok/bg.jpg" }] });
  assert.deepEqual(a.backgrounds.map((m) => m.id), ["x3"]);
});

test("我的背景最多 8 个：读取时多的丢掉，添加第 9 个被忽略", () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `c${i}`, color: "#101010" }));
  const a = sanitizeAppearance({ backgrounds: many });
  assert.equal(a.backgrounds.length, MAX_MINE);
  assert.equal(MAX_MINE, 8);
  const full = addMine(a, { id: "new", color: "#202020" });
  assert.equal(full, a);
  const one = addMine(DEFAULT_APPEARANCE, { id: "n1", color: "#202020" });
  assert.equal(one.backgrounds.length, 1);
  assert.deepEqual(one.background, { kind: "mine", id: "n1" });
});

test("透明度夹在 0 到 100，取整；不是数字的退回 100", () => {
  assert.equal(sanitizeAppearance({ cardOpacity: -20 }).cardOpacity, 0);
  assert.equal(sanitizeAppearance({ cardOpacity: 150 }).cardOpacity, 100);
  assert.equal(sanitizeAppearance({ cardOpacity: 67.6 }).cardOpacity, 68);
  assert.equal(sanitizeAppearance({ cardOpacity: "50" }).cardOpacity, 100);
  assert.equal(sanitizeAppearance({ cardOpacity: Number.NaN }).cardOpacity, 100);
  assert.equal(sanitizeAppearance({ cardOpacity: 0 }).cardOpacity, 0);
});

test("颜色明暗判定：浅底配深字，深底配浅字", () => {
  assert.equal(inkFor("#FFFFFF"), "dark");
  assert.equal(inkFor("#E8DFD0"), "dark");
  assert.equal(inkFor("#000000"), "light");
  assert.equal(inkFor("#1E2A44"), "light");
  assert.equal(inkFor("#808080"), "light");
  assert.equal(inkFor("#C0C0C0"), "dark");
});

test("图片上部的平均颜色：按像素数据求平均", () => {
  const px = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 255]);
  assert.equal(averageHex(px), "#800080");
  assert.equal(averageHex(new Uint8ClampedArray(0)), "#808080");
});

test("图片压缩：长边不超过 1920，按比例缩，不放大", () => {
  assert.equal(MAX_IMAGE_EDGE, 1920);
  assert.deepEqual(fitWithin(3840, 2160), { w: 1920, h: 1080 });
  assert.deepEqual(fitWithin(1000, 4000), { w: 480, h: 1920 });
  assert.deepEqual(fitWithin(800, 600), { w: 800, h: 600 });
  assert.deepEqual(fitWithin(0, 0), { w: 1, h: 1 });
});

test("删除我的背景：删掉选中的退回跟随主题；删别的不动选中项", () => {
  let a = addMine(DEFAULT_APPEARANCE, { id: "c1", color: "#111111" });
  a = addMine(a, { id: "c2", color: "#222222" });
  const other = removeMine(a, "c1");
  assert.deepEqual(other.background, { kind: "mine", id: "c2" });
  assert.deepEqual(other.backgrounds.map((m) => m.id), ["c2"]);
  const sel = removeMine(a, "c2");
  assert.deepEqual(sel.background, { kind: "theme" });
});

test("库里的图片改名：记录跟着改；改到不安全的路径就保持原样", () => {
  const a = addMine(DEFAULT_APPEARANCE, { id: "p1", image: "Note Pulse/backgrounds/bg-p1.jpg", ink: "dark" });
  const moved = renameImage(a, "Note Pulse/backgrounds/bg-p1.jpg", "Pics/sky.jpg");
  assert.equal(moved.backgrounds[0].image, "Pics/sky.jpg");
  assert.equal(renameImage(a, "nope.jpg", "x.jpg"), a);
});

test("挂到看板上的类名和属性：跟随主题时只有主题类名", () => {
  assert.deepEqual(appearanceLook(DEFAULT_APPEARANCE, () => null), { classes: ["vp-theme-default"], props: {} });
  const paper = appearanceLook({ ...DEFAULT_APPEARANCE, theme: "craft", background: { kind: "preset", preset: "paper" } }, () => null);
  assert.deepEqual(paper.classes, ["vp-theme-craft", "vp-bg-paper"]);
});

test("自选颜色、图片、透明度：类名和属性；图片文件找不到时退回主题底色", () => {
  const c = addMine({ ...DEFAULT_APPEARANCE, cardOpacity: 70 }, { id: "c1", color: "#1E2A44" });
  const lc = appearanceLook(c, () => null);
  assert.deepEqual(lc.classes, ["vp-theme-default", "vp-bg-color", "vp-ink-light", "vp-translucent"]);
  assert.deepEqual(lc.props, { "--vp-custom": "#1E2A44", "--vp-card-op": "0.7" });
  const i = addMine(DEFAULT_APPEARANCE, { id: "p1", image: "Note Pulse/backgrounds/bg-p1.jpg", ink: "dark" });
  const li = appearanceLook(i, (p) => `app://local/${p}`);
  assert.deepEqual(li.classes, ["vp-theme-default", "vp-bg-image", "vp-ink-dark"]);
  assert.equal(li.props["--vp-page-image"], 'url("app://local/Note Pulse/backgrounds/bg-p1.jpg")');
  const gone = appearanceLook(i, () => null);
  assert.deepEqual(gone, { classes: ["vp-theme-default"], props: {} });
});

test("styles.css 里的主题样式和代码里的主题表一致（改了主题表要跑 node scripts/build-themes.mjs）", () => {
  const css = readFileSync("styles.css", "utf8");
  const start = css.indexOf("/* themes:start */");
  const end = css.indexOf("/* themes:end */");
  assert.ok(start >= 0 && end > start, "styles.css 缺少 themes:start / themes:end 标记");
  assert.equal(css.slice(start, end + "/* themes:end */".length), themeBlock());
  assert.ok(buildCss().includes(".vp-root.vp-theme-craft {"));
  assert.ok(!buildCss().includes("vp-theme-default"));
});

test("取色：十六进制和色相、饱和度、明度互换后不变", () => {
  for (const hex of ["#E8DFD0", "#1E2A44", "#FF0000", "#00FF00", "#0000FF", "#000000", "#FFFFFF", "#7C5CFF"]) {
    const { h, s, v } = hexToHsv(hex);
    assert.equal(hsvToHex(h, s, v), hex);
  }
  assert.equal(hsvToHex(0, 1, 1), "#FF0000");
  assert.equal(hsvToHex(120, 1, 0.5), "#008000");
});
