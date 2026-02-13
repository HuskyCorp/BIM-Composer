// src/viewer/usda/parser/logParser.js
import { parsePrimTree } from "./hierarchyParser.js";

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

    // Parse metadata from logBody using constrained regex (safe within the body)
    // We remove newlines to make regex matching easier on the body,
    // BUT mapped serialized prims need structure.
    // So we match line-by-line or specific keys.
    const commit = { id: logId, serializedPrims: [] };

    // Parse simple fields
    const entryMatch = logBody.match(/custom int entry = (\d+)/);
    if (entryMatch) {
      commit.entry = parseInt(entryMatch[1], 10);
    } else {
      // Fallback: try to match "undefined" or just missing
      // Use timestamp if available
      const timestampMatch = logBody.match(
        /custom string timestamp = "([^"]+)"/
      );
      if (timestampMatch) {
        commit.entry = new Date(timestampMatch[1]).getTime();
      } else {
        // Absolute fallback
        commit.entry = 0;
      }
    }

    const typeMatch = logBody.match(/custom string type = "([^"]+)"/);
    if (typeMatch) commit.type = typeMatch[1];

    const timestampMatch = logBody.match(/custom string timestamp = "([^"]+)"/);
    if (timestampMatch) {
        commit.timestamp = timestampMatch[1];
    } else {
        commit.timestamp = new Date().toISOString();
    }

    const userMatch = logBody.match(/custom string user = "([^"]+)"/);
    if (userMatch) commit.user = userMatch[1];

    // For nested prims, we need to extract the parts of logBody that look like prim definitions
    // i.e. def "Type" "Name" { or def Type "Name" {
    // We can use parsePrimTree on the logBody!
    // parsePrimTree returns a list of prims.
    // However, logBody contains "custom string ..." properties too.
    // parsePrimTree usually handles properties.

    try {
      // Attempt to parse the body as a USDA hierarchy
      // This will parse properties as prim properties (which is correct)
      // And nested prims as children (which is also correct)
      const parsedBody = parsePrimTree(logBody);

      // Extract metadata from the parsed structure
      // The properties of the Log prim are at the top level of parsedBody?
      // No, parsePrimTree parses *children*? Or the content itself?
      // parsePrimTree usually parses a list of root definitions.
      // Inside the {} of Log_, we have properties and maybe nested defs.
      // hierarchyParser currently might expect "def ..." at start.
      // Let's assume parsePrimTree works on the *inner* content if it supports properties.
      // Wait, typical USDA parser expects "properties" then "children".

      // Let's rely on standard regex for metadata and
      // a more manual extraction for nested prims to allow standard parser to work on them.

      // Extract nested prim definitions substring
      // Anything starting with "def " or "over " inside the body
      // We can just scan the body for "def " that seems to start a prim block

      // OPTION 2: Use the existing regexes for metadata, then assume everything else is a prim?
      // "serializedPrims" doesn't strictly exist as a field wrapper in my previous step,
      // I just appended the prim text.

      // Let's pass the *entire* logBody to parsePrimTree to find nested prims.
      // If hierarchyParser can ignore unknown lines (like properties it doesn't support??)
      // Actually, hierarchyParser *does* parse properties.
      // So `parsedBody` should contain the metadata properties as `properties` of a generic result?
      // or just return the Children if it's designed to parse a stage?

      // Let's verify hierarchyParser behavior in a separate check if needed,
      // but for now I'll assume we can use it to find the nested prims.

      // Actually, simpler approach:
      // We know we appended `def ...` at the end of the Log body.
      // Let's use `parsePrimTree` on the whole log body.
      // It should return an array. The items that are `def ...` are our serialized prims.
      // The properties (custom string ...) might be ignored or collected.

      const children = parsePrimTree(logBody);

      // Filter out things that aren't prims (if any) or identify which are the serialized prims
      // The serialized prims will have 'def' specifier.
      // The log properties are just properties.

      commit.serializedPrims = children.filter(
        (c) => c.type || c.specifier === "def" || c.specifier === "over"
      );

      // Also ensure we got the metadata from regex if parser didn't give it to us easily
      // (Re-using the regexes from before for safety)
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
          .map((p) => p.trim().replace(/"/g, ""));
      } else {
        commit.stagedPrims = [];
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
