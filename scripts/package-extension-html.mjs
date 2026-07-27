import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const projectRoot = resolve(import.meta.dirname, "..");
const sourceRoot = resolve(projectRoot, "extension");
const outputRoot = resolve(projectRoot, "extension-dist");

await mkdir(outputRoot, { recursive: true });

const viewerTemplate = await readFile(resolve(sourceRoot, "viewer.html"), "utf8");
const viewerHtml = viewerTemplate.replace(
  '<script type="module" src="./viewer-main.tsx"></script>',
  '<script src="./viewer.js"></script>',
);
if (viewerHtml === viewerTemplate) {
  throw new Error("Viewer entry script was not found in the HTML template.");
}

await writeFile(resolve(outputRoot, "viewer.html"), viewerHtml, "utf8");
await copyFile(resolve(sourceRoot, "config.html"), resolve(outputRoot, "config.html"));
