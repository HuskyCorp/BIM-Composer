import { USDA_PARSER } from "./usdaParser.js";

/**
 * Inserts a prim definition text into a USDA file content at the specified parent path.
 * Effectively handles creating missing 'over' hierarchy if the parent path doesn't fully exist.
 *
 * @param {string} fileContent - The original USDA file content.
 * @param {string} targetParentPath - The absolute path where the prim should be inserted (e.g. "/World/Group"). Use "" or "/" for root.
 * @param {string} primText - The full text of the prim definition to insert.
 * @returns {string} - The modified file content.
 */
/**
 * Inserts a prim into USDA file content at the specified parent path
 * Automatically creates missing intermediate "over" blocks if parent path doesn't exist
 *
 * This function:
 * 1. Finds the deepest existing node in the target parent path
 * 2. Wraps the prim text in "over" blocks for any missing intermediate paths
 * 3. Inserts the wrapped prim at the appropriate location
 *
 * @param {string} fileContent - The original USDA file content
 * @param {string} targetParentPath - Path where prim should be inserted (e.g., "/World/Characters")
 * @param {string} primText - The prim definition text to insert (e.g., 'def Xform "NewPrim" { }')
 * @returns {string} Modified USDA file content with inserted prim
 * @example
 * const newContent = insertPrimIntoFile(content, '/World/Characters', 'def Xform "Hero" { }');
 * // If /World exists but /World/Characters doesn't, creates:
 * // over "Characters" {
 * //   def Xform "Hero" { }
 * // }
 */
export function insertPrimIntoFile(fileContent, targetParentPath, primText) {
  console.log("[INSERT] Starting prim insertion");
  console.log("[INSERT] Target parent path:", targetParentPath);
  console.log("[INSERT] Prim text to insert:", primText);

  if (!targetParentPath || targetParentPath === "/") {
    // Simple append to root
    console.log("[INSERT] Inserting at root level");
    const result = fileContent + "\n" + primText;
    console.log("[INSERT] Insertion complete");
    return result;
  }

  const hierarchy = USDA_PARSER.getPrimHierarchy(fileContent);
  console.log(
    "[INSERT] Parsed hierarchy:",
    hierarchy.map((p) => p.path)
  );

  const parts = targetParentPath.split("/").filter(Boolean);
  console.log("[INSERT] Parent path parts:", parts);

  // 1. Find the deepest existing node in the path chain
  let currentNode = null;
  let siblings = hierarchy;
  let matchedDepth = 0;

  for (let i = 0; i < parts.length; i++) {
    const partName = parts[i];
    const match = siblings.find((n) => n.name === partName);
    if (match) {
      currentNode = match;
      siblings = match.children || [];
      matchedDepth++;
      console.log(
        `[INSERT] Matched part ${i}: "${partName}" at depth ${matchedDepth}`
      );
    } else {
      console.log(
        `[INSERT] No match for part ${i}: "${partName}", stopping at depth ${matchedDepth}`
      );
      break;
    }
  }

  console.log("[INSERT] Matched depth:", matchedDepth, "/", parts.length);
  console.log(
    "[INSERT] Current node:",
    currentNode ? currentNode.path : "null (root)"
  );

  // 2. Construct the insertion payload (primText wrapped in missing "over" blocks)
  // missing parts: parts[matchedDepth] ... parts[parts.length - 1]
  let wrapperStart = "";
  let wrapperEnd = "";

  for (let i = matchedDepth; i < parts.length; i++) {
    const pName = parts[i];
    wrapperStart += `over "${pName}" {\n`;
    wrapperEnd = `\n}` + wrapperEnd;
    console.log(`[INSERT] Wrapping with "over ${pName}"`);
  }

  const fullBlock = wrapperStart + primText + wrapperEnd;
  console.log("[INSERT] Full block to insert:\n", fullBlock);

  // 3. Insert into the file
  if (currentNode) {
    // Insert inside currentNode before the closing brace
    const insertionIndex = currentNode.endIndex; // This is the index of '}'
    console.log("[INSERT] Inserting inside node at index:", insertionIndex);

    const result =
      fileContent.slice(0, insertionIndex) +
      "\n" +
      fullBlock +
      "\n" +
      fileContent.slice(insertionIndex);

    console.log("[INSERT] Insertion complete inside existing node");
    return result;
  } else {
    // No matching root was found, append entirely new hierarchy to root
    console.log("[INSERT] No matching root node, appending to end of file");
    const result = fileContent + "\n" + fullBlock;
    console.log("[INSERT] Insertion complete at file end");
    return result;
  }
}

/**
 * Removes a prim definition from the USDA file content based on its path.
 *
 * @param {string} fileContent - The original USDA file content.
 * @param {string} primPath - The absolute path of the prim to remove.
 * @returns {string} - The modified file content.
 */
export function removePrimFromFile(fileContent, primPath) {
  const hierarchy = USDA_PARSER.getPrimHierarchy(fileContent);

  // Helper to find node by path
  const findNode = (nodes, path) => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNode(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const nodeToRemove = findNode(hierarchy, primPath);

  if (
    nodeToRemove &&
    typeof nodeToRemove.startIndex === "number" &&
    typeof nodeToRemove.endIndex === "number"
  ) {
    return (
      fileContent.slice(0, nodeToRemove.startIndex) +
      fileContent.slice(nodeToRemove.endIndex + 1)
    );
  }

  console.warn(`Prim not found for removal: ${primPath}`);
  return fileContent;
}

/**
 * Updates a property value in a USDA file for a specific prim.
 * If the property exists, it updates the value. If not, it inserts the property.
 *
 * @param {string} fileContent - The original USDA file content.
 * @param {string} primPath - The absolute path of the prim to update.
 * @param {string} propertyName - The name of the property (e.g., "displayName", "status").
 * @param {string} propertyValue - The new value for the property.
 * @param {string} propertyType - The USD type (e.g., "string", "token"). Default: "string".
 * @returns {string} - The modified file content.
 */
/**
 * Updates or inserts a property in a prim within USDA file content
 * Handles both regular properties (using primvars namespace) and Pset properties
 *
 * This function:
 * 1. Parses the file to find the target prim by path
 * 2. Searches for existing property definition
 * 3. Updates existing property or inserts new one if not found
 * 4. Preserves file structure and indentation
 *
 * @param {string} fileContent - The original USDA file content
 * @param {string} primPath - The absolute path of the prim to update (e.g., "/World/Character")
 * @param {string} propertyName - The property name (e.g., "displayName" or "Pset_ActionRequest:Comments")
 * @param {string} propertyValue - The new property value
 * @param {string} [propertyType="string"] - The USD property type (string, float, int, bool, etc.)
 * @returns {string} Modified USDA file content with updated property
 * @example
 * const updated = updatePropertyInFile(content, '/World/Sphere', 'displayName', 'MySphere');
 * // Updates or adds: custom string primvars:displayName = "MySphere"
 *
 * const withPset = updatePropertyInFile(content, '/Wall', 'Pset_Wall:FireRating', '2HR');
 * // Updates or adds: custom string Pset_Wall:FireRating = "2HR"
 */
export function updatePropertyInFile(
  fileContent,
  primPath,
  propertyName,
  propertyValue,
  propertyType = "string"
) {
  console.log("[UPDATE PROPERTY] Starting property update");
  console.log("[UPDATE PROPERTY] Prim path:", primPath);
  console.log("[UPDATE PROPERTY] Property:", propertyName, "=", propertyValue);

  const hierarchy = USDA_PARSER.getPrimHierarchy(fileContent);

  // Helper to find node by path
  const findNode = (nodes, path) => {
    for (const node of nodes) {
      if (node.path === path) {
        console.log("[UPDATE PROPERTY] ✓ Found prim at path:", path);
        return node;
      }
      if (node.children) {
        const found = findNode(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  // Helper to find node by name (fallback for nested structures)
  const findNodeByName = (nodes, name) => {
    for (const node of nodes) {
      if (node.name === name) {
        console.log("[UPDATE PROPERTY] ✓ Found prim by name:", name);
        return node;
      }
      if (node.children) {
        const found = findNodeByName(node.children, name);
        if (found) return found;
      }
    }
    return null;
  };

  let prim = findNode(hierarchy, primPath);

  // FALLBACK: If not found by path, try by name (for nested structures like statement.usda)
  if (
    !prim ||
    typeof prim.startIndex !== "number" ||
    typeof prim.endIndex !== "number"
  ) {
    console.warn(
      `[UPDATE PROPERTY] Prim not found by path: ${primPath}, trying by name...`
    );
    const primName = primPath.split("/").filter(Boolean).pop();
    prim = findNodeByName(hierarchy, primName);
  }

  if (
    !prim ||
    typeof prim.startIndex !== "number" ||
    typeof prim.endIndex !== "number"
  ) {
    console.warn(`[UPDATE PROPERTY] Prim not found: ${primPath}`);
    console.warn("[UPDATE PROPERTY] Available paths in hierarchy:");
    const collectPaths = (nodes, paths = []) => {
      nodes.forEach((n) => {
        paths.push(n.path);
        if (n.children) collectPaths(n.children, paths);
      });
      return paths;
    };
    console.warn(collectPaths(hierarchy));
    return fileContent;
  }

  // Extract the prim's text content
  const primText = fileContent.slice(prim.startIndex, prim.endIndex + 1);
  console.log("[UPDATE PROPERTY] Found prim text");

  // Build the property line based on naming convention
  // Regular properties like displayName and status use primvars namespace
  // Pset properties use their own namespace (e.g., "Pset_ActionRequest:RequestComments")
  let propertyFullName;

  if (propertyName.includes(":")) {
    // This is already a fully qualified name (e.g., Pset_ActionRequest:RequestComments)
    propertyFullName = propertyName;
    console.log(
      "[UPDATE PROPERTY] Using Pset property name:",
      propertyFullName
    );
  } else {
    // Regular property - use primvars namespace
    propertyFullName = `primvars:${propertyName}`;
    console.log(
      "[UPDATE PROPERTY] Using primvars property name:",
      propertyFullName
    );
  }

  // Regex to match the property line
  // Matches: custom <type> propertyFullName = "value"
  const propertyRegex = new RegExp(
    `(\\s*custom\\s+\\w+\\s+${propertyFullName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*)"([^"]*)"`,
    "g"
  );

  let updatedPrimText;
  const matches = primText.match(propertyRegex);

  if (matches && matches.length > 0) {
    // Property exists - update it
    console.log("[UPDATE PROPERTY] Property exists, updating value");
    updatedPrimText = primText.replace(propertyRegex, `$1"${propertyValue}"`);
  } else {
    // Property doesn't exist - insert it
    console.log("[UPDATE PROPERTY] Property does not exist, inserting");

    // Find the position to insert (before the closing brace)
    const closingBraceIndex = primText.lastIndexOf("}");

    if (closingBraceIndex === -1) {
      console.warn("[UPDATE PROPERTY] Could not find closing brace");
      return fileContent;
    }

    // Determine indentation by looking at existing properties
    const lines = primText.split("\n");
    let indent = "    "; // Default 4 spaces

    // Try to find indentation from existing properties
    for (const line of lines) {
      if (
        line.includes("custom ") ||
        line.includes("def ") ||
        line.includes("over ")
      ) {
        const match = line.match(/^(\s+)/);
        if (match && match[1].length > 0) {
          indent = match[1];
          break;
        }
      }
    }

    const propertyLine = `\n${indent}custom ${propertyType} ${propertyFullName} = "${propertyValue}"`;

    updatedPrimText =
      primText.slice(0, closingBraceIndex) +
      propertyLine +
      primText.slice(closingBraceIndex);
  }

  // Replace the prim text in the file
  const result =
    fileContent.slice(0, prim.startIndex) +
    updatedPrimText +
    fileContent.slice(prim.endIndex + 1);

  console.log("[UPDATE PROPERTY] Property update complete");
  return result;
}

/**
 * Prunes empty container prims (Xform/Scope with no geometry and no unique metadata)
 * Promotes children one level up to flatten hierarchy
 *
 * @param {string} fileContent - The original USDA file content
 * @param {Object} options - Pruning options
 * @param {string[]} options.excludePaths - Paths to never prune (e.g., ["/World", "/_Classes"])
 * @returns {Object} - { content: modified content, prunedCount: number }
 */
export function pruneEmptyContainers(fileContent, options = {}) {
  const {
    excludePaths = [
      "/World",
      "/IFCModel",
      "/_Classes",
      "/Materials",
      "/Prototypes",
    ],
  } = options;

  console.log("[PRUNE] Starting empty container pruning");
  const hierarchy = USDA_PARSER.getPrimHierarchy(fileContent);
  const primsToRemove = [];

  // Identify empty containers
  function analyzeNode(node) {
    if (excludePaths.includes(node.path)) {
      if (node.children) {
        node.children.forEach((child) => analyzeNode(child));
      }
      return;
    }

    // Check if this is an empty container
    if (["Xform", "Scope"].includes(node.type) && isEmptyContainer(node)) {
      if (node.children && node.children.length > 0) {
        console.log(
          `[PRUNE] Marking ${node.path} for removal (promoting ${node.children.length} children)`
        );
        primsToRemove.push(node);
      }
    }

    if (node.children) {
      node.children.forEach((child) => analyzeNode(child, node.path));
    }
  }

  function isEmptyContainer(node) {
    // Has geometry? Not empty
    if (node.properties?.points || node.properties?.faceVertexIndices)
      return false;

    // Has references/payloads? Not empty
    if (node.references || node.payload) return false;

    // Has meaningful metadata? Not empty
    const meaningfulProps = ["displayName", "status", "entityType"];
    if (meaningfulProps.some((prop) => node.properties?.[prop])) return false;

    return true;
  }

  hierarchy.forEach((root) => analyzeNode(root));

  if (primsToRemove.length === 0) {
    console.log("[PRUNE] No empty containers found");
    return { content: fileContent, prunedCount: 0 };
  }

  // Sort by depth (deepest first) to avoid removing parent before child
  primsToRemove.sort(
    (a, b) => b.path.split("/").length - a.path.split("/").length
  );

  // Remove empty containers
  let modifiedContent = fileContent;
  for (const prim of primsToRemove) {
    modifiedContent = removePrimFromFile(modifiedContent, prim.path);
  }

  console.log(`[PRUNE] Removed ${primsToRemove.length} empty containers`);
  return { content: modifiedContent, prunedCount: primsToRemove.length };
}

/**
 * Renames a prim in a USDA file by changing its definition name.
 * This updates the prim's name in the def/over statement.
 *
 * @param {string} fileContent - The original USDA file content.
 * @param {string} primPath - The absolute path of the prim to rename.
 * @param {string} newName - The new name for the prim.
 * @returns {object} - { content: modified file content, newPath: new prim path }
 */
export function renamePrimInFile(fileContent, primPath, newName) {
  console.log("[RENAME PRIM] Starting prim rename");
  console.log("[RENAME PRIM] Prim path:", primPath);
  console.log("[RENAME PRIM] New name:", newName);

  // Validate new name (no spaces, special chars, etc.)
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
    console.error("[RENAME PRIM] Invalid prim name:", newName);
    throw new Error(
      "Invalid prim name. Must start with letter or underscore and contain only alphanumeric characters and underscores."
    );
  }

  const hierarchy = USDA_PARSER.getPrimHierarchy(fileContent);

  // Helper to find node by path
  const findNode = (nodes, path) => {
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findNode(node.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const prim = findNode(hierarchy, primPath);

  if (
    !prim ||
    typeof prim.startIndex !== "number" ||
    typeof prim.endIndex !== "number"
  ) {
    console.warn(`[RENAME PRIM] Prim not found: ${primPath}`);
    return { content: fileContent, newPath: primPath };
  }

  // Extract the prim's text content
  const primText = fileContent.slice(prim.startIndex, prim.endIndex + 1);

  // Get the expected prim name from the path
  const pathParts = primPath.split("/").filter(Boolean);
  const expectedName = pathParts[pathParts.length - 1];

  console.log("[RENAME PRIM] Expected current name from path:", expectedName);

  // Find the prim definition line that matches this specific name
  // Matches: def/over [Type] "ExpectedName" or def/over "ExpectedName"
  const defRegex = new RegExp(
    `(def|over)(\\s+\\w+)?\\s+"${expectedName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`
  );
  const match = primText.match(defRegex);

  if (!match) {
    console.error(
      "[RENAME PRIM] Could not find prim definition for:",
      expectedName
    );
    console.error("[RENAME PRIM] Prim text:", primText.substring(0, 200));
    return { content: fileContent, newPath: primPath };
  }

  const oldName = expectedName;
  console.log("[RENAME PRIM] Current name:", oldName);

  // Replace the name in the definition - only replace the first occurrence
  const updatedPrimText = primText.replace(defRegex, `$1$2 "${newName}"`);

  // Calculate new path
  pathParts[pathParts.length - 1] = newName;
  const newPath = "/" + pathParts.join("/");

  console.log("[RENAME PRIM] New path:", newPath);

  // Replace the prim text in the file
  let result =
    fileContent.slice(0, prim.startIndex) +
    updatedPrimText +
    fileContent.slice(prim.endIndex + 1);

  // Update any references that point to the old path
  // References look like: @filename.usda@</old/path>
  // We need to update them to: @filename.usda@</new/path>
  const escapedOldPath = primPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const referenceRegex = new RegExp(`(@[^@]+@<${escapedOldPath}>)`, "g");

  const referenceMatches = result.match(referenceRegex);
  if (referenceMatches && referenceMatches.length > 0) {
    console.log(
      "[RENAME PRIM] Found",
      referenceMatches.length,
      "references to update"
    );
    result = result.replace(referenceRegex, `@$1@<${newPath}>`);

    // Fix the replacement - the regex captures the whole thing, so we need a different approach
    // Let's use a more specific regex
    const refPathRegex = new RegExp(`@([^@]+)@<${escapedOldPath}>`, "g");
    result = result.replace(refPathRegex, `@$1@<${newPath}>`);
    console.log("[RENAME PRIM] Updated reference paths");
  }

  console.log("[RENAME PRIM] Prim rename complete");
  return { content: result, newPath };
}
