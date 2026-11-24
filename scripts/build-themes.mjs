// 把 src/appearance.ts 的主题表和预设表生成的样式写进 styles.css 的 themes:start … themes:end 之间（没有这段就插在 tokens:end 前面）。
// 改了主题表后运行：node scripts/build-themes.mjs。tests/appearance.test.ts 会检查两边一致。
import { build } from "esbuild";
import { readFileSync, writeFileSync } from "node:fs";

const out = await build({ entryPoints: ["src/appearance.ts"], bundle: true, platform: "node", format: "esm", write: false, logLevel: "warning" });
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
const block = mod.themeBlock();
const css = readFileSync("styles.css", "utf8");
const start = css.indexOf("/* themes:start */");
const endMark = "/* themes:end */";
const end = css.indexOf(endMark);
let next;
if (start >= 0 && end > start) next = css.slice(0, start) + block + css.slice(end + endMark.length);
else {
  const at = css.indexOf("/* tokens:end */");
  if (at < 0) throw new Error("styles.css 缺少 tokens:end 标记");
  next = `${css.slice(0, at)}${block}\n${css.slice(at)}`;
}
if (next === css) console.log("styles.css 的主题样式已是最新");
else {
  writeFileSync("styles.css", next);
  console.log("已更新 styles.css 的主题样式");
}
