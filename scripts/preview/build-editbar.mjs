// 编辑栏原型要用的图标：从 lucide 包抽出来，生成 editbar-icons.js（只在本地预览时运行）
// node scripts/preview/build-editbar.mjs <lucide 包的 dist/esm/icons 目录>
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
const dir = process.argv[2];
const names = ["undo-2", "rotate-ccw", "arrow-up-to-line", "circle-help", "plus", "check", "pencil", "palette", "ellipsis", "maximize", "refresh-cw", "settings"];
const out = {};
for (const n of names) {
  const src = readFileSync(join(dir, `${n}.js`), "utf8");
  const end = src.lastIndexOf("];") >= 0 ? src.lastIndexOf("];") : src.lastIndexOf("]);");
  const body = src.slice(src.indexOf("["), end + 1);
  const arr = Function(`"use strict"; const defaultAttributes = {}; return ${body};`)();
  const list = Array.isArray(arr[0]) ? arr : arr[2];
  const kids = list.map(([tag, attrs]) => `<${tag} ${Object.entries(attrs).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  out[n] = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="svg-icon lucide-${n}">${kids}</svg>`;
}
writeFileSync(new URL("./editbar-icons.js", import.meta.url), `window.NP_ICONS = ${JSON.stringify(out)};\n`);
console.log(Object.keys(out).length, "icons");
