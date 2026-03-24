// src/utils/primHelpers.js
// Reusable utility functions for working with prims

/**
 * Finds a prim in the hierarchy by its path
 * @param {Array} prims - The hierarchy to search
 * @param {string} path - The prim path (e.g., "/Root/Child")
 * @returns {Object|null} The prim object or null if not found
 */
export function findPrimByPath(prims, path) {
  if (!prims || !Array.isArray(prims)) return null;

  for (const prim of prims) {
    if (prim.path === path) return prim;
    if (prim.children) {
      const found = findPrimByPath(prim.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Validates a prim name according to USD naming rules
 * @param {string} name - The name to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function validatePrimName(name) {
  if (!name || typeof name !== "string") return false;
  // USD naming: must start with letter or underscore, followed by letters, numbers, or underscores
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * Collects all prim paths from a hierarchy
 * @param {Array} hierarchy - The hierarchy to traverse
 * @returns {Array<string>} Array of all prim paths
 */
export function getAllPrimPaths(hierarchy) {
  const paths = [];

  function traverse(prims) {
    if (!prims) return;
    for (const prim of prims) {
      paths.push(prim.path);
      if (prim.children) {
        traverse(prim.children);
      }
    }
  }

  traverse(hierarchy);
  return paths;
}
