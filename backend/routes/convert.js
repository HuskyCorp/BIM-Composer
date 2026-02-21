import express from "express";
import fs from "fs/promises";
import { createReadStream } from "fs";
import path from "path";
import { upload } from "../middleware/upload.js";
import { convertIFC } from "../services/pythonRunner.js";

const router = express.Router();

// In-memory store: downloadId → { usdPath, usdaFilename }
// Entries are removed after the client downloads or after 5 minutes.
const pendingResults = new Map();

// ── GET /api/convert/result/:id ─────────────────────────────────────────────
// Streams the converted USDA file as plain text — no JSON encoding.
// This avoids the browser main-thread freeze caused by JSON.parse on a 24MB payload.
router.get("/result/:id", async (req, res) => {
  const entry = pendingResults.get(req.params.id);
  if (!entry) {
    return res
      .status(404)
      .json({ error: "Result not found or already downloaded" });
  }

  const { usdPath, usdaFilename, cleanupIfc } = entry;

  try {
    // Check the file exists before streaming
    await fs.stat(usdPath);
  } catch {
    pendingResults.delete(req.params.id);
    return res.status(404).json({ error: "USDA file not found on server" });
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${usdaFilename}"`
  );

  const stream = createReadStream(usdPath, { encoding: "utf8" });
  stream.pipe(res);

  stream.on("end", async () => {
    pendingResults.delete(req.params.id);
    await cleanupFile(usdPath);
    if (cleanupIfc) await cleanupFile(cleanupIfc);
  });

  stream.on("error", async (err) => {
    console.error("Stream error:", err);
    pendingResults.delete(req.params.id);
    await cleanupFile(usdPath);
    if (cleanupIfc) await cleanupFile(cleanupIfc);
    if (!res.headersSent) res.status(500).end();
  });
});

// ── POST /api/convert ────────────────────────────────────────────────────────
router.post("/", upload.single("ifcFile"), async (req, res) => {
  const ifcPath = req.file.path;
  const usdPath = ifcPath.replace(".ifc", ".usda");

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  try {
    // Progress callback sends SSE events
    const sendProgress = (percentage, message) => {
      res.write(`data: ${JSON.stringify({ percentage, message })}\n\n`);
    };

    // Run Python conversion
    await convertIFC(ifcPath, usdPath, sendProgress);

    // Generate a unique download ID
    const downloadId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const usdaFilename = path.basename(req.file.originalname, ".ifc") + ".usda";

    // Store reference — client will fetch separately
    pendingResults.set(downloadId, {
      usdPath,
      usdaFilename,
      cleanupIfc: ifcPath,
    });

    // Auto-expire after 5 minutes if client never fetches
    setTimeout(
      async () => {
        if (pendingResults.has(downloadId)) {
          pendingResults.delete(downloadId);
          await cleanupFile(usdPath);
          await cleanupFile(ifcPath);
        }
      },
      5 * 60 * 1000
    );

    // Send complete event — NO file content embedded in JSON
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        filename: usdaFilename,
        downloadId,
      })}\n\n`
    );

    res.end();
  } catch (error) {
    console.error("Conversion error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error.message,
      })}\n\n`
    );
    res.end();

    await cleanupFile(ifcPath);
    await cleanupFile(usdPath);
  }
});

// ── helpers ──────────────────────────────────────────────────────────────────
async function cleanupFile(filePath) {
  if (!filePath) return;
  try {
    const exists = await fs
      .stat(filePath)
      .then(() => true)
      .catch(() => false);
    if (exists) await fs.unlink(filePath);
  } catch (err) {
    console.error(`Cleanup error for ${filePath}:`, err);
  }
}

export default router;
