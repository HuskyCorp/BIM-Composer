/**
 * IFC to USD Conversion API Client
 * Communicates with backend server for Python-based conversion.
 *
 * Two-step flow to avoid freezing the browser main thread:
 *  1. POST /api/convert (SSE) — streams progress, ends with {type:"complete", downloadId, filename}
 *  2. GET  /api/convert/result/:id — streams the raw USDA text (no JSON encoding)
 *
 * JSON.stringify/parse of a 24 MB string adds ~50 MB of encoding overhead
 * and blocks the JS main thread for several seconds.  By using a plain-text
 * streaming download instead, the browser's C++ I/O layer handles the bytes
 * and there is no main-thread freeze.
 */

import { API_ENDPOINTS, API_BASE_URL } from "../config/api.js";

export class IFCConverterAPI {
  constructor(baseURL = API_ENDPOINTS.convert) {
    this.baseURL = baseURL;
  }

  /**
   * Convert IFC file to USD using backend Python service.
   * @param {File} ifcFile - IFC file from input
   * @param {Function} progressCallback - (percentage, message) => void
   * @returns {Promise<string>} - USD file content as plain text
   */
  async convert(ifcFile, progressCallback) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("ifcFile", ifcFile);

      fetch(this.baseURL, {
        method: "POST",
        body: formData,
      })
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          const processStream = ({ done, value }) => {
            if (done) return;

            buffer += decoder.decode(value, { stream: true });

            const lines = buffer.split("\n\n");
            buffer = lines.pop(); // Keep incomplete message in buffer

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.substring(6));

                  if (data.type === "complete") {
                    // ── Step 2: download the USDA as plain text ─────────────
                    // The server no longer embeds the content in JSON to avoid
                    // the JSON.stringify (server) + JSON.parse (browser) cost
                    // on a ~24 MB payload.
                    const downloadURL = `${API_BASE_URL}/api/convert/result/${data.downloadId}`;
                    console.log(
                      `[IFC→USD] ✅ SSE complete. Fetching USDA from ${downloadURL}`
                    );
                    console.time("[IFC→USD] plain-text download");

                    fetch(downloadURL)
                      .then((dlRes) => {
                        if (!dlRes.ok)
                          throw new Error(`Download failed: ${dlRes.status}`);
                        console.timeEnd("[IFC→USD] plain-text download");
                        console.time("[IFC→USD] response.text()");
                        return dlRes.text();
                      })
                      .then((usdContent) => {
                        console.timeEnd("[IFC→USD] response.text()");
                        console.log(
                          `[IFC→USD] 📄 USDA received: ${Math.round(usdContent.length / 1024)} KB`
                        );
                        resolve(usdContent);
                      })
                      .catch(reject);

                    return; // Done processing SSE stream
                  } else if (data.type === "error") {
                    reject(new Error(data.message));
                    return;
                  } else if (data.percentage !== undefined) {
                    progressCallback?.(data.percentage, data.message);
                  }
                } catch (e) {
                  console.error("Failed to parse SSE data:", e);
                }
              }
            }

            return reader.read().then(processStream);
          };

          return reader.read().then(processStream);
        })
        .catch((error) => {
          reject(new Error(`Upload failed: ${error.message}`));
        });
    });
  }
}

export const ifcConverterAPI = new IFCConverterAPI();
