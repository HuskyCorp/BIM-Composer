import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.join(__dirname, "../python/ifctousdconverter.py");

export async function convertIFC(inputPath, outputPath, progressCallback) {
  return new Promise((resolve, reject) => {
    // Construct the path to the local virtual environment created in nixpacks.toml
    const venvPath = path.join(__dirname, "../python/venv/bin/python");

    // Determine which Python interpreter to use
    let pythonCmd = process.env.PYTHON_CMD;
    if (!pythonCmd) {
      // Prioritize the local virtual environment, fall back to system python3 if not found
      pythonCmd = existsSync(venvPath) ? venvPath : "python3";
    }

    console.log(`[PythonRunner] Using interpreter: ${pythonCmd}`);

    // Spawn Python process
    const python = spawn(pythonCmd, [PYTHON_SCRIPT, inputPath, outputPath]);

    let errorOutput = "";

    // Handle stdout (progress updates and success messages)
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
          // Non-JSON output (regular print statements for debugging)
          console.log("[Python]:", line);
        }
      }
    });

    // Handle stderr (capture error traceback)
    python.stderr.on("data", (data) => {
      errorOutput += data.toString();
      console.error("[Python Error]:", data.toString());
    });

    // Handle process exit
    python.on("close", (code) => {
      if (code !== 0) {
        reject(
          new Error(`Python process exited with code ${code}: ${errorOutput}`)
        );
      }
    });
  });
}
