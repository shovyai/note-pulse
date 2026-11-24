/*
 * 新手引导：第一次打开看板时，一步一步带用户看一遍（高亮真实的界面、自动进入编辑模式、点“下一步”继续）。
 * 两套：完整引导（新装、从没看过引导的人，以及用命令、“更多”菜单、设置主动打开的）；
 * 新增内容的短引导（看过旧版引导的老用户升级后自动看一次，只讲变了的地方）。
 * 这里只放纯数据和纯函数（步骤、谁看哪套、提示卡该放在哪），不依赖 DOM，方便单元测试；画界面的部分在 tour.ts。
 */
import { L } from "./i18n";

/** 看过哪一版引导的记号（存在 data.json 的 guideSeen）。不必等于发版号。
 * 以后界面再大改：改成新值，看过旧值的人会自动看一次短引导，内容在 tourSteps 的 news 里改 */
export const GUIDE_VERSION = "2.2";

/** full：完整引导；news：只讲新增和变了的地方 */
export type TourKind = "full" | "news";

/**
 * 打开看板时该不该自动弹引导、弹哪套。seen 是 data.json 里记着看过的版本（空表示从没看过）。
 * 看过旧版的老用户在手机和窄面板上不弹（短引导讲的都是电脑上的编辑工具），也不记成看过，等第一次在宽面板打开再弹。
 */
export function autoTourKind(seen: string, wide: boolean): TourKind | null {
  if (seen === GUIDE_VERSION) return null;
  if (seen === "") return "full";
  return wide ? "news" : null;
}

/** 这一步需要看板处在什么状态：是否编辑模式、是否展开了“添加卡片”面板 */
export interface TourState {
  editing: boolean;
  addOpen: boolean;
}

/** 要高亮的界面元素，具体怎么找由 view 决定。tools 是页头里撤销、整理、更多这三个图标 */
export type TourTarget = "greeting" | "alerts" | "editBtn" | "card" | "handle" | "switch" | "tools" | "addBtn" | "addPanel" | "doneBtn" | "firstCard";

/** 这一步上演示的小动画：光标拖动卡片、拖角调大小、点切换按钮 */
export type TourDemo = "drag" | "resize" | "click";

export interface TourStep {
  id: string;
  title: string;
  body: string;
  /** 没有目标的步骤，提示卡放在屏幕中间 */
  target?: TourTarget;
  /** 目标找不到时（比如用户没有提醒、没有带切换的卡片）跳过这一步 */
  optional?: boolean;
  state: TourState;
  demo?: TourDemo;
}

const VIEW: TourState = { editing: false, addOpen: false };
const EDIT: TourState = { editing: true, addOpen: false };
const ADD: TourState = { editing: true, addOpen: true };

/**
 * 所有步骤。wide 为 false（手机或窄面板）时看板只看不改，只讲看得到的部分，不进编辑模式；两套在窄面板上一样。
 */
export function tourSteps(wide: boolean, kind: TourKind = "full"): TourStep[] {
  const greeting: TourStep = {
    id: "greeting",
    title: L("页首的问候", "The greeting"),
    body: L("问候会跟着时间和你今天的写作变：目标达成了、还差多少字、再写多少能保住连续打卡……下面一行是本周的小结。", "The greeting follows the time of day and your writing today: goal met, words to go, how to keep your streak. The line below is this week's summary."),
    target: "greeting",
    state: VIEW,
  };
  const alerts: TourStep = {
    id: "alerts",
    title: L("醒目的提醒", "Reminders"),
    body: L(
      "任务逾期（红）、今天到期（橙）、连续打卡快断了（橙）、本周目标还差多少（紫），做成色块放在这里，点一下跳到相关的卡片。每种提醒都能在设置的“打卡与热力图”里单独开关。",
      "Overdue tasks (red), tasks due today (orange), a streak about to break (orange) and a weekly goal still short (purple) show up here as coloured blocks. Click one to jump to the card. Each kind can be turned on or off in Settings under “Streak and heatmap”."
    ),
    target: "alerts",
    optional: true,
    state: VIEW,
  };

  if (!wide) {
    return [
      {
        id: "welcome",
        title: L("欢迎来到 Note Pulse", "Welcome to Note Pulse"),
        body: L(
          "看板上有卡片、问候和提醒，图表也能换画法。手机和窄面板上只看不改，布局跟着电脑上摆好的走。花一分钟看看。",
          "The dashboard has cards, a greeting and reminders, and charts you can restyle. On phones and narrow panes it is view-only and follows the layout you arranged on a computer. Take a minute to look around."
        ),
        state: VIEW,
      },
      greeting,
      alerts,
      {
        id: "cards",
        title: L("卡片", "Cards"),
        body: L("每张卡片大小不同，显示的内容跟着变：小的只有数字，大的有图表和细节。列表放不下的会折成“还有 N 个”，点开可以在卡片里滚动。", "Cards differ in size and show more as they grow: small ones just a number, big ones charts and details. Lists that do not fit fold into “N more”."),
        target: "firstCard",
        optional: true,
        state: VIEW,
      },
      {
        id: "finish",
        title: L("开始使用吧", "You are all set"),
        body: L("想再看一遍：在命令面板里搜“新手引导”。要摆卡片，请在电脑上操作，手机会自动同步。", "To see this again, search “guide” in the command palette. To arrange cards, use a computer; your phone follows automatically."),
        state: VIEW,
      },
    ];
  }

  const again = L("在命令面板里搜“新手引导”，或者编辑时点页头的“更多”，再点“新手引导”。", "search “guide” in the command palette, or while editing open “More” in the header and choose “Guide”.");
  const tools = (lead: string, leadEn: string): TourStep => ({
    id: "tools",
    title: L("页头的编辑工具", "Edit tools in the header"),
    body: L(`${lead}撤销、整理（把卡片往上补齐空位），以及“更多”，里面有恢复默认布局和新手引导。`, `${leadEn}undo, tidy up (moves cards up to fill gaps), and “More”, which holds Restore default and the guide.`),
    target: "tools",
    state: EDIT,
  });
  const library = (body: string, bodyEn: string): TourStep => ({
    id: "library",
    title: kind === "news" ? L("添加卡片", "Add cards") : L("挑一张卡片", "Pick a card"),
    body: L(body, bodyEn),
    target: "addPanel",
    state: ADD,
  });

  if (kind === "news") {
    return [
      {
        id: "news",
        title: L("编辑看板换了样子", "Editing has a new look"),
        body: L("编辑工具搬进了页头，添加卡片换成从底部弹起的面板。花半分钟看一下。", "The edit tools now live in the header, and adding cards opens a panel from the bottom. Take half a minute to see."),
        state: VIEW,
      },
      alerts,
      tools("点铅笔进入编辑后，页头的按钮换成编辑工具：", "After you click the pencil, the header buttons turn into edit tools: "),
      library(
        "点页头的“添加卡片”，面板从底部弹起，按主题分类，每张卡都是真实的预览。点一下添加，再点一下取消；也可以直接拖到看板上想放的位置。",
        "Click “Add a card” in the header and a panel slides up from the bottom, sorted by topic, with a live preview of every card. Click one to add it, click again to remove it, or drag it where you want it on the dashboard."
      ),
      {
        id: "done",
        title: L("改完点“完成”", "Click Done when finished"),
        body: L("“完成”在页头最右，点了回到平时的看板。改动自动保存，并随库同步到你的其他设备。", "Done sits at the far right of the header and takes you back to the dashboard. Changes are saved automatically and sync across your devices."),
        target: "doneBtn",
        state: EDIT,
      },
      {
        id: "finish",
        title: L("就这些", "That is all"),
        body: L(`想看完整的引导：${again}`, `For the full guide, ${again}`),
        state: VIEW,
      },
    ];
  }

  return [
    {
      id: "welcome",
      title: L("欢迎来到 Note Pulse", "Welcome to Note Pulse"),
      body: L("看板可以自己摆：要哪些卡片、放在哪、多大，都由你定。花一分钟，跟着看一遍怎么用。", "The dashboard is yours to arrange: pick the cards, where they go and how big. Take a minute to see how it works."),
      state: VIEW,
    },
    greeting,
    alerts,
    {
      id: "edit",
      title: L("点铅笔，进入编辑", "Click the pencil to edit"),
      body: L("点这里进入编辑模式，才能摆卡片。点“下一步”，我带你进去。", "Click here to enter edit mode, where you can arrange cards. Press Next and I will take you in."),
      target: "editBtn",
      state: VIEW,
    },
    {
      id: "drag",
      title: L("拖动卡片换位置", "Drag a card to move it"),
      body: L(
        "按住卡片拖到想放的位置，落在哪就是哪，虚线框是松手后的位置；压住的卡片会就近让开。留下的空位不会自动补上，想排整齐就点页头的“整理”。按 Esc 取消，Cmd / Ctrl + Z 撤销，也可以用方向键移动。",
        "Drag a card where you want it; it lands exactly where the dashed frame shows, and cards underneath step aside. Gaps are not filled automatically; click “Tidy up” in the header to close them. Esc cancels, Cmd / Ctrl + Z undoes, arrow keys work too."
      ),
      target: "card",
      state: EDIT,
      demo: "drag",
    },
    {
      id: "resize",
      title: L("拖右下角调大小", "Drag the corner to resize"),
      body: L("宽和高按格子吸附（一共 12 列）。每张卡片有自己合适的大小范围，拖大了会显示更多内容，缩小了只留重点。", "Width and height snap to a 12-column grid. Each card has its own sensible range; bigger shows more, smaller keeps the essentials."),
      target: "handle",
      state: EDIT,
      demo: "resize",
    },
    {
      id: "switch",
      title: L("切换指标、范围和图的样子", "Switch metric, period and chart style"),
      body: L("编辑时，卡片上会出现切换：指标、时间范围、标签页，以及图的画法（柱状 / 折线 / 曲线 / 面积、堆叠条 / 环形图、标签云……）。平时看板上不放这些按钮，免得误点。", "While editing, cards show switches for metric, period and tabs, plus the chart style (bar, line, curve, area, donut, cloud…). They stay hidden otherwise so you do not click them by accident."),
      target: "switch",
      optional: true,
      state: EDIT,
      demo: "click",
    },
    tools("进入编辑后，页头换成编辑工具：", "While editing, the header shows the edit tools: "),
    {
      id: "add",
      title: L("添加更多卡片", "Add more cards"),
      body: L("点“添加卡片”，面板从底部弹起。点“下一步”，我带你看。", "Click “Add a card” and a panel slides up from the bottom. Press Next to look inside."),
      target: "addBtn",
      state: EDIT,
    },
    library(
      "面板按主题分类，每张卡都是真实的预览。点一下添加，加好的会有强调，再点一下取消；也可以直接拖到看板上想放的位置。大小拖卡片右下角调。",
      "The panel is sorted by topic, with a live preview of every card. Click one to add it; added cards are highlighted, and clicking again removes it. You can also drag a card where you want it, and resize it by its corner."
    ),
    {
      id: "done",
      title: L("改完点“完成”", "Click Done when finished"),
      body: L("改动自动保存，并随库同步到你的其他设备。手机上看板只看不改，会跟着电脑上的布局。", "Changes are saved automatically and sync across your devices. On a phone the dashboard is view-only and follows your computer's layout."),
      target: "doneBtn",
      state: EDIT,
    },
    {
      id: "finish",
      title: L("都看完了", "All done"),
      body: L(`想再看一遍：${again}祝写得开心。`, `To see this again, ${again} Happy writing.`),
      state: VIEW,
    },
  ];
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clampN = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * 提示卡放在哪（左上角）：没有目标时放在看板面板（anchor）中间；否则优先放目标下面，放不下放上面，
 * 再不行放右边、左边；水平方向对齐目标中心，夹在屏幕里。都放不下（目标很大）时压在屏幕下部。
 */
export function placeCard(target: Rect | null, card: { w: number; h: number }, vp: { w: number; h: number }, gap = 14, anchor?: Rect): { x: number; y: number; side: "center" | "below" | "above" | "right" | "left" | "over" } {
  const maxX = Math.max(gap, vp.w - card.w - gap);
  const maxY = Math.max(gap, vp.h - card.h - gap);
  // 没有目标：居中。有 anchor（看板所在的面板）就在面板里居中，不然在整个窗口里居中（侧边栏开着时窗口中心不是看板中心）
  if (!target) {
    const a = anchor ? visibleRect(anchor, vp) : { x: 0, y: 0, w: vp.w, h: vp.h };
    const box = a.w > 0 && a.h > 0 ? a : { x: 0, y: 0, w: vp.w, h: vp.h };
    return { x: clampN(box.x + (box.w - card.w) / 2, gap, maxX), y: clampN(box.y + (box.h - card.h) / 2, gap, maxY), side: "center" };
  }
  const cx = clampN(target.x + target.w / 2 - card.w / 2, gap, maxX);
  const cy = clampN(target.y + target.h / 2 - card.h / 2, gap, maxY);
  const below = target.y + target.h + gap;
  if (below + card.h <= vp.h - gap) return { x: cx, y: below, side: "below" };
  const above = target.y - gap - card.h;
  if (above >= gap) return { x: cx, y: above, side: "above" };
  const right = target.x + target.w + gap;
  if (right + card.w <= vp.w - gap) return { x: right, y: cy, side: "right" };
  const left = target.x - gap - card.w;
  if (left >= gap) return { x: left, y: cy, side: "left" };
  return { x: cx, y: maxY, side: "over" };
}

/** 目标超出屏幕时，高亮框只画屏幕里看得见的那部分 */
export function visibleRect(r: Rect, vp: { w: number; h: number }): Rect {
  const x = clampN(r.x, 0, vp.w);
  const y = clampN(r.y, 0, vp.h);
  const right = clampN(r.x + r.w, 0, vp.w);
  const bottom = clampN(r.y + r.h, 0, vp.h);
  return { x, y, w: Math.max(0, right - x), h: Math.max(0, bottom - y) };
}

