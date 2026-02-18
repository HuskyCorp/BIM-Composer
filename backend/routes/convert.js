import express from "express";
import fs from "fs/promises";
import path from "path";
import { upload } from "../middleware/upload.js";
import { convertIFC } from "../services/pythonRunner.js";

const router = express.Router();

router.post("/", upload.single("ifcFile"), async (req, res) => {
  const ifcPath = req.file.path;
  const usdPath = ifcPath.replace(".ifc", ".usda");

  // Set headers for Server-Sent Events (SSE)
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  // Helper function to clean up temp files safely without ENOENT errors
  const cleanupFile = async (filePath) => {
    try {
      // Only attempt to unlink if the file actually exists
      const exists = await fs
        .stat(filePath)
        .then(() => true)
        .catch(() => false);
      if (exists) {
        await fs.unlink(filePath);
      }
    } catch (err) {
      console.error(`Cleanup error for ${filePath}:`, err);
    }
  };

  try {
    // Progress callback sends SSE events
    const sendProgress = (percentage, message) => {
      res.write(`data: ${JSON.stringify({ percentage, message })}\n\n`);
    };

    // Run Python conversion
    await convertIFC(ifcPath, usdPath, sendProgress);

    // Read output USD file
    const usdContent = await fs.readFile(usdPath, "utf-8");

    // Send final result
    res.write(
      `data: ${JSON.stringify({
        type: "complete",
        content: usdContent,
        filename: path.basename(req.file.originalname, ".ifc") + ".usda",
      })}\n\n`
    );

    res.end();

    // Clean up temp files on success
    await cleanupFile(ifcPath);
    await cleanupFile(usdPath);
  } catch (error) {
    console.error("Conversion error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error.message,
      })}\n\n`
    );
    res.end();

    // Clean up temp files on error
    await cleanupFile(ifcPath);
    await cleanupFile(usdPath);
  }
});

export default router;
