// src/components/outlinerController.js
// REFACTORED: Enhanced with error handling and core architecture
import { store, errorHandler, ValidationError } from "../core/index.js";
import { resolvePrimStatus } from "../utils/statusUtils.js";
const nextFrame = () =>
  new Promise((resolve) => requestAnimationFrame(resolve));

/**
 * Find all descendant meshes for a given prim path
 * @param {Array} meshes - Array of THREE.Mesh objects
 * @param {string} primPath - Path to search from
 * @returns {Array} - All meshes whose primPath starts with the given path
 */
const findDescendantMeshes = errorHandler.wrap((meshes, primPath) => {
  if (!Array.isArray(meshes)) {
    throw new ValidationError("Meshes must be an array", "meshes", meshes);
  }

  if (!primPath || typeof primPath !== "string") {
    throw new ValidationError(
      "PrimPath must be a valid string",
      "primPath",
      primPath
    );
  }

  return meshes.filter((m) => {
    if (!m.userData.primPath) return false;
    // Exact match OR descendant (starts with path + "/")
    return (
      m.userData.primPath === primPath ||
      m.userData.primPath.startsWith(primPath + "/")
    );
  });
});

export const makeItemCollapsible = errorHandler.wrap(
  (liElement, childUlElement) => {
    if (!liElement || !(liElement instanceof HTMLElement)) {
      throw new ValidationError(
        "liElement must be a valid HTML element",
        "liElement",
        liElement
      );
    }

    if (!childUlElement || !(childUlElement instanceof HTMLElement)) {
      throw new ValidationError(
        "childUlElement must be a valid HTML element",
        "childUlElement",
        childUlElement
      );
    }

    liElement.classList.add("collapsible", "collapsed");
    childUlElement.style.display = "none";
  }
);

const buildOutlinerNodesRecursive = errorHandler.wrapAsync(
  async (prims, parentUl, allMeshesByFile, log, indent = "") => {
    if (!prims || !Array.isArray(prims)) {
      throw new ValidationError("Prims must be an array", "prims", prims);
    }

    if (!parentUl || !(parentUl instanceof HTMLElement)) {
      throw new ValidationError(
        "ParentUl must be a valid HTML element",
        "parentUl",
        parentUl
      );
    }
    for (let i = 0; i < prims.length; i++) {
      const prim = prims[i];
      const meshName = prim.path.substring(1);
      const allMeshes = Object.values(allMeshesByFile).flat();

      // Try exact match first
      let mesh = allMeshes.find((m) => m.userData.primPath === prim.path);

      // If no exact match, find first descendant mesh (for parent containers)
      if (!mesh && prim.children && prim.children.length > 0) {
        mesh = allMeshes.find(
          (m) =>
            m.userData.primPath &&
            m.userData.primPath.startsWith(prim.path + "/")
        );
      }

      // Safety: ensure properties object exists
      if (!prim.properties) {
        prim.properties = {};
      }

      const nameForUI = prim.properties.displayName || prim.name;
      // PHASE 4: ACTIVE STATE MANAGEMENT - Use centralized resolver
      const status = resolvePrimStatus(prim, store.getState().stage.layerStack);
      const statusIndicator = `<span class="status-indicator ${status.toLowerCase()}" title="${status}">${status.charAt(
        0
      )}</span>`;
      const visibilityToggle = `<span class="visibility-toggle">👁️</span>`;
      const editButton = `<span class="edit-prim-button" title="Edit Prim">✏️</span>`;

      const isInterfaceObject = !!prim.payload;
      let icon = prim.type === "Xform" ? "📦" : "🧊";

      const isScope =
        prim.type === "Scope" ||
        (prim.type === "Xform" &&
          prim.children &&
          prim.children.some(
            (c) => c.type === "Mesh" && (c.references || c.payload)
          ));
      if (isScope) {
        icon = "📂";
      }

      let tooltip = "";
      if (isInterfaceObject) {
        icon = "🔗";
        tooltip = `Payload: ${prim.payload}`;
      }

      const rowContent = `
      <div class="outliner-row" title="${tooltip}">
        <span class="outliner-toggler" style="visibility: ${
          prim.children && prim.children.length > 0 ? "visible" : "hidden"
        };">v</span>
        <span class="outliner-icon">${icon}</span>
        <span class="outliner-text">${nameForUI}</span>
        <div class="outliner-controls">${editButton}${statusIndicator}${visibilityToggle}</div>
      </div>
    `;

      // Always create fresh DOM elements to avoid circular reference issues
      const childItem = document.createElement("li");
      childItem.classList.add("prim-item");
      childItem.innerHTML = rowContent;

      if (isInterfaceObject) childItem.classList.add("interface-object");

      childItem.dataset.primPath = prim.path;
      childItem.dataset.meshName = meshName;

      // Store reference for potential future use (but don't reuse the element)
      if (mesh) mesh.userData.outlinerElement = childItem;

      if (prim.children && prim.children.length > 0) {
        const childUl = document.createElement("ul");
        await buildOutlinerNodesRecursive(
          prim.children,
          childUl,
          allMeshesByFile,
          log,
          indent + "  "
        );
        childItem.appendChild(childUl);
        makeItemCollapsible(childItem, childUl);
      }
      parentUl.appendChild(childItem);
      if (i % 50 === 0) await nextFrame();
    }
  }
);

export const buildFileOutliner = errorHandler.wrap(
  (outlinerEl, combinedHierarchy) => {
    if (!outlinerEl || !(outlinerEl instanceof HTMLElement)) {
      throw new ValidationError(
        "outlinerEl must be a valid HTML element",
        "outlinerEl",
        outlinerEl
      );
    }

    outlinerEl.innerHTML = "";
    outlinerEl.className = "blender-outliner";
    const fragment = document.createDocumentFragment();

    const sceneName =
      document.getElementById("sampleSceneItem").textContent || "Stage";
    const sceneRootLi = document.createElement("li");
    sceneRootLi.classList.add("scene-item");
    sceneRootLi.dataset.type = "hierarchy";
    sceneRootLi.innerHTML = `<div class="outliner-row"><span class="outliner-toggler">v</span><span class="outliner-icon">🏛️</span><span class="outliner-text">${sceneName}</span><div class="outliner-controls"><span class="visibility-toggle">👁️</span></div></div>`;
    const layersListUl = document.createElement("ul");
    sceneRootLi.appendChild(layersListUl);
    fragment.appendChild(sceneRootLi);
    makeItemCollapsible(sceneRootLi, layersListUl);

    if (combinedHierarchy) {
      Object.entries(combinedHierarchy).forEach(([fileName, hierarchy]) => {
        const layerLi = document.createElement("li");
        layerLi.classList.add("layer-item");
        layerLi.dataset.type = "hierarchy";
        layerLi.innerHTML = `<div class="outliner-row"><span class="outliner-toggler">v</span><span class="outliner-icon">📄</span><span class="outliner-text">${fileName}</span><div class="outliner-controls"><span class="visibility-toggle">👁️</span></div></div>`;
        const primsForFileUl = document.createElement("ul");
        layerLi.appendChild(primsForFileUl);
        layersListUl.appendChild(layerLi);
        makeItemCollapsible(layerLi, primsForFileUl);

        Object.entries(hierarchy).forEach(([xformName, children]) => {
          const topItem = document.createElement("li");
          topItem.classList.add("xform-item");
          topItem.dataset.type = "hierarchy";
          topItem.innerHTML = `<div class="outliner-row"><span class="outliner-toggler">v</span><span class="outliner-icon">📦</span><span class="outliner-text">${xformName}</span><div class="outliner-controls"><span class="visibility-toggle">👁️</span></div></div>`;
          const childList = document.createElement("ul");
          children.forEach(({ mesh }) => {
            const childItem = mesh.userData.outlinerElement;
            childList.appendChild(childItem);
          });
          topItem.appendChild(childList);
          primsForFileUl.appendChild(topItem);
          makeItemCollapsible(topItem, childList);
        });
      });
    }
    outlinerEl.appendChild(fragment);
  }
);

let isBuilding = false;

export const buildStageOutliner = errorHandler.wrapAsync(
  async (outlinerEl, composedHierarchy, allMeshesByFile, state) => {
    if (!outlinerEl || !(outlinerEl instanceof HTMLElement)) {
      throw new ValidationError(
        "outlinerEl must be a valid HTML element",
        "outlinerEl",
        outlinerEl
      );
    }

    // Prevent concurrent builds
    if (isBuilding) {
      console.warn(
        "[OUTLINER] Build already in progress, skipping duplicate call"
      );
      return;
    }

    isBuilding = true;
    try {
      const log = [];
      outlinerEl.innerHTML = "";
      outlinerEl.className = "blender-outliner";
      const fragment = document.createDocumentFragment();
      const sceneName = state.sceneName || "Stage";
      if (!composedHierarchy) return;

      const sceneRootLi = document.createElement("li");
      sceneRootLi.classList.add("scene-item");
      sceneRootLi.dataset.type = "hierarchy";
      sceneRootLi.innerHTML = `<div class="outliner-row"><span class="outliner-toggler">v</span><span class="outliner-icon">🏛️</span><span class="outliner-text">${sceneName}</span><div class="outliner-controls"><span class="visibility-toggle">👁️</span></div></div>`;
      const primsListUl = document.createElement("ul");
      sceneRootLi.appendChild(primsListUl);

      await buildOutlinerNodesRecursive(
        composedHierarchy,
        primsListUl,
        allMeshesByFile,
        log,
        "  "
      );
      fragment.appendChild(sceneRootLi);
      makeItemCollapsible(sceneRootLi, primsListUl);
      outlinerEl.appendChild(fragment);

      console.log(
        `✅ Built stage outliner with ${composedHierarchy ? composedHierarchy.length : 0} root prims`
      );
    } finally {
      isBuilding = false;
    }
  }
);

export const initOutlinerEvents = errorHandler.wrap(
  (fileThreeScene, stageThreeScene) => {
    const outlinerEl = document.getElementById("usdaOutliner");

    if (!outlinerEl) {
      throw new ValidationError(
        "usdaOutliner element not found",
        "outlinerEl",
        null
      );
    }

    outlinerEl.addEventListener("click", (e) => {
      try {
        const fileCanvas = document.getElementById("webglCanvas");
        const activeScene =
          fileCanvas.style.display !== "none"
            ? fileThreeScene
            : stageThreeScene;
        const toggler = e.target.closest(".outliner-toggler");
        const visibilityToggle = e.target.closest(".visibility-toggle");
        const editToggle = e.target.closest(".edit-prim-button"); // NEW: Capture Edit Click
        const row = e.target.closest(".outliner-row");
        if (!row) return;
        const parentLi = row.parentElement;

        if (toggler) {
          e.stopPropagation();
          const isCollapsed = parentLi.classList.toggle("collapsed");
          const childUl = parentLi.querySelector("ul");
          if (childUl) childUl.style.display = isCollapsed ? "none" : "block";
          return;
        }

        if (editToggle) {
          e.stopPropagation();

          if (store.getState().isHistoryMode) {
            throw new ValidationError(
              "Cannot edit hierarchy in History Mode",
              "isHistoryMode",
              true
            );
          }

          // Dispatch 'openReferenceModal' event to show "Update" UI
          const primPath = parentLi.dataset.primPath;
          if (primPath) {
            document.dispatchEvent(
              new CustomEvent("openReferenceModal", {
                detail: { primPath: primPath },
              })
            );
          }
          return;
        }

        const isPrim = parentLi.classList.contains("prim-item");
        const isHierarchy = parentLi.dataset.type === "hierarchy";

        if (isPrim) {
          const primPath = parentLi.dataset.primPath;

          // Try to find exact mesh match first
          const mesh = activeScene.meshesGroup.children.find(
            (m) => m.userData.primPath === primPath
          );

          // If no exact match, find all descendant meshes (for parent containers like Scope/Xform)
          if (!mesh) {
            const descendantMeshes = findDescendantMeshes(
              activeScene.meshesGroup.children,
              primPath
            );

            if (descendantMeshes.length > 0) {
              console.log(
                `[OUTLINER] Found ${descendantMeshes.length} descendant meshes for parent path:`,
                primPath
              );

              if (visibilityToggle) {
                e.stopPropagation();
                // Toggle visibility of all descendants
                const newVisibility = !descendantMeshes[0].visible;
                descendantMeshes.forEach((m) =>
                  activeScene.selectionController.setVisibility(
                    m,
                    newVisibility
                  )
                );
              } else {
                // Select all descendants as a group
                activeScene.selectionController.toggleHierarchySelection(
                  parentLi,
                  descendantMeshes,
                  primPath
                );
              }
              return; // Exit early - descendants handled
            } else {
              // No mesh or descendants found - this is likely an empty Xform or container
              console.log(
                `[OUTLINER] No mesh found for path, but dispatching primSelected anyway:`,
                primPath
              );

              if (!visibilityToggle) {
                // Dispatch primSelected event so properties panel can show prim data
                document.dispatchEvent(
                  new CustomEvent("primSelected", {
                    detail: { primPath: primPath },
                  })
                );
              }
              return; // Exit early - event dispatched
            }
          }

          // Handle exact match (original logic)
          if (mesh) {
            if (visibilityToggle) {
              e.stopPropagation();
              activeScene.selectionController.setVisibility(
                mesh,
                !mesh.visible
              );
            } else {
              activeScene.selectionController.togglePrimSelection(
                primPath,
                e.ctrlKey || e.metaKey
              );
            }
          }
        } else if (isHierarchy) {
          const childPrims = parentLi.querySelectorAll(".prim-item");
          const meshes = Array.from(childPrims)
            .map((li) =>
              activeScene.meshesGroup.children.find(
                (m) => m.userData.primPath === li.dataset.primPath
              )
            )
            .filter(Boolean);
          if (meshes.length === 0) return;
          if (visibilityToggle) {
            e.stopPropagation();
            const newVisibility = !meshes[0].visible;
            meshes.forEach((m) =>
              activeScene.selectionController.setVisibility(m, newVisibility)
            );
          } else {
            activeScene.selectionController.toggleHierarchySelection(
              parentLi,
              meshes,
              parentLi.dataset.primPath
            );
          }
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          errorHandler.handleError(error);
          return;
        }
        throw error;
      }
    });

    console.log("✅ Outliner events initialized with error handling");
  }
);
