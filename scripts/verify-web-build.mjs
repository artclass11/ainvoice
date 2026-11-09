import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = path.resolve("dist");

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(absolute));
    else if (entry.isFile()) results.push(absolute);
  }
  return results;
}

function fail(message) {
  console.error("PWA verification failed: " + message);
  process.exitCode = 1;
}

const rootStat = await stat(root).catch(() => undefined);
if (!rootStat?.isDirectory()) {
  fail("dist/ was not created by the production build.");
  process.exit(1);
}

const files = await walk(root);
const relative = file => path.relative(root, file).split(path.sep).join("/");
const htmlPath = path.join(root, "index.html");
const manifestPath = files.find(file => path.basename(file) === "manifest.webmanifest");
const serviceWorkerPath = files.find(file => path.basename(file) === "sw.js");
const jsFiles = files.filter(file => file.endsWith(".js") && !file.endsWith("sw.js"));
const cssFiles = files.filter(file => file.endsWith(".css"));

for (const [condition, message] of [
  [files.includes(htmlPath), "index.html is missing."],
  [Boolean(manifestPath), "manifest.webmanifest is missing."],
  [Boolean(serviceWorkerPath), "service worker sw.js is missing."],
  [jsFiles.length > 0, "No production JavaScript bundle was emitted."],
  [cssFiles.length > 0, "No production CSS bundle was emitted."]
]) {
  if (!condition) fail(message);
}

if (process.exitCode) process.exit(1);

const html = await readFile(htmlPath, "utf8");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (!html.includes("manifest.webmanifest")) fail("index.html does not link the web app manifest.");
if (!/name=["']viewport["']/.test(html)) fail("index.html has no viewport meta tag.");
if (manifest.name !== "AInvoice" || manifest.short_name !== "AInvoice") {
  fail("The PWA manifest name is not AInvoice.");
}
if (manifest.display !== "standalone") fail("The PWA display mode is not standalone.");
if (manifest.start_url !== "/" || manifest.scope !== "/") {
  fail("The root-path PWA start_url and scope must both be '/'.");
}
if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
  fail("The PWA manifest has no icons.");
}

for (const icon of manifest.icons ?? []) {
  const iconPath = path.resolve(root, icon.src.replace(/^\//, ""));
  if (!iconPath.startsWith(root + path.sep) || !files.includes(iconPath)) {
    fail("A manifest icon is missing or escapes the build directory: " + icon.src);
  }
}

if (process.exitCode) process.exit(1);

console.log("PWA artifact verification passed.");
console.log("Manifest: " + relative(manifestPath));
console.log("Service worker: " + relative(serviceWorkerPath));
console.log("JavaScript bundles: " + jsFiles.length);
console.log("CSS bundles: " + cssFiles.length);
