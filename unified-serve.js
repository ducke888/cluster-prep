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
// The legacy Node API (server/server.js — tutor proxy + /api/profile + admin
// reset) is intentionally NOT mounted. The client is Firestore-only now, and
// that handler had an unauthenticated profile-write endpoint plus a weak
// default admin-reset token. Any stray /api/* request is rejected below.

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
  // Strict containment: abs must be ROOT itself or a child of ROOT (a sibling
  // dir whose name merely starts with ROOT must not pass).
  if (abs !== ROOT && !abs.startsWith(ROOT + path.sep)) return null;
  // Never serve server-side source, server state, build files, or VCS internals.
  const rel = abs.slice(ROOT.length + 1);
  if (rel === "unified-serve.js" || rel === "package.json" || rel === "package-lock.json" ||
      rel === "render.yaml" || rel === ".gitignore" ||
      rel.startsWith("server" + path.sep) || rel.startsWith(".git" + path.sep) ||
      rel.startsWith("scripts" + path.sep)) return null;
  return abs;
}

const server = http.createServer(async (req, res) => {
  // The legacy /api/* surface is retired (Firestore-only client). Reject it.
  if (req.url && req.url.startsWith("/api/")) {
    res.writeHead(410, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "gone" }));
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
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
      "Referrer-Policy": "strict-origin-when-cross-origin",
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
  console.log(`[unified] legacy /api surface: retired (410)`);
});
