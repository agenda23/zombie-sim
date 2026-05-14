import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, cpSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const extRoot = join(root, "extension");
const dist = join(extRoot, "dist");

const watch = process.argv.includes("--watch");

mkdirSync(dist, { recursive: true });

const common = {
  bundle: true,
  platform: "browser",
  target: "chrome120",
  format: "iife",
  sourcemap: true,
  logLevel: "info",
};

function copyStatics() {
  cpSync(join(extRoot, "styles"), join(dist, "styles"), { recursive: true });
  copyFileSync(join(extRoot, "options.html"), join(dist, "options.html"));
  copyFileSync(join(extRoot, "manifest.json"), join(dist, "manifest.json"));
}

async function run() {
  const ctx = await esbuild.context({
    ...common,
    entryPoints: {
      background: join(extRoot, "src", "background.ts"),
      content: join(extRoot, "src", "content.ts"),
      options: join(extRoot, "src", "options.ts"),
    },
    outdir: dist,
  });

  if (watch) {
    copyStatics();
    await ctx.watch();
  } else {
    await ctx.rebuild();
    await ctx.dispose();
    copyStatics();
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
