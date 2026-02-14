// src/components/sidebar/layerStackController.js
// REFACTORED: Enhanced with error handling and core architecture
import {
  store,
  errorHandler,
  ValidationError,
  FileError,
  actions as coreActions,
} from "../../core/index.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import { composeLogPrim } from "../../viewer/usda/usdaComposer.js";
import { sha256 } from "js-sha256";
import { explodeUsda } from "../../utils/atomicFileHandler.js";

const STATUS_ORDER = ["WIP", "Shared", "Published", "Archived"];

// TODO: Future refactoring - Move business logic to LayerService:
// - Layer filtering logic (lines 22-34)
// - Layer grouping logic (lines 36-46)
// - Status promotion logic
// - Permission validation logic

export function renderLayerStack() {
  const layerStackList = document.getElementById("layerStackList");
  layerStackList.innerHTML = "";

  if (!store.getState().stage || !store.getState().stage.layerStack) return;

  const state = store.getState();
  const filteredLayers = state.stage.layerStack.filter((layer) => {
    // Project Manager sees all layers
    if (state.currentUser === "Project Manager") {
      // Fallthrough to status filter
    }
    // Only show layers owned by current user
    else if (layer.owner && layer.owner !== state.currentUser) {
      return false;
    }
    // Then apply status filter
    if (state.stage.activeFilter === "All") return true;
    return layer.status === state.stage.activeFilter;
  });

  const groups = {};
  const ungrouped = [];

  filteredLayers.forEach((layer) => {
    if (layer.groupName) {
      if (!groups[layer.groupName]) groups[layer.groupName] = [];
      groups[layer.groupName].push(layer);
    } else {
      ungrouped.push(layer);
    }
  });

  const createLayerItem = (layer, displayName) => {
    const li = document.createElement("li");
    li.dataset.layerId = layer.id;
    li.dataset.filePath = layer.filePath;

    const statusIndicator = `<span class="status-indicator ${layer.status.toLowerCase()}" title="Click to change status">${layer.status.charAt(
      0
    )}</span>`;
    const nameStr = displayName || layer.filePath;
    const visibilityToggle = `<span class="visibility-toggle ${
      layer.visible ? "" : "hidden-item"
    }">${layer.visible ? "👁️" : "➖"}</span>`;

    li.innerHTML = `
      ${statusIndicator}
      <span class="layer-name" style="flex: 1; word-break: break-word; line-height: 1.4;" title="${layer.filePath}">${nameStr}</span>
      <div class="layer-item-controls">${visibilityToggle}</div>
    `;

    if (state.currentView === "file" && state.currentFile === layer.filePath) {
      li.classList.add("selected");
    }
    return li;
  };

  ungrouped.forEach((layer) => {
    layerStackList.appendChild(createLayerItem(layer));
  });

  Object.keys(groups).forEach((groupName) => {
    // Create a single item for the entire group using the first layer as representative
    const firstLayer = groups[groupName][0];
    const groupItem = createLayerItem(firstLayer, groupName);

    // Mark this as a group item and store all layer IDs for batch operations
    groupItem.dataset.isGroup = "true";
    groupItem.dataset.groupName = groupName;
    groupItem.dataset.layerIds = groups[groupName].map((l) => l.id).join(",");

    layerStackList.appendChild(groupItem);
  });
}

function handleLayerSelection(li, updateView) {
  if (!li.dataset.layerId) return;
  document.getElementById("sampleSceneItem").classList.remove("selected");
  const allItems = document
    .getElementById("layerStackList")
    .querySelectorAll("li");
  allItems.forEach((item) => item.classList.remove("selected"));
  li.classList.add("selected");
  li.classList.add("selected");
  const filePath = li.dataset.filePath;
  store.dispatch(coreActions.setCurrentFile(filePath));

  // Update selectedFiles for renderer consistency
  const state = store.getState();
  if (state.loadedFiles[filePath]) {
    store.dispatch(
      coreActions.setSelectedFiles([
        {
          name: filePath,
          content: state.loadedFiles[filePath],
        },
      ])
    );
  }

  document.getElementById("currentFileTab").textContent = filePath;
  store.dispatch(coreActions.setCurrentView("file"));
  updateView();
}

export function logPromotionToStatement(details) {
  const { layerPath, sourceStatus, targetStatus, objectPath, type } = details;
  const entryNumber = store.dispatch(coreActions.incrementLogEntryCounter());
  const state = store.getState();
  const fileContent = state.loadedFiles[layerPath];
  if (!fileContent) return;

  const fileSize = new Blob([fileContent]).size;
  const contentHash = sha256(fileContent);
  const primsInFile = USDA_PARSER.getPrimHierarchy(fileContent);
  const allStagedPaths = [];
  function collectPaths(prims) {
    prims.forEach((p) => {
      allStagedPaths.push(p.path);
      if (p.children) collectPaths(p.children);
    });
  }
  collectPaths(primsInFile);

  const newId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const logEntry = {
    ID: newId,
    Entry: entryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": layerPath,
    "File Name": layerPath,
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: type || "Promotion",
    User: state.currentUser,
    Status: "New",
    SourceStatus: sourceStatus,
    TargetStatus: targetStatus,
    sourceStatusForHistory: targetStatus,
    stagedPrims: allStagedPaths,
    parent: state.headCommitId,
  };

  if (objectPath) {
    logEntry["Object Path"] = objectPath;
    if (!type) {
      logEntry.Type = "Object Promotion";
    }
  }
  store.dispatch(coreActions.setHeadCommit(newId));

  const logPrimString = composeLogPrim(logEntry);
  const newContent = USDA_PARSER.appendToUsdaFile(
    state.loadedFiles["statement.usda"],
    logPrimString,
    "ChangeLog"
  );
  store.dispatch(coreActions.updateFile("statement.usda", newContent));
}

/**
 * Recomposes the stage hierarchy by resolving references and applying visibility filters
 * This is the core function for USD layer composition in the viewer
 *
 * Process:
 * 1. Filters staged prims based on user ownership (non-PMs only see their own layers)
 * 2. Resolves all references (@file.usda@</Path>) by loading and merging content
 * 3. Stamps source file metadata (_sourceFile, _sourcePath, _sourceLayerStatus) for renderer
 * 4. Recursively processes children and merges local edits with referenced content
 * 5. Updates composed hierarchy in store for 3D viewer
 *
 * Reference resolution patterns supported:
 * - @filename.usda@</Path> (full reference with path)
 * - @filename.usda@ (reference to default prim)
 * - filename.usda@</Path> (missing leading @)
 * - filename.usda (simple filename)
 *
 * @example
 * recomposeStage();
 * // Resolves all references in the layer stack and updates the composed hierarchy
 * // The 3D viewer will re-render based on the new composed hierarchy
 */
export function recomposeStage() {
  const state = store.getState();
  let stagedPrims = state.stage.composedPrims || [];

  // Strict Visibility Filter for 3D Viewer
  if (state.currentUser !== "Project Manager") {
    stagedPrims = stagedPrims.filter((prim) => {
      // If no source file, assume it's safe (or blocking it might break local edits)
      // But strict mode means we only show what we own.
      // However, newly added prims might not have _sourceFile yet until saved?
      // For now, check if it maps to a known layer.
      if (prim._sourceFile) {
        const layer = state.stage.layerStack.find(
          (l) => l.filePath === prim._sourceFile
        );
        if (layer && layer.owner && layer.owner !== state.currentUser) {
          return false; // Hide this prim
        }
      }
      return true;
    });
  }

  if (stagedPrims.length === 0) {
    store.dispatch(coreActions.setComposedHierarchy([]));
    console.log("[RECOMPOSE] No staged prims, cleared hierarchy");
    return;
  }

  console.log(
    "[RECOMPOSE] Recomposing stage with",
    stagedPrims.length,
    "prims"
  );

  // Recursive function to resolve references and build the full renderable tree
  function resolveHierarchy(prims) {
    if (!prims || !Array.isArray(prims)) {
      console.warn(
        "[RECOMPOSE] Invalid prims array passed to resolveHierarchy"
      );
      return [];
    }

    return prims.map((prim) => {
      // Clone the prim to avoid mutating the source of truth
      const resolvedPrim = {
        ...prim,
        children: [],
        properties: { ...prim.properties },
      };

      // 1. Resolve Reference if present
      if (resolvedPrim.references) {
        let fileName = null;
        let pathInFile = null;

        const ref = resolvedPrim.references.trim();

        const matchFull = ref.match(/^@([^@]+)@<([^>]+)>$/);
        const matchSimple = ref.match(/^@([^@]+)@$/);
        // Support: filename.usda@</path> (Missing leading @)
        const matchNoLeadingAt = ref.match(/^([^@]+)@<([^>]+)>$/);
        // Allow simple filenames too (e.g. from some USDA generators or user tweaks)
        const matchRaw = ref.match(/^([^@<>\s]+\.(?:usda|usd|usdc))$/i);

        if (matchFull) {
          fileName = matchFull[1];
          pathInFile = matchFull[2];
        } else if (matchNoLeadingAt) {
          fileName = matchNoLeadingAt[1];
          pathInFile = matchNoLeadingAt[2];
        } else if (matchSimple) {
          fileName = matchSimple[1];
        } else if (matchRaw) {
          fileName = matchRaw[1];
        }

        if (fileName) {
          const fileContent = state.loadedFiles[fileName];
          if (fileContent) {
            // Parse the source file
            const sourceHierarchy = USDA_PARSER.getPrimHierarchy(fileContent);

            // If no explicit path, use the first root prim as a heuristic for defaultPrim
            if (!pathInFile && sourceHierarchy.length > 0) {
              pathInFile = sourceHierarchy[0].path;
            }

            // Find the target prim in the source
            let targetPrim = null;

            if (pathInFile) {
              // Helper to find path in hierarchy
              const findPrim = (list, targetPath) => {
                if (!list || !Array.isArray(list)) return null;
                for (const p of list) {
                  if (p.path === targetPath) return p;
                  if (targetPath.startsWith(p.path + "/")) {
                    const child = findPrim(p.children || [], targetPath);
                    if (child) return child;
                  }
                }
                return null;
              };
              targetPrim = findPrim(sourceHierarchy, pathInFile);
            }

            if (targetPrim) {
              resolvedPrim.type = targetPrim.type;
              resolvedPrim.properties = {
                ...targetPrim.properties,
                ...resolvedPrim.properties,
              };
              resolvedPrim.children = targetPrim.children
                ? JSON.parse(JSON.stringify(targetPrim.children))
                : [];

              // Look up layer status - FORCE FRESH LOOKUP
              const currentLayer = state.stage.layerStack.find(
                (l) => l.filePath === fileName
              );
              const layerStatus = currentLayer
                ? currentLayer.status
                : "Published";

              // CRITICAL FIX: Stamp the SOURCE PATH so the renderer can find the geometry
              // The renderer keys geometry by the path in the source file, not the staged path.
              resolvedPrim._sourceFile = fileName;
              resolvedPrim._sourcePath = targetPrim.path;
              resolvedPrim._sourceLayerStatus = layerStatus;
              console.log(`[RECOMPOSE] Set _sourcePath for ${resolvedPrim.path} to ${targetPrim.path} from file ${fileName}`);

              // Recursively stamp source path on children
              const stampChildren = (children, source, status) => {
                if (!children || !Array.isArray(children)) return;
                children.forEach((child) => {
                  child._sourceFile = source;
                  child._sourceLayerStatus = status;
                  // The child path in the source hierarchy IS the source path
                  child._sourcePath = child.path;
                  if (child.children)
                    stampChildren(child.children, source, status);
                });
              };
              stampChildren(resolvedPrim.children, fileName, layerStatus);
            } else {
              console.warn(
                `[RECOMPOSE] Target prim '${pathInFile}' not found in '${fileName}'`
              );
            }
          } else {
            console.warn(
              `[RECOMPOSE] Reference '${fileName}' found in code but file not loaded in loadedFiles.`
            );
          }
        } else {
          console.warn(
            `[RECOMPOSE] Invalid reference format: ${resolvedPrim.references}`
          );
        }
      }

      if (prim.children && prim.children.length > 0) {
        const localChildren = resolveHierarchy(prim.children);
        resolvedPrim.children = [...resolvedPrim.children, ...localChildren];
      }

      if (resolvedPrim.children.length > 0) {
        const tagChildren = (list, source, status) => {
          if (!list || !Array.isArray(list)) return;
          list.forEach((c) => {
            if (!c._sourceFile) c._sourceFile = source;
            if (!c._sourceLayerStatus && status) c._sourceLayerStatus = status;
            if (c.children) tagChildren(c.children, source, status);
          });
        };
        if (resolvedPrim._sourceFile) {
          tagChildren(
            resolvedPrim.children,
            resolvedPrim._sourceFile,
            resolvedPrim._sourceLayerStatus
          );
        }
      }

      return resolvedPrim;
    });
  }

  store.dispatch(
    coreActions.setComposedHierarchy(resolveHierarchy(stagedPrims))
  );
  console.log(
    "[RECOMPOSE] Composed hierarchy with",
    store.getState().composedHierarchy.length,
    "root prims"
  );
}

export function initLayerStack(updateView, fileThreeScene, stageThreeScene) {
  const layerStackList = document.getElementById("layerStackList");
  const addFileButton = document.getElementById("add-file-button");
  const deleteFileButton = document.getElementById("delete-file-button");
  const setStageButton = document.getElementById("set-stage-button");
  const promoteLayerButton = document.getElementById("promote-layer-button");
  const demoteLayerButton = document.getElementById("demote-layer-button");
  const fileInput = document.getElementById("usdaFileInput");
  const layerFilterControls = document.getElementById("layer-filter-controls");

  // ==================== Add File Button ====================
  const handleAddFile = errorHandler.wrap(() => {
    // Field Person cannot upload files
    const currentUser = store.getState().currentUser;
    if (currentUser === "Field Person") {
      throw new ValidationError(
        "Field Person users cannot upload files",
        "user",
        currentUser
      );
    }
    fileInput.click();
  });

  addFileButton.addEventListener("click", handleAddFile);

  // Migration: Fix legacy ownership if present
  const layerStack = store.getState().stage.layerStack.map((layer) => {
    if (layer.owner === "user1") return { ...layer, owner: "Architect" };
    if (layer.owner === "user2")
      return { ...layer, owner: "Structural Engineer" };
    return layer;
  });
  store.dispatch(coreActions.updateLayerStack(layerStack));
  renderLayerStack();

  // ==================== File Input Change Handler ====================
  const handleFileInput = errorHandler.wrap((event) => {
    const file = event.target.files[0];

    if (!file) {
      return; // No file selected, no error
    }

    // Validate file extension
    if (!file.name.endsWith(".usda") && !file.name.endsWith(".usd")) {
      throw new FileError(
        "Invalid file type. Please select a .usda or .usd file",
        file.name
      );
    }

    const reader = new FileReader();

    reader.onerror = () => {
      throw new FileError(
        `Failed to read file: ${reader.error?.message || "Unknown error"}`,
        file.name,
        reader.error
      );
    };

    reader.onload = errorHandler.wrap((e) => {
      const fileContent = e.target.result;

      if (!fileContent || typeof fileContent !== "string") {
        throw new FileError("File content is empty or invalid", file.name);
      }

      // TODO: Use layerService.createLayer() here in future refactor
      const atomicFiles = explodeUsda(fileContent, file.name);

      Object.entries(atomicFiles).forEach(([fileName, content]) => {
        store.dispatch(coreActions.loadFile(fileName, content));

        // Create layer with current user as owner
        const newLayer = {
          id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          filePath: fileName,
          status: "WIP",
          visible: true,
          owner: store.getState().currentUser,
          groupName: Object.keys(atomicFiles).length > 1 ? file.name : null,
        };
        store.dispatch(coreActions.addLayer(newLayer));
      });

      renderLayerStack();
      console.log(
        `✅ Successfully loaded ${Object.keys(atomicFiles).length} file(s) from ${file.name}`
      );
    });

    reader.readAsText(file);
    fileInput.value = ""; // Reset to allow re-importing
  });

  fileInput.addEventListener("change", handleFileInput);

  // Helper to select prims belonging to specific layers
  const selectLayerPrims = (layerFilePath) => {
    if (store.getState().currentView !== "stage") return; // Only applicable in Stage View for now

    const targetPaths = [];
    const findPaths = (prims) => {
      for (const prim of prims) {
        if (prim._sourceFile === layerFilePath) {
          targetPaths.push(prim.path);
        }
        if (prim.children) findPaths(prim.children);
      }
    };
    if (store.getState().composedHierarchy) {
      findPaths(store.getState().composedHierarchy);
    }

    if (stageThreeScene && stageThreeScene.selectionController) {
      stageThreeScene.selectionController.selectPrims(targetPaths);
    }
  };

  layerStackList.addEventListener("click", (e) => {
    const targetLi = e.target.closest("li");
    if (!targetLi) return;

    // Check if this is a group item
    const isGroup = targetLi.dataset.isGroup === "true";
    const groupName = targetLi.dataset.groupName;
    const layerIds = isGroup
      ? targetLi.dataset.layerIds.split(",")
      : [targetLi.dataset.layerId];

    // Get all layers for this item (single or group)
    const currentLayerStack = store.getState().stage.layerStack;
    const layers = layerIds
      .map((id) => currentLayerStack.find((l) => l.id === id))
      .filter((l) => l);
    if (layers.length === 0) return;

    // Handle Visibility Toggle
    if (e.target.closest(".visibility-toggle")) {
      e.stopPropagation();
      // Toggle visibility for all layers in the group
      const newVisibility = !layers[0].visible;
      const updatedStack = currentLayerStack.map((l) => {
        if (layerIds.includes(l.id)) {
          return { ...l, visible: newVisibility };
        }
        return l;
      });
      store.dispatch(coreActions.updateLayerStack(updatedStack));

      renderLayerStack();
      recomposeStage();
      if (store.getState().currentView === "stage") updateView();
      // Also potentially select prims? User only clicked eye. Maybe not.
      return;
    }

    // Handle Status Click
    if (e.target.closest(".status-indicator")) {
      e.stopPropagation();

      // Permission Check: Only Owner or Project Manager can change status
      const currentUser = store.getState().currentUser;
      const unauthorizedLayers = layers.filter(
        (layer) =>
          currentUser !== "Project Manager" &&
          layer.owner &&
          layer.owner !== currentUser
      );

      if (unauthorizedLayers.length > 0) {
        alert(
          `Permission Denied: Only the owner or Project Manager can change the status of this layer.`
        );
        return;
      }

      const currentIndex = STATUS_ORDER.indexOf(layers[0].status);
      const nextIndex = (currentIndex + 1) % STATUS_ORDER.length;
      const newStatus = STATUS_ORDER[nextIndex];

      // Apply status change to all layers in the group
      const currentStack = store.getState().stage.layerStack;
      const updatedStack = currentStack.map((l) => {
        if (layers.find((target) => target.id === l.id)) {
          const updatedLayer = { ...l, status: newStatus };
          // We need to sync prim status here or after
          // syncPrimStatusFromLayer mutates prims, so we need to handle that carefully
          // For now, let's update the layer stack first
          return updatedLayer;
        }
        return l;
      });
      store.dispatch(coreActions.updateLayerStack(updatedStack));

      // Now sync prim status (which will update composedPrims)
      layers.forEach((layer) => {
        // We need to pass the UPDATED layer info
        syncPrimStatusFromLayer({ ...layer, status: newStatus });
      });

      renderLayerStack();
      recomposeStage();
      if (store.getState().currentView === "stage") {
        updateView();
        // Select prims from all layers in the group
        layers.forEach((layer) => selectLayerPrims(layer.filePath));
      }
      return;
    }

    // Handle Selection (Clicking Name/Row)
    if (e.ctrlKey || e.metaKey) {
      if (targetLi.classList.contains("selected")) {
        targetLi.classList.remove("selected");
      } else {
        targetLi.classList.add("selected");
      }

      // Re-calculate selectedFiles - for groups, include all layers
      const selectedElements = Array.from(
        document
          .getElementById("layerStackList")
          .querySelectorAll("li.selected")
      );
      const selectedFiles = [];

      selectedElements.forEach((el) => {
        const isGroupEl = el.dataset.isGroup === "true";
        if (isGroupEl) {
          // Add all files from the group
          const groupLayerIds = el.dataset.layerIds.split(",");
          groupLayerIds.forEach((id) => {
            const layer = store
              .getState()
              .stage.layerStack.find((l) => l.id === id);
            if (layer && store.getState().loadedFiles[layer.filePath]) {
              selectedFiles.push({
                name: layer.filePath,
                content: store.getState().loadedFiles[layer.filePath],
              });
            }
          });
        } else {
          // Single file
          const fp = el.dataset.filePath;
          if (store.getState().loadedFiles[fp]) {
            if (!selectedFiles.find((f) => f.name === fp)) {
              selectedFiles.push({
                name: fp,
                content: store.getState().loadedFiles[fp],
              });
            }
          }
        }
      });

      store.dispatch(coreActions.setSelectedFiles(selectedFiles));

      if (selectedFiles.length === 1) {
        store.dispatch(coreActions.setCurrentFile(selectedFiles[0].name));
        document.getElementById("currentFileTab").textContent =
          selectedFiles[0].name;
      } else if (selectedFiles.length > 1) {
        // Check if first file is valid before setting
        if (selectedFiles[0])
          store.dispatch(coreActions.setCurrentFile(selectedFiles[0].name));
        document.getElementById("currentFileTab").textContent =
          "Multiple Files";
      } else {
        store.dispatch(coreActions.setCurrentFile(null));
        document.getElementById("currentFileTab").textContent = "None";
      }

      store.dispatch(coreActions.setCurrentView("file"));
      updateView();
    } else {
      // Single Selection
      if (isGroup) {
        // For groups, select all files in the group
        document.getElementById("sampleSceneItem").classList.remove("selected");
        const allItems = document
          .getElementById("layerStackList")
          .querySelectorAll("li");
        allItems.forEach((item) => item.classList.remove("selected"));
        targetLi.classList.add("selected");

        const state = store.getState(); // Get fresh state
        const newSelectedFiles = layers
          .map((layer) => ({
            name: layer.filePath,
            content: state.loadedFiles[layer.filePath],
          }))
          .filter((item) => item.content);

        store.dispatch(coreActions.setSelectedFiles(newSelectedFiles));

        const firstFileName = newSelectedFiles[0]?.name || null;
        store.dispatch(coreActions.setCurrentFile(firstFileName));

        document.getElementById("currentFileTab").textContent =
          newSelectedFiles.length > 1 ? groupName : firstFileName || "None";

        store.dispatch(coreActions.setCurrentView("file"));
        updateView();
      } else {
        // Single layer selection
        handleLayerSelection(targetLi, updateView);
      }
    }
  });

  // ==================== Layer Filter Controls ====================
  const handleLayerFilter = errorHandler.wrap((e) => {
    if (!e.target.classList.contains("filter-btn")) {
      return; // Not a filter button, ignore
    }

    const filter = e.target.dataset.filter;

    if (!filter) {
      throw new ValidationError(
        "Filter button missing data-filter attribute",
        "filter",
        null
      );
    }

    store.dispatch(coreActions.setLayerFilter(filter));

    layerFilterControls
      .querySelectorAll(".filter-btn")
      .forEach((btn) => btn.classList.remove("active"));
    e.target.classList.add("active");

    renderLayerStack();

    if (store.getState().currentView === "stage") {
      updateView();
    }

    console.log(`🔍 Filter changed to: ${filter}`);
  });

  layerFilterControls.addEventListener("click", handleLayerFilter);

  // ==================== Delete File Button ====================
  const handleDeleteFile = errorHandler.wrap(() => {
    const selectedLayerItems = layerStackList.querySelectorAll("li.selected");

    if (selectedLayerItems.length === 0) {
      throw new ValidationError(
        "Please select a layer to delete",
        "selection",
        null
      );
    }

    const filePaths = Array.from(selectedLayerItems).map(
      (li) => li.dataset.filePath
    );

    const state = store.getState();

    // Check ownership before allowing deletion
    if (state.currentUser !== "Project Manager") {
      const unauthorizedLayers = state.stage.layerStack.filter(
        (layer) =>
          filePaths.includes(layer.filePath) &&
          layer.owner &&
          layer.owner !== state.currentUser
      );

      if (unauthorizedLayers.length > 0) {
        throw new ValidationError(
          `You can only delete layers owned by ${state.currentUser}. ${unauthorizedLayers.length} selected layer(s) belong to other users`,
          "permission",
          unauthorizedLayers.map((l) => l.filePath)
        );
      }
    }

    const confirmMessage =
      filePaths.length === 1
        ? `Are you sure you want to remove layer '${filePaths[0]}' from the stack?`
        : `Are you sure you want to remove ${filePaths.length} layers from the stack?`;

    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }

    const newStack = state.stage.layerStack.filter(
      (layer) => !filePaths.includes(layer.filePath)
    );
    store.dispatch(coreActions.updateLayerStack(newStack));

    const currentFile = state.currentFile;
    const currentFileRemoved = currentFile && filePaths.includes(currentFile);

    renderLayerStack();
    recomposeStage();

    if (currentFileRemoved) {
      store.dispatch(coreActions.setCurrentFile(null));
      store.dispatch(coreActions.setCurrentView("stage"));
      document.getElementById("sampleSceneItem").click();
    } else {
      updateView();
    }

    console.log(`✅ Deleted ${filePaths.length} layer(s)`);
  });

  deleteFileButton.addEventListener("click", handleDeleteFile);

  // ==================== Set Stage Button ====================
  const handleSetStage = errorHandler.wrap(() => {
    const selectedFileItems = layerStackList.querySelectorAll("li.selected");

    if (selectedFileItems.length === 0) {
      throw new ValidationError(
        "Please select a file to open the prim selector",
        "selection",
        null
      );
    }

    // Permission Check
    const layerId = selectedFileItems[0].dataset.layerId;
    const state = store.getState();
    const layer = state.stage.layerStack.find((l) => l.id === layerId);

    if (
      layer &&
      state.currentUser !== "Project Manager" &&
      layer.owner &&
      layer.owner !== state.currentUser
    ) {
      throw new ValidationError(
        `Only the owner (${layer.owner}) or Project Manager can stage items from this layer`,
        "permission",
        { user: state.currentUser, owner: layer.owner }
      );
    }

    // Modal currently only supports single file context
    const fileName = selectedFileItems[0].dataset.filePath;
    document.dispatchEvent(
      new CustomEvent("openPrimModal", { detail: { fileName, mode: "normal" } })
    );
  });

  setStageButton.addEventListener("click", handleSetStage);

  // ==================== Entity Stage Button ====================
  const entityStageButton = document.getElementById("entity-stage-button");
  if (entityStageButton) {
    // Remove existing listeners to prevent duplicates if init is called multiple times
    const newBtn = entityStageButton.cloneNode(true);
    entityStageButton.parentNode.replaceChild(newBtn, entityStageButton);

    const handleEntityStage = errorHandler.wrap(() => {
      const selectedFileItems = layerStackList.querySelectorAll("li.selected");

      if (selectedFileItems.length === 0) {
        throw new ValidationError(
          "Please select a file to open the entity selector",
          "selection",
          null
        );
      }

      // Permission Check
      const layerId = selectedFileItems[0].dataset.layerId;
      const state = store.getState();
      const layer = state.stage.layerStack.find((l) => l.id === layerId);

      if (
        layer &&
        state.currentUser !== "Project Manager" &&
        layer.owner &&
        layer.owner !== state.currentUser
      ) {
        throw new ValidationError(
          `Only the owner (${layer.owner}) or Project Manager can create entity placeholders from this layer`,
          "permission",
          { user: state.currentUser, owner: layer.owner }
        );
      }

      // Modal currently only supports single file context
      const fileName = selectedFileItems[0].dataset.filePath;
      document.dispatchEvent(
        new CustomEvent("openPrimModal", {
          detail: { fileName, mode: "entity" },
        })
      );
    });

    newBtn.addEventListener("click", handleEntityStage);
  }

  promoteLayerButton.addEventListener("click", () => {
    // 1. Check for Object Selection in 3D View
    let objectsToPromote = [];

    console.log("[PROMOTE] Button clicked");
    console.log("[PROMOTE] Current view:", store.getState().currentView);

    // Check both file view and stage view scenes
    const activeScene = store.getState().currentView === "stage" ? stageThreeScene : fileThreeScene;
    console.log("[PROMOTE] Using scene:", store.getState().currentView === "stage" ? "stageThreeScene" : "fileThreeScene");
    console.log("[PROMOTE] activeScene exists:", !!activeScene);
    console.log("[PROMOTE] selectionController exists:", !!activeScene?.selectionController);

    if (activeScene && activeScene.selectionController) {
      const { selectedMeshes, activeMesh } = activeScene.selectionController;

      console.log("[PROMOTE] selectedMeshes size:", selectedMeshes?.size);
      console.log("[PROMOTE] activeMesh:", activeMesh?.name);

      const primPaths = new Set();
      if (selectedMeshes && selectedMeshes.size > 0) {
        selectedMeshes.forEach(m => {
          console.log("[PROMOTE] Checking mesh:", m.name, "primPath:", m.userData.primPath, "visible:", m.visible);
          if (m.userData.primPath && m.visible) {
             primPaths.add(m.userData.primPath);
          }
        });
      } else if (activeMesh && activeMesh.userData.primPath && activeMesh.visible) {
         primPaths.add(activeMesh.userData.primPath);
      }

      console.log("[PROMOTE] primPaths collected:", primPaths.size, Array.from(primPaths));

      if (primPaths.size > 0) {
          const findPrim = (nodes, path) => {
            for (const n of nodes) {
              if (n.path === path) return n;
              if (n.children) {
                const found = findPrim(n.children, path);
                if (found) return found;
              }
            }
            return null;
          };

          const composedHierarchy = store.getState().composedHierarchy || [];
          console.log("[PROMOTE] composedHierarchy length:", composedHierarchy.length);

          primPaths.forEach(path => {
              const prim = findPrim(composedHierarchy, path);
              console.log("[PROMOTE] Finding prim for path:", path, "found:", !!prim);
              if (prim) {
                  objectsToPromote.push(prim);
              }
          });
      }
    }

    console.log("[PROMOTE] objectsToPromote length:", objectsToPromote.length);

    if (objectsToPromote.length > 0) {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            mode: "object",
            prims: objectsToPromote, // Plural
            direction: "promote",
          },
        })
      );
      return;
    }

    // 2. Check for Layer Selection
    const selectedLis = layerStackList.querySelectorAll("li.selected");
    
    if (selectedLis.length === 0) {
      alert("Please select one or more layers or objects to promote.");
      return;
    }

    // Layer Promotion Logic
    const selectedLayers = Array.from(selectedLis)
      .map((li) => {
        const layerId = li.dataset.layerId;
        return store.getState().stage.layerStack.find((l) => l.id === layerId);
      })
      .filter((l) => l);

    if (selectedLayers.length === 0) return;

    // Permission Check
    if (store.getState().currentUser !== "Project Manager") {
      const unauthorized = selectedLayers.filter(
        (l) => l.owner && l.owner !== store.getState().currentUser
      );
      if (unauthorized.length > 0) {
        alert(
          `Permission Denied: You cannot promote layers owned by others. ${unauthorized.length} layer(s) belong to other users.`
        );
        return;
      }
    }

    // Dispatch event to open modal
    document.dispatchEvent(
      new CustomEvent("openPromotionModal", {
        detail: { initialSelection: selectedLayers, direction: "promote" },
      })
    );
  });

  demoteLayerButton.addEventListener("click", () => {
    // 1. Check for Object Selection in 3D View
    let objectsToDemote = [];

    console.log("[DEMOTE] Button clicked");
    console.log("[DEMOTE] Current view:", store.getState().currentView);

    // Check both file view and stage view scenes
    const activeScene = store.getState().currentView === "stage" ? stageThreeScene : fileThreeScene;
    console.log("[DEMOTE] Using scene:", store.getState().currentView === "stage" ? "stageThreeScene" : "fileThreeScene");
    console.log("[DEMOTE] activeScene exists:", !!activeScene);
    console.log("[DEMOTE] selectionController exists:", !!activeScene?.selectionController);

    if (activeScene && activeScene.selectionController) {
      const { selectedMeshes, activeMesh } = activeScene.selectionController;

      console.log("[DEMOTE] selectedMeshes size:", selectedMeshes?.size);
      console.log("[DEMOTE] activeMesh:", activeMesh?.name);

      const primPaths = new Set();
      if (selectedMeshes && selectedMeshes.size > 0) {
        selectedMeshes.forEach(m => {
          console.log("[DEMOTE] Checking mesh:", m.name, "primPath:", m.userData.primPath, "visible:", m.visible);
          if (m.userData.primPath && m.visible) {
             primPaths.add(m.userData.primPath);
          }
        });
      } else if (activeMesh && activeMesh.userData.primPath && activeMesh.visible) {
         primPaths.add(activeMesh.userData.primPath);
      }

      console.log("[DEMOTE] primPaths collected:", primPaths.size, Array.from(primPaths));

      if (primPaths.size > 0) {
          const findPrim = (nodes, path) => {
            for (const n of nodes) {
              if (n.path === path) return n;
              if (n.children) {
                const found = findPrim(n.children, path);
                if (found) return found;
              }
            }
            return null;
          };

          const composedHierarchy = store.getState().composedHierarchy || [];
          console.log("[DEMOTE] composedHierarchy length:", composedHierarchy.length);

          primPaths.forEach(path => {
              const prim = findPrim(composedHierarchy, path);
              console.log("[DEMOTE] Finding prim for path:", path, "found:", !!prim);
              if (prim) {
                  objectsToDemote.push(prim);
              }
          });
      }
    }

    console.log("[DEMOTE] objectsToDemote length:", objectsToDemote.length);

    if (objectsToDemote.length > 0) {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            mode: "object",
            prims: objectsToDemote, // Plural
            direction: "demote",
          },
        })
      );
      return;
    }

    // 2. Check for Layer Selection
    const selectedLis = layerStackList.querySelectorAll("li.selected");
    
    if (selectedLis.length === 0) {
      alert("Please select one or more layers or objects to demote.");
      return;
    }

    // Layer Demotion Logic
    const selectedLayers = Array.from(selectedLis)
      .map((li) => {
        const layerId = li.dataset.layerId;
        return store.getState().stage.layerStack.find((l) => l.id === layerId);
      })
      .filter((l) => l);

    if (selectedLayers.length === 0) return;

    // Permission Check
    if (store.getState().currentUser !== "Project Manager") {
      const unauthorized = selectedLayers.filter(
        (l) => l.owner && l.owner !== store.getState().currentUser
      );
      if (unauthorized.length > 0) {
        alert(
          `Permission Denied: You cannot demote layers owned by others. ${unauthorized.length} layer(s) belong to other users.`
        );
        return;
      }
    }

    // Dispatch event to open modal
    document.dispatchEvent(
      new CustomEvent("openPromotionModal", {
        detail: { initialSelection: selectedLayers, direction: "demote" },
      })
    );
  });

  renderLayerStack();

  console.log("✅ Layer Stack Controller initialized with error handling");
}
// ... existing code ...

export function refreshComposedStage(
  modifiedFileName,
  specificPrimPath = null
) {
  console.log("[REFRESH] Starting refresh for file:", modifiedFileName);
  console.log("[REFRESH] Specific prim path:", specificPrimPath);

  const state = store.getState();
  if (!state.loadedFiles[modifiedFileName]) {
    console.warn("[REFRESH] File not found in loadedFiles:", modifiedFileName);
    return;
  }

  // 1. Get fresh hierarchy from the modified file
  let freshHierarchy = USDA_PARSER.getPrimHierarchy(
    state.loadedFiles[modifiedFileName]
  );
  console.log(
    "[REFRESH] Fresh hierarchy parsed:",
    freshHierarchy.length,
    "root prims"
  );

  // If a specific prim path is provided, only process that prim
  if (specificPrimPath) {
    console.log("[REFRESH] Filtering for specific prim:", specificPrimPath);

    // Helper function to recursively find a prim by path
    const findPrimByPath = (prims, targetPath) => {
      for (const prim of prims) {
        if (prim.path === targetPath) {
          return prim;
        }
        if (prim.children && prim.children.length > 0) {
          const found = findPrimByPath(prim.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };

    const targetPrim = findPrimByPath(freshHierarchy, specificPrimPath);

    if (targetPrim) {
      freshHierarchy = [targetPrim];
      console.log(
        "[REFRESH] Found specific prim:",
        targetPrim.name,
        "at path:",
        targetPrim.path
      );
    } else {
      console.warn(
        "[REFRESH] Specific prim not found in fresh hierarchy:",
        specificPrimPath
      );
      return;
    }
  }

  // 2. Update state.stage.composedPrims
  // Clone composedPrims to avoid direct mutation
  const composedPrims = state.stage.composedPrims
    ? JSON.parse(JSON.stringify(state.stage.composedPrims))
    : [];

  // Helper to merge a node into a list
  const mergeNode = (list, newNode) => {
    const existingNode = list.find((n) => n.name === newNode.name); // Match by name (assuming same scope)
    console.log(
      "[REFRESH] Merging node:",
      newNode.name,
      "Existing:",
      !!existingNode
    );

    // Determine Status
    const sourceLayer = state.stage.layerStack.find(
      (l) => l.filePath === modifiedFileName
    );
    const layerStatus = sourceLayer ? sourceLayer.status : "Published";
    console.log("[REFRESH] Layer status:", layerStatus);

    if (existingNode) {
      existingNode.type = newNode.type;

      // Merge properties (but preserve local overrides if any? For now, source wins for simplicity as per requirement)
      existingNode.properties = {
        ...existingNode.properties,
        ...newNode.properties,
      };

      // Fix: If this node is a reference, we do NOT want to explicitly list its children from the source
      // as they are already included by the reference.
      // We clear them here to "fix" any existing bad state.
      // (Note: This assumes we don't have *other* valid overrides we want to keep.
      //  Given the user's request, strictly enforcing reference semantics is the priority.)
      if (existingNode.references) {
        existingNode.children = [];
      } else {
        // Only recurse if it's NOT a reference (local grouping/hierarchy)
        if (newNode.children) {
          if (!existingNode.children) existingNode.children = [];
          newNode.children.forEach((child) =>
            mergeNode(existingNode.children, child)
          );
        }
      }
    } else {
      // New Node! Check if this prim already exists in the stage from another file
      // to avoid duplicates when the same prim is referenced in multiple files
      const existingInStage = list.find((p) => p.path === newNode.path);
      if (existingInStage) {
        console.log(
          "[REFRESH] Prim already exists in stage, skipping:",
          newNode.name
        );
        return; // Skip this prim to avoid duplicates
      }

      console.log("[REFRESH] Creating new prim for:", newNode.name);

      // CRITICAL FIX: Check if the prim already has a reference in the source file
      // - If it has a reference, preserve it (user explicitly set it)
      // - If it doesn't have a reference, it's a standalone prim definition (no reference needed)
      // This allows creating standalone prims when user selects "Reference: None"

      const refPrim = {
        specifier: "def",
        type: newNode.type,
        name: newNode.name,
        path: newNode.path,
        properties: { ...newNode.properties },
        children: [],
      };

      // Preserve existing reference if present, otherwise leave as standalone prim
      if (newNode.references) {
        // Prim has a reference, keep it
        refPrim.references = newNode.references;
        console.log(
          "[REFRESH] Preserved existing reference:",
          refPrim.references
        );
      } else {
        // Prim is a standalone definition (user chose "Reference: None")
        console.log("[REFRESH] Standalone prim (no reference)");
      }

      // recursively stamp source info (vital for renderer)
      const stamp = (n) => {
        n._sourceFile = modifiedFileName;
        n._sourceLayerStatus = layerStatus;
        n._sourcePath = n.path;

        if (n.children) n.children.forEach(stamp);
      };
      stamp(refPrim);

      list.push(refPrim);
    }
  };

  console.log(
    "[REFRESH] Merging",
    freshHierarchy.length,
    "fresh prims into stage"
  );
  freshHierarchy.forEach((rootPrim) => {
    mergeNode(composedPrims, rootPrim);
  });

  console.log(
    "[REFRESH] Before cleanup - composedPrims count:",
    composedPrims.length
  );
  console.log("[REFRESH] Fresh hierarchy count:", freshHierarchy.length);
  console.log(
    "[REFRESH] Fresh prim names:",
    freshHierarchy.map((p) => p.name)
  );

  // CRITICAL FIX: Only run cleanup when refreshing the ENTIRE file, not when adding a specific prim
  // If we're processing a specific prim, we don't want to remove other prims from the same file
  let finalPrims = composedPrims;
  if (!specificPrimPath) {
    console.log(
      "[REFRESH] Running cleanup (removing prims that no longer exist)"
    );
    // Remove prims that no longer exist in the source file
    // This prevents deleted prims from persisting in the stage
    const freshPrimNames = new Set(freshHierarchy.map((p) => p.name));
    const beforeCount = finalPrims.length;
    finalPrims = finalPrims.filter((prim) => {
      // Keep prims from other files (not affected by this deletion)
      if (prim._sourceFile !== modifiedFileName) {
        console.log(
          "[REFRESH] Keeping prim from other file:",
          prim.name,
          "from",
          prim._sourceFile
        );
        return true;
      }

      // Keep prims from this file that still exist in the fresh hierarchy
      const shouldKeep = freshPrimNames.has(prim.name);
      console.log(
        "[REFRESH] Prim",
        prim.name,
        "from",
        modifiedFileName,
        "- Keep:",
        shouldKeep
      );
      return shouldKeep;
    });
    const afterCount = finalPrims.length;
    console.log(
      "[REFRESH] After cleanup - composedPrims count:",
      afterCount,
      "(removed",
      beforeCount - afterCount,
      "prims)"
    );
  } else {
    console.log("[REFRESH] Skipping cleanup (processing specific prim only)");
  }

  // UPDATE STATE WITH NEW PRIMS
  store.dispatch(coreActions.setComposedHierarchy(finalPrims));

  console.log("[REFRESH] Calling recomposeStage to update hierarchy");
  recomposeStage();
  console.log("[REFRESH] Refresh complete for:", modifiedFileName);
}

export function syncPrimStatusFromLayer(layer) {
  const state = store.getState();
  if (!state.stage.composedPrims) return;

  const composedPrims = JSON.parse(JSON.stringify(state.stage.composedPrims));

  const updatePrimStatus = (list) => {
    list.forEach((p) => {
      if (p._sourceFile === layer.filePath) {
        p._sourceLayerStatus = layer.status;
      }
      if (p.children) updatePrimStatus(p.children);
    });
  };

  updatePrimStatus(composedPrims);
  store.dispatch(coreActions.setComposedHierarchy(composedPrims));
}
