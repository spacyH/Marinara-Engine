#!/usr/bin/env node
/**
 * Minimal Marinara-compatible HTTP image sidecar stub.
 *
 * Replace the placeholder PNG response with Playwright automation for your
 * target web UI generator. See README.md in this folder.
 */

import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3456);
const HOST = process.env.HOST ?? "127.0.0.1";

// 1×1 PNG — enough to verify Marinara wiring end-to-end.
const PLACEHOLDER_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  if (req.method === "POST" && req.url === "/generate") {
    try {
      const payload = await readJsonBody(req);
      const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
      process.stdout.write(`[sidecar] generate prompt=${JSON.stringify(prompt.slice(0, 80))}\n`);

      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          base64: PLACEHOLDER_PNG.toString("base64"),
          mimeType: "image/png",
        }),
      );
    } catch (err) {
      res.writeHead(400, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: err instanceof Error ? err.message : "Bad request" }));
    }
    return;
  }

  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  res.writeHead(404, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Image sidecar stub listening on http://${HOST}:${PORT}/generate\n`);
});
