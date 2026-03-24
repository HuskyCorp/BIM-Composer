// REFACTORED: Enhanced with error handling and core architecture
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";
import {
  store,
  errorHandler,
  ValidationError,
  FileError,
} from "../core/index.js";
import { actions } from "../state/actions.js";
import {
  recomposeStage,
  refreshComposedStage,
} from "./sidebar/layerStackController.js";
import {
  insertPrimIntoFile,
  removePrimFromFile,
} from "../viewer/usda/usdaEditor.js";

const buildRefPrimTreeUI = errorHandler.wrap(
  (prims, parentUl, primToSelectPath) => {
    if (!prims || !Array.isArray(prims)) {
      throw new ValidationError("Prims must be an array", "prims", prims);
    }

    if (!parentUl || !(parentUl instanceof HTMLElement)) {
      throw new ValidationError(
        "Parent UL must be a valid HTML element",
        "parentUl",
        parentUl
      );
    }

    prims.forEach((prim) => {
      const li = document.createElement("li");
      li.dataset.primPath = prim.path;
      li.dataset.primType = prim.type;

      const togglerVisibility =
        prim.children && prim.children.length > 0 ? "visible" : "hidden";
      const icon = prim.type === "Xform" ? "📦" : "🧊";

      li.innerHTML = `
            <div class="outliner-row">
                <span class="outliner-toggler" style="visibility: ${togglerVisibility}">v</span>
                <span class="outliner-icon">${icon}</span>
                <span class="outliner-text">${prim.name}</span>
            </div>
        `;

      if (prim.path === primToSelectPath) {
        li.classList.add("selected");
      }

      if (prim.children && prim.children.length > 0) {
        const childUl = document.createElement("ul");
        buildRefPrimTreeUI(prim.children, childUl, primToSelectPath);
        li.appendChild(childUl);
        li.classList.add("collapsible");
      }
      parentUl.appendChild(li);
    });
  }
);

export function initReferenceModal(updateView) {
  const modal = document.getElementById("reference-modal");
  const modalBody = modal.querySelector(".reference-modal-body");
  const primNameInput = document.getElementById("prim-name-input");
  const referenceSelect = document.getElementById("reference-select"); // Direct access
  const updateButton = document.getElementById("update-reference-button");
  const cancelButton = document.getElementById("cancel-reference-button");
  const primTypeGroup = document.getElementById("prim-type-group");
  const primTypeSelect = document.getElementById("prim-type-select");

  // UI Enhancements: Editable Parent Path Input
  let parentPathGroup = document.getElementById("parent-path-group");
  let parentPathInput = document.getElementById("parent-path-input");

  // NEW: Status Group
  let statusGroup = document.getElementById("status-group");

  const detailsInputs = modal.querySelector(".reference-details-inputs");

  // --- STYLING FIXES ---
  const modalContent = modal.querySelector(".reference-modal-content");
  if (modalContent) {
    modalContent.style.maxWidth = "40%";
    modalContent.style.margin = "10vh auto";
  }
  if (detailsInputs) {
    detailsInputs.style.display = "flex";
    detailsInputs.style.flexDirection = "column";
    detailsInputs.style.alignItems = "center";
    detailsInputs.style.width = "100%";
  }
  if (modalBody) {
    modalBody.style.display = "flex";
    modalBody.style.justifyContent = "center";
  }

  if (!parentPathGroup) {
    // --- Parent Path ---
    parentPathGroup = document.createElement("div");
    parentPathGroup.id = "parent-path-group";
    parentPathGroup.className = "input-group";
    parentPathGroup.style.width = "100%";

    const label = document.createElement("label");
    label.textContent = "Parent Path";
    label.htmlFor = "parent-path-input";

    parentPathInput = document.createElement("input");
    parentPathInput.type = "text";
    parentPathInput.id = "parent-path-input";
    parentPathInput.placeholder = "/World";
    parentPathInput.style.width = "100%";

    parentPathGroup.appendChild(label);
    parentPathGroup.appendChild(parentPathInput);

    // --- Status ---
    statusGroup = document.createElement("div");
    statusGroup.id = "status-group";
    statusGroup.className = "input-group";
    statusGroup.style.width = "100%";

    const statusLabel = document.createElement("label");
    statusLabel.textContent = "Status";
    statusLabel.htmlFor = "status-select";

    const statusSelect = document.createElement("select");
    statusSelect.id = "status-select";
    statusSelect.style.width = "100%";

    ["WIP", "Shared", "Published", "Archived"].forEach((st) => {
      const opt = document.createElement("option");
      opt.value = st;
      opt.textContent = st;
      statusSelect.appendChild(opt);
    });

    statusGroup.appendChild(statusLabel);
    statusGroup.appendChild(statusSelect);

    // --- Prim Type Enhancements ---
    if (primTypeSelect && !primTypeSelect.querySelector("option[value='']")) {
      const noneOpt = document.createElement("option");
      noneOpt.value = "";
      noneOpt.textContent = "None";
      primTypeSelect.insertBefore(noneOpt, primTypeSelect.firstChild);
      primTypeSelect.value = "Cube";
    }

    const primNameInputGroup = primNameInput
      ? primNameInput.parentElement
      : null;
    const refSelectGroup = referenceSelect
      ? referenceSelect.parentElement
      : null;

    [primNameInputGroup, primTypeGroup, refSelectGroup].forEach((el) => {
      if (el) el.style.width = "100%";
    });

    // --- Hide Outliners ---
    const outlinerContainer = modal.querySelector(".reference-file-lists");
    if (outlinerContainer) outlinerContainer.style.display = "none";

    if (detailsInputs) {
      detailsInputs.insertBefore(parentPathGroup, detailsInputs.firstChild);
      detailsInputs.insertBefore(statusGroup, parentPathGroup.nextSibling);
      if (primTypeGroup) detailsInputs.appendChild(primTypeGroup);
    }
  }

  let originalPrimPath = null;
  let isAddMode = false;

  const handleOpenReferenceModal = errorHandler.wrap((e) => {
    // Refresh state
    const state = store.getState();

    isAddMode = !e.detail.primPath;
    originalPrimPath = e.detail.primPath;
    const initialParent = e.detail.parentPath || "";

    primNameInput.value = "";

    const statusSelect = document.getElementById("status-select");
    if (statusSelect) statusSelect.value = "WIP";

    if (referenceSelect) {
      referenceSelect.innerHTML = "";
      const noneRef = document.createElement("option");
      noneRef.value = "";
      noneRef.textContent = "None";
      referenceSelect.appendChild(noneRef);

      Object.keys(state.loadedFiles).forEach((fileName) => {
        const content = state.loadedFiles[fileName];
        try {
          const hierarchy = USDA_PARSER.getPrimHierarchy(content);
          const flatten = (prims) => {
            prims.forEach((p) => {
              const opt = document.createElement("option");
              opt.value = `@${fileName}@<${p.path}>`;
              opt.textContent = `${fileName} -> ${p.path}`;
              referenceSelect.appendChild(opt);
              if (p.children) flatten(p.children);
            });
          };
          flatten(hierarchy);
        } catch {
          console.warn("Failed to parse hierarchy for ref dropdown:", fileName);
        }
      });
    }

    if (isAddMode) {
      updateButton.textContent = "Add Prim";
      updateButton.disabled = false;
      primTypeGroup.style.display = "flex";
      parentPathGroup.style.display = "flex";
      if (statusGroup) statusGroup.style.display = "flex";

      // IMPROVED UX: Replace text input with dropdown for parent path selection
      // Build dropdown from current hierarchy
      const oldInput = parentPathInput;
      const newSelect = document.createElement("select");
      newSelect.id = "parent-path-input";
      newSelect.style.width = "100%";

      // Add root option
      const rootOpt = document.createElement("option");
      rootOpt.value = "/";
      rootOpt.textContent = "/ (root)";
      newSelect.appendChild(rootOpt);

      // Add all prims from hierarchy as options
      if (state.composedHierarchy && state.composedHierarchy.length > 0) {
        const addPrimsToSelect = (prims, indent = "") => {
          prims.forEach((prim) => {
            const opt = document.createElement("option");
            opt.value = prim.path;
            opt.textContent = `${indent}${prim.path}`;
            newSelect.appendChild(opt);

            if (prim.children && prim.children.length > 0) {
              addPrimsToSelect(prim.children, indent + "  ");
            }
          });
        };
        addPrimsToSelect(state.composedHierarchy);
      }

      // Replace input with select
      if (oldInput && oldInput.parentNode) {
        oldInput.parentNode.replaceChild(newSelect, oldInput);
        // Update reference for later use
        parentPathInput = newSelect;
      }

      // Set initial value
      newSelect.value = initialParent || "/";
    } else {
      updateButton.textContent = "Update";
      primTypeGroup.style.display = "flex";
      parentPathGroup.style.display = "flex";
      if (statusGroup) statusGroup.style.display = "flex";

      const primNameFromPath = originalPrimPath
        ? originalPrimPath.split("/").pop()
        : "";
      primNameInput.value = primNameFromPath;

      const parentPath =
        originalPrimPath.substring(0, originalPrimPath.lastIndexOf("/")) || "/";
      parentPathInput.value = parentPath;
      parentPathInput.readOnly = false; // ALLOW REPARENTING!
      parentPathInput.title = "Edit path to move/reparent prim.";

      // Populate Type and Status from Hierarchy
      const findPrimRecursive = (prims) => {
        for (const p of prims) {
          if (p.path === originalPrimPath) return p;
          if (p.children) {
            const found = findPrimRecursive(p.children);
            if (found) return found;
          }
        }
        return null;
      };

      if (state.composedHierarchy) {
        const prim = findPrimRecursive(state.composedHierarchy);
        if (prim) {
          if (prim.type) primTypeSelect.value = prim.type;
          if (prim.properties && prim.properties.status) {
            if (statusSelect) statusSelect.value = prim.properties.status;
          }
        }
      }
    }
    modal.style.display = "flex";
    console.log(
      `✅ Opened reference modal (${isAddMode ? "Add" : "Update"} mode)`
    );
  });

  document.addEventListener("openReferenceModal", handleOpenReferenceModal);

  const handleUpdateButton = errorHandler.wrap(() => {
    // Refresh state
    const state = store.getState();

    const displayName = primNameInput.value.trim();
    const refSelect = document.getElementById("reference-select");
    const reference = refSelect ? refSelect.value : "";
    const primType = primTypeSelect.value;
    const desiredParentPath = parentPathInput.value.trim();
    const statusSelect = document.getElementById("status-select");
    const statusValue = statusSelect ? statusSelect.value : "WIP";

    if (displayName === "") {
      throw new ValidationError(
        "Prim name cannot be empty",
        "displayName",
        displayName
      );
    }

    // Validate prim name: no spaces or special characters (except underscore)
    if (/\s/.test(displayName)) {
      throw new ValidationError(
        "Prim name cannot contain spaces. Please use underscores instead (e.g., 'meu_pai' instead of 'meu pai')",
        "displayName",
        displayName
      );
    }

    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(displayName)) {
      throw new ValidationError(
        "Prim name must start with a letter or underscore and contain only letters, numbers, and underscores",
        "displayName",
        displayName
      );
    }

    // --- CONSTRUCT THE NEW PRIM BLOCK TEXT ---
    let primString = "";
    if (primType) {
      primString = `def ${primType} "${displayName}"`;
    } else {
      primString = `def "${displayName}"`;
    }
    let propertiesBlock = "";

    if (reference) {
      propertiesBlock += ` (\n    prepend references = ${reference}\n)`;
    }

    const statusLine = `    custom token primvars:status = "${statusValue}"`;
    propertiesBlock += `\n{\n${statusLine}\n}`;
    const newPrimBlock = `${primString}${propertiesBlock}`;

    console.log("[ADD PRIM] Constructed prim block:", newPrimBlock);
    console.log("[ADD PRIM] Mode:", isAddMode ? "ADD" : "UPDATE");
    console.log("[ADD PRIM] Display name:", displayName);
    console.log("[ADD PRIM] Parent path:", desiredParentPath);

    if (isAddMode) {
      // --- ADD MODE ---
      let targetFile = null;

      // User-created prims should go to a dedicated stage/scene file
      // NOT to statement.usda (which is only for logging)

      // First, try to find an existing scene file in the layer stack
      const sceneLayers = state.stage.layerStack.filter(
        (l) =>
          (l.filePath !== "statement.usda" && l.filePath.includes("scene")) ||
          l.filePath.includes("stage")
      );

      if (sceneLayers.length > 0) {
        // Use the first scene file found
        targetFile = sceneLayers[0].filePath;
        console.log("[ADD PRIM] Using existing scene file:", targetFile);
      } else {
        // No scene file exists, check if there are any non-statement files
        const nonStatementLayers = state.stage.layerStack.filter(
          (l) => l.filePath !== "statement.usda"
        );

        if (nonStatementLayers.length > 0) {
          // Use the first available file
          targetFile = nonStatementLayers[0].filePath;
          console.log("[ADD PRIM] Using existing file:", targetFile);
        } else {
          // No files exist, create a new scene file
          targetFile = "scene.usda";
          console.log("[ADD PRIM] Creating new scene file:", targetFile);

          if (!state.loadedFiles[targetFile]) {
            // Initialize with basic USDA header
            state.loadedFiles[targetFile] = `#usda 1.0
(
    defaultPrim = "World"
    metersPerUnit = 1.0
    upAxis = "Z"
)

def Xform "World"
{
}
`;
            actions.addLoadedFile(targetFile, state.loadedFiles[targetFile]);

            // Add to layer stack
            const newLayer = {
              id: `layer-${Date.now()}`,
              filePath: targetFile,
              status: "WIP",
              visible: true,
              owner: state.currentUser,
              groupName: null,
            };
            actions.addLayer(newLayer);
          }
        }
      }

      console.log("[ADD PRIM] Target file:", targetFile);
      console.log("[ADD PRIM] File exists:", !!state.loadedFiles[targetFile]);

      if (!targetFile) {
        throw new ValidationError(
          "No target file specified for prim addition",
          "targetFile",
          targetFile
        );
      }

      if (!state.loadedFiles[targetFile]) {
        throw new FileError(`Target file not found: ${targetFile}`, targetFile);
      }

      try {
        const content = state.loadedFiles[targetFile];
        console.log("[ADD PRIM] File content length before:", content.length);

        const newContent = insertPrimIntoFile(
          content,
          desiredParentPath,
          newPrimBlock
        );
        console.log("[ADD PRIM] File content length after:", newContent.length);

        actions.updateLoadedFile(targetFile, newContent);
        console.log("[ADD PRIM] File updated in state");

        // CORRECT APPROACH: Create prim object directly from user input
        // Don't parse the file and try to find it - just use what the user entered!
        const fullPath =
          desiredParentPath === "/" || desiredParentPath === ""
            ? `/${displayName}`
            : `${desiredParentPath}/${displayName}`;

        console.log("[ADD PRIM] Creating prim object from user input");
        console.log("[ADD PRIM] Name:", displayName);
        console.log("[ADD PRIM] Path:", fullPath);
        console.log("[ADD PRIM] Type:", primType);
        console.log("[ADD PRIM] Reference:", reference);

        // Build the prim object using ONLY user input
        const newPrim = {
          specifier: "def",
          type: primType || undefined,
          name: displayName,
          path: fullPath,
          properties: {
            status: statusValue,
          },
          children: [],
          _sourceFile: targetFile,
          _sourceLayerStatus: statusValue,
          _sourcePath: fullPath,
        };

        // Add reference if user specified one
        if (reference) {
          newPrim.references = reference;
          console.log("[ADD PRIM] Added reference:", reference);
        }

        // Handle parent-child relationship
        if (!state.stage.composedPrims) state.stage.composedPrims = [];

        if (
          desiredParentPath &&
          desiredParentPath !== "/" &&
          desiredParentPath !== ""
        ) {
          // Find the parent prim recursively
          // Note: We need to clone the hierarchy to avoid mutating state directly
          // However, for this complex operation, we'll modify a clone and then update state

          const composedPrims = JSON.parse(
            JSON.stringify(state.stage.composedPrims)
          );

          const findPrimByPath = (prims, path) => {
            for (const prim of prims) {
              if (prim.path === path) return prim;
              if (prim.children) {
                const found = findPrimByPath(prim.children, path);
                if (found) return found;
              }
            }
            return null;
          };

          const parentPrim = findPrimByPath(composedPrims, desiredParentPath);

          if (parentPrim) {
            // Add as child of parent
            if (!parentPrim.children) parentPrim.children = [];
            parentPrim.children.push(newPrim);
            console.log("[ADD PRIM] Added as child of:", desiredParentPath);
          } else {
            // Parent not found, add to root
            composedPrims.push(newPrim);
            console.warn(
              "[ADD PRIM] Parent not found, added to root:",
              desiredParentPath
            );
          }

          actions.setComposedPrims(composedPrims);
        } else {
          // No parent specified, add to root
          const composedPrims = JSON.parse(
            JSON.stringify(state.stage.composedPrims)
          );
          composedPrims.push(newPrim);
          actions.setComposedPrims(composedPrims);
          console.log("[ADD PRIM] Added to root");
        }

        // Recompose stage to update hierarchy
        console.log("[ADD PRIM] Calling recomposeStage...");
        recomposeStage();
        console.log("[ADD PRIM] recomposeStage complete");

        // Record as a pending change (user must click "Record Changes" to commit)
        actions.addStagedChange({
          type: "primAdded",
          targetPath: fullPath,
          primName: displayName,
          sourceFile: targetFile,
          user: state.currentUser,
          timestamp: new Date().toISOString(),
          sourceStatus: statusValue,
          targetStatus: statusValue,
        });

        if (state.currentView === "stage") {
          console.log("[ADD PRIM] Calling updateView...");
          updateView();
        }
        modal.style.display = "none";
        console.log(`✅ Successfully added prim: ${fullPath} to ${targetFile}`);
      } catch (err) {
        // Re-throw as FileError with context
        throw new FileError(
          `Failed to add prim "${displayName}": ${err.message}`,
          targetFile,
          err
        );
      }
    } else {
      // --- UPDATE MODE (Remove + Insert) ---
      if (!originalPrimPath) {
        throw new ValidationError(
          "No original prim path specified for update",
          "originalPrimPath",
          originalPrimPath
        );
      }

      // Find valid Source File
      let targetFile = "scene.usda";
      let currentSourcePath = originalPrimPath;

      const findPrimRecursive = (prims) => {
        for (const p of prims) {
          if (p.path === originalPrimPath) return p;
          if (p.children) {
            const f = findPrimRecursive(p.children);
            if (f) return f;
          }
        }
      };
      const existingNode = findPrimRecursive(state.composedHierarchy || []);
      if (existingNode) {
        if (existingNode._sourceFile) targetFile = existingNode._sourceFile;
        if (existingNode._sourcePath)
          currentSourcePath = existingNode._sourcePath;
      }

      if (!state.loadedFiles[targetFile]) {
        throw new FileError(`Target file not found: ${targetFile}`, targetFile);
      }

      console.log("[UPDATE PRIM] Target file:", targetFile);
      console.log("[UPDATE PRIM] Original path:", originalPrimPath);
      console.log("[UPDATE PRIM] Source path:", currentSourcePath);

      try {
        let content = state.loadedFiles[targetFile];
        console.log(
          "[UPDATE PRIM] File content length before:",
          content.length
        );

        // 1. Remove Old
        console.log("[UPDATE PRIM] Removing old prim...");
        content = removePrimFromFile(content, currentSourcePath);
        console.log(
          "[UPDATE PRIM] File content length after removal:",
          content.length
        );

        // 2. Insert New
        console.log("[UPDATE PRIM] Inserting new prim...");
        content = insertPrimIntoFile(content, desiredParentPath, newPrimBlock);
        console.log(
          "[UPDATE PRIM] File content length after insertion:",
          content.length
        );

        actions.updateLoadedFile(targetFile, content);
        console.log("[UPDATE PRIM] File updated in state");

        // Record as a pending change (user must click "Record Changes" to commit)
        const updatedPath =
          desiredParentPath === "/" || desiredParentPath === ""
            ? `/${displayName}`
            : `${desiredParentPath}/${displayName}`;
        actions.addStagedChange({
          type: "primUpdate",
          targetPath: updatedPath,
          oldPath: originalPrimPath,
          primName: displayName,
          sourceFile: targetFile,
          user: state.currentUser,
          timestamp: new Date().toISOString(),
        });

        console.log("[UPDATE PRIM] Calling refreshComposedStage...");
        refreshComposedStage(targetFile);
        console.log("[UPDATE PRIM] refreshComposedStage complete");

        if (state.currentView === "stage") {
          console.log("[UPDATE PRIM] Calling updateView...");
          updateView();
        }
        modal.style.display = "none";
        console.log(
          `✅ Successfully updated prim: ${originalPrimPath} → ${desiredParentPath}/${displayName}`
        );
      } catch (err) {
        // Re-throw as FileError with context
        throw new FileError(
          `Failed to update prim "${originalPrimPath}": ${err.message}`,
          targetFile,
          err
        );
      }
    }
  });

  updateButton.addEventListener("click", handleUpdateButton);

  const handleCancelButton = errorHandler.wrap(() => {
    modal.style.display = "none";
    console.log("Reference modal closed");
  });

  cancelButton.addEventListener("click", handleCancelButton);

  console.log("✅ Reference Modal Controller initialized with error handling");
}
