import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const publicDirectory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const assets = new Map([
  ["/", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/index.html", { file: "index.html", type: "text/html; charset=utf-8" }],
  ["/styles.css", { file: "styles.css", type: "text/css; charset=utf-8" }],
  ["/app.js", { file: "app.js", type: "text/javascript; charset=utf-8" }],
  ["/favicon.svg", { file: "favicon.svg", type: "image/svg+xml" }],
  ["/site.webmanifest", { file: "site.webmanifest", type: "application/manifest+json" }],
]);

export async function serveStatic(pathname, method, response) {
  const asset = assets.get(pathname);
  if (!asset) return false;

  try {
    const body = await readFile(path.join(publicDirectory, asset.file));
    response.writeHead(200, {
      "Cache-Control": "no-cache",
      "Content-Length": body.length,
      "Content-Security-Policy": "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; connect-src 'self'; font-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      "Content-Type": asset.type,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(method === "HEAD" ? undefined : body);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}
