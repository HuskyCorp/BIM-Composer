import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import convertRouter from "./routes/convert.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
  console.log("📁 Created uploads directory at:", uploadDir);
}

app.use(
  cors({
    origin: [
      "http://localhost:3000",
      "http://localhost:5173",
      "https://huskycorp.github.io",
    ],
    credentials: true,
  })
);

app.use(express.json());

app.get("/", (req, res) => {
  res.send("BIM Composer Backend is running!");
});

app.use("/api/convert", convertRouter);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "ifc-converter-backend" });
});

// Global Error Handler to catch and log errors (like missing directories)
app.use((err, req, res, next) => {
  console.error("💥 Backend Error:", err.stack);
  res.status(500).json({
    error: "Internal Server Error",
    message: err.message,
  });
});

app.listen(PORT, () => {
  console.log(`🚀 IFC Converter Backend running on http://localhost:${PORT}`);
  console.log(`📝 API endpoint: http://localhost:${PORT}/api/convert`);
});
