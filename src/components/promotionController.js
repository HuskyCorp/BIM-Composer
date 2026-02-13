// REFACTORED: Enhanced with error handling and core architecture
import { store, errorHandler, ValidationError } from "../core/index.js";
import { actions } from "../state/actions.js"; // TODO: Migrate to dispatch pattern
import {
  renderLayerStack,
  recomposeStage,
  logPromotionToStatement,
  syncPrimStatusFromLayer,
} from "./sidebar/layerStackController.js";

export function initPromotionController(updateView) {
  const modal = document.getElementById("promotion-modal");
  const eligibleList = document.getElementById("eligible-layers-list");
  const promoteList = document.getElementById("promote-layers-list");
  const targetStatusLabel = document.getElementById("promotion-target-status");

  const closeButton = document.getElementById("close-promotion-modal-button");
  const confirmButton = document.getElementById("confirm-promotion-button");

  const addBtn = document.getElementById("add-layer-to-promote");
  const removeBtn = document.getElementById("remove-layer-from-promote");
  const addAllBtn = document.getElementById("add-all-layers-to-promote");
  const removeAllBtn = document.getElementById(
    "remove-all-layers-from-promote"
  );

  let currentTargetStatus = null;
  let currentSourceStatus = null;
  let promotionMode = "layer"; // "layer" or "object"
  let objectsToPromote = []; // Array of prims

  let promotionDirection = "promote"; // "promote" or "demote"

  document.addEventListener("openPromotionModal", (e) => {
    try {
      const { initialSelection, mode, prim, prims, direction = "promote" } = e.detail;
      promotionDirection = direction;

      const actionText = direction === "demote" ? "Demote" : "Promote";
      const actionTextPresent =
        direction === "demote" ? "Demoting" : "Promoting";
      const actionArrow = direction === "demote" ? "→" : "→"; // Arrow direction usually same logic (A -> B)

      const modalTitle = modal.querySelector("h2");
      if (modalTitle) {
        modalTitle.textContent =
          mode === "object"
            ? `${actionText} Object(s)`
            : `Batch ${actionText} Layers`;
      }

      confirmButton.textContent = actionText;

      // RESET UI
      eligibleList.innerHTML = "";
      promoteList.innerHTML = "";
      modal.style.display = "flex";

      if (mode === "object" && (prim || (prims && prims.length > 0))) {
        promotionMode = "object";
        objectsToPromote = prims || [prim];

        // Determine Status based on first prim
        const firstPrim = objectsToPromote[0];

        // Lookup layer status for context of first prim
        const state = store.getState();
        let layerStatus = "Published";
        if (firstPrim._sourceFile) {
          const layer = state.stage.layerStack.find(
            (l) => l.filePath === firstPrim._sourceFile
          );
          if (layer) layerStatus = layer.status;
        }

        currentSourceStatus = firstPrim.properties.status || layerStatus;

        // Validate all have same status?
        const inconsistent = objectsToPromote.some(p => {
             let pStatus = "Published"; // Default
             if (p._sourceFile) {
                const l = state.stage.layerStack.find(la => la.filePath === p._sourceFile);
                if (l) pStatus = l.status;
             }
             const actualStatus = p.properties.status || pStatus;
             return actualStatus !== currentSourceStatus;
        });

        if (inconsistent) {
             throw new ValidationError(
              `All selected objects must have the same status to batch ${actionText.toLowerCase()}.`,
              "status",
              "Mixed"
            );
        }

        if (promotionDirection === "promote") {
          if (currentSourceStatus === "WIP") currentTargetStatus = "Shared";
          else if (currentSourceStatus === "Shared")
            currentTargetStatus = "Published";
          else {
            throw new ValidationError(
              `Objects are already ${currentSourceStatus} and cannot be promoted further`,
              "status",
              currentSourceStatus
            );
          }
        } else {
          // Demote
          if (currentSourceStatus === "Published")
            currentTargetStatus = "Shared";
          else if (currentSourceStatus === "Shared")
            currentTargetStatus = "WIP";
          else {
            throw new ValidationError(
              `Objects are already ${currentSourceStatus} and cannot be demoted further`,
              "status",
              currentSourceStatus
            );
          }
        }

        const objCountText = objectsToPromote.length > 1 ? `${objectsToPromote.length} Objects` : `Object: ${firstPrim.name}`;
        targetStatusLabel.textContent = `${actionTextPresent} ${objCountText} (${currentSourceStatus} ${actionArrow} ${currentTargetStatus})`;

        // Disable list interactions for object mode
        addBtn.disabled = true;
        removeBtn.disabled = true;
        addAllBtn.disabled = true;
        removeAllBtn.disabled = true;

        // Show the objects in the "Promote" list
        objectsToPromote.forEach(p => {
            const li = document.createElement("li");
            li.innerHTML = `<span class="outliner-icon">📦</span> ${p.name} <span style="opacity:0.6">(${p.path})</span>`;
            promoteList.appendChild(li);
        });

        return;
      }

      promotionMode = "layer";
      objectsToPromote = []; // Clear

      // Re-enable list interactions
      addBtn.disabled = false;
      removeBtn.disabled = false;
      addAllBtn.disabled = false;
      removeAllBtn.disabled = false;

      if (!initialSelection || initialSelection.length === 0) return;

      // Determine common status
      const firstStatus = initialSelection[0].status;
      const consistent = initialSelection.every(
        (l) => l.status === firstStatus
      );

      if (!consistent) {
        throw new ValidationError(
          "Please select layers with the same status to batch promote",
          "status",
          initialSelection.map((l) => l.status)
        );
      }

      currentSourceStatus = firstStatus;
      if (promotionDirection === "promote") {
        if (currentSourceStatus === "WIP") currentTargetStatus = "Shared";
        else if (currentSourceStatus === "Shared")
          currentTargetStatus = "Published";
        else {
          throw new ValidationError(
            "Selected layers are already Published or Archived and cannot be promoted",
            "status",
            currentSourceStatus
          );
        }
      } else {
        // Demote
        if (currentSourceStatus === "Published") currentTargetStatus = "Shared";
        else if (currentSourceStatus === "Shared") currentTargetStatus = "WIP";
        else {
          throw new ValidationError(
            "Selected layers are already WIP and cannot be demoted",
            "status",
            currentSourceStatus
          );
        }
      }

      targetStatusLabel.textContent = `${actionTextPresent} Layers (${currentSourceStatus} ${actionArrow} ${currentTargetStatus})`;

      // Find all layers of this status owned by current user
      const state = store.getState();
      const allMatchingLayers = state.stage.layerStack.filter(
        (l) =>
          l.status === currentSourceStatus &&
          (!l.owner || l.owner === state.currentUser) // Only show current user's layers
      );

      allMatchingLayers.forEach((layer) => {
        const li = createLayerListItem(layer);
        const isSelected = initialSelection.some((sel) => sel.id === layer.id);

        if (isSelected) {
          promoteList.appendChild(li);
        } else {
          eligibleList.appendChild(li);
        }
      });

      console.log(
        `✅ Opened promotion modal (${promotionMode} mode, ${currentSourceStatus} → ${currentTargetStatus})`
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  function createLayerListItem(layer) {
    const li = document.createElement("li");
    li.dataset.layerId = layer.id;

    // Visual elements
    const status = layer.status || "WIP";
    const statusIndicator = `<span class="status-indicator ${status.toLowerCase()}" title="Status: ${status}">${status.charAt(0)}</span>`;

    // Determine icon based on file type or group status (using simple file icon for now)
    const icon = "📄";

    const fileName = layer.filePath.split("/").pop(); // Show basename for cleaner look
    const subtext =
      layer.filePath !== fileName
        ? `<span style="opacity:0.5; font-size:0.8em; margin-left: 8px;">${layer.filePath}</span>`
        : "";

    li.innerHTML = `
        <div class="outliner-row" style="padding-left: 5px;">
            ${statusIndicator}
            <span class="outliner-icon" style="margin-left: 5px;">${icon}</span>
            <span class="outliner-text">${fileName}</span>
            ${subtext}
        </div>`;

    return li;
  }

  // --- List Interaction ---
  const handleListClick = (e) => {
    try {
      const li = e.target.closest("li");
      if (!li) return;

      if (e.ctrlKey || e.metaKey) {
        li.classList.toggle("selected");
      } else {
        // Single select behavior
        li.parentElement
          .querySelectorAll("li.selected")
          .forEach((el) => el.classList.remove("selected"));
        li.classList.add("selected");
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  };

  eligibleList.addEventListener("click", handleListClick);
  promoteList.addEventListener("click", handleListClick);

  // --- Transfer Buttons ---
  const moveItems = (source, target) => {
    try {
      const selected = Array.from(source.querySelectorAll("li.selected"));
      selected.forEach((li) => {
        li.classList.remove("selected");
        target.appendChild(li);
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  };

  addBtn.addEventListener("click", () => {
    try {
      moveItems(eligibleList, promoteList);
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  removeBtn.addEventListener("click", () => {
    try {
      moveItems(promoteList, eligibleList);
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  addAllBtn.addEventListener("click", () => {
    try {
      Array.from(eligibleList.children).forEach((li) =>
        promoteList.appendChild(li)
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  removeAllBtn.addEventListener("click", () => {
    try {
      Array.from(promoteList.children).forEach((li) =>
        eligibleList.appendChild(li)
      );
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  // --- Modal Actions ---
  closeButton.addEventListener("click", () => {
    try {
      modal.style.display = "none";
      console.log("Promotion modal closed");
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  confirmButton.addEventListener("click", () => {
    try {
      const actionText = promotionDirection === "demote" ? "Demote" : "Promote";
      const actionTextPresent =
        promotionDirection === "demote" ? "Demoting" : "Promoting";
      const actionArrow = promotionDirection === "demote" ? "→" : "→";

      if (promotionMode === "object" && objectsToPromote.length > 0) {
        
        if (!currentTargetStatus) {
            throw new ValidationError(
              "Target status is not defined",
              "targetStatus",
              currentTargetStatus
            );
        }

        if (
          confirm(
            `${actionText} ${objectsToPromote.length} object(s) to ${currentTargetStatus}?`
          )
        ) {
           let successCount = 0;
           objectsToPromote.forEach(obj => {
              // ... per object logic ...
              // Logic:
              // 1. Validate info
              // 2. Log
              // 3. Update Status
              
              if (!obj.name || !obj._sourceFile || !obj.path) {
                  console.warn("Skipping invalid object:", obj);
                  return;
              }

              // Log
              try {
                logPromotionToStatement({
                  layerPath: obj._sourceFile,
                  sourceStatus: currentSourceStatus,
                  targetStatus: currentTargetStatus,
                  objectPath: obj.path,
                  type: promotionDirection === "demote" ? "Object Demotion" : "Object Promotion",
                });
              } catch (err) {
                 console.warn("Log failed for", obj.name, err);
              }

              // Update Runtime
              if (!obj.properties) obj.properties = {};
              obj.properties.status = currentTargetStatus;
              successCount++;
           });

           recomposeStage();
           updateView();
           
           alert(`${actionText}d ${successCount} object(s) to ${currentTargetStatus}.`);
        }
        modal.style.display = "none";
        return;
      }

      const itemsToPromote = Array.from(promoteList.children);
      if (itemsToPromote.length === 0) {
        console.log("No layers selected for promotion");
        modal.style.display = "none";
        return;
      }

      if (!currentTargetStatus) {
        throw new ValidationError(
          "Target status is not defined",
          "targetStatus",
          currentTargetStatus
        );
      }

      if (
        confirm(
          `${actionText} ${itemsToPromote.length} layers to ${currentTargetStatus}?`
        )
      ) {
        const state = store.getState();
        let promotedCount = 0;

        itemsToPromote.forEach((li) => {
          const layerId = li.dataset.layerId;

          if (!layerId) {
            console.warn("Layer item missing layerId, skipping");
            return;
          }

          const layer = state.stage.layerStack.find((l) => l.id === layerId);

          if (!layer) {
            console.warn(`Layer not found: ${layerId}, skipping`);
            return;
          }

          if (layer.status !== currentSourceStatus) {
            console.warn(
              `Layer status mismatch (expected ${currentSourceStatus}, got ${layer.status}), skipping`
            );
            return;
          }

          try {
            // Update layer via action
            actions.updateLayer(layerId, { status: currentTargetStatus });

            // Construct updated layer object for sync and log
            const updatedLayer = { ...layer, status: currentTargetStatus };

            syncPrimStatusFromLayer(updatedLayer);
            logPromotionToStatement({
              layerPath: layer.filePath,
              sourceStatus: currentSourceStatus,
              targetStatus: currentTargetStatus,
              type: promotionDirection === "demote" ? "Demotion" : "Promotion",
            });

            promotedCount++;
          } catch (err) {
            console.error(`Failed to promote layer ${layer.filePath}:`, err);
            // Continue with other layers
          }
        });

        renderLayerStack(); // Renders from store now
        recomposeStage();
        updateView();

        console.log(
          `✅ Successfully ${actionTextPresent.toLowerCase()} ${promotedCount}/${
            itemsToPromote.length
          } layers (${currentSourceStatus} ${actionArrow} ${currentTargetStatus})`
        );
      }
      modal.style.display = "none";
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });

  console.log("✅ Promotion Controller initialized with error handling");
}
