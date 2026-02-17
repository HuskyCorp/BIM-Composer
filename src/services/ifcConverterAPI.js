/**
 * IFC to USD Conversion API Client
 * Communicates with backend server for Python-based conversion
 */

export class IFCConverterAPI {
  constructor(baseURL = "/api/convert") {
    this.baseURL = baseURL;
  }

  /**
   * Convert IFC file to USD using backend Python service
   * @param {File} ifcFile - IFC file from input
   * @param {Function} progressCallback - (percentage, message) => void
   * @returns {Promise<string>} - USD file content
   */
  async convert(ifcFile, progressCallback) {
    return new Promise((resolve, reject) => {
      const formData = new FormData();
      formData.append("ifcFile", ifcFile);

      // Use fetch with streaming to handle Server-Sent Events
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

          // Read the stream
          const processStream = ({ done, value }) => {
            if (done) {
              return;
            }

            // Decode the chunk and add to buffer
            buffer += decoder.decode(value, { stream: true });

            // Process complete SSE messages
            const lines = buffer.split("\n\n");
            buffer = lines.pop(); // Keep incomplete message in buffer

            for (const line of lines) {
              if (line.startsWith("data: ")) {
                try {
                  const data = JSON.parse(line.substring(6));

                  if (data.type === "complete") {
                    resolve(data.content);
                    return;
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

            // Continue reading
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
