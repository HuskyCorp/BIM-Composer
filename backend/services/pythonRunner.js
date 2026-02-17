import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PYTHON_SCRIPT = path.join(__dirname, "../python/ifctousdconverter.py");

export async function convertIFC(inputPath, outputPath, progressCallback) {
  return new Promise((resolve, reject) => {
    // Spawn Python process
    const pythonCmd = process.env.PYTHON_CMD || "python3";
    const python = spawn(pythonCmd, [PYTHON_SCRIPT, inputPath, outputPath]);

    let errorOutput = "";

    // Handle stdout (progress updates)
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
          // Non-JSON output (regular print statements)
          console.log("[Python]:", line);
        }
      }
    });

    // Handle stderr (errors)
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
