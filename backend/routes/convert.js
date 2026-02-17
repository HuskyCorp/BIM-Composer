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

    // Clean up temp files
    await fs.unlink(ifcPath);
    await fs.unlink(usdPath);
  } catch (error) {
    console.error("Conversion error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        message: error.message,
      })}\n\n`
    );
    res.end();

    // Clean up on error
    try {
      await fs.unlink(ifcPath);
      await fs.unlink(usdPath);
    } catch (cleanupError) {
      console.error("Cleanup error:", cleanupError);
    }
  }
});

export default router;
