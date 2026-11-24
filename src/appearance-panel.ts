/**
 * 添加面板里“外观”那一组的两个分类：背景、主题（编辑看板 → 调色盘图标）。
 * 面板的壳、导航、弹起收起都在 view.ts（和“添加卡片”同一块面板）；这里只画两个分类的内容，改动通过 LookHost 交回看板。
 * 界面规则：不用系统原生控件（取色、滑块都是自己画的；唯一的例外是选图片用的系统文件选择器），没有解释性小字。
 */
import { App, Notice, TFile, setIcon } from "obsidian";
import { L } from "./i18n";
import {
  Appearance,
  BACKGROUNDS,
  BG_FOLDER,
  JPEG_QUALITY,
  MAX_IMAGE_BYTES,
  MAX_MINE,
  MyBackground,
  OPACITY_MIN,
  START_COLOR,
  THEMES,
  addMine,
  averageHex,
  fitWithin,
  hexToHsv,
  hsvToHex,
  inkFor,
  isHex,
  mineOf,
  removeMine,
} from "./appearance";
import { COLS, GAP, ROW_H, rowsToPx } from "./grid";
import type { WidgetId } from "./widgets";

export interface LookHost {
  app: App;
  get(): Appearance;
  /** 改外观：立刻挂到看板上。live 是拖动中（不保存、不带过渡），松手时再调一次不带 live 的；restyle 时看板整体淡入一下 */
  set(next: Appearance, opts?: { live?: boolean; restyle?: boolean }): void;
  /** 库里图片的显示地址；文件不在（删了、还没同步到）返回 null */
  imageUrl(path: string): string | null;
  /** 用看板同一套渲染代码和真实数据，把一张卡按 cols × rows 画进 host */
  renderCard(host: HTMLElement, id: WidgetId, cols: number, rows: number): void;
  gridWidth(): number;
}

/** 主题名（面板里格子下面的名字） */
const THEME_NAME: Record<string, () => string> = {
  default: () => L("默认", "Default"),
  craft: () => "Craft",
};
const BG_NAME: Record<string, () => string> = {
  gradient: () => L("渐变", "Gradient"),
  paper: () => L("纸", "Paper"),
};
export const themeName = (id: string) => (THEME_NAME[id] ?? (() => id))();

const uid = () => Math.random().toString(36).slice(2, 8);

/** 给一个元素加“按住拖动”：move 收到 0 到 1 的横纵位置；松手时 end 一次 */
function dragOn(el: HTMLElement, move: (x: number, y: number) => void, end: () => void) {
  const at = (e: PointerEvent) => {
    const r = el.getBoundingClientRect();
    move(Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))), Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))));
  };
  el.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    el.setPointerCapture(e.pointerId);
    el.addClass("is-down");
    el.focus({ preventScroll: true });
    at(e);
  });
  el.addEventListener("pointermove", (e) => {
    if (el.hasPointerCapture(e.pointerId)) at(e);
  });
  const up = (e: PointerEvent) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    el.releasePointerCapture(e.pointerId);
    el.removeClass("is-down");
    end();
  };
  el.addEventListener("pointerup", up);
  el.addEventListener("pointercancel", up);
}

/** 读一张本地图片 */
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((ok, no) => {
    const im = createEl("img");
    im.onload = () => ok(im);
    im.onerror = () => no(new Error("image decode failed"));
    im.src = src;
  });
}

async function ensureFolder(app: App, path: string) {
  let cur = "";
  for (const seg of path.split("/")) {
    cur = cur ? `${cur}/${seg}` : seg;
    if (app.vault.getAbstractFileByPath(cur)) continue;
    try {
      await app.vault.createFolder(cur);
    } catch {
      // 文件夹已经在磁盘上（别的设备刚同步过来、库还没索引到）：照常往里写
    }
  }
}

/**
 * 添加图片：压缩成 JPEG（长边 ≤ 1920、质量 0.82），复制进库里的 Note Pulse/backgrounds/，
 * 按图片上部 35% 的平均颜色决定页首文字用深色还是浅色。失败时提示并返回 null，不改外观。
 */
export async function importImage(app: App, file: File): Promise<MyBackground | null> {
  if (file.size > MAX_IMAGE_BYTES) {
    new Notice(L("图片超过 20 MB，换一张小一点的", "This image is over 20 MB. Pick a smaller one."));
    return null;
  }
  if (file.type && !file.type.startsWith("image/")) {
    new Notice(L("这不是图片文件", "That file is not an image."));
    return null;
  }
  const src = URL.createObjectURL(file);
  try {
    const im = await loadImage(src);
    const { w, h } = fitWithin(im.naturalWidth, im.naturalHeight);
    const c = createEl("canvas");
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(im, 0, 0, w, h);
    const t = createEl("canvas");
    t.width = 16;
    t.height = 6;
    const tc = t.getContext("2d");
    tc?.drawImage(c, 0, 0, w, Math.max(1, Math.round(h * 0.35)), 0, 0, 16, 6);
    const ink = inkFor(averageHex(tc?.getImageData(0, 0, 16, 6).data ?? new Uint8ClampedArray(0)));
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("encode failed");
    await ensureFolder(app, BG_FOLDER);
    let id = uid();
    while (app.vault.getAbstractFileByPath(`${BG_FOLDER}/bg-${id}.jpg`)) id = uid();
    const path = `${BG_FOLDER}/bg-${id}.jpg`;
    await app.vault.createBinary(path, await blob.arrayBuffer());
    return { id, image: path, ink };
  } catch (e) {
    console.error("Note Pulse: adding a background image failed", e);
    new Notice(L("没能添加这张图片", "Could not add this image."));
    return null;
  } finally {
    URL.revokeObjectURL(src);
  }
}

/** 系统文件选择器（界面规则允许的唯一原生控件）；没选、取消时什么都不做 */
function pickImageFile(onPick: (f: File) => void) {
  const input = createEl("input", { attr: { type: "file", accept: "image/*" } });
  input.addEventListener("change", () => {
    const f = input.files?.[0];
    if (f) onPick(f);
  });
  input.click();
}

interface Tile {
  cell: HTMLElement;
  btn: HTMLElement;
  frame: HTMLElement;
}

/** 面板里的一格：外面一层格子（浮起动画挂在它上面，需要时还放删除按钮），里面是和添加卡片一样的按钮 */
function tile(parent: HTMLElement, name: string, i: number, fw: number, fh: number, rise: boolean): Tile {
  const cell = parent.createDiv({ cls: rise ? "vp-look-cell vp-look-rise" : "vp-look-cell" });
  cell.setCssProps({ "--vp-gal-i": String(Math.min(8, i)) });
  const btn = cell.createEl("button", { cls: "vp-gal-tile", attr: { type: "button", "aria-pressed": "false", "aria-label": name } });
  const check = btn.createSpan({ cls: "vp-gal-check", attr: { "aria-hidden": "true" } });
  setIcon(check, "check");
  check.querySelectorAll("svg *").forEach((n) => n.setAttribute("pathLength", "1"));
  const frame = btn.createDiv({ cls: "vp-gal-frame", attr: { "aria-hidden": "true" } });
  frame.setCssProps({ "--vp-gal-fw": `${fw}px`, "--vp-gal-fh": `${fh}px` });
  btn.createDiv({ cls: "vp-gal-cap", text: name });
  return { cell, btn, frame };
}

const pick = (btn: HTMLElement, on: boolean) => {
  btn.toggleClass("is-picked", on);
  btn.setAttr("aria-pressed", String(on));
};

/** 背景的小样：一个缩小的看板根元素（带当前主题和这个背景的类名），里面三张示意卡片用当前主题的卡片底色和当前透明度 */
type SwatchKind = { kind: "theme" } | { kind: "preset"; id: string } | { kind: "color"; color: string } | { kind: "image"; url: string | null };
function paintSwatch(frame: HTMLElement, theme: string, k: SwatchKind) {
  let sw = frame.querySelector<HTMLElement>(":scope > .vp-look-sw");
  if (!sw) {
    sw = frame.createDiv();
    sw.createDiv({ cls: "vp-look-sw-card is-a" }).createDiv({ cls: "vp-look-sw-bar" });
    sw.createDiv({ cls: "vp-look-sw-card is-b" });
    sw.createDiv({ cls: "vp-look-sw-card is-c" });
  }
  const cls = ["vp-look-sw", "vp-root", `vp-theme-${theme}`];
  if (k.kind === "preset") cls.push(`vp-bg-${k.id}`);
  if (k.kind === "color") cls.push("vp-bg-color");
  if (k.kind === "image" && k.url) cls.push("has-img");
  sw.className = cls.join(" ");
  sw.setCssProps({ "--vp-custom": k.kind === "color" ? k.color : "", "--vp-look-img": k.kind === "image" && k.url ? `url("${k.url.replace(/"/g, "%22")}")` : "" });
}

/** 自己画的取色界面：饱和度明度方块、色相条、十六进制输入框（普通文本框）。改的是“我的背景”里选中的那个颜色 */
function buildPicker(parent: HTMLElement, host: LookHost) {
  const wrap = parent.createDiv({ cls: "vp-look-picker" });
  const sv = wrap.createDiv({ cls: "vp-look-sv", attr: { role: "slider", tabindex: "0", "aria-label": L("饱和度和明度", "Saturation and brightness") } });
  sv.createDiv({ cls: "vp-look-thumb" });
  const hue = wrap.createDiv({ cls: "vp-look-hue", attr: { role: "slider", tabindex: "0", "aria-label": L("色相", "Hue"), "aria-valuemin": "0", "aria-valuemax": "360" } });
  hue.createDiv({ cls: "vp-look-thumb" });
  const input = wrap.createEl("input", { cls: "vp-look-hex", attr: { type: "text", spellcheck: "false", maxlength: "7", "aria-label": L("十六进制颜色", "Hex colour") } });
  let { h, s, v } = hexToHsv(START_COLOR);
  const paint = () => {
    const hex = hsvToHex(h, s, v);
    wrap.setCssProps({ "--vp-look-hue": `hsl(${Math.round(h)} 100% 50%)`, "--vp-look-s": String(s), "--vp-look-v": String(v), "--vp-look-h": String(h / 360), "--vp-look-hex": hex });
    hue.setAttr("aria-valuenow", String(Math.round(h)));
    sv.setAttr("aria-valuetext", hex);
    if (input.ownerDocument.activeElement !== input) input.value = hex;
    return hex;
  };
  const write = (hex: string, live: boolean) => {
    const a = host.get();
    const m = mineOf(a);
    if (!m?.color) return;
    host.set({ ...a, backgrounds: a.backgrounds.map((x) => (x.id === m.id ? { ...x, color: hex } : x)) }, { live });
  };
  let queued = 0;
  const win = () => wrap.ownerDocument.defaultView ?? window;
  /** 拖动中每帧最多写一次；松手、键盘、输入框是最终值，立刻写并保存 */
  const commit = (final: boolean) => {
    const hex = paint();
    win().cancelAnimationFrame(queued);
    if (final) write(hex, false);
    else queued = win().requestAnimationFrame(() => write(hex, true));
  };
  dragOn(
    sv,
    (x, y) => {
      s = x;
      v = 1 - y;
      commit(false);
    },
    () => commit(true)
  );
  dragOn(
    hue,
    (x) => {
      h = x * 360;
      commit(false);
    },
    () => commit(true)
  );
  sv.addEventListener("keydown", (e) => {
    const step = e.shiftKey ? 0.1 : 0.02;
    const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    const m = d[e.key];
    if (!m) return;
    e.preventDefault();
    e.stopPropagation();
    s = Math.min(1, Math.max(0, s + m[0]));
    v = Math.min(1, Math.max(0, v + m[1]));
    commit(true);
  });
  hue.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    e.stopPropagation();
    const step = e.shiftKey ? 30 : 5;
    h = (h + (e.key === "ArrowRight" ? step : -step) + 360) % 360;
    commit(true);
  });
  input.addEventListener("input", () => {
    const t = input.value.startsWith("#") ? input.value : `#${input.value}`;
    if (!isHex(t)) return;
    ({ h, s, v } = hexToHsv(t));
    commit(true);
  });
  input.addEventListener("blur", () => paint());
  paint();
  /** 选中的颜色换了一项：把取色界面对到那个颜色上（自己拖动时不调，免得色相在灰色处乱跳） */
  return {
    bind: (hex: string) => {
      ({ h, s, v } = hexToHsv(hex));
      paint();
    },
  };
}

/** 自己画的滑块（卡片透明度）：拖动、点按、左右键（Shift 一次 10） */
function buildSlider(parent: HTMLElement, label: string, min: number, max: number, get: () => number, set: (v: number, live: boolean) => void) {
  const el = parent.createDiv({ cls: "vp-look-slider", attr: { role: "slider", tabindex: "0", "aria-label": label, "aria-valuemin": String(min), "aria-valuemax": String(max) } });
  el.createDiv({ cls: "vp-look-slider-fill" });
  el.createDiv({ cls: "vp-look-thumb" });
  dragOn(
    el,
    (x) => set(Math.round(min + x * (max - min)), true),
    () => set(get(), false)
  );
  el.addEventListener("keydown", (e) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -1 : 0;
    if (!d && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    e.stopPropagation();
    const next = e.key === "Home" ? min : e.key === "End" ? max : get() + d * (e.shiftKey ? 10 : 1);
    set(Math.min(max, Math.max(min, next)), false);
  });
  return {
    paint: () => {
      const v = get();
      el.setCssProps({ "--vp-look-f": String((v - min) / (max - min)) });
      el.setAttr("aria-valuenow", String(v));
      el.setAttr("aria-valuetext", `${v}%`);
    },
  };
}

/** 主题小样里的三张卡：今日写作、本月写作、总字数 */
const THEME_CARDS: { id: WidgetId; x: number; y: number; w: number; h: number }[] = [
  { id: "hero", x: 0, y: 0, w: 8, h: 6 },
  { id: "month", x: 8, y: 0, w: 4, h: 3 },
  { id: "words", x: 8, y: 3, w: 4, h: 3 },
];
const THEME_FRAME_W = 280;
const SW_W = 148;
const SW_H = 92;

export class LookPanel {
  private syncs: (() => void)[] = [];

  constructor(private host: LookHost) {}

  /** 外观变了（这里改的，或者别的设备同步来的）：格子的选中状态、小样、滑块、数字跟着变 */
  sync() {
    for (const f of this.syncs) f();
  }

  /** 背景：顶上卡片透明度，下面 跟随主题 / 渐变 / 纸 / 我的背景 / 添加颜色 / 添加图片，选中自选颜色时右边展开取色界面 */
  buildBackground(pane: HTMLElement, setCount: (n: number) => void) {
    const host = this.host;
    const opRow = pane.createDiv({ cls: "vp-look-op" });
    opRow.createSpan({ cls: "vp-look-op-label", text: L("卡片透明度", "Card opacity") });
    const slider = buildSlider(
      opRow,
      L("卡片透明度", "Card opacity"),
      OPACITY_MIN,
      100,
      () => host.get().cardOpacity,
      (v, live) => host.set({ ...host.get(), cardOpacity: v }, { live })
    );
    const opVal = opRow.createSpan({ cls: "vp-look-op-val" });
    const layout = pane.createDiv({ cls: "vp-look-bg" });
    const grid = layout.createDiv({ cls: "vp-look-tiles" });
    const picker = buildPicker(layout, host);
    let refs: { btn: HTMLElement; picked: (a: Appearance) => boolean; paint: (a: Appearance) => void }[] = [];
    let sig: string | null = null;
    let boundId = "";

    const addColor = () => {
      const a = host.get();
      if (a.backgrounds.length < MAX_MINE) host.set(addMine(a, { id: uid(), color: START_COLOR }));
    };
    const addImage = () =>
      pickImageFile((f) => {
        void importImage(host.app, f).then((m) => {
          if (m) host.set(addMine(host.get(), m), { restyle: true });
        });
      });

    /** 格子的组成变了（添加、删除）才重排；拖取色、拖滑块只重画小样 */
    const renderTiles = (initial: boolean) => {
      grid.empty();
      refs = [];
      let i = 0;
      const add = (name: string, choose: () => void, picked: (a: Appearance) => boolean, paint: (frame: HTMLElement, a: Appearance) => void) => {
        const t = tile(grid, name, i++, SW_W, SW_H, initial);
        t.btn.addEventListener("click", choose);
        refs.push({ btn: t.btn, picked, paint: (a) => paint(t.frame, a) });
        return t;
      };
      const fromImage = (a: Appearance) => !!mineOf(a)?.image;
      add(
        L("跟随主题", "Theme"),
        () => host.set({ ...host.get(), background: { kind: "theme" } }, { restyle: fromImage(host.get()) }),
        (a) => a.background.kind === "theme",
        (f, a) => paintSwatch(f, a.theme, { kind: "theme" })
      );
      for (const b of BACKGROUNDS) {
        add(
          BG_NAME[b.id]?.() ?? b.id,
          () => host.set({ ...host.get(), background: { kind: "preset", preset: b.id } }, { restyle: fromImage(host.get()) }),
          (a) => a.background.kind === "preset" && a.background.preset === b.id,
          (f, a) => paintSwatch(f, a.theme, { kind: "preset", id: b.id })
        );
      }
      let nImg = 0;
      for (const m of host.get().backgrounds) {
        const label = m.color ?? `${L("图片", "Image")} ${++nImg}`;
        const del = { el: null as HTMLElement | null };
        const t = add(
          label,
          () => host.set({ ...host.get(), background: { kind: "mine", id: m.id } }, { restyle: !!m.image || fromImage(host.get()) }),
          (a) => a.background.kind === "mine" && a.background.id === m.id,
          (f, a) => {
            const cur = a.backgrounds.find((x) => x.id === m.id);
            if (cur?.image) paintSwatch(f, a.theme, { kind: "image", url: host.imageUrl(cur.image) });
            else {
              const color = cur?.color ?? START_COLOR;
              paintSwatch(f, a.theme, { kind: "color", color });
              // 拖取色时名字跟着变（格子不重排）
              f.parentElement?.setAttr("aria-label", color);
              f.parentElement?.querySelector(".vp-gal-cap")?.setText(color);
              del.el?.setAttr("aria-label", `${L("删除", "Remove")} ${color}`);
            }
          }
        );
        del.el = t.cell.createEl("button", { cls: "vp-look-del", attr: { type: "button", "aria-label": `${L("删除", "Remove")} ${label}` } });
        setIcon(del.el, "x");
        del.el.addEventListener("click", () => {
          const a = host.get();
          host.set(removeMine(a, m.id), { restyle: a.background.kind === "mine" && a.background.id === m.id && !!m.image });
        });
      }
      if (host.get().backgrounds.length < MAX_MINE) {
        const c = tile(grid, L("添加颜色", "Add colour"), i++, SW_W, SW_H, initial);
        c.frame.addClass("vp-look-addcolor");
        setIcon(c.frame.createDiv({ cls: "vp-look-disc" }), "plus");
        c.btn.addEventListener("click", addColor);
        const p = tile(grid, L("添加图片", "Add image"), i++, SW_W, SW_H, initial);
        p.frame.addClass("vp-look-addimg");
        setIcon(p.frame.createDiv({ cls: "vp-look-disc" }), "image");
        p.btn.addEventListener("click", addImage);
      }
    };

    this.syncs.push(() => {
      const a = host.get();
      const nextSig = a.backgrounds.map((m) => `${m.id}:${m.image ?? ""}`).join(",");
      if (nextSig !== sig) {
        renderTiles(sig === null);
        sig = nextSig;
        setCount(1 + BACKGROUNDS.length + a.backgrounds.length);
      }
      for (const r of refs) {
        pick(r.btn, r.picked(a));
        r.paint(a);
      }
      pane.setCssProps({ "--vp-look-op": String(a.cardOpacity / 100) });
      opVal.setText(`${a.cardOpacity}%`);
      slider.paint();
      const sel = mineOf(a);
      layout.toggleClass("is-picking", !!sel?.color);
      if (sel?.color && sel.id !== boundId) picker.bind(sel.color);
      boundId = sel?.color ? sel.id : "";
    });
    this.sync();
  }

  /** 主题：每套主题一格，小样是用真实看板代码按那套主题画的三张卡 */
  buildTheme(pane: HTMLElement) {
    const host = this.host;
    const grid = pane.createDiv({ cls: "vp-look-tiles is-themes" });
    const pad = GAP;
    const W = Math.max(600, host.gridWidth());
    const colW = (W - 2 * pad - GAP * (COLS - 1)) / COLS;
    const H = rowsToPx(6) + 2 * pad;
    const scale = THEME_FRAME_W / W;
    const refs: { id: string; btn: HTMLElement }[] = [];
    THEMES.forEach((t, i) => {
      const { btn, frame } = tile(grid, themeName(t.id), i, THEME_FRAME_W, Math.round(H * scale), true);
      const stage = frame.createDiv({ cls: `vp-look-stage vp-root vp-theme-${t.id}` });
      stage.setCssProps({ "--vp-look-w": `${W}px`, "--vp-look-h": `${H}px`, "--vp-look-scale": String(scale) });
      for (const c of THEME_CARDS) {
        const slot = stage.createDiv({ cls: "vp-look-slot" });
        slot.setCssProps({
          "--vp-look-x": `${pad + c.x * (colW + GAP)}px`,
          "--vp-look-y": `${pad + c.y * (ROW_H + GAP)}px`,
          "--vp-look-cw": `${c.w * colW + (c.w - 1) * GAP}px`,
          "--vp-look-ch": `${rowsToPx(c.h)}px`,
        });
        host.renderCard(slot, c.id, c.w, c.h);
      }
      btn.addEventListener("click", () => {
        const a = host.get();
        if (a.theme !== t.id) host.set({ ...a, theme: t.id }, { restyle: true });
      });
      refs.push({ id: t.id, btn });
    });
    this.syncs.push(() => {
      const a = host.get();
      for (const r of refs) pick(r.btn, r.id === a.theme);
    });
    this.sync();
  }
}

/** 库里的图片文件：路径 → 能显示的地址；不是文件（删了、还没同步到）返回 null */
export function vaultImageUrl(app: App, path: string): string | null {
  const f = app.vault.getAbstractFileByPath(path);
  return f instanceof TFile ? app.vault.getResourcePath(f) : null;
}
