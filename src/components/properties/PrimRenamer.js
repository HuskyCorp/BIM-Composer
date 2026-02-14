// src/components/properties/PrimRenamer.js
// REFACTORED: Enhanced with error handling and core architecture
// Handles prim renaming logic

import {
  store,
  errorHandler,
  ValidationError,
  FileError,
} from "../../core/index.js";
import { actions } from "../../state/actions.js";
import { renamePrimInFile } from "../../viewer/usda/usdaEditor.js";
import { composeLogPrim } from "../../viewer/usda/usdaComposer.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import {
  renderLayerStack,
  recomposeStage,
} from "../sidebar/layerStackController.js";
import { sha256 } from "js-sha256";

/**
 * Applies a prim rename operation
 * @param {Object} prim - The prim to rename
 * @param {string} newName - The new name for the prim
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
export const applyPrimRename = errorHandler.wrap(
  (prim, newName, updateView, commitButton) => {
    if (!prim || !prim.path) {
      throw new ValidationError("Prim is missing or invalid", "prim", prim);
    }

    if (!newName || typeof newName !== "string") {
      throw new ValidationError(
        "New name must be a valid string",
        "newName",
        newName
      );
    }
    console.log("[PRIM RENAME] Starting prim rename");
    console.log("[PRIM RENAME] Old path:", prim.path);
    console.log("[PRIM RENAME] New name:", newName);

    // 1. Log to staged changes
    const change = {
      type: "renamePrim",
      targetPath: prim.path,
      oldName: prim.name,
      newName: newName,
    };
    actions.addStagedChange(change);
    if (commitButton) {
      commitButton.classList.add("has-changes");
    }

    // 2. Log rename to statement.usda
    logRenameToStatement(prim, newName);

    // 3. Rename in source file if it exists
    let newPath = prim.path;

    if (prim._sourceFile) {
      const state = store.getState();
      const sourceContent = state.loadedFiles[prim._sourceFile];

      if (sourceContent) {
        console.log("[PRIM RENAME] Renaming in source file:", prim._sourceFile);

        const pathToUse = prim._sourcePath || prim.path;
        console.log("[PRIM RENAME] Using path for rename:", pathToUse);

        try {
          const result = renamePrimInFile(sourceContent, pathToUse, newName);
          actions.updateLoadedFile(prim._sourceFile, result.content);
          newPath = result.newPath;
          console.log("[PRIM RENAME] Source file updated, new path:", newPath);
        } catch (error) {
          console.error("[PRIM RENAME] Error renaming prim:", error);
          throw new FileError(
            `Failed to rename prim in file: ${error.message}`,
            prim._sourceFile,
            error
          );
        }
      } else {
        console.warn("[PRIM RENAME] Source file not found in loadedFiles");
      }
    } else {
      console.warn("[PRIM RENAME] No _sourceFile property on prim");
    }

    // 4. Update stage.composedPrims
    const state = store.getState();
    if (state.stage.composedPrims) {
      // Deep clone to avoid mutating state directly
      const composedPrims = JSON.parse(
        JSON.stringify(state.stage.composedPrims)
      );
      if (
        updateComposedPrimsAfterRename(
          composedPrims,
          prim.path,
          newName,
          newPath
        )
      ) {
        actions.setComposedPrims(composedPrims);
      }
    }

    // 5. Update references in ALL loaded files
    updateReferencesInAllFiles(prim.path, newPath);

    // 6. Recompose stage
    console.log("[PRIM RENAME] Recomposing stage");
    recomposeStage();

    // 7. Refresh layer stack
    console.log("[PRIM RENAME] Refreshing layer stack");
    renderLayerStack();

    if (typeof updateView === "function") {
      console.log("[PRIM RENAME] Updating view");
      updateView();
    }

    // 8. Re-select the renamed prim with new path
    setTimeout(() => {
      document.dispatchEvent(
        new CustomEvent("primSelected", { detail: { primPath: newPath } })
      );
    }, 100);

    console.log(
      `✅ Prim rename complete: ${prim.name} → ${newName} (${newPath})`
    );
  }
);

/**
 * Logs a rename operation to statement.usda
 * @param {Object} prim - The prim being renamed
 * @param {string} newName - The new name
 */
function logRenameToStatement(prim, newName) {
  console.log("[PRIM RENAME] Logging to statement.usda");
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

  const logEntry = {
    ID: newId,
    Entry: newEntryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": prim.path,
    "File Name": prim._sourceFile || "unknown",
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: "Rename",
    "Old Name": prim.name,
    "New Name": newName,
    User: state.currentUser,
    Status: "New",
    entityType: entityType,
    stagedPrims: stagedPaths,
    parent: state.headCommitId,
  };

  actions.setHeadCommitId(newId);

  const logPrimString = composeLogPrim(logEntry);
  const newContent = USDA_PARSER.appendToUsdaFile(
    state.loadedFiles["statement.usda"],
    logPrimString,
    "ChangeLog"
  );
  actions.updateLoadedFile("statement.usda", newContent);
  console.log("[PRIM RENAME] Logged to statement.usda");
}

/**
 * Updates composed prims after a rename
 * @param {Array} prims - The prims array to update
 * @param {string} oldPath - The old prim path
 * @param {string} newName - The new name
 * @param {string} newPath - The new path
 * @returns {boolean} True if prim was found and updated
 */
function updateComposedPrimsAfterRename(prims, oldPath, newName, newPath) {
  if (!prims || !Array.isArray(prims)) return false;

  let found = false;

  for (const p of prims) {
    // Check if this is the renamed prim
    if (p.path === oldPath) {
      console.log("[PRIM RENAME] Found prim in composedPrims:", p.path);

      p.name = newName;
      p.path = newPath;

      // Update _sourcePath if it exists (important for geometry lookup)
      if (p._sourcePath) {
        const oldSourceName = p._sourcePath.split("/").pop();
        p._sourcePath = p._sourcePath.replace(oldSourceName, newName);
        console.log("[PRIM RENAME] Updated _sourcePath to:", p._sourcePath);
      }

      // Update references - can be string or array
      if (p.references) {
        if (typeof p.references === "string") {
          if (p.references.includes(oldPath)) {
            p.references = p.references.replace(oldPath, newPath);
            console.log(
              "[PRIM RENAME] Updated string reference to:",
              p.references
            );
          }
        } else if (Array.isArray(p.references)) {
          p.references = p.references.map((ref) => {
            if (ref.includes(oldPath)) {
              return ref.replace(oldPath, newPath);
            }
            return ref;
          });
          console.log("[PRIM RENAME] Updated array references");
        }
      }

      // Recursively update all child paths and references
      if (p.children) {
        updateChildPaths(p.children, oldPath, newPath);
      }

      console.log(
        "[PRIM RENAME] Updated composedPrims:",
        oldPath,
        "->",
        newPath
      );
      found = true;
    }
    // Also check if this prim's path starts with the old path (it's a child that needs updating)
    else if (p.path.startsWith(oldPath + "/")) {
      const relativePath = p.path.substring(oldPath.length);
      p.path = newPath + relativePath;

      if (p._sourcePath && p._sourcePath.startsWith(oldPath + "/")) {
        const relativeSourcePath = p._sourcePath.substring(oldPath.length);
        p._sourcePath = newPath + relativeSourcePath;
      }

      // Update references
      if (p.references) {
        if (typeof p.references === "string") {
          p.references = p.references.replace(
            new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
            newPath
          );
        } else if (Array.isArray(p.references)) {
          p.references = p.references.map((ref) =>
            ref.replace(
              new RegExp(oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"),
              newPath
            )
          );
        }
      }

      console.log("[PRIM RENAME] Updated child prim path:", p.path);
    }

    // Recursively check children
    if (p.children && updateComposedPrimsAfterRename(p.children, oldPath, newName, newPath)) {
      found = true;
    }
  }
  return found;
}

/**
 * Recursively updates child prim paths after a parent rename
 * @param {Array} children - Array of child prims
 * @param {string} oldParentPath - The old parent path
 * @param {string} newParentPath - The new parent path
 */
function updateChildPaths(children, oldParentPath, newParentPath) {
  if (!children || !Array.isArray(children)) return;

  children.forEach((child) => {
    // Update the child's path
    if (child.path.startsWith(oldParentPath + "/")) {
      const relativePath = child.path.substring(oldParentPath.length);
      child.path = newParentPath + relativePath;
      console.log("[PRIM RENAME] Updated child path to:", child.path);
    }

    // Update _sourcePath
    if (child._sourcePath && child._sourcePath.startsWith(oldParentPath + "/")) {
      const relativeSourcePath = child._sourcePath.substring(oldParentPath.length);
      child._sourcePath = newParentPath + relativeSourcePath;
      console.log("[PRIM RENAME] Updated child _sourcePath to:", child._sourcePath);
    }

    // Update references
    if (child.references) {
      const oldPathRegex = new RegExp(
        oldParentPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        "g"
      );
      if (typeof child.references === "string") {
        child.references = child.references.replace(oldPathRegex, newParentPath);
      } else if (Array.isArray(child.references)) {
        child.references = child.references.map((ref) =>
          ref.replace(oldPathRegex, newParentPath)
        );
      }
    }

    // Recursively update grandchildren
    if (child.children) {
      updateChildPaths(child.children, oldParentPath, newParentPath);
    }
  });
}

/**
 * Updates all references to a prim across all loaded files
 * @param {string} oldPath - The old prim path
 * @param {string} newPath - The new prim path
 */
function updateReferencesInAllFiles(oldPath, newPath) {
  console.log("[PRIM RENAME] Updating references in all loaded files");
  const escapedOldPath = oldPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const refPathRegex = new RegExp(`@([^@]+)@<${escapedOldPath}>`, "g");

  let referencesUpdated = 0;
  const state = store.getState();
  for (const filename in state.loadedFiles) {
    const fileContent = state.loadedFiles[filename];
    const matches = fileContent.match(refPathRegex);

    if (matches && matches.length > 0) {
      console.log(
        "[PRIM RENAME] Updating",
        matches.length,
        "references in",
        filename
      );
      const newContent = fileContent.replace(refPathRegex, `@$1@<${newPath}>`);
      actions.updateLoadedFile(filename, newContent);
      referencesUpdated += matches.length;
    }
  }

  if (referencesUpdated > 0) {
    console.log(
      "[PRIM RENAME] Updated",
      referencesUpdated,
      "total references across all files"
    );
  }
}
