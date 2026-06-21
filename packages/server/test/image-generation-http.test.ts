import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createServer } from "node:http";
import { test } from "node:test";
import { generateImage } from "../src/services/image/image-generation.js";

const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

test("Custom HTTP image sidecar returns base64 image payload", async () => {
  let port = 0;
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/generate") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { prompt?: string; width?: number; height?: number };
        assert.equal(parsed.prompt, "a cat in a hat");
        assert.equal(parsed.width, 512);
        assert.equal(parsed.height, 512);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            base64: PNG_BYTES.toString("base64"),
            mimeType: "image/png",
          }),
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addressInfo = server.address();
  assert.ok(addressInfo && typeof addressInfo === "object");
  port = addressInfo.port;

  try {
    const result = await generateImage("http", `http://127.0.0.1:${port}/generate`, "", "http", {
      prompt: "a cat in a hat",
      width: 512,
      height: 512,
    });

    assert.equal(result.mimeType, "image/png");
    assert.equal(result.ext, "png");
    assert.equal(result.base64, PNG_BYTES.toString("base64"));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("Custom HTTP image sidecar can return a fetchable image URL", async () => {
  let port = 0;
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/generate") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ url: `http://127.0.0.1:${port}/image.png` }));
      return;
    }

    if (req.method === "GET" && req.url === "/image.png") {
      res.writeHead(200, { "content-type": "image/png" });
      res.end(PNG_BYTES);
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addressInfo = server.address();
  assert.ok(addressInfo && typeof addressInfo === "object");
  port = addressInfo.port;

  try {
    const result = await generateImage("http", `http://127.0.0.1:${port}/generate`, "", "http", {
      prompt: "landscape",
    });

    assert.equal(result.mimeType, "image/png");
    assert.equal(result.ext, "png");
    assert.equal(result.base64, PNG_BYTES.toString("base64"));
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("Custom HTTP image sidecar receives optional bearer token from connection API key", async () => {
  let port = 0;
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/generate") {
      assert.equal(req.headers.authorization, "Bearer sidecar-secret");
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          base64: PNG_BYTES.toString("base64"),
          mimeType: "image/png",
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addressInfo = server.address();
  assert.ok(addressInfo && typeof addressInfo === "object");
  port = addressInfo.port;

  try {
    await generateImage("http", `http://127.0.0.1:${port}/generate`, "sidecar-secret", "http", {
      prompt: "token check",
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("Custom HTTP image sidecar rejects oversized base64 payloads", async () => {
  let port = 0;
  const oversized = Buffer.alloc(10 * 1024 * 1024 + 1, 0x89);
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/generate") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          base64: oversized.toString("base64"),
          mimeType: "image/png",
        }),
      );
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addressInfo = server.address();
  assert.ok(addressInfo && typeof addressInfo === "object");
  port = addressInfo.port;

  try {
    await assert.rejects(
      () =>
        generateImage("http", `http://127.0.0.1:${port}/generate`, "", "http", {
          prompt: "too large",
        }),
      /exceeded .* byte limit/,
    );
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});

test("Custom HTTP image sidecar forwards reference images as base64 strings", async () => {
  let port = 0;
  const referenceBase64 = PNG_BYTES.toString("base64");
  const server = createServer((req, res) => {
    if (req.method === "POST" && req.url === "/generate") {
      let body = "";
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        const parsed = JSON.parse(body) as { referenceImages?: string[] };
        assert.deepEqual(parsed.referenceImages, [referenceBase64]);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            base64: referenceBase64,
            mimeType: "image/png",
          }),
        );
      });
      return;
    }

    res.writeHead(404);
    res.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addressInfo = server.address();
  assert.ok(addressInfo && typeof addressInfo === "object");
  port = addressInfo.port;

  try {
    await generateImage("http", `http://127.0.0.1:${port}/generate`, "", "http", {
      prompt: "img2img",
      referenceImages: [referenceBase64],
    });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  }
});
