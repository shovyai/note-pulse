// 打包“添加卡片”面板原型：node scripts/preview/build-gallery.mjs，然后打开 scripts/preview/gallery.html
import { build } from "esbuild";
await build({
  entryPoints: ["scripts/preview/gallery.ts"], bundle: true, format: "iife", outfile: "scripts/preview/gallery.js",
  alias: { obsidian: "./scripts/preview/obsidian-preview.ts" }, logLevel: "warning", loader: { ".json": "json" },
});
console.log("gallery prototype built");
