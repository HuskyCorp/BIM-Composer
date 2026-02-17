import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import convertRouter from "./routes/convert.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

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
app.listen(PORT, () => {
  console.log(`🚀 IFC Converter Backend running on http://localhost:${PORT}`);
  console.log(`📝 API endpoint: http://localhost:${PORT}/api/convert`);
});
