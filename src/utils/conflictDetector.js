// src/utils/conflictDetector.js
import { store } from "../core/index.js";
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";

/**
 * Detect if a property change will create a conflict
 * @param {Object} prim - The prim being edited
 * @param {string} propertyName - Name of the property (e.g., "status", "displayName")
 * @param {string} newValue - The new value being set
 * @returns {Array|null} - Array of conflicts or null if no conflicts
 */
export function detectConflict(prim, propertyName, newValue) {
  const conflicts = [];
  const currentValue = prim.properties[propertyName];

  // No conflict if value is the same
  if (currentValue === newValue) {
    return null;
  }

  // Check if property exists in source file with different owner
  if (prim._sourceFile) {
    const state = store.getState();
    const sourceLayer = state.stage.layerStack.find(
      (l) => l.filePath === prim._sourceFile
    );

    if (sourceLayer) {
      // Check ownership
      if (sourceLayer.owner && sourceLayer.owner !== state.currentUser) {
        // Another user owns this layer
        conflicts.push({
          source: "layer",
          file: prim._sourceFile,
          owner: sourceLayer.owner,
          currentValue: currentValue,
          type: "ownership",
        });
      }

      // Check if property is defined in the source file
      const sourceContent = state.loadedFiles[prim._sourceFile];
      if (sourceContent) {
        const hierarchy = USDA_PARSER.getPrimHierarchy(sourceContent);
        const sourcePrim = findPrimInHierarchy(
          hierarchy,
          prim._sourcePath || prim.path
        );

        if (sourcePrim && sourcePrim.properties[propertyName]) {
          // Property is defined in source file
          conflicts.push({
            source: "layer",
            file: prim._sourceFile,
            owner: sourceLayer.owner || "unknown",
            currentValue: sourcePrim.properties[propertyName],
            type: "source_definition",
          });
        }
      }
    }
  }

  // Check if property has been overridden in statement.usda
  const statementContent = store.getState().loadedFiles["statement.usda"];
  if (statementContent) {
    const hierarchy = USDA_PARSER.getPrimHierarchy(statementContent);
    const statementPrim = findPrimInHierarchy(hierarchy, prim.path);

    if (statementPrim && statementPrim.properties[propertyName]) {
      // Property has been overridden in statement.usda
      conflicts.push({
        source: "statement",
        file: "statement.usda",
        owner: "staged changes",
        currentValue: statementPrim.properties[propertyName],
        type: "staged_override",
      });
    }
  }

  // Check if multiple layers define this property
  const layersWithProperty = [];
  const state = store.getState();
  state.stage.layerStack.forEach((layer) => {
    const layerContent = state.loadedFiles[layer.filePath];
    if (layerContent) {
      const hierarchy = USDA_PARSER.getPrimHierarchy(layerContent);
      const layerPrim = findPrimInHierarchy(hierarchy, prim.path);

      if (layerPrim && layerPrim.properties[propertyName]) {
        layersWithProperty.push({
          file: layer.filePath,
          owner: layer.owner || "unknown",
          value: layerPrim.properties[propertyName],
        });
      }
    }
  });

  if (layersWithProperty.length > 1) {
    // Multiple layers define this property
    conflicts.push({
      source: "multiple_layers",
      layers: layersWithProperty,
      type: "multi_layer_definition",
    });
  }

  return conflicts.length > 0 ? conflicts : null;
}

/**
 * Helper function to find a prim in a hierarchy by path
 * @param {Array} hierarchy - The hierarchy to search
 * @param {string} path - The prim path to find
 * @returns {Object|null} - The prim object or null
 */
function findPrimInHierarchy(hierarchy, path) {
  if (!hierarchy || !Array.isArray(hierarchy)) return null;

  for (const prim of hierarchy) {
    if (prim.path === path) return prim;
    if (prim.children) {
      const found = findPrimInHierarchy(prim.children, path);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Check if user has permission to modify a property
 * @param {Object} prim - The prim being edited
 * @param {string} propertyName - Name of the property
 * @returns {Object} - { allowed: boolean, reason: string }
 */
export function checkPermission(prim) {
  const state = store.getState();

  // History Mode is Read-Only
  if (state.isHistoryMode) {
    return {
      allowed: false,
      reason: "History mode is read-only"
    };
  }

  // Project Manager can edit anything
  if (state.currentUser === "Project Manager") {
    return { allowed: true, reason: "Project Manager has full permissions" };
  }

  // Field Engineer can edit anything
  if (state.currentUser === "Field Engineer") {
    return { allowed: true, reason: "Field Engineer has full permissions" };
  }

  // Field Person cannot edit
  if (state.currentUser === "Field Person") {
    return {
      allowed: false,
      reason: "Field Person role has read-only access"
    };
  }

  // Check if prim has a source file
  if (prim._sourceFile) {
    const sourceLayer = state.stage.layerStack.find(
      (l) => l.filePath === prim._sourceFile
    );

    if (sourceLayer) {
      // User can only edit their own layers
      if (sourceLayer.owner === state.currentUser) {
        return { allowed: true, reason: "User owns this layer" };
      } else {
        return {
          allowed: false,
          reason: `This property is owned by ${sourceLayer.owner}. Only the owner or Project Manager can modify it.`,
        };
      }
    }
  }

  // If no source file, allow editing (staged prims)
  return { allowed: true, reason: "No ownership restrictions" };
}
