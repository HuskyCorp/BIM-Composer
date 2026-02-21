// src/viewer/usda/usdaParser.js
import { parsePrimTree } from "./parser/hierarchyParser.js";
import { parseStatementLog } from "./parser/logParser.js";
import {
  extractGeometries,
  extractGeometriesDirect,
} from "./parser/geometryParser.js";

function findMatchingBrace(str, start) {
  let depth = 1;
  for (let i = start + 1; i < str.length; i++) {
    if (str[i] === "{") {
      depth++;
    } else if (str[i] === "}") {
      depth--;
    }
    if (depth === 0) {
      return i;
    }
  }
  return -1;
}

export const USDA_PARSER = {
  getPrimHierarchy(usdaText) {
    if (!usdaText) return [];
    return parsePrimTree(usdaText);
  },

  appendToUsdaFile(fileContent, textToAppend, rootPrimName = null) {
    if (rootPrimName) {
      // Allow optional type: (def|over) [Type] "Name" {
      const primRegex = new RegExp(
        `(def|over)(?:\\s+\\w+)?\\s+"${rootPrimName}"\\s*\\{`
      );
      const match = fileContent.match(primRegex);
      if (match) {
        const braceIndex = match.index + match[0].length;
        const endBraceIndex = findMatchingBrace(fileContent, braceIndex - 1);
        if (endBraceIndex !== -1) {
          return `${fileContent.slice(
            0,
            endBraceIndex
          )}${textToAppend}${fileContent.slice(endBraceIndex)}`;
        }
      }
    }
    // If no root prim specified, append to the end of the file (Root level)
    return fileContent + "\n" + textToAppend;
  },

  parseStatementLog(statementContent) {
    return parseStatementLog(statementContent);
  },

  parseUSDA(usdaText) {
    // Files larger than 500 KB are typically IFC-converted USD assets.
    // parsePrimTree is O(n²) on file size (recursive substring copying +
    // findMatchingBrace scanning). For a 24 MB file this causes a browser
    // freeze or silently empty geometry list.
    // Use the O(n) direct line-scanner for large files instead.
    if (usdaText && usdaText.length > 500_000) {
      const sizeKB = Math.round(usdaText.length / 1024);
      console.log(
        `[parseUSDA] Large file detected: ${sizeKB} KB → using extractGeometriesDirect`
      );
      console.time("[parseUSDA] extractGeometriesDirect total");
      const result = extractGeometriesDirect(usdaText);
      console.timeEnd("[parseUSDA] extractGeometriesDirect total");
      console.log(`[parseUSDA] Extracted ${result.length} meshes`);
      return result;
    }
    console.log(
      `[parseUSDA] Normal file (${Math.round(usdaText.length / 1024)} KB) → parsePrimTree`
    );
    console.time("[parseUSDA] parsePrimTree + extractGeometries");
    const primHierarchy = parsePrimTree(usdaText);
    const result = extractGeometries(primHierarchy);
    console.timeEnd("[parseUSDA] parsePrimTree + extractGeometries");
    console.log(`[parseUSDA] Extracted ${result.length} meshes`);
    return result;
  },
};
