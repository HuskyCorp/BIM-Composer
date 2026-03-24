// src/viewer/usda/parser/logParser.js

/**
 * Parses the Statement.usda file to extract commit history and serialized prims.
 * Uses a brace-counting approach to handle nested structures correctly.
 */
export function parseStatementLog(statementContent) {
  console.log("[LOG_PARSER] Parsing statement log...");
  console.log("[LOG_PARSER] Content length:", statementContent?.length || 0);

  const commits = new Map();
  const roots = [];

  if (!statementContent) return { commits, roots };

  let currentIndex = 0;

  // Helper to find the next "def" keyword starting a Log entry
  function findNextLogEntry() {
    const logDefRegex = /def "Log_([^"]+)"\s*\{/g;
    logDefRegex.lastIndex = currentIndex;
    const match = logDefRegex.exec(statementContent);
    return match;
  }

  // Helper to find the matching closing brace, ignoring braces in strings
  function findClosingBrace(startIndex) {
    let depth = 0;
    let inString = false;

    for (let i = startIndex; i < statementContent.length; i++) {
      const char = statementContent[i];

      if (char === '"' && statementContent[i - 1] !== "\\") {
        inString = !inString;
      }

      if (!inString) {
        if (char === "{") depth++;
        else if (char === "}") {
          depth--;
          if (depth === 0) return i;
        }
      }
    }
    return -1;
  }

  while (currentIndex < statementContent.length) {
    const match = findNextLogEntry();
    if (!match) break;

    const logId = match[1];
    const openBraceIndex = match.index + match[0].length - 1; // index of '{'
    const closeBraceIndex = findClosingBrace(openBraceIndex);

    if (closeBraceIndex === -1) {
      console.error(
        `[LOG_PARSER] Malformed log entry for ${logId}: Missing closing brace`
      );
      break;
    }

    // Extract the full content inside the Log entry
    const logBody = statementContent.substring(
      openBraceIndex + 1,
      closeBraceIndex
    );

    const commit = { id: logId };

    // Parse metadata fields using regex
    const entryMatch = logBody.match(/custom int entry = (\d+)/);
    if (entryMatch) {
      commit.entry = parseInt(entryMatch[1], 10);
    } else {
      const tsMatch = logBody.match(/custom string timestamp = "([^"]+)"/);
      commit.entry = tsMatch ? new Date(tsMatch[1]).getTime() : 0;
    }

    const typeMatch = logBody.match(/custom string type = "([^"]+)"/);
    if (typeMatch) commit.type = typeMatch[1];

    const timestampMatch = logBody.match(/custom string timestamp = "([^"]+)"/);
    commit.timestamp = timestampMatch
      ? timestampMatch[1]
      : new Date().toISOString();

    const userMatch = logBody.match(/custom string user = "([^"]+)"/);
    if (userMatch) commit.user = userMatch[1];

    const commitMessageMatch = logBody.match(
      /custom string commitMessage = "([^"]*)"/
    );
    if (commitMessageMatch) commit.commitMessage = commitMessageMatch[1];

    try {
      const branchMatch = logBody.match(/custom string branch = "([^"]+)"/);
      if (branchMatch) commit.branch = branchMatch[1];

      const parentMatch = logBody.match(/custom string parent = "([^"]+)"/);
      if (parentMatch) commit.parent = parentMatch[1];

      const sourceStatusMatch = logBody.match(
        /custom string sourceStatus = "([^"]+)"/
      );
      if (sourceStatusMatch) commit.sourceStatus = sourceStatusMatch[1];

      const stagedPrimsMatch = logBody.match(
        /custom string\[] stagedPrims = \[([^\]]*)\]/
      );
      if (stagedPrimsMatch) {
        commit.stagedPrims = stagedPrimsMatch[1]
          .split(",")
          .map((p) => p.trim().replace(/"/g, ""))
          .filter(Boolean);
      } else {
        commit.stagedPrims = [];
      }

      // Phase D: parse diff arrays
      const parseArray = (regex) => {
        const m = logBody.match(regex);
        if (!m || !m[1].trim()) return [];
        return m[1]
          .split(",")
          .map((p) => p.trim().replace(/"/g, ""))
          .filter(Boolean);
      };
      commit.addedPrims = parseArray(
        /custom string\[] addedPrims = \[([^\]]*)\]/
      );
      commit.removedPrims = parseArray(
        /custom string\[] removedPrims = \[([^\]]*)\]/
      );
      commit.modifiedPrims = parseArray(
        /custom string\[] modifiedPrims = \[([^\]]*)\]/
      );

      // Extract oldPath and newPath for rename operations
      if (commit.type === "Rename") {
        const oldPathMatch = logBody.match(/custom string oldPath = "([^"]+)"/);
        const newPathMatch = logBody.match(/custom string newPath = "([^"]+)"/);

        if (oldPathMatch) commit.oldPath = oldPathMatch[1];
        if (newPathMatch) commit.newPath = newPathMatch[1];

        // Fallback for legacy entries: reconstruct from oldName/newName
        if (!commit.oldPath || !commit.newPath) {
          const oldNameMatch = logBody.match(
            /custom string oldName = "([^"]+)"/
          );
          const newNameMatch = logBody.match(
            /custom string newName = "([^"]+)"/
          );

          if (oldNameMatch && commit["USD Reference Path"]) {
            commit.oldPath = commit["USD Reference Path"];
          }
          if (newNameMatch && commit.oldPath) {
            const parts = commit.oldPath.split("/");
            parts[parts.length - 1] = newNameMatch[1];
            commit.newPath = parts.join("/");
          }
        }
      }
    } catch (e) {
      console.warn(`[LOG_PARSER] Error parsing body of log ${logId}:`, e);
    }

    commits.set(logId, commit);
    currentIndex = closeBraceIndex + 1;
  }

  console.log(`[LOG_PARSER] Total matches found: ${commits.size}`);

  commits.forEach((commit, id) => {
    if (!commit.parent || !commits.has(commit.parent)) {
      roots.push(id);
    }
  });

  return { commits, roots };
}
