// 编辑栏重做原型：静态示意，不接真实数据。node scripts/preview/build-editbar.mjs <lucide 图标目录> 生成 editbar-icons.js 后，用 http 服务打开 editbar.html。
(function () {
  const I = window.NP_ICONS;
  const state = { plan: "new", mode: "edit", width: "wide", theme: "light", moved: false, menu: false, enter: true };

  const icon = (name) => `<span class="vp-btn-icon" aria-hidden="true">${I[name]}</span>`;
  const iconBtn = (name, label, extra = "", cls = "") =>
    `<button type="button" class="vp-icon-btn ${cls}" aria-label="${label}" data-tip="${label}" ${extra}>${I[name]}</button>`;

  const greeting = `<div class="vp-greeting"><div class="vp-headline-lead">下午好</div><div class="vp-headline-sub">今天已写 640 字，连续 3 天</div></div>`;
  const cards = `<div class="ep-grid">${[0, 1, 2, 3, 4, 5, 6, 7].map((i) => `<div class="ep-card${i % 4 === 0 ? " is-wide" : ""}${state.mode === "edit" ? " is-edit" : ""}"></div>`).join("")}</div>`;

  const browseActions = () =>
    `<div class="vp-header-actions"><span class="vp-status">刚刚更新</span>${iconBtn("pencil", "编辑看板", 'data-act="edit"')}${iconBtn("maximize", "全屏")}${iconBtn("refresh-cw", "刷新数据")}${iconBtn("settings", "看板设置")}</div>`;

  // 现状：粘顶的整条栏，说明文字加七个同样重的按钮（图标补全，免得预览缺图标误导）
  const oldBar = () => {
    const b = (ic, t, primary) => `<button type="button" class="vp-btn is-compact${primary ? " is-primary" : ""}">${icon(ic)}<span>${t}</span></button>`;
    return `<div class="vp-editbar" role="toolbar"><div class="vp-editbar-hint">拖动卡片换位置（放哪是哪，不会自动补位），拖右下角调大小</div><div class="vp-editbar-actions">${b("undo-2", "撤销")}${b("rotate-ccw", "恢复默认布局")}${b("arrow-up-to-line", "整理")}${b("circle-help", "新手引导")}${b("plus", "添加卡片")}${b("palette", "外观")}${b("check", "完成", true)}</div></div>`;
  };

  // 新方案：编辑时页头右侧换成编辑工具
  const newTools = () => `
    <div class="vp-header-actions"><div class="ep-tools" role="toolbar" aria-label="编辑看板">
      ${iconBtn("undo-2", "撤销", `data-act="undo" ${state.moved ? "" : "disabled"}`)}
      ${iconBtn("arrow-up-to-line", "整理", 'data-act="tidy"')}
      ${iconBtn("palette", "外观")}
      <div class="ep-more">
        ${iconBtn("ellipsis", "更多", `data-act="more" aria-haspopup="menu" aria-expanded="${state.menu}"`, state.menu ? "is-open" : "")}
        <div class="ep-menu${state.menu ? " is-open" : ""}" role="menu">
          <button type="button" class="ep-item" role="menuitem" data-act="reset">${I["rotate-ccw"]}<span>恢复默认布局</span></button>
          <button type="button" class="ep-item" role="menuitem" data-act="guide">${I["circle-help"]}<span>新手引导</span></button>
        </div>
      </div>
      <span class="ep-sep" aria-hidden="true"></span>
      <button type="button" class="vp-btn is-soft" data-act="add">${icon("plus")}<span>添加卡片</span></button>
      <button type="button" class="vp-btn is-primary" data-act="done">${icon("check")}<span>完成</span></button>
    </div></div>`;

  function render() {
    document.body.className = state.theme === "dark" ? "theme-dark" : "theme-light";
    const editing = state.mode === "edit";
    const isNew = state.plan === "new";
    const header = `<div class="vp-header">${greeting}${isNew && editing ? newTools() : browseActions()}</div>`;
    const bar = !isNew && editing ? oldBar() : "";
    const frame = document.getElementById("frame");
    frame.className = `ep-frame is-${state.width}`;
    frame.innerHTML = `<div class="vp-root vp-motion${isNew && editing ? " ep-edit" : ""}${state.enter ? " ep-enter" : ""}"><div class="vp-shell">${header}${bar}${cards}</div></div>`;
    state.enter = false;
    renderSwitch();
  }

  const opts = (key, list) => `<div class="ep-group">${list.map(([v, t]) => `<button type="button" class="${state[key] === v ? "is-on" : ""}" data-key="${key}" data-val="${v}">${t}</button>`).join("")}</div>`;
  function renderSwitch() {
    document.getElementById("switch").innerHTML =
      opts("plan", [["old", "现状"], ["new", "新方案"]]) + opts("mode", [["browse", "浏览"], ["edit", "编辑"]]) + opts("width", [["wide", "宽"], ["narrow", "窄"]]) + opts("theme", [["light", "浅色"], ["dark", "深色"]]);
  }

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-key],[data-act]");
    if (t && t.dataset.key) {
      state[t.dataset.key] = t.dataset.val;
      state.menu = false;
      state.enter = true;
      return render();
    }
    const act = t && t.dataset.act;
    if (act === "edit") { state.mode = "edit"; state.moved = false; state.enter = true; return render(); }
    if (act === "done") { state.mode = "browse"; state.menu = false; return render(); }
    if (act === "more") { state.menu = !state.menu; return render(); }
    if (act === "tidy" || act === "reset") { state.moved = true; state.menu = false; return render(); }
    if (act === "undo") { state.moved = false; return render(); }
    if (act === "guide") { state.menu = false; return render(); }
    if (state.menu) { state.menu = false; render(); }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && state.menu) { state.menu = false; render(); }
  });
  render();
})();
