/**
 * Serves the exported site from `out/` for a local production preview.
 *
 * `next start` cannot do this: it boots the Next.js server runtime, which
 * `output: "export"` deliberately does not build. And a plain static server
 * pointed at `out/` would 404 every asset, because the export links them
 * under the GitHub Pages project sub-path. So mount `out/` at that sub-path
 * and resolve URLs the way Pages does.
 */
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { sitePath } from "../lib/site.ts";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "out");
const basePath = sitePath("");
const port = Number(process.env.PORT ?? 3000);

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".webmanifest", "application/manifest+json"],
  [".woff2", "font/woff2"],
  [".xml", "application/xml; charset=utf-8"],
]);

/** Absolute path inside `out/` for a site-relative URL path, or null if it escapes. */
function resolveInOut(urlPath) {
  const resolved = path.resolve(outDir, `.${urlPath}`);
  return resolved === outDir || resolved.startsWith(outDir + path.sep) ? resolved : null;
}

function isFile(filePath) {
  return filePath !== null && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
}

function send(req, res, status, filePath, headers = {}) {
  const type = contentTypes.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
  const body = fs.readFileSync(filePath);
  res.writeHead(status, { "content-type": type, "content-length": body.length, ...headers });
  res.end(req.method === "HEAD" ? undefined : body);
}

function sendNotFound(req, res) {
  const notFound = path.join(outDir, "404.html");
  if (isFile(notFound)) {
    send(req, res, 404, notFound);
    return;
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end(req.method === "HEAD" ? undefined : "404 Not Found\n");
}

function redirect(req, res, location) {
  res.writeHead(308, { location });
  res.end();
}

const server = http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { allow: "GET, HEAD" });
    res.end();
    return;
  }

  const { pathname } = new URL(req.url, `http://${req.headers.host ?? "localhost"}`);
  const decoded = decodeURIComponent(pathname);

  // Anything outside the sub-path is a request the deployed site never sees;
  // send it to the equivalent URL under the sub-path rather than 404ing, so
  // that visiting http://localhost:3000/ lands on the home page.
  if (decoded !== basePath && !decoded.startsWith(`${basePath}/`)) {
    redirect(req, res, `${basePath}${decoded === "/" ? "/" : decoded}`);
    return;
  }

  const urlPath = decoded.slice(basePath.length) || "/";

  // `trailingSlash: true` exports every page as `<route>/index.html`, and
  // Pages redirects the extensionless URL rather than serving it directly.
  if (!urlPath.endsWith("/") && !path.extname(urlPath)) {
    const asDirectory = resolveInOut(path.posix.join(urlPath, "index.html"));
    if (isFile(asDirectory)) {
      redirect(req, res, `${basePath}${urlPath}/`);
      return;
    }
  }

  const candidate = urlPath.endsWith("/")
    ? resolveInOut(`${urlPath}index.html`)
    : resolveInOut(urlPath);

  if (isFile(candidate)) {
    send(req, res, 200, candidate, { "cache-control": "no-store" });
    return;
  }

  sendNotFound(req, res);
});

if (!fs.existsSync(outDir)) {
  console.error("No out/ directory — run `npm run build` first.");
  process.exit(1);
}

server.listen(port, () => {
  console.log(`Serving out/ on http://localhost:${port}${basePath}/`);
});
