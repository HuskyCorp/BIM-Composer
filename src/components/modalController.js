// src/components/modalController.js
// REFACTORED: Enhanced with error handling and core architecture
import {
  store,
  errorHandler,
  ParseError,
  ValidationError,
  FileError,
} from "../core/index.js";
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";
import { stagePrims } from "./staging/primStaging.js";

const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

async function buildTreeUI(prims, parentUl, sourceFile, defaultStatus) {
  for (let i = 0; i < prims.length; i++) {
    const prim = prims[i];
    const li = document.createElement("li");
    li.dataset.prim = JSON.stringify(prim);
    li.dataset.primPath = prim.path;
    if (sourceFile) {
      li.dataset.sourceFile = sourceFile;
    }

    const status = prim.properties.status || defaultStatus || "Published";
    const statusIndicator = `<span class="status-indicator ${status.toLowerCase()}" title="Status: ${status}">${status.charAt(
      0
    )}</span>`;
    const icon = prim.type === "Xform" ? "📦" : "🧊";
    const togglerVisibility =
      prim.children && prim.children.length > 0 ? "visible" : "hidden";
    const toggler = `<span class="outliner-toggler" style="visibility: ${togglerVisibility};">v</span>`;

    const sourceLabel = sourceFile
      ? `<span class="source-file-label" style="font-size: 0.8em; color: #888; margin-left: auto;">${sourceFile}</span>`
      : "";

    li.innerHTML = `<div class="outliner-row">${statusIndicator}${toggler}<span class="outliner-icon">${icon}</span><span class="outliner-text">${prim.name}</span>${sourceLabel}</div>`;

    if (prim.children && prim.children.length > 0) {
      const childrenSource = sourceFile;
      const childUl = document.createElement("ul");
      await buildTreeUI(prim.children, childUl, childrenSource, defaultStatus);
      li.appendChild(childUl);
      li.classList.add("collapsible", "collapsed");
      childUl.style.display = "none";
    }
    parentUl.appendChild(li);

    if (i % 50 === 0) {
      await nextFrame();
    }
  }
}

function moveSelected(sourceList, targetList) {
  const selectedItems = Array.from(sourceList.querySelectorAll("li.selected"));
  const allPrimsInSource = new Map();
  sourceList.querySelectorAll("li").forEach((li) => {
    allPrimsInSource.set(li.dataset.primPath, li);
  });

  selectedItems.forEach((item) => {
    const primData = JSON.parse(item.dataset.prim);
    const pathSegments = primData.path.split("/").filter(Boolean);
    let currentParentUl = targetList;

    for (let i = 0; i < pathSegments.length - 1; i++) {
      const ancestorPath = "/" + pathSegments.slice(0, i + 1).join("/");
      let ancestorLi = Array.from(currentParentUl.children).find(
        (child) => child.dataset.primPath === ancestorPath
      );

      if (!ancestorLi) {
        const sourceAncestorLi = allPrimsInSource.get(ancestorPath);
        if (sourceAncestorLi) {
          ancestorLi = sourceAncestorLi.cloneNode(false);
          currentParentUl.appendChild(ancestorLi);
        } else {
          continue;
        }
      }

      let childUl = ancestorLi.querySelector("ul");
      if (!childUl) {
        childUl = document.createElement("ul");
        ancestorLi.appendChild(childUl);
        if (!ancestorLi.classList.contains("collapsible")) {
          ancestorLi.classList.add("collapsible");
          const toggler = ancestorLi.querySelector(".outliner-toggler");
          if (toggler) toggler.style.visibility = "visible";
        }
      }
      currentParentUl = childUl;
    }

    // Preserve dataset when moving? cloneNode does, but we are appending the item itself.
    // However, if we built ancestors, do they have the sourceFile?

    // CRITICAL: ancestorLi created from sourceAncestorLi.cloneNode(false) WILL copy dataset attributes.
    // So sourceFile should propagate correctly for ancestors too if they existed in sourceList.

    currentParentUl.appendChild(item);
    item.classList.remove("selected");
  });

  sourceList.querySelectorAll("ul").forEach((ul) => {
    if (!ul.hasChildNodes()) {
      const parentLi = ul.parentElement;
      ul.remove();
      if (parentLi && parentLi.classList.contains("collapsible")) {
        parentLi.classList.remove("collapsible");
        const toggler = parentLi.querySelector(".outliner-toggler");
        if (toggler) toggler.style.visibility = "hidden";
      }
    }
  });
}

export function initModal(updateView) {
  const modal = document.getElementById("prim-selection-modal");
  const availablePrimsList = document.getElementById("available-prims-list");
  const stagePrimsList = document.getElementById("stage-prims-list");
  const addPrimToStageButton = document.getElementById("add-prim-to-stage");
  const removePrimFromStageButton = document.getElementById(
    "remove-prim-from-stage"
  );
  const addAllPrimsToStageButton = document.getElementById(
    "add-all-prims-to-stage"
  );
  const removeAllPrimsFromStageButton = document.getElementById(
    "remove-all-prims-from-stage"
  );
  const saveHierarchyButton = document.getElementById("save-hierarchy-button");
  const closeModalButton = document.getElementById("close-modal-button");

  let currentModalFile = null;
  // let currentMode = "normal"; // REMOVED: Use DOM state to avoid closure issues

  // ==================== Handle Open Modal Event ====================
  const handleOpenModal = errorHandler.wrap((e) => {
    const { fileName, mode, preSelectedItems } = e.detail || {};

    if (!fileName) {
      throw new ValidationError(
        "fileName is required in event detail",
        "fileName",
        e.detail
      );
    }

    currentModalFile = fileName;
    // Store mode in DOM to ensure single source of truth across potential multiple closures
    modal.dataset.mode = mode || "normal";
    openPrimSelectionModal(fileName, preSelectedItems);
  });

  document.addEventListener("openPrimModal", handleOpenModal);

  // Keep this legacy/alternative listener for completeness, though likely unused by the button flow
  document.addEventListener("sendToStage", (e) => {
    const { primPaths, mode } = e.detail;
    stagePrims(primPaths, { isEntity: mode === "entity" });
    updateView();
  });

  // ==================== Open Prim Selection Modal ====================
  const openPrimSelectionModal = errorHandler.wrapAsync(
    async (fileName, preSelectedItems) => {
      if (!fileName) {
        throw new ValidationError(
          "File name is required to open modal",
          "fileName",
          null
        );
      }

      const state = store.getState();
      const fileContent = state.loadedFiles[fileName];

      if (!fileContent) {
        throw new FileError(
          `Could not find content for file: ${fileName}`,
          fileName
        );
      }

      // Parse hierarchy with error handling
      let originalHierarchy;
      try {
        originalHierarchy = USDA_PARSER.getPrimHierarchy(fileContent);
      } catch (error) {
        throw new ParseError(
          `Failed to parse USDA file: ${fileName}`,
          fileContent,
          error
        );
      }

      // Clear existing lists
      availablePrimsList.innerHTML = "";
      stagePrimsList.innerHTML = "";

      // Find layer status

      const layer = state.stage.layerStack.find((l) => l.filePath === fileName);
      const layerStatus = layer ? layer.status : "Published";

      // Build tree UI

      await buildTreeUI(
        originalHierarchy,
        availablePrimsList,
        fileName,
        layerStatus
      );

      // Show modal
      modal.style.display = "flex";

      // Update header based on mode from DOM
      const currentMode = modal.dataset.mode;
      const header = modal.querySelector(".modal-header h2");
      if (header) {
        header.textContent =
          currentMode === "entity"
            ? "Select Entity Placeholders"
            : "Select Prims for Stage";
      }

      // NEW: Handle pre-selected items (multiple, potentially from different files)
      if (
        preSelectedItems &&
        Array.isArray(preSelectedItems) &&
        preSelectedItems.length > 0
      ) {
        console.log(
          `[Modal] Auto-staging ${preSelectedItems.length} pre-selected items`
        );

        const localItems = [];
        const externalItems = [];

        preSelectedItems.forEach((item) => {
          if (item.originFile === fileName) {
            localItems.push(item);
          } else {
            externalItems.push(item);
          }
        });

        console.log(`[Modal] Local Items (${localItems.length}):`, localItems);
        console.log(
          `[Modal] External Items (${externalItems.length}):`,
          externalItems
        );

        // 1. Handle Local Items (select in available list)
        if (localItems.length > 0) {
          const allLis = availablePrimsList.querySelectorAll("li");
          let foundAny = false;

          allLis.forEach((li) => {
            const match = localItems.find(
              (i) => i.primPath === li.dataset.primPath
            );
            if (match) {
              li.classList.add("selected");
              foundAny = true;

              // Ensure parent chain is expanded/visible
              let parent = li.parentElement;
              while (parent && parent !== availablePrimsList) {
                if (parent.tagName === "UL") {
                  parent.style.display = "block";
                  if (
                    parent.parentElement &&
                    parent.parentElement.classList.contains("collapsible")
                  ) {
                    parent.parentElement.classList.remove("collapsed");
                  }
                }
                parent = parent.parentElement;
              }
            }
          });

          if (foundAny) {
            moveSelected(availablePrimsList, stagePrimsList);
          }
        }

        // 2. Handle External Items (create synthetic elements in stage list)
        if (externalItems.length > 0) {
          // Sort by primPath length to ensure parents are processed before children
          externalItems.sort((a, b) => a.primPath.length - b.primPath.length);

          // Map to store created LIs by "OriginFile::PrimPath" for hierarchy lookup
          const createdItemsMap = new Map();

          externalItems.forEach((item) => {
            console.log("DEBUG: Processing external item", item);
            // Check if already staged to avoid duplicates
            const existing = Array.from(
              stagePrimsList.querySelectorAll("li")
            ).find(
              (li) =>
                li.dataset.primPath === item.primPath &&
                li.dataset.sourceFile === item.originFile
            );
            if (existing) {
              console.log("DEBUG: Item already exists", item.primPath);
              return;
            }

            const li = document.createElement("li");
            const primData = {
              path: item.primPath,
              name: item.name || item.primPath.split("/").pop(),
              type: item.type || "Mesh",
              properties: {},
            };
            li.dataset.prim = JSON.stringify(primData);
            li.dataset.primPath = item.primPath;
            li.dataset.sourceFile = item.originFile;

            // Resolve Status from Layer Stack
            const layerStack = store.getState().stage.layerStack;
            const sourceLayer = layerStack.find(
              (l) => l.filePath === item.originFile
            );
            const status = sourceLayer ? sourceLayer.status : "Published";

            const statusIndicator = `<span class="status-indicator ${status.toLowerCase()}" title="Status: ${status}">${status.charAt(0)}</span>`;
            const icon =
              primData.type === "Xform" || primData.type === "Group"
                ? "📦"
                : "🧊";
            const toggler = `<span class="outliner-toggler" style="visibility: visible;">v</span>`; // Visible by default, logic can hide if no children
            const sourceLabel = `<span class="source-file-label" style="font-size: 0.8em; color: #888; margin-left: auto;">${item.originFile}</span>`;

            li.innerHTML = `<div class="outliner-row">${statusIndicator}${toggler}<span class="outliner-icon">${icon}</span><span class="outliner-text">${primData.name}</span>${sourceLabel}</div>`;
            li.classList.add("outliner-item"); // Ensure consistent styling

            // Key for map
            const key = `${item.originFile}::${item.primPath}`;
            createdItemsMap.set(key, li);

            // Attempt to find parent in our map
            // We need to derive the parent path string from the current path
            const parts = item.primPath.split("/");
            parts.pop();
            const parentPath = parts.join("/");
            const parentKey = `${item.originFile}::${parentPath}`;

            const parentLi = createdItemsMap.get(parentKey);

            if (parentLi) {
              // Append to parent
              let childUl = parentLi.querySelector("ul");
              if (!childUl) {
                childUl = document.createElement("ul");
                // childUl.style.display = "block"; // Ensure visible
                parentLi.appendChild(childUl);
              }
              childUl.appendChild(li);
              console.log(
                `[Modal] Nested ${primData.name} under ${parentLi.dataset.primPath}`
              );
            } else {
              // Append to root
              stagePrimsList.appendChild(li);
              console.log(
                `[Modal] Appended root external item: ${primData.name}`
              );
            }
          });
        }
        console.log(
          `[Modal] Final Stage List Child Count: ${stagePrimsList.children.length}`
        );
      }

      console.log(
        `✅ Opened prim selection modal for ${fileName} (${originalHierarchy.length} root prims)`
      );
    }
  );

  // ==================== Handle Tree Interaction ====================
  const handleTreeInteraction = errorHandler.wrap((event) => {
    const targetLi = event.target.closest("li");
    if (!targetLi) return;

    const toggler = event.target.closest(".outliner-toggler");
    if (toggler) {
      event.stopPropagation();
      const isCollapsed = targetLi.classList.toggle("collapsed");
      const childUl = targetLi.querySelector("ul");
      if (childUl) {
        childUl.style.display = isCollapsed ? "none" : "block";
      }
      return;
    }

    if (!event.ctrlKey && !event.metaKey) {
      const container = targetLi.closest(".prim-list-container");
      if (container) {
        container
          .querySelectorAll("li.selected")
          .forEach((li) => li.classList.remove("selected"));
      }
    }
    targetLi.classList.toggle("selected");
  });

  availablePrimsList.addEventListener("click", handleTreeInteraction);
  stagePrimsList.addEventListener("click", handleTreeInteraction);

  // ==================== Button Handlers ====================
  const handleAddToStage = errorHandler.wrap(() => {
    moveSelected(availablePrimsList, stagePrimsList);
    console.log("✅ Moved selected prims to stage list");
  });

  const handleRemoveFromStage = errorHandler.wrap(() => {
    moveSelected(stagePrimsList, availablePrimsList);
    console.log("✅ Moved selected prims back to available list");
  });

  const handleAddAllToStage = errorHandler.wrap(() => {
    const primsToMove = Array.from(availablePrimsList.children);
    if (primsToMove.length === 0) {
      console.log("No prims to move");
      return;
    }
    primsToMove.forEach((primLi) => {
      stagePrimsList.appendChild(primLi);
    });
    console.log(`✅ Moved all ${primsToMove.length} prims to stage`);
  });

  const handleRemoveAllFromStage = errorHandler.wrap(() => {
    const primsToMove = Array.from(stagePrimsList.children);
    if (primsToMove.length === 0) {
      console.log("No prims to remove");
      return;
    }
    primsToMove.forEach((primLi) => {
      availablePrimsList.appendChild(primLi);
    });
    console.log(`✅ Removed all ${primsToMove.length} prims from stage`);
  });

  addPrimToStageButton.addEventListener("click", handleAddToStage);
  removePrimFromStageButton.addEventListener("click", handleRemoveFromStage);
  addAllPrimsToStageButton.addEventListener("click", handleAddAllToStage);
  removeAllPrimsFromStageButton.addEventListener(
    "click",
    handleRemoveAllFromStage
  );

  // ==================== Build Hierarchy From DOM ====================
  function buildHierarchyFromDom(ulElement) {
    const prims = [];
    ulElement.childNodes.forEach((node) => {
      if (node.nodeType !== Node.ELEMENT_NODE || node.tagName !== "LI") return;

      // Parse prim data with error handling
      let primData;
      try {
        primData = JSON.parse(node.dataset.prim);
      } catch (error) {
        console.warn(
          `Failed to parse prim data for node:`,
          node.dataset.prim,
          error
        );
        return; // Skip this node
      }

      // Preserve sourceFile if present in dataset
      if (node.dataset.sourceFile) {
        primData.sourceFile = node.dataset.sourceFile;
      }

      const childUl = node.querySelector(":scope > ul");
      primData.children = childUl ? buildHierarchyFromDom(childUl) : [];
      prims.push(primData);
    });
    return prims;
  }

  // ==================== Save Hierarchy Button ====================
  const handleSaveHierarchy = errorHandler.wrap(() => {
    if (!currentModalFile) {
      throw new ValidationError(
        "No file is currently loaded in modal",
        "currentModalFile",
        null
      );
    }

    // Build hierarchy from staged prims
    const newlyStagedHierarchy = buildHierarchyFromDom(stagePrimsList);

    if (newlyStagedHierarchy.length === 0) {
      console.log("No prims selected for staging");
      modal.style.display = "none";
      return;
    }

    // Extract paths with source file information
    const extractPaths = (nodes) => {
      let paths = [];
      nodes.forEach((n) => {
        // Use the sourceFile from the node if available (for external items), otherwise currentModalFile
        const source = n.sourceFile || currentModalFile;
        paths.push({ path: n.path, sourceFile: source });
        if (n.children) paths = [...paths, ...extractPaths(n.children)];
      });
      return paths;
    };

    const itemsToStage = extractPaths(newlyStagedHierarchy);
    const currentMode = modal.dataset.mode || "normal";

    console.log(
      `[ModalController] Staging ${itemsToStage.length} items from ${currentModalFile}`
    );
    console.log(`[ModalController] Mode: ${currentMode}`);

    // Stage the prims
    stagePrims(itemsToStage, { isEntity: currentMode === "entity" });

    // Close modal and update view
    modal.style.display = "none";
    updateView();

    console.log(
      `✅ Staged ${itemsToStage.length} prim(s) from ${currentModalFile}`
    );
  });

  const handleCloseModal = errorHandler.wrap(() => {
    modal.style.display = "none";
    console.log("Modal closed");
  });

  saveHierarchyButton.addEventListener("click", handleSaveHierarchy);
  closeModalButton.addEventListener("click", handleCloseModal);

  console.log("✅ Modal Controller initialized with error handling");
}
