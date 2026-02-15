/**
 * Path Translation Registry
 *
 * Tracks prim rename history to enable correct geometry lookup when
 * reconstructing historical states. When a prim is renamed, historical
 * log entries still reference the old path. This registry maps old
 * paths to current paths.
 */

/**
 * Build a path translation registry from commit history
 * @param {Map<string, Object>} commits - Map of all commits from history
 * @returns {Object} Registry with pathMap and renameChain
 */
export function buildPathTranslationRegistry(commits) {
  const pathMap = new Map(); // Map<oldPath, currentPath>
  const renameChain = []; // Array of {timestamp, oldPath, newPath}

  if (!commits || commits.size === 0) {
    return { pathMap, renameChain };
  }

  // Convert commits Map to array and sort chronologically (oldest first)
  const commitsArray = Array.from(commits.values());
  commitsArray.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });

  // Process each rename commit
  for (const commit of commitsArray) {
    if (commit.type !== "Rename") continue;

    let oldPath = commit.oldPath;
    let newPath = commit.newPath;

    // Fallback: reconstruct paths from oldName/newName for legacy entries
    if (!oldPath && commit.oldName) {
      const primPath = commit["USD Reference Path"] || commit.primPath;
      if (primPath) {
        // Remove old name from end of path
        const parentPath = primPath.substring(0, primPath.lastIndexOf("/"));
        oldPath = parentPath ? `${parentPath}/${commit.oldName}` : `/${commit.oldName}`;
        newPath = primPath; // The primPath is the new path after rename
      }
    }

    if (!oldPath || !newPath) continue;

    // Handle rename chains: if oldPath was previously a newPath, update the chain
    let finalOldPath = oldPath;
    for (const [origPath, currentPath] of pathMap.entries()) {
      if (currentPath === oldPath) {
        // Found a chain: origPath -> oldPath -> newPath
        // Update: origPath should now point to newPath
        pathMap.set(origPath, newPath);
        finalOldPath = origPath;
      }
    }

    // Add or update the mapping
    pathMap.set(oldPath, newPath);

    // Track the rename event
    renameChain.push({
      timestamp: commit.timestamp,
      oldPath: finalOldPath,
      newPath: newPath,
      commitId: commit.id
    });

    // Handle parent rename cascading to children
    // When /World/Foo -> /World/Bar, all /World/Foo/* paths need updating
    for (const [existingOldPath, existingNewPath] of Array.from(pathMap.entries())) {
      if (existingOldPath !== oldPath && existingOldPath.startsWith(oldPath + "/")) {
        // This is a child path that needs updating
        const relativePath = existingOldPath.substring(oldPath.length);
        const updatedNewPath = newPath + relativePath;
        pathMap.set(existingOldPath, updatedNewPath);
      }

      // Also update if the existing new path is affected by this rename
      if (existingNewPath !== oldPath && existingNewPath.startsWith(oldPath + "/")) {
        const relativePath = existingNewPath.substring(oldPath.length);
        const updatedNewPath = newPath + relativePath;
        pathMap.set(existingOldPath, updatedNewPath);
      }
    }
  }

  console.log(`[Path Registry] Built registry with ${pathMap.size} path translations from ${renameChain.length} rename operations`);

  return { pathMap, renameChain };
}

/**
 * Translate a single path using the registry
 * @param {string} oldPath - The historical path to translate
 * @param {Object} registry - The path translation registry
 * @returns {string} The current path, or the original if no translation exists
 */
export function translatePath(oldPath, registry) {
  if (!oldPath || !registry || !registry.pathMap) {
    return oldPath;
  }

  // Direct mapping exists
  if (registry.pathMap.has(oldPath)) {
    return registry.pathMap.get(oldPath);
  }

  // Check if any parent path was renamed
  // If /World/Building was renamed to /World/Structure,
  // then /World/Building/Wall should become /World/Structure/Wall
  for (const [registryOldPath, registryNewPath] of registry.pathMap.entries()) {
    if (oldPath.startsWith(registryOldPath + "/")) {
      const relativePath = oldPath.substring(registryOldPath.length);
      return registryNewPath + relativePath;
    }
  }

  // No translation found, return original path
  return oldPath;
}

/**
 * Recursively translate all paths in a prim and its children
 * @param {Object} prim - The prim object to translate
 * @param {Object} registry - The path translation registry
 * @returns {Object} The prim with translated paths
 */
export function translatePrimPaths(prim, registry) {
  if (!prim || !registry) {
    return prim;
  }

  // Clone the prim to avoid mutating the original
  const translatedPrim = { ...prim };

  // Translate the main path
  if (translatedPrim.path) {
    const newPath = translatePath(translatedPrim.path, registry);
    if (newPath !== translatedPrim.path) {
      console.log(`[Path Registry] Translated path: ${translatedPrim.path} -> ${newPath}`);
      translatedPrim.path = newPath;
    }
  }

  // Translate _sourcePath if it exists
  if (translatedPrim._sourcePath) {
    const newSourcePath = translatePath(translatedPrim._sourcePath, registry);
    if (newSourcePath !== translatedPrim._sourcePath) {
      console.log(`[Path Registry] Translated _sourcePath: ${translatedPrim._sourcePath} -> ${newSourcePath}`);
      translatedPrim._sourcePath = newSourcePath;
    }
  }

  // Recursively translate children
  if (translatedPrim.children && Array.isArray(translatedPrim.children)) {
    translatedPrim.children = translatedPrim.children.map(child =>
      translatePrimPaths(child, registry)
    );
  }

  return translatedPrim;
}

/**
 * Get debug information about the registry
 * @param {Object} registry - The path translation registry
 * @returns {Object} Debug information
 */
export function getRegistryDebugInfo(registry) {
  if (!registry) {
    return { totalMappings: 0, totalRenames: 0, mappings: [] };
  }

  const mappings = Array.from(registry.pathMap.entries()).map(([oldPath, newPath]) => ({
    oldPath,
    newPath
  }));

  return {
    totalMappings: registry.pathMap.size,
    totalRenames: registry.renameChain.length,
    mappings,
    renameChain: registry.renameChain
  };
}
