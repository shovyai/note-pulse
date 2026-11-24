// 打包“外观”的本地预览（真实看板代码）：node scripts/preview/build-appearance.mjs，然后打开 scripts/preview/appearance.html
import { build } from "esbuild";
await build({
  entryPoints: ["scripts/preview/appearance.ts"], bundle: true, format: "iife", outfile: "scripts/preview/appearance.js",
  alias: { obsidian: "./scripts/preview/obsidian-preview.ts" }, logLevel: "warning", loader: { ".json": "json" },
});
console.log("appearance preview built");
