import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.join(__dirname, "../python/ifctousdconverter.py");

export async function convertIFC(inputPath, outputPath, progressCallback) {
  return new Promise((resolve, reject) => {
    // Correctly point to the venv created in nixpacks.toml relative to this file
    const venvPath = path.join(
      __dirname,
      "..",
      "python",
      "venv",
      "bin",
      "python"
    );

    let pythonCmd = process.env.PYTHON_CMD;
    if (!pythonCmd) {
      // Prioritize the local venv; fall back to system python3 only as a last resort
      pythonCmd = existsSync(venvPath) ? venvPath : "python3";
    }

    console.log(`[PythonRunner] Executing conversion with: ${pythonCmd}`);
    const python = spawn(pythonCmd, [PYTHON_SCRIPT, inputPath, outputPath]);

    let errorOutput = "";

    python.stdout.on("data", (data) => {
      const lines = data
        .toString()
        .split("\n")
        .filter((line) => line.trim());
      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          if (parsed.type === "progress" && progressCallback) {
            progressCallback(parsed.percentage, parsed.message);
          } else if (parsed.type === "success") {
            resolve(parsed.output);
          } else if (parsed.type === "error") {
            reject(new Error(parsed.message));
          }
        } catch (e) {
          console.log("[Python]:", line);
        }
      }
    });

    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.error("[Python Error]:", data.toString());
    });

    python.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Python process exited with code ${code}: ${errorOutput}`)
        );
      }
    });
  });
}
