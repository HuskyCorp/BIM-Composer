// src/viewer/usda/parser/hierarchyParser.js
import * as THREE from "three";

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

/**
 * Locate the opening `{` that begins a prim body, skipping over an optional
 * multi-line `(...)` metadata block.  Standard `[^)]*` stops at the first `)`,
 * which breaks on IFC-exported USDA where metadata contains values like
 * `color3f inputs:diffuseColor = (0.5, 0.5, 0.5)`.  This scanner handles
 * arbitrarily-deep nested parens correctly.
 *
 * Returns the index of the first `{` outside any paren group that appears
 * after `start`, or -1 if none found before a line that clearly belongs to a
 * different prim definition.
 */
function findPrimOpenBrace(str, start) {
  let parenDepth = 0;
  for (let i = start; i < str.length; i++) {
    const ch = str[i];
    if (ch === "(") {
      parenDepth++;
    } else if (ch === ")") {
      if (parenDepth > 0) parenDepth--;
    } else if (ch === "{" && parenDepth === 0) {
      return i;
    } else if (ch === "\n" && parenDepth === 0) {
      // If we hit a newline outside any paren group, check whether the next
      // non-whitespace token starts a new prim — if so, abort.
      const rest = str.slice(i + 1).match(/^\s*((def|over)\s+[A-Z]|#)/);
      if (rest && parenDepth === 0) {
        // Peek further — still OK if the `{` comes first on the next line(s)
        // (common: closing `)` + blank line + `{` on next line).
        // We only abort if we see another prim keyword before any `{`.
        const nextBrace = str.indexOf("{", i + 1);
        const nextPrimKw = str.slice(i + 1).search(/(def|over)\s+[A-Z]/);
        if (
          nextPrimKw !== -1 &&
          (nextBrace === -1 || nextPrimKw < nextBrace - (i + 1))
        ) {
          return -1;
        }
      }
    }
  }
  return -1;
}

export function parsePrimTree(usdaContent, pathPrefix = "") {
  const prims = [];
  // Match only the prim header: `def Type "Name"` — the optional `(...)` metadata
  // block and the opening `{` are located by findPrimOpenBrace so that
  // multi-line metadata containing `)` chars does not confuse the regex.
  const primRegex = /(def|over)\s+([A-Z][a-zA-Z0-9_]*)\s+"([^"]+)"/g;
  let match;

  while ((match = primRegex.exec(usdaContent)) !== null) {
    const specifier = match[1];
    const primType = match[2];
    const primName = match[3];
    const currentPath = `${pathPrefix}/${primName}`;

    // Find the true opening brace for this prim, skipping any metadata `(...)`.
    const headerEnd = match.index + match[0].length;
    const braceIdx = findPrimOpenBrace(usdaContent, headerEnd);
    if (braceIdx === -1) continue; // malformed — skip

    // Extract the metadata text between the header and `{` for reference parsing.
    const metadata = usdaContent.slice(headerEnd, braceIdx);

    const contentStart = braceIdx + 1;
    const contentEnd = findMatchingBrace(usdaContent, braceIdx);

    if (contentEnd !== -1) {
      const innerContent = usdaContent.substring(contentStart, contentEnd);

      // --- FIX: Capture full raw text for lossless slicing ---
      const fullPrimText = usdaContent.substring(match.index, contentEnd + 1);
      // -----------------------------------------------------

      const prim = {
        specifier: specifier,
        name: primName,
        type: primType,
        path: currentPath,
        children: [],
        properties: {},
        _rawContent: innerContent,
        rawText: fullPrimText, // Store the raw text
        payload: null,
        references: null, // Add references field
        startIndex: match.index,
        endIndex: contentEnd,
      };

      // --- FIX: Create clean content by masking nested braces to prevent matching children's properties ---
      let cleanContent = "";
      let depth = 0;
      for (let i = 0; i < innerContent.length; i++) {
        const char = innerContent[i];
        if (char === "{") {
          depth++;
        } else if (char === "}") {
          depth--;
        } else if (depth === 0) {
          cleanContent += char;
        }
      }

      // --- Properties Parsing (Use cleanContent) ---
      const colorMatch = cleanContent.match(
        /color3f\[]\s+primvars:displayColor\s*=\s*\[\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\s*\)\]/
      );
      if (colorMatch) {
        prim.properties.displayColor = new THREE.Color(
          parseFloat(colorMatch[1]),
          parseFloat(colorMatch[2]),
          parseFloat(colorMatch[3])
        );
      }

      const displayNameMatch = cleanContent.match(
        /custom\s+string\s+primvars:displayName\s*=\s*(["'])(.*?)\1/
      );
      if (displayNameMatch) {
        prim.properties.displayName = displayNameMatch[2];
      }

      const statusMatch = cleanContent.match(
        /custom\s+token\s+primvars:status\s*=\s*(["'])(.*?)\1/
      );
      if (statusMatch) {
        prim.properties.status = statusMatch[2];
      }

      const opacityMatch = cleanContent.match(
        /(?:custom\s+)?float\s+opacity\s*=\s*([\d.]+)/
      );
      if (opacityMatch) {
        prim.properties.opacity = opacityMatch[1];
      }

      const entityTypeMatch = cleanContent.match(
        /custom\s+string\s+primvars:entityType\s*=\s*(["'])(.*?)\1/
      );
      if (entityTypeMatch) {
        prim.properties.entityType = entityTypeMatch[2];
      }

      // --- Payloads/References Parsing ---
      // 1. Check metadata for references
      // FIX: Capture full reference including optional prim path suffix (e.g. @file.usda@</Prim>)
      const metadataRefMatch = metadata.match(
        /(?:prepend\s+)?references\s*=\s*((?:@.*?@)(?:<.*?>)?)/
      );
      if (metadataRefMatch) {
        prim.references = metadataRefMatch[1];
      }

      // 2. Check inner content for payload/references (legacy/alternate)
      const payloadMatch = cleanContent.match(
        /(?:prepend\s+)?(?:payload|references)\s*=\s*((?:@.*?@)(?:<.*?>)?)/
      );
      if (payloadMatch) {
        // If not already found in metadata
        if (!prim.references) {
          // Note: payload and reference are semantically different but often treated similarly in simple parsers
          // keeping existing behavior for payload but assigning to references if valid
          if (payloadMatch[0].includes("references")) {
            prim.references = payloadMatch[1];
          } else {
            prim.payload = payloadMatch[1];
          }
        } else if (!prim.payload && payloadMatch[0].includes("payload")) {
          prim.payload = payloadMatch[1];
        }
      }

      prim.children = parsePrimTree(innerContent, currentPath);
      prims.push(prim);

      primRegex.lastIndex = contentEnd + 1;
    }
  }
  return prims;
}
