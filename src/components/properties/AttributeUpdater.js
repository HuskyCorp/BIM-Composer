// src/components/properties/AttributeUpdater.js
// REFACTORED: Enhanced with error handling and core architecture
// Handles attribute/property updates with conflict detection

import { store, errorHandler, ValidationError } from "../../core/index.js";
import { actions } from "../../state/actions.js";
import {
  updatePropertyInFile,
  updateDictionaryInFile,
} from "../../viewer/usda/usdaEditor.js";
import {
  composeLogPrim,
  composePrimsFromHierarchy,
} from "../../viewer/usda/usdaComposer.js";

import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import {
  renderLayerStack,
  recomposeStage,
} from "../sidebar/layerStackController.js";
import {
  detectConflict,
  checkPermission,
} from "../../utils/conflictDetector.js";
import { showConflictModal } from "../conflictModal.js";
import { sha256 } from "js-sha256";

/**
 * Applies an attribute change to a prim
 * @param {Object} prim - The prim to update
 * @param {string} attrName - Full attribute name (e.g., "custom string primvars:status")
 * @param {string} attrValue - The new value
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 * @param {boolean} skipRefresh - Skip UI refresh (for batch operations)
 */
export const applyAttributeChange = errorHandler.wrap(
  (
    prim,
    attrName,
    attrValue,
    updateView,
    commitButton,
    skipRefresh = false
  ) => {
    if (!prim || !prim.path) {
      throw new ValidationError("Prim is missing or invalid", "prim", prim);
    }

    if (!attrName || typeof attrName !== "string") {
      throw new ValidationError(
        "Attribute name must be a valid string",
        "attrName",
        attrName
      );
    }
    console.log("[PROPERTY CHANGE] Starting attribute change");
    console.log("[PROPERTY CHANGE] Prim:", prim.path);
    console.log("[PROPERTY CHANGE] Attribute:", attrName, "=", attrValue);
    console.log("[PROPERTY CHANGE] skipRefresh:", skipRefresh);

    // 1. Stage the change (deferred — not yet written to statement.usda)
    const { propertyName: stagedPropName } = parseAttributeName(attrName);
    const change = {
      type: stagedPropName === "status" ? "propertyEdit" : "propertyEdit",
      targetPath: prim.path,
      attributeName: attrName,
      attributeValue: attrValue,
      propertyName: stagedPropName,
      oldValue: prim.properties ? prim.properties[stagedPropName] : undefined,
      sourceFile: prim._sourceFile || "unknown",
      sourceOwner: prim._sourceOwner || "unknown",
      user: store.getState().currentUser,
      timestamp: new Date().toISOString(),
      sourceStatus: prim.properties?.status || "WIP",
      targetStatus: prim.properties?.status || "WIP",
    };
    actions.addStagedChange(change);
    if (commitButton) {
      commitButton.classList.add("has-changes");
    }

    // 2. Parse attribute name to extract property name and type
    const { propertyName, propertyType } = parseAttributeName(attrName);
    console.log(
      "[PROPERTY CHANGE] Parsed - Property:",
      propertyName,
      "Type:",
      propertyType
    );

    // 3. Check for conflicts and permissions
    const permission = checkPermission(prim, propertyName);
    if (!permission.allowed) {
      throw new ValidationError(
        `Permission Denied: ${permission.reason}`,
        "permission",
        permission
      );
    }

    const conflicts = detectConflict(prim, propertyName, attrValue);
    if (conflicts) {
      console.log("[PROPERTY CHANGE] Conflict detected:", conflicts);

      // Show conflict modal and wait for user decision
      showConflictModal(
        {
          prim,
          propertyName,
          currentValue: prim.properties[propertyName],
          newValue: attrValue,
          conflicts,
        },
        (resolution) => {
          if (resolution === "use-new") {
            console.log("[PROPERTY CHANGE] User chose to apply new value");
            applyAttributeChangeInternal(
              prim,
              attrName,
              attrValue,
              propertyName,
              propertyType,
              updateView,
              skipRefresh
            );
          } else {
            console.log("[PROPERTY CHANGE] User cancelled change");
          }
        }
      );
      return;
    }

    // No conflict, proceed with change
    applyAttributeChangeInternal(
      prim,
      attrName,
      attrValue,
      propertyName,
      propertyType,
      updateView,
      skipRefresh
    );

    console.log(`✅ Attribute change applied: ${propertyName} = ${attrValue}`);
  }
);

/**
 * Parses an attribute name to extract property name and type
 * @param {string} attrName - Full attribute name (e.g., "custom string primvars:status")
 * @returns {Object} { propertyName, propertyType }
 */
function parseAttributeName(attrName) {
  const attrParts = attrName.split(" ");
  let propertyType = "string";
  let propertyName = "";

  if (attrParts.length >= 3 && attrParts[0] === "custom") {
    propertyType = attrParts[1];
    const fullPropertyName = attrParts[2];

    if (fullPropertyName.startsWith("primvars:")) {
      propertyName = fullPropertyName.substring(9);
    } else {
      propertyName = fullPropertyName;
    }
  }

  return { propertyName, propertyType };
}

/**
 * Internal function that actually applies the attribute change
 * @param {Object} prim - The prim to update
 * @param {string} attrName - Full attribute name
 * @param {string} attrValue - The new value
 * @param {string} propertyName - Parsed property name
 * @param {string} propertyType - Property type
 * @param {Function} updateView - Callback to update the view
 * @param {boolean} skipRefresh - Skip UI refresh
 */
function applyAttributeChangeInternal(
  prim,
  attrName,
  attrValue,
  propertyName,
  propertyType,
  updateView,
  skipRefresh = false
) {
  console.log("[PROPERTY CHANGE] Applying change internally");
  console.log("[PROPERTY CHANGE] skipRefresh:", skipRefresh);

  // 1. Detect or use source file (logging deferred to explicit commit)
  detectSourceFile(prim);

  // 2. Update source file if prim has a source
  if (prim._sourceFile && prim._sourcePath) {
    updateSourceFile(prim, propertyName, attrValue, propertyType);
  } else {
    console.log(
      "[PROPERTY CHANGE] No source file found, updating in-memory only"
    );
  }

  // 3. Update in-memory hierarchy
  updateInMemoryHierarchy(prim.path, propertyName, attrValue);

  // 4. For status changes, update parent prim's status AND Layer Stack
  if (propertyName === "status") {
    updateParentStatus(prim.path, attrValue);
    updateLayerStackStatus(prim._sourceFile, attrValue);
  }

  // 5. Refresh UI if not skipped
  if (!skipRefresh) {
    refreshUI(prim.path, updateView);
  }
}

/**
 * Logs a property change to statement.usda
 * @param {Object} prim - The prim being updated
 * @param {string} propertyName - Property name
 * @param {string} attrValue - New value
 */
function logPropertyChangeToStatement(prim, propertyName, attrValue) {
  console.log("[PROPERTY CHANGE] Logging to statement.usda");
  const newEntryNumber = actions.incrementLogEntryCounter();

  const state = store.getState();
  const fileContent = state.loadedFiles["statement.usda"] || "";
  const fileSize = new Blob([fileContent]).size;
  const contentHash = sha256(fileContent);
  const newId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const entityType = prim.properties?.entityType || "Real Element";
  const stagedPaths = state.stage.composedPrims
    ? state.stage.composedPrims.map((p) => p.path)
    : [];
  const logType = propertyName === "status" ? "Promotion" : "Property Change";

  // Capture old value
  const oldValue = prim.properties[propertyName];
  let oldValueForLog;
  if (propertyName === "status") {
    oldValueForLog =
      oldValue || prim._sourceLayerStatus || prim.properties.status || "WIP";
  } else {
    oldValueForLog =
      oldValue !== undefined && oldValue !== null ? oldValue : "null";
  }

  const logEntry = {
    ID: newId,
    Entry: newEntryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": prim.path,
    "File Name": prim._sourceFile || "unknown",
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: logType,
    "Property Name": propertyName,
    "Old Value": oldValueForLog,
    "New Value": attrValue,
    "Old Name": "null",
    "New Name": "null",
    User: state.currentUser,
    Status: "New",
    entityType: entityType,
    stagedPrims: stagedPaths,
    parent: state.headCommitId,
    sourceStatus:
      propertyName === "status"
        ? oldValueForLog
        : prim.properties.status || "WIP",
    targetStatus:
      propertyName === "status" ? attrValue : prim.properties.status || "WIP",
  };

  actions.setHeadCommitId(newId);

  const logPrimString = composeLogPrim(logEntry);
  const newContent = USDA_PARSER.appendToUsdaFile(
    state.loadedFiles["statement.usda"],
    logPrimString,
    "ChangeLog"
  );
  actions.updateLoadedFile("statement.usda", newContent);
  console.log("[PROPERTY CHANGE] Logged to statement.usda");
}

/**
 * Detects the source file for a prim if not already set
 * @param {Object} prim - The prim object
 */
function detectSourceFile(prim) {
  if (prim._sourceFile && prim._sourcePath) return;

  console.log("[PROPERTY CHANGE] Detecting source file for prim:", prim.path);

  const state = store.getState();
  for (const [fileName, content] of Object.entries(state.loadedFiles)) {
    if (fileName === "statement.usda") continue;

    const primName = prim.path.split("/").pop();
    const defPattern = new RegExp(`def\\s+\\w+\\s+"${primName}"`, "m");

    if (defPattern.test(content)) {
      console.log("[PROPERTY CHANGE] Found prim in file:", fileName);
      prim._sourceFile = fileName;
      prim._sourcePath = prim.path;
      return;
    }
  }

  // Fallback: check statement.usda for legacy prims
  if (state.loadedFiles["statement.usda"]) {
    const primName = prim.path.split("/").pop();
    const defPattern = new RegExp(`def\\s+\\w+\\s+"${primName}"`, "m");

    if (defPattern.test(state.loadedFiles["statement.usda"])) {
      console.warn("[PROPERTY CHANGE] Found legacy prim in statement.usda");
      prim._sourceFile = "statement.usda";
      prim._sourcePath = prim.path;
    }
  }
}

/**
 * Updates the source file with the new property value
 * @param {Object} prim - The prim object
 * @param {string} propertyName - Property name
 * @param {string} attrValue - New value
 * @param {string} propertyType - Property type
 */
function updateSourceFile(prim, propertyName, attrValue, propertyType) {
  const state = store.getState();
  const sourceContent = state.loadedFiles[prim._sourceFile];

  if (!sourceContent) {
    console.warn("[PROPERTY CHANGE] Source file not found:", prim._sourceFile);
    return;
  }

  console.log("[PROPERTY CHANGE] Updating source file:", prim._sourceFile);

  const updatedContent = updatePropertyInFile(
    sourceContent,
    prim._sourcePath,
    propertyName,
    attrValue,
    propertyType
  );

  state.loadedFiles[prim._sourceFile] = updatedContent;
  actions.updateLoadedFile(prim._sourceFile, updatedContent);
  console.log("[PROPERTY CHANGE] Source file updated");
}

/**
 * Updates the in-memory hierarchy with the new property value
 * @param {string} primPath - Path of the prim
 * @param {string} propertyName - Property name
 * @param {string} propertyValue - New value
 */
function updateInMemoryHierarchy(primPath, propertyName, propertyValue) {
  const updateInHierarchy = (prims, targetPath, propName, propValue) => {
    if (!prims || !Array.isArray(prims)) return false;

    for (const p of prims) {
      if (p.path === targetPath) {
        if (!p.properties) p.properties = {};
        p.properties[propName] = propValue;
        console.log("[PROPERTY CHANGE] Updated in-memory hierarchy");
        return true;
      }
      if (
        p.children &&
        updateInHierarchy(p.children, targetPath, propName, propValue)
      ) {
        return true;
      }
    }
    return false;
  };

  // Update BOTH hierarchies

  // Clone to avoid direct mutation
  const composedHierarchy = JSON.parse(
    JSON.stringify(store.getState().composedHierarchy)
  );
  updateInHierarchy(composedHierarchy, primPath, propertyName, propertyValue);
  actions.setComposedHierarchy(composedHierarchy);

  const composedPrims = JSON.parse(
    JSON.stringify(store.getState().stage.composedPrims)
  );
  updateInHierarchy(composedPrims, primPath, propertyName, propertyValue);
  actions.setComposedPrims(composedPrims);
  console.log("[PROPERTY CHANGE] Updated both hierarchies");
}

/**
 * Updates the parent prim's status when a child's status changes
 * @param {string} primPath - Path of the prim
 * @param {string} newStatus - New status value
 */
export function updateParentStatus(primPath, newStatus) {
  const parentPath = primPath.substring(0, primPath.lastIndexOf("/"));
  if (!parentPath || parentPath === "") return;

  const findAndUpdateParent = (prims, targetPath, propValue) => {
    for (const p of prims) {
      if (p.path === targetPath) {
        if (!p.properties) p.properties = {};
        p.properties.status = propValue;
        console.log("[PROPERTY CHANGE] Updated parent status");
        return true;
      }
      if (
        p.children &&
        findAndUpdateParent(p.children, targetPath, propValue)
      ) {
        return true;
      }
    }
    return false;
  };

  const composedHierarchy = JSON.parse(
    JSON.stringify(store.getState().composedHierarchy)
  );
  findAndUpdateParent(composedHierarchy, parentPath, newStatus);
  actions.setComposedHierarchy(composedHierarchy);

  const composedPrims = JSON.parse(
    JSON.stringify(store.getState().stage.composedPrims)
  );
  findAndUpdateParent(composedPrims, parentPath, newStatus);
  actions.setComposedPrims(composedPrims);
}

/**
 * Updates all children prims' status when a parent's status changes
 * @param {string} primPath - Path of the parent prim
 * @param {string} newStatus - New status value
 */
export function updateChildrenStatus(primPath, newStatus) {
  const updateAllChildren = (prims, targetPath, propValue) => {
    for (const p of prims) {
      if (p.path === targetPath) {
        // Found the target prim, update all its children recursively
        const updateDescendants = (prim) => {
          if (prim.children && prim.children.length > 0) {
            for (const child of prim.children) {
              if (!child.properties) child.properties = {};
              child.properties.status = propValue;
              updateDescendants(child);
            }
          }
        };
        updateDescendants(p);
        console.log("[PROPERTY CHANGE] Updated children status");
        return true;
      }
      if (p.children && updateAllChildren(p.children, targetPath, propValue)) {
        return true;
      }
    }
    return false;
  };

  const composedHierarchy = JSON.parse(
    JSON.stringify(store.getState().composedHierarchy)
  );
  updateAllChildren(composedHierarchy, primPath, newStatus);
  actions.setComposedHierarchy(composedHierarchy);

  const composedPrims = JSON.parse(
    JSON.stringify(store.getState().stage.composedPrims)
  );
  updateAllChildren(composedPrims, primPath, newStatus);
  actions.setComposedPrims(composedPrims);
}

/**
 * Updates the layer stack if the status change implies a layer status update
 * @param {string} filePath - Source file path
 * @param {string} newStatus - New status value
 */
function updateLayerStackStatus(filePath, newStatus) {
  if (!filePath) return;
  const state = store.getState();
  const layerStack = state.stage.layerStack;

  // Check if any layer matches this file
  const layerIndex = layerStack.findIndex((l) => l.filePath === filePath);

  if (layerIndex !== -1) {
    console.log(
      "[PROPERTY CHANGE] Syncing status to Layer Stack:",
      filePath,
      "->",
      newStatus
    );
    const updatedStack = [...layerStack];
    updatedStack[layerIndex] = {
      ...updatedStack[layerIndex],
      status: newStatus,
    };
    actions.updateLayerStack(updatedStack);

    // BULK UPDATE: Update all prims belonging to this file
    updateAllPrimsInLayer(filePath, newStatus);
  }
}

/**
 * Bulk updates the status of all prims belonging to a source file
 * @param {string} sourceFile - The file path
 * @param {string} newStatus - The new status
 */
function updateAllPrimsInLayer(sourceFile, newStatus) {
  if (!sourceFile) return;
  console.log(
    "[PROPERTY CHANGE] Bulk updating all prims in layer:",
    sourceFile
  );

  // Helper to recursively update
  const updatePrims = (prims) => {
    if (!prims) return false;
    let changed = false;
    for (const p of prims) {
      if (p._sourceFile === sourceFile) {
        if (!p.properties) p.properties = {};
        // Only update if different to avoid infinite loops or redundant checks
        if (p.properties.status !== newStatus) {
          p.properties.status = newStatus;
          changed = true;
        }
      }
      if (p.children && updatePrims(p.children)) {
        changed = true;
      }
    }
    return changed;
  };

  // Update State
  const composedHierarchy = JSON.parse(
    JSON.stringify(store.getState().composedHierarchy)
  );
  if (updatePrims(composedHierarchy)) {
    actions.setComposedHierarchy(composedHierarchy);
  }

  const composedPrims = JSON.parse(
    JSON.stringify(store.getState().stage.composedPrims)
  );
  if (updatePrims(composedPrims)) {
    actions.setComposedPrims(composedPrims);
  }
}

/**
 * Refreshes the UI after a property change
 * @param {string} primPath - Path of the updated prim
 * @param {Function} updateView - Callback to update the view
 */
function refreshUI(primPath, updateView) {
  console.log("[PROPERTY CHANGE] Refreshing UI");

  // Recompose stage
  recomposeStage();

  // Refresh layer stack
  renderLayerStack();

  // Update view
  if (typeof updateView === "function") {
    updateView();
  }

  // Re-select the prim to refresh properties panel
  setTimeout(() => {
    document.dispatchEvent(
      new CustomEvent("primSelected", { detail: { primPath } })
    );
  }, 100);
}

/**
 * Applies a full Pset dictionary to a prim, writing it as a
 * `dictionary PsetName = { ... }` block in statement.usda (and the source
 * file when available).  Updates in-memory hierarchy with `_psets` metadata.
 *
 * @param {Object}   prim        - The prim being edited
 * @param {string}   psetName    - Dictionary / Pset name
 * @param {Array}    properties  - [{ name, value }] list of entries
 * @param {Function} updateView  - Callback to refresh the view
 * @param {HTMLElement} commitButton - Commit button element
 */
export const applyPsetDictionary = errorHandler.wrap(
  (prim, psetName, properties, updateView, commitButton) => {
    if (!prim || !prim.path) {
      throw new ValidationError("Prim is missing or invalid", "prim", prim);
    }
    if (!psetName) {
      throw new ValidationError("Pset name is required", "psetName", psetName);
    }
    if (!Array.isArray(properties) || properties.length === 0) {
      throw new ValidationError(
        "Properties must be a non-empty array",
        "properties",
        properties
      );
    }

    console.log(
      "[PSET DICT] Writing dictionary",
      psetName,
      "with",
      properties.length,
      "entries to prim",
      prim.path
    );

    // Mark commit button dirty
    if (commitButton) commitButton.classList.add("has-changes");

    // Write each entry to statement.usda as dictionary entries
    const state = store.getState();
    let statementContent = state.loadedFiles["statement.usda"] || "#usda 1.0\n";

    for (const prop of properties) {
      statementContent = updateDictionaryInFile(
        statementContent,
        prim.path,
        psetName,
        prop.name,
        prop.value,
        "string"
      );
    }
    actions.updateLoadedFile("statement.usda", statementContent);

    // Also write to source file when the prim has a resolvable source path
    if (prim._sourceFile && prim._sourcePath) {
      const sourceContent = state.loadedFiles[prim._sourceFile];
      if (sourceContent) {
        let updatedSource = sourceContent;
        for (const prop of properties) {
          updatedSource = updateDictionaryInFile(
            updatedSource,
            prim._sourcePath,
            psetName,
            prop.name,
            prop.value,
            "string"
          );
        }
        actions.updateLoadedFile(prim._sourceFile, updatedSource);
      }
    }

    // Update in-memory hierarchy with new properties and _psets metadata
    const updateInMemory = (prims, targetPath) => {
      for (const p of prims) {
        if (p.path === targetPath) {
          if (!p._psets) p._psets = {};
          if (!p.properties) p.properties = {};
          for (const prop of properties) {
            p.properties[prop.name] = prop.value;
            p._psets[prop.name] = psetName;
          }
          return true;
        }
        if (p.children && updateInMemory(p.children, targetPath)) return true;
      }
      return false;
    };

    const composedHierarchy = JSON.parse(
      JSON.stringify(store.getState().composedHierarchy || [])
    );
    updateInMemory(composedHierarchy, prim.path);
    actions.setComposedHierarchy(composedHierarchy);

    const composedPrims = JSON.parse(
      JSON.stringify(store.getState().stage.composedPrims || [])
    );
    updateInMemory(composedPrims, prim.path);
    actions.setComposedPrims(composedPrims);

    // Refresh UI
    refreshUI(prim.path, updateView);

    console.log("[PSET DICT] Dictionary write complete");
  }
);
