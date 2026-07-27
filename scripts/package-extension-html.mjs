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

const liveHtml = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vault Surge Live</title>
    <script src="https://extension-files.twitch.tv/helper/v1/twitch-ext.min.js"></script>
    <link rel="stylesheet" href="./extension.css" />
  </head>
  <body>
    <main class="setup">
      <span class="eyebrow">LIVE CONTROL</span>
      <h1>Use the Vault Surge app.</h1>
      <p>Live commands and game connection are managed in the installed Windows app.</p>
    </main>
  </body>
</html>
`;

const viewerBundle = await readFile(resolve(outputRoot, "viewer.js"), "utf8");
if (viewerBundle.includes("process.env")) {
  throw new Error("The Twitch viewer bundle still contains process.env references.");
}
if (viewerBundle.includes("https://localhost:3000")) {
  throw new Error("The Twitch viewer bundle still points at localhost.");
}

await writeFile(resolve(outputRoot, "viewer.html"), viewerHtml, "utf8");
await writeFile(resolve(outputRoot, "mobile.html"), viewerHtml.replace(
  'data-surface="component"',
  'data-surface="mobile"',
), "utf8");
await writeFile(resolve(outputRoot, "live.html"), liveHtml, "utf8");
await copyFile(resolve(sourceRoot, "config.html"), resolve(outputRoot, "config.html"));
