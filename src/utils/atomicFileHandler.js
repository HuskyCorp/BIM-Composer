// src/utils/atomicFileHandler.js
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";

export function explodeUsda(fileContent, originalFileName) {
  const hierarchy = USDA_PARSER.getPrimHierarchy(fileContent);
  const atomicFiles = {};

  if (!hierarchy || hierarchy.length === 0) {
    console.warn(
      `No hierarchy found in ${originalFileName}, loading as single file.`
    );
    atomicFiles[originalFileName] = fileContent;
    return atomicFiles;
  }

  const cleanName = originalFileName.replace(/\.(usda|usd)$/i, "");

  // --- INTELLIGENT UNWRAPPING ---
  // If the file contains only ONE top-level prim (e.g., "IFCModel" or "World"),
  // we likely want to explode its CHILDREN, not the container itself.
  let primsToExplode = hierarchy;
  const parentWrapper = null; // To preserve the hierarchy structure

  if (
    hierarchy.length === 1 &&
    hierarchy[0].children &&
    hierarchy[0].children.length > 0
  ) {
    console.log(
      `Single root detected (${hierarchy[0].name}), exploding children...`
    );
    // parentWrapper = hierarchy[0]; // DISABLE parentWrapper context to avoid filename pollution
    primsToExplode = hierarchy[0].children;
  }
  // ------------------------------

  primsToExplode.forEach((prim) => {
    // Generate filename: Barsa_Window23.usda (No IFCModel prefix)
    const prefix = parentWrapper
      ? `${cleanName}_${parentWrapper.name}`
      : cleanName;
    const fileName = `${prefix}_${prim.name}.usda`;

    // If we unwrapped a parent, we must wrap the child in an 'over'
    // to ensure it loads back into the correct place in the hierarchy.
    let contentBody = prim.rawText;

    // Logic: If the exploded prim is a Mesh, we MUST wrap it in an Xform
    // and rename the Mesh to avoid naming collisions/bad structure.
    if (prim.type === "Mesh" || parentWrapper) {
      // Modify the inner definition to add "Mesh_" prefix
      // e.g., def Mesh "IfcBuildingElement..." -> def Mesh "Mesh_IfcBuildingElement..."
      const typeMatch = prim.rawText.match(
        /(def|over|class)\s+(\w+)\s+"([^"]+)"/
      );
      let modifiedRawText = prim.rawText;

      if (typeMatch) {
        const specifier = typeMatch[1];
        const type = typeMatch[2];
        // Use the actual matched string for replacement to handle variable whitespace
        modifiedRawText = prim.rawText.replace(
          typeMatch[0],
          `${specifier} ${type} "Mesh_${prim.name}"`
        );
      }

      // Wrap in an Xform with the original prim name
      contentBody = `
def Xform "${prim.name}"
{
    ${modifiedRawText}
}
`;
    }

    const atomicContent = `#usda 1.0
(
    defaultPrim = "${prim.name}"
    upAxis = "Z"
)

${contentBody}
`;

    atomicFiles[fileName] = atomicContent;
  });

  return atomicFiles;
}

/**
 * Validates USDA file syntax for common issues that would fail usdchecker
 * @param {string} fileContent - USDA file content to validate
 * @returns {object} - { valid: boolean, errors: string[], warnings: string[] }
 */
export function validateUsdaSyntax(fileContent) {
  const errors = [];
  const warnings = [];

  // 1. Check brace balance
  const openBraces = (fileContent.match(/{/g) || []).length;
  const closeBraces = (fileContent.match(/}/g) || []).length;
  if (openBraces !== closeBraces) {
    errors.push(
      `Brace mismatch: ${openBraces} opening '{' vs ${closeBraces} closing '}'`
    );
  }

  // 2. Check for duplicate headers
  const headerMatches = fileContent.match(/#usda\s+[\d.]+/g) || [];
  if (headerMatches.length === 0) {
    errors.push("Missing USD header (#usda 1.0)");
  } else if (headerMatches.length > 1) {
    errors.push(
      `Multiple USD headers found: ${headerMatches.length}. Only one header should exist at the top of the file.`
    );
  }

  // 3. Check header position (should be at the very beginning)
  const firstHeaderIndex = fileContent.indexOf("#usda");
  if (firstHeaderIndex > 0) {
    const beforeHeader = fileContent.substring(0, firstHeaderIndex).trim();
    if (beforeHeader.length > 0 && !beforeHeader.startsWith("# File:")) {
      warnings.push(
        "USD header should be at the beginning of the file (comments starting with '# File:' are acceptable)"
      );
    }
  }

  // 4. Check for non-namespaced custom attributes (outside of metadata dictionaries)
  // This is a heuristic check - we look for patterns like "custom float propertyName ="
  // but exclude lines that already have colons (namespaced)
  const customAttrRegex =
    /custom\s+(float|string|int|bool|token|double)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*=/g;
  let match;
  const nonNamespacedAttrs = [];

  // Find the end of the metadata block (first closing paren after header)
  const headerMatch = fileContent.match(/#usda\s+[\d.]+/);
  let metadataEndIndex = 0;
  if (headerMatch) {
    const afterHeader = fileContent.substring(headerMatch.index);
    const metadataCloseMatch = afterHeader.match(/^\s*\)/m);
    if (metadataCloseMatch) {
      metadataEndIndex =
        headerMatch.index +
        metadataCloseMatch.index +
        metadataCloseMatch[0].length;
    }
  }

  while ((match = customAttrRegex.exec(fileContent)) !== null) {
    const attrName = match[2];

    // Skip if attribute name contains a colon (already namespaced)
    if (attrName.includes(":")) {
      continue;
    }

    // Skip if we're in the metadata block (before metadataEndIndex)
    if (match.index < metadataEndIndex) {
      continue;
    }

    // This is a non-namespaced custom attribute in the prim definitions
    nonNamespacedAttrs.push(attrName);
  }

  if (nonNamespacedAttrs.length > 0) {
    warnings.push(
      `Found ${nonNamespacedAttrs.length} custom attributes without namespace (e.g., ${nonNamespacedAttrs.slice(0, 3).join(", ")}). Consider using namespaced attributes like "ifc:propertyName" for better USD compliance.`
    );
  }

  // 5. Check for empty file
  if (fileContent.trim().length === 0) {
    errors.push("File is empty");
  }

  // 6. Check for valid metadata block structure if present
  const headerMatch2 = fileContent.match(/#usda\s+[\d.]+/);
  if (headerMatch2) {
    // Look for metadata block starting after header
    const afterHeader = fileContent.substring(
      headerMatch2.index + headerMatch2[0].length
    );
    const openParenMatch = afterHeader.match(/^\s*\(/);

    if (openParenMatch) {
      // There is a metadata block - check for balanced parentheses
      // Find the first top-level closing paren
      let depth = 0;
      let foundClosing = false;
      const startPos = openParenMatch.index + openParenMatch[0].length;

      for (let i = startPos; i < afterHeader.length; i++) {
        if (afterHeader[i] === "(") {
          depth++;
        } else if (afterHeader[i] === ")") {
          if (depth === 0) {
            // Found the matching closing paren
            foundClosing = true;
            break;
          }
          depth--;
        }
      }

      if (!foundClosing) {
        errors.push(
          "Metadata block has unbalanced parentheses - missing closing ')'"
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
