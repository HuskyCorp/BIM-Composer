import { store } from "../../core/index.js";
import { actions } from "../../state/actions.js";
import { recomposeStage } from "./layerStackController.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import {
  removePrimFromFile,
  insertPrimIntoFile,
} from "../../viewer/usda/usdaEditor.js";

// ── Drag-and-drop reparenting ─────────────────────────────────────────────

function initDragAndDrop(outliner, updateView) {
  let dragSourcePath = null;

  // Make existing items draggable and watch for newly rendered items
  function makeItemsDraggable() {
    outliner
      .querySelectorAll("li.prim-item:not([draggable])")
      .forEach((li) => li.setAttribute("draggable", "true"));
  }

  makeItemsDraggable();

  const observer = new MutationObserver(makeItemsDraggable);
  observer.observe(outliner, { childList: true, subtree: true });

  outliner.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li.prim-item");
    if (!li) return;
    dragSourcePath = li.dataset.primPath;
    e.dataTransfer.setData("text/plain", dragSourcePath);
    e.dataTransfer.effectAllowed = "move";
    // Defer so the browser snapshot isn't taken while opacity is 0
    setTimeout(() => li.classList.add("dragging"), 0);
  });

  outliner.addEventListener("dragend", (e) => {
    const li = e.target.closest("li.prim-item");
    if (li) li.classList.remove("dragging");
    outliner
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
    dragSourcePath = null;
  });

  outliner.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const li = e.target.closest("li.prim-item");
    if (!li || li.dataset.primPath === dragSourcePath) return;
    outliner
      .querySelectorAll(".drag-over")
      .forEach((el) => el.classList.remove("drag-over"));
    li.classList.add("drag-over");
  });

  outliner.addEventListener("dragleave", (e) => {
    // Only clear if we're leaving the li entirely (not a child element)
    const li = e.target.closest("li.prim-item");
    if (li && !li.contains(e.relatedTarget)) {
      li.classList.remove("drag-over");
    }
  });

  outliner.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetLi = e.target.closest("li.prim-item");
    if (!targetLi) return;
    targetLi.classList.remove("drag-over");

    const sourcePath = e.dataTransfer.getData("text/plain");
    const targetPath = targetLi.dataset.primPath;

    if (!sourcePath || sourcePath === targetPath) return;
    // Prevent dropping onto own descendant
    if (targetPath.startsWith(sourcePath + "/")) return;
    // Prevent same-parent no-op
    const currentParent = sourcePath.substring(0, sourcePath.lastIndexOf("/"));
    if (currentParent === targetPath) return;

    // Move the DOM node immediately for visual feedback
    const sourceLi = outliner.querySelector(
      `li.prim-item[data-prim-path="${CSS.escape(sourcePath)}"]`
    );
    if (sourceLi) {
      let targetUl = targetLi.querySelector(":scope > ul");
      if (!targetUl) {
        targetUl = document.createElement("ul");
        targetLi.appendChild(targetUl);
      }
      targetUl.appendChild(sourceLi);
      // Expand target if it was collapsed
      targetLi.classList.remove("collapsed");
      targetUl.style.display = "block";
    }

    reparentPrim(sourcePath, targetPath, updateView);
  });
}

function reparentPrim(sourcePath, newParentPath, updateView) {
  const state = store.getState();
  if (state.isHistoryMode) return;

  const primName = sourcePath.split("/").pop();
  const newPath = newParentPath + "/" + primName;

  // Find a prim node by path in any nested tree
  const findInTree = (list, path) => {
    if (!list) return null;
    for (const p of list) {
      if (p.path === path) return p;
      if (p.children) {
        const found = findInTree(p.children, path);
        if (found) return found;
      }
    }
    return null;
  };

  const hierarchy = state.composedHierarchy || [];
  const sourceNode = findInTree(hierarchy, sourcePath);
  const targetNode = findInTree(hierarchy, newParentPath);

  // 1. Log staged change for the record
  actions.addStagedChange({
    type: "reparent",
    targetPath: newPath,
    oldPath: sourcePath,
    primName,
    sourceFile: sourceNode?._sourceFile || "unknown",
    user: state.currentUser,
    timestamp: new Date().toISOString(),
    sourceStatus: sourceNode?.properties?.status || "WIP",
    targetStatus: sourceNode?.properties?.status || "WIP",
  });

  // 2. Modify the USDA layer file(s) to move the prim block.
  //
  // IMPORTANT: after recomposeStage(), composedHierarchy._sourceFile is
  // overwritten with the GEOMETRY file (the resolved reference target), not the
  // staging layer file where the def/references block actually lives.
  // We must search the layer stack directly to find the correct layer file.

  const findPrimInLayerFiles = (primPath) => {
    // Build set of geometry/referenced files to skip — these files are targets
    // of `references` on staged prims and must NOT be modified during reparenting.
    const referencedFiles = new Set();
    const collectRefs = (prims) => {
      if (!prims) return;
      prims.forEach((p) => {
        if (p.references) {
          const refMatch = p.references.match(/@([^@<>\s]+)@/);
          if (refMatch) referencedFiles.add(refMatch[1]);
        }
        if (p.children) collectRefs(p.children);
      });
    };
    collectRefs(state.stage.composedPrims || []);

    const findNode = (nodes, path) => {
      for (const n of nodes) {
        if (n.path === path) return n;
        if (n.children) {
          const found = findNode(n.children, path);
          if (found) return found;
        }
      }
      return null;
    };
    for (const layer of state.stage.layerStack) {
      if (layer.filePath === "statement.usda") continue;
      if (referencedFiles.has(layer.filePath)) continue; // skip geometry files
      const content = state.loadedFiles[layer.filePath];
      if (!content) continue;
      const fh = USDA_PARSER.getPrimHierarchy(content);
      const node = findNode(fh, primPath);
      if (node && typeof node.startIndex === "number") {
        return { layerFile: layer.filePath, fileNode: node };
      }
    }
    return null;
  };

  const sourceLayerInfo = findPrimInLayerFiles(sourcePath);
  const targetLayerInfo = findPrimInLayerFiles(newParentPath);

  if (sourceLayerInfo) {
    const { layerFile: sourceFile, fileNode } = sourceLayerInfo;
    const fileContent = state.loadedFiles[sourceFile];
    const primText = fileContent.slice(
      fileNode.startIndex,
      fileNode.endIndex + 1
    );
    const contentWithoutPrim = removePrimFromFile(fileContent, sourcePath);

    const targetLayerFile = targetLayerInfo?.layerFile || sourceFile;

    if (targetLayerFile === sourceFile) {
      const newFileContent = insertPrimIntoFile(
        contentWithoutPrim,
        newParentPath,
        primText
      );
      actions.updateLoadedFile(sourceFile, newFileContent);
    } else {
      actions.updateLoadedFile(sourceFile, contentWithoutPrim);
      if (state.loadedFiles[targetLayerFile]) {
        const newTargetContent = insertPrimIntoFile(
          state.loadedFiles[targetLayerFile],
          newParentPath,
          primText
        );
        actions.updateLoadedFile(targetLayerFile, newTargetContent);
      }
    }
  } else {
    console.warn(
      "[REPARENT] Could not find prim in any layer file:",
      sourcePath
    );
  }

  // 3. Update composedPrims in-memory tree to match the new hierarchy
  if (state.stage.composedPrims) {
    const composedPrims = JSON.parse(JSON.stringify(state.stage.composedPrims));

    // Remove the source node from wherever it currently lives
    let reparentedNode = null;
    const removeFromTree = (list) => {
      for (let i = 0; i < list.length; i++) {
        if (list[i].path === sourcePath) {
          reparentedNode = list.splice(i, 1)[0];
          return true;
        }
        if (list[i].children && removeFromTree(list[i].children)) {
          return true;
        }
      }
      return false;
    };
    removeFromTree(composedPrims);

    if (reparentedNode) {
      // Update path (and _sourcePath for inline prims) of the moved subtree.
      // Reference prims keep their _sourcePath pointing into the referenced file —
      // recomposeStage() re-stamps those after resolving the reference.
      // Inline prims (no references) have _sourcePath === their file path, so we
      // must update it here so the geometry cache lookup still matches.
      const replacePaths = (node) => {
        const oldNodePath = node.path;
        if (node.path === sourcePath) {
          node.path = newPath;
        } else if (node.path.startsWith(sourcePath + "/")) {
          node.path = newPath + node.path.slice(sourcePath.length);
        }
        if (!node.references && node._sourcePath === oldNodePath) {
          node._sourcePath = node.path;
        }
        if (node.children) node.children.forEach(replacePaths);
      };
      replacePaths(reparentedNode);

      // Attach to the target parent in the tree
      const findParent = (list, path) => {
        for (const n of list) {
          if (n.path === path) return n;
          if (n.children) {
            const found = findParent(n.children, path);
            if (found) return found;
          }
        }
        return null;
      };
      const targetParent = findParent(composedPrims, newParentPath);
      if (targetParent) {
        if (!targetParent.children) targetParent.children = [];
        targetParent.children.push(reparentedNode);
      } else {
        // Fallback: push to root if target not found
        composedPrims.push(reparentedNode);
      }

      actions.setComposedPrims(composedPrims);
    }
  }

  // 4. Rebuild the composed hierarchy and refresh the view
  recomposeStage();
  if (typeof updateView === "function") updateView();
}

export function initHierarchyPanel(updateView) {
  const outliner = document.getElementById("usdaOutliner");
  const expandAllButton = document.getElementById("expand-all-button");
  const collapseAllButton = document.getElementById("collapse-all-button");
  const addPrimButton = document.getElementById("add-prim-button");
  const removePrimButton = document.getElementById("remove-prim-button");

  addPrimButton.addEventListener("click", () => {
    // Don't automatically use selected item as parent
    // Let the modal determine the correct parent (defaultPrim or user-specified)
    // If user wants to add as child, they can manually fill the parent path field
    if (store.getState().isHistoryMode) {
      alert("Cannot edit hierarchy in History Mode.");
      return;
    }

    document.dispatchEvent(
      new CustomEvent("openReferenceModal", {
        detail: {
          primPath: null, // Signals "Add Mode"
          parentPath: null, // Let modal auto-detect defaultPrim
        },
      })
    );
  });

  removePrimButton.addEventListener("click", () => {
    const selectedItem = outliner.querySelector("li.selected");
    if (!selectedItem) {
      alert("Please select a prim to remove.");
      return;
    }

    // Validate that we have a composed hierarchy to work with
    const state = store.getState();
    if (state.isHistoryMode) {
      alert("Cannot edit hierarchy in History Mode.");
      return;
    }
    if (!state.composedHierarchy || state.composedHierarchy.length === 0) {
      alert("No prims in the stage to remove.");
      return;
    }

    // Find the actual prim node in our state to identify source file
    const primPath = selectedItem.dataset.primPath;

    if (!primPath) {
      alert("Invalid prim selection - no path found.");
      return;
    }

    // Recursive finder
    const findPrim = (list) => {
      if (!list || !Array.isArray(list)) return null;
      for (const p of list) {
        if (p.path === primPath) return p;
        if (p.children) {
          const f = findPrim(p.children);
          if (f) return f;
        }
      }
      return null;
    };

    const primNode = findPrim(state.composedHierarchy || []);

    if (!primNode) {
      alert("Prim not found in stage. The hierarchy may have changed.");
      return;
    }

    // Check ownership - only allow removing prims from user's own layers (UNLESS Project Manager)
    if (primNode._sourceFile && state.currentUser !== "Project Manager") {
      const sourceLayer = state.stage.layerStack.find(
        (l) => l.filePath === primNode._sourceFile
      );
      if (
        sourceLayer &&
        sourceLayer.owner &&
        sourceLayer.owner !== state.currentUser
      ) {
        alert(
          `You can only remove elements owned by ${state.currentUser}. This element belongs to ${sourceLayer.owner}.`
        );
        return;
      }
    }

    if (
      !confirm(
        `Are you sure you want to remove '${primNode.name}' from the stage?`
      )
    ) {
      return;
    }

    try {
      console.log("[REMOVE PRIM] Starting unstaging...");
      console.log("[REMOVE PRIM] Prim path:", primPath);
      console.log("[REMOVE PRIM] Prim name:", primNode.name);

      // Remove the prim from composedPrims (unstage it)
      const removePrimFromComposed = (list, pathToRemove) => {
        if (!list || !Array.isArray(list)) return [];
        return list.filter((prim) => {
          // Don't remove if this is the target prim
          if (prim.path === pathToRemove) {
            console.log(
              "[REMOVE PRIM] Removing prim:",
              prim.name,
              "at",
              prim.path
            );
            return false;
          }
          // Recursively clean children
          if (prim.children && prim.children.length > 0) {
            prim.children = removePrimFromComposed(prim.children, pathToRemove);
          }
          return true;
        });
      };

      console.log(
        "[REMOVE PRIM] After removal - composedPrims count:",
        state.stage.composedPrims?.length || 0
      ); // Before update

      // Collect all remaining paths after this deletion for the log
      const allRemainingPaths = [];
      const collectPaths = (prims) => {
        if (!prims || !Array.isArray(prims)) return;
        prims.forEach((p) => {
          if (p.path !== primPath) allRemainingPaths.push(p.path);
          if (p.children) collectPaths(p.children);
        });
      };
      collectPaths(state.stage.composedPrims || []);

      // Stage the deletion — written to statement.usda only on Record Changes
      console.log("[REMOVE PRIM] Staging deletion...");
      actions.addStagedChange({
        type: "deletion",
        targetPath: primPath,
        primName: primNode.name,
        sourceFile: primNode._sourceFile || "unknown",
        sourceStatus: primNode.properties?.status || "WIP",
        user: store.getState().currentUser,
        timestamp: new Date().toISOString(),
      });

      // Remove from composedPrims
      const newComposedPrims = removePrimFromComposed(
        state.stage.composedPrims || [],
        primPath
      );
      actions.setComposedPrims(newComposedPrims);

      console.log(
        "[REMOVE PRIM] After removal - composedPrims count:",
        newComposedPrims.length
      );

      // Recompose the stage to update the hierarchy
      console.log("[REMOVE PRIM] Calling recomposeStage...");
      recomposeStage();

      console.log(
        "[REMOVE PRIM] composedHierarchy count:",
        state.composedHierarchy?.length || 0
      );

      if (state.currentView === "stage") {
        console.log("[REMOVE PRIM] Calling updateView...");
        updateView();
      }

      console.log("[REMOVE PRIM] Unstaging complete!");
    } catch (e) {
      console.error("Remove failed:", e);
      alert("Failed to remove prim: " + e.message);
    }
  });

  // Enable drag-and-drop reparenting
  initDragAndDrop(outliner, updateView);

  expandAllButton.addEventListener("click", () => {
    const collapsibleItems = outliner.querySelectorAll(".collapsible");
    collapsibleItems.forEach((item) => {
      item.classList.remove("collapsed");
      const childUl = item.querySelector("ul");
      if (childUl) {
        childUl.style.display = "block";
      }
    });
  });

  collapseAllButton.addEventListener("click", () => {
    const collapsibleItems = outliner.querySelectorAll(".collapsible");
    collapsibleItems.forEach((item) => {
      item.classList.add("collapsed");
      const childUl = item.querySelector("ul");
      if (childUl) {
        childUl.style.display = "none";
      }
    });
  });
}
