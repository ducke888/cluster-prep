// Unified server for Render/production deploys:
//   - Serves static files from project root (index.html, app.html, styles.css,
//     app.js, landing-assets/, data/, favicon.svg, icons.svg).
//   - Proxies /api/* to the existing Node tutor/leaderboard/sync handler in
//     server/server.js without modifying it (that file stays runnable
//     standalone on :3001 for local dev).
//
// Locally you'd still use `python3 -m http.server 8765` + `cd server && node server.js`.
// On Render we can't run two processes, so this file unifies them on $PORT.

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3001;
const ROOT = __dirname;

// Load the existing API handler. server.js ends with `server.listen(...)` which
// would conflict — we guard against that by setting an env flag the file can
// check; if it's missing we intercept createServer. Simpler: just require the
// module and grab the requestListener it exposes. We added `module.exports`
// support below; if absent, fall back to re-bundling logic inline.
let apiListener = null;
try {
  // Prefer an exported listener if server.js chooses to expose one
  const mod = require("./server/server.js");
  if (typeof mod === "function") apiListener = mod;
} catch (e) {
  console.warn("[unified-serve] could not load server/server.js as a module:", e.message);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".woff": "font/woff",
  ".woff2":"font/woff2",
  ".txt":  "text/plain; charset=utf-8",
};

function safePath(urlPath) {
  // Strip query/hash, decode, prevent traversal
  let p = decodeURIComponent(urlPath.split("?")[0].split("#")[0]);
  // Root serves the study tool directly (the React landing was removed).
  if (p === "/" || p === "" || p === "/index.html") p = "/app.html";
  const abs = path.normalize(path.join(ROOT, p));
  if (!abs.startsWith(ROOT)) return null;
  return abs;
}

const server = http.createServer(async (req, res) => {
  // Route /api/* to the tutor/leaderboard/sync handler
  if (req.url && req.url.startsWith("/api/")) {
    if (apiListener) return apiListener(req, res);
    res.writeHead(503, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "api not loaded" }));
  }

  // Static file
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405);
    return res.end("method not allowed");
  }
  const abs = safePath(req.url);
  if (!abs) { res.writeHead(400); return res.end("bad path"); }
  fs.stat(abs, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404); return res.end("not found");
    }
    const ext = path.extname(abs).toLowerCase();
    // HTML entry points must never be stale — otherwise the browser keeps
    // loading an old HTML file that references old ?v= cache-bust strings,
    // and all our CSS/JS updates appear to "not work" in that browser.
    // CSS/JS/images can be cached aggressively because every reference to
    // them carries a versioned query string we bump on each release.
    const isHtml = ext === ".html";
    const headers = {
      "Content-Type": MIME[ext] || "application/octet-stream",
    };
    if (isHtml) {
      headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0";
      headers["Pragma"] = "no-cache";
      headers["Expires"] = "0";
    } else {
      headers["Cache-Control"] = "public, max-age=3600";
    }
    res.writeHead(200, headers);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(abs).pipe(res);
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`[unified] ClusterPrep site + API on :${PORT}`);
  console.log(`[unified] root: ${ROOT}`);
  console.log(`[unified] api handler loaded: ${Boolean(apiListener)}`);
});
