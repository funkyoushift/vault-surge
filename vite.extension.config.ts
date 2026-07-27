import react from "@vitejs/plugin-react";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";

const projectRoot = process.cwd();
const extensionRoot = resolve(projectRoot, "extension");
const certificatePath = resolve(projectRoot, ".certs/localhost.pem");
const certificateKeyPath = resolve(projectRoot, ".certs/localhost-key.pem");
const hasCertificate =
  existsSync(certificatePath) && existsSync(certificateKeyPath);

export default defineConfig({
  root: extensionRoot,
  base: "./",
  envDir: projectRoot,
  publicDir: resolve(extensionRoot, "public"),
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  server: {
    port: 8081,
    strictPort: true,
    https: hasCertificate
      ? {
          cert: readFileSync(certificatePath),
          key: readFileSync(certificateKeyPath),
        }
      : undefined,
    fs: { allow: [projectRoot] },
  },
  build: {
    outDir: resolve(projectRoot, "extension-dist"),
    emptyOutDir: true,
    cssCodeSplit: false,
    lib: {
      entry: resolve(extensionRoot, "viewer-main.tsx"),
      name: "VaultSurgeViewer",
      formats: ["iife"],
      fileName: () => "viewer.js",
      cssFileName: "extension",
    },
  },
});
