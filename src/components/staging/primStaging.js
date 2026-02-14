// src/components/staging/primStaging.js
import { store } from "../../core/index.js";
import { actions } from "../../state/actions.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import {
  composeLogPrim,
  composePrimsFromHierarchy,
} from "../../viewer/usda/usdaComposer.js";
import { sha256 } from "js-sha256";

function logToStatement(details) {
  const { primPath, type, allStagedPaths, sourceStatus, entityType } = details;

  console.log("[PRIM_STAGING] Logging to statement.usda");
  console.log("[PRIM_STAGING] Type:", type);
  console.log("[PRIM_STAGING] Prim path:", primPath);
  console.log("[PRIM_STAGING] All staged paths:", allStagedPaths);
  console.log("[PRIM_STAGING] Source status:", sourceStatus);
  console.log("[PRIM_STAGING] Entity type:", entityType);

  console.log("[PRIM_STAGING] Entity type:", entityType);

  const entryNumber = actions.incrementLogEntryCounter();
  const state = store.getState();
  const fileName = state.currentFile;
  const fileContent = state.loadedFiles[fileName];
  if (!fileContent) {
    console.warn("[PRIM_STAGING] No file content found for:", fileName);
    return;
  }

  const fileSize = new Blob([fileContent]).size;
  const contentHash = sha256(fileContent);
  const newId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  // Extract prim name from path
  const pathParts = primPath.split("/").filter(Boolean);
  const primName = pathParts[pathParts.length - 1] || "";

  const logEntry = {
    ID: newId,
    Entry: entryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": primPath,
    "File Name": fileName,
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: type,
    User: state.currentUser,
    Status: "New",
    primName: primName, // Add prim name for consistent log structure
    stagedPrims: allStagedPaths,
    sourceStatus: sourceStatus,
    targetStatus: sourceStatus, // For prim selection, target = source
    entityType: entityType,
    parent: state.headCommitId, // Link to current HEAD
  };

  console.log("[PRIM_STAGING] Log entry created:", logEntry);

  state.headCommitId = newId; // Update HEAD
  console.log("[PRIM_STAGING] Updated HEAD to:", newId);

  const logPrimString = composeLogPrim(logEntry);
  const newContent = USDA_PARSER.appendToUsdaFile(
    state.loadedFiles["statement.usda"],
    logPrimString,
    "ChangeLog"
  );
  actions.updateLoadedFile("statement.usda", newContent);

  console.log(
    "[PRIM_STAGING] Written to statement.usda (now",
    state.loadedFiles["statement.usda"].length,
    "characters)"
  );
}

function applySourceFileToHierarchy(prims, sourceFile, layerStatus) {
  prims.forEach((prim) => {
    prim._sourceFile = sourceFile;
    if (layerStatus) prim._sourceLayerStatus = layerStatus;
    if (prim.children && prim.children.length > 0) {
      applySourceFileToHierarchy(prim.children, sourceFile, layerStatus);
    }
  });
}

export function stagePrims(primInput, options = {}) {
  const { isEntity } = options;
  console.log("[primStaging] stagePrims called. Options:", options);
  console.log("[primStaging] isEntity:", isEntity);
  if (!primInput || primInput.length === 0) return;

  // Normalize input: can be array of strings (paths) or objects ({path, sourceFile})
  const state = store.getState();
  const primsToProcess = primInput.map((item) => {
    if (typeof item === "string")
      return { path: item, sourceFile: state.currentFile };
    return item;
  });

  // Group by source file
  const primsByFile = {};
  primsToProcess.forEach((item) => {
    if (!item.sourceFile) item.sourceFile = state.currentFile; // Fallback
    if (!primsByFile[item.sourceFile]) primsByFile[item.sourceFile] = [];
    primsByFile[item.sourceFile].push(item.path);
  });

  const allStagedPathsLogging = primsToProcess.map((p) => p.path);
  const existingStagedPaths = state.stage.composedPrims
    ? state.stage.composedPrims.map((p) => p.path)
    : [];
  const allStagedPathsComplete = [
    ...new Set([...existingStagedPaths, ...allStagedPathsLogging]),
  ];

  // Log the action (using the first file as representative for the log entry header if multiple)
  // Log action MOVED to end of function to include serialized prims
  const firstSource = primsToProcess[0].sourceFile;
  const sourceLayer = state.stage.layerStack.find(
    (layer) => layer.filePath === firstSource
  );
  const layerStatusAtEvent = sourceLayer ? sourceLayer.status : "WIP";

  let allNewlyStagedPrims = [];

  // Collision Detection Setup
  const existingHierarchy = state.stage.composedPrims || [];
  const collisionMap = new Map(); // path -> { _sourceFile, ... }

  function mapToCollision(prims) {
    prims.forEach((p) => {
      collisionMap.set(p.path, p);
      if (p.children) mapToCollision(p.children);
    });
  }
  mapToCollision(existingHierarchy);

  // Helper to rename prim recursively
  function updatePrimPath(prim, newPath) {
    prim.path = newPath;
    const parts = newPath.split("/");
    prim.name = parts[parts.length - 1];
    if (prim.children) {
      prim.children.forEach((c) => updatePrimPath(c, `${newPath}/${c.name}`));
    }
  }

  // Process each file group
  for (const [sourceFile, paths] of Object.entries(primsByFile)) {
    const fileContent = state.loadedFiles[sourceFile];
    if (!fileContent) {
      console.warn(`Content for ${sourceFile} not found.`);
      continue;
    }
    const fullHierarchy = USDA_PARSER.getPrimHierarchy(fileContent);

    // Helper to find a prim in hierarchy by path
    function findPrim(nodes, path) {
      for (const node of nodes) {
        if (node.path === path) return node;
        if (node.children && path.startsWith(node.path + "/")) {
          const found = findPrim(node.children, path);
          if (found) return found;
        }
      }
      return null;
    }

    // If isEntity is true, we create placeholders instead of filtering/referencing the hierarchy
    let stagedForFile = [];
    if (isEntity) {
      stagedForFile = paths.map((path) => {
        // Find the original prim in the hierarchy to get its type and details
        const originalPrim = findPrim(fullHierarchy, path);

        // If not found (shouldn't happen), fallback to Cube or skipping
        const type = originalPrim ? originalPrim.type : "Cube";
        const name = originalPrim ? originalPrim.name : path.split("/").pop();

        return {
          specifier: "def", // Use def to define the new entity placeholder
          type: type,
          name: name,
          path: path,
          properties: {
            displayColor: "[(0.56, 0.93, 0.56)]", // Light Green
            opacity: "0.1", // 90% Transparent
            entityType: "placeholder", // Custom identification string
          },
          references: `${sourceFile}@<${path}>`, // Reference the original geometry
          children: [],
          _sourceFile: sourceFile, // Track origin for metadata
          _sourcePath: path, // Ensure renderer knows where to find the geometry
          _isPlaceholder: true,
        };
      });
    } else {
      stagedForFile = paths
        .map((path) => filterHierarchyForPath(fullHierarchy, path, sourceFile))
        .flat();
    }

    const layerForFile = state.stage.layerStack.find(
      (l) => l.filePath === sourceFile
    );
    const statusForFile = layerForFile ? layerForFile.status : "Published";

    if (stagedForFile.length > 0) {
      const processPrimsRecursive = (prims) => {
        prims.forEach((prim) => {
          // Check Collision
          if (collisionMap.has(prim.path)) {
            const existing = collisionMap.get(prim.path);

            // ----------------------------------------------------------------
            // OVERWRITE PROTECTION RULES
            // Rule 1: S (Real Element) is Stronger than E (Placeholder)
            // ----------------------------------------------------------------
            const isExistingReal =
              existing.properties?.entityType === "Real Element";
            const isIncomingEntity = isEntity;

            // Case: E trying to overwrite S -> BLOCK
            if (isExistingReal && isIncomingEntity) {
              alert(
                `Cannot overwrite Real Element '${prim.path}' with an Entity Placeholder.\n\nAction skipped for this item.`
              );
              // We mark this prim to be ignored/removed from the stagedForFile list?
              // But we are iterating. Hard to remove in place across recursion.
              // Simpler: Just don't apply it to the existing map?
              // But mapPrims merges everything in 'allNewlyStagedPrims'.
              // We should probably splice it out of the input list.
              // For now, let's flag it or return?
              // Since we are mutating 'existing' in other cases, returning here stops mutation.
              // But we need to ensure it's removed from 'allNewlyStagedPrims' later.
              prim._cancelled = true;
              return;
            }

            // Case: S trying to overwrite E -> ALLOW (Upgrade) + CLEANUP
            // We must ensure the "placeholder" visual properties are REMOVED so it becomes a solid Real Element.
            // Note: We check if existing is placeholder OR if it has the specific visual markers of one (opacity 0.1)
            if (
              (existing.properties?.entityType === "placeholder" ||
                existing._isPlaceholder ||
                existing.properties?.opacity == 0.1) &&
              !isIncomingEntity
            ) {
              delete existing.properties.opacity;
              delete existing.properties.displayColor;
              delete existing.properties.entityType;
              delete existing._isPlaceholder;

              // Also set to undefined to ensure Object.assign overrides don't stick if delete fails (though delete should work)
              existing.properties.opacity = undefined;
              existing.properties.displayColor = undefined;
            }

            // If source file is different, we have a collision that needs resolving
            if (existing._sourceFile && existing._sourceFile !== sourceFile) {
              let counter = 1;
              let newPath = `${prim.path}_${counter}`;
              while (collisionMap.has(newPath)) {
                counter++;
                newPath = `${prim.path}_${counter}`;
              }
              updatePrimPath(prim, newPath);
            }
          }

          // Add to collision map to reserve this path (if not cancelled)
          // Note: If we are recursively processing NEW items, we update the map so siblings/cousins respect it.
          if (!prim._cancelled) {
            collisionMap.set(prim.path, { ...prim, _sourceFile: sourceFile });

            if (prim.children && prim.children.length > 0) {
              processPrimsRecursive(prim.children);
            }
          }
        });
      };

      processPrimsRecursive(stagedForFile);

      // Filter out cancelled items
      const filterCancelled = (list) => {
        return list.filter((p) => {
          if (p._cancelled) return false;
          if (p.children) {
            p.children = filterCancelled(p.children);
          }
          return true;
        });
      };
      const cleanedStagedForFile = filterCancelled(stagedForFile);

      if (cleanedStagedForFile.length > 0) {
        applySourceFileToHierarchy(
          cleanedStagedForFile,
          sourceFile,
          statusForFile
        );
        allNewlyStagedPrims = [...allNewlyStagedPrims, ...cleanedStagedForFile];
      }
    }
  }

  if (allNewlyStagedPrims.length === 0) return;

  // Helper function (moved inside or kept separate, but needs sourceFile arg)
  function filterHierarchyForPath(hierarchy, targetPath, sourceFile) {
    const result = [];
    for (const prim of hierarchy) {
      if (prim.path === targetPath) {
        // Check if it's an Xform with a single Mesh child (common import pattern)
        const meshChild =
          prim.children && prim.children.find((c) => c.type === "Mesh");

        if (prim.type === "Xform" && meshChild) {
          // Create Scope container
          const scopePrim = {
            specifier: "def",
            type: "Scope",
            name: prim.name,
            path: prim.path,
            properties: {
              entityType: "Real Element",
            },
            children: [],
          };

          // Create Mesh child with reference to the specific mesh path
          const meshPrim = {
            specifier: "def",
            type: "Mesh",
            name: meshChild.name,
            path: `${prim.path}/${meshChild.name}`,
            properties: {
              entityType: "Real Element",
            },
            references: `${sourceFile}@<${meshChild.path}>`,
            children: [],
          };

          scopePrim.children.push(meshPrim);
          return [scopePrim];
        }

        // Default behavior
        const refPrim = {
          specifier: "def",
          type: prim.type,
          name: prim.name,
          path: prim.path,
          properties: {
            entityType: "Real Element",
          },
          references: `${sourceFile}@<${prim.path}>`, // Use specific sourceFile
          children: [],
        };
        return [refPrim];
      }
      if (targetPath.startsWith(prim.path + "/")) {
        const childrenResult = filterHierarchyForPath(
          prim.children || [],
          targetPath,
          sourceFile
        );
        if (childrenResult.length > 0) {
          const primClone = { ...prim, children: childrenResult };
          result.push(primClone);
          return result;
        }
      }
    }
    return result;
  }

  const primsByPathFinal = new Map();

  function mapPrims(prims) {
    prims.forEach((prim) => {
      const newPrim = { ...prim, children: [] };
      if (prim._sourceFile) newPrim._sourceFile = prim._sourceFile;
      if (prim._sourceLayerStatus)
        newPrim._sourceLayerStatus = prim._sourceLayerStatus;
      // Copy references and payload explicitly
      if (prim.references) newPrim.references = prim.references;
      if (prim.payload) newPrim.payload = prim.payload;

      if (primsByPathFinal.has(prim.path)) {
        const existingPrim = primsByPathFinal.get(prim.path);
        Object.assign(existingPrim.properties, newPrim.properties);
        if (newPrim._sourceLayerStatus)
          existingPrim._sourceLayerStatus = newPrim._sourceLayerStatus;
        if (newPrim._sourceFile) existingPrim._sourceFile = newPrim._sourceFile;

        // Update references on existing prims too
        if (newPrim.references) existingPrim.references = newPrim.references;
        if (newPrim.payload) existingPrim.payload = newPrim.payload;
      } else {
        primsByPathFinal.set(prim.path, newPrim);
      }
      if (prim.children && prim.children.length > 0) mapPrims(prim.children);
    });
  }

  mapPrims(existingHierarchy);
  mapPrims(allNewlyStagedPrims);

  const mergedHierarchy = [];
  primsByPathFinal.forEach((prim) => {
    const pathSegments = prim.path.split("/").filter(Boolean);
    if (pathSegments.length > 1) {
      const parentPath = "/" + pathSegments.slice(0, -1).join("/");
      const parent = primsByPathFinal.get(parentPath);
      if (parent) {
        if (!parent.children.some((p) => p.path === prim.path))
          parent.children.push(prim);
      }
    } else {
      if (!mergedHierarchy.some((p) => p.path === prim.path))
        mergedHierarchy.push(prim);
    }
  });

  actions.setComposedPrims(mergedHierarchy);
  actions.setComposedHierarchy(mergedHierarchy); // Un-commented to ensure render tree update

  logToStatement({
    primPath: primsToProcess[0].path, // Representative path
    type: isEntity ? "Entity Placeholder" : "Prim Selection",
    allStagedPaths: allStagedPathsComplete,
    sourceStatus: layerStatusAtEvent,
    entityType: isEntity ? "placeholder" : "Real Element",
  });
}
