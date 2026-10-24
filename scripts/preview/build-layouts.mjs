// 打包排版方案原型：node scripts/preview/build-layouts.mjs，然后打开 scripts/preview/layouts.html?v=1（v=0 是现在的布局）
import { build } from "esbuild";
await build({
  entryPoints: ["scripts/preview/layouts.ts"], bundle: true, format: "iife", outfile: "scripts/preview/layouts.js",
  alias: { obsidian: "./scripts/preview/obsidian-preview.ts" }, logLevel: "warning", loader: { ".json": "json" },
});
console.log("layouts prototype built");
