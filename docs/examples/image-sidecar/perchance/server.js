#!/usr/bin/env node
/**
 * Marinara Custom HTTP sidecar for Perchance marinara-t2i-host.
 *
 * Uses Playwright to open the published generator and call marinara.bridge.generate()
 * on-page (same path as the host UI's local Generate button). See README.md.
 */

import { createServer } from "node:http";
import { closeBrowser, generatePerchanceImage } from "./perchance-driver.js";

const PORT = Number(process.env.PORT ?? 3456);
const HOST = process.env.HOST ?? "127.0.0.1";

/** @type {Promise<void>} */
let queueTail = Promise.resolve();

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 4 * 1024 * 1024) {
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

function enqueue(task) {
  const run = queueTail.then(task, task);
  queueTail = run.catch(() => {});
  return run;
}

function sendJson(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/health") {
    sendJson(res, 200, { ok: true, service: "marinara-perchance-image-sidecar" });
    return;
  }

  if (req.method !== "POST" || req.url !== "/generate") {
    sendJson(res, 404, { error: "Not found" });
    return;
  }

  enqueue(async () => {
    try {
      const payload = await readJsonBody(req);
      const prompt = typeof payload.prompt === "string" ? payload.prompt : "";
      process.stdout.write(`[perchance-sidecar] generate ${JSON.stringify(prompt.slice(0, 80))}\n`);

      const image = await generatePerchanceImage(payload);
      sendJson(res, 200, { base64: image.base64, mimeType: image.mimeType });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      process.stderr.write(`[perchance-sidecar] error: ${message}\n`);
      sendJson(res, 502, { error: message });
    }
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Perchance image sidecar listening on http://${HOST}:${PORT}/generate\n`);
});

async function shutdown() {
  server.close();
  await closeBrowser();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
