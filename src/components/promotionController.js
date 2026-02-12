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
  let objectToPromote = null;

  document.addEventListener("openPromotionModal", (e) => {
    try {
      const { initialSelection, mode, prim } = e.detail;

      // RESET UI
      eligibleList.innerHTML = "";
      promoteList.innerHTML = "";
      modal.style.display = "flex";

      if (mode === "object" && prim) {
        promotionMode = "object";
        objectToPromote = prim;

        // Determine Status based on prim property or fallback to layer status
        // We need to know what the CURRENT status is to determine the NEXT status.
        // Assuming prim status property holds the truth for objects.
        // If undefined, it inherits layer status.

        // Lookup layer status for context
        const state = store.getState();
        let layerStatus = "Published";
        if (prim._sourceFile) {
          const layer = state.stage.layerStack.find(
            (l) => l.filePath === prim._sourceFile
          );
          if (layer) layerStatus = layer.status;
        }

        currentSourceStatus = prim.properties.status || layerStatus; // Default to layer status if not set

        if (currentSourceStatus === "WIP") currentTargetStatus = "Shared";
        else if (currentSourceStatus === "Shared")
          currentTargetStatus = "Published";
        else {
          throw new ValidationError(
            `Object is already ${currentSourceStatus} and cannot be promoted further`,
            "status",
            currentSourceStatus
          );
        }

        targetStatusLabel.textContent = `Promoting Object: ${prim.name} (${currentSourceStatus} → ${currentTargetStatus})`;

        // Disable list interactions for object mode
        addBtn.disabled = true;
        removeBtn.disabled = true;
        addAllBtn.disabled = true;
        removeAllBtn.disabled = true;

        // Show the object in the "Promote" list
        const li = document.createElement("li");
        li.innerHTML = `<span class="outliner-icon">📦</span> ${prim.name} <span style="opacity:0.6">(${prim.path})</span>`;
        promoteList.appendChild(li);

        return;
      }

      promotionMode = "layer";
      objectToPromote = null;

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

      targetStatusLabel.textContent = `Promoting Layers (${currentSourceStatus} → ${currentTargetStatus})`;

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
      if (promotionMode === "object" && objectToPromote) {
        if (!objectToPromote.name) {
          throw new ValidationError(
            "Object to promote is missing a name",
            "object",
            objectToPromote
          );
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
            `Promote object '${objectToPromote.name}' to ${currentTargetStatus}?`
          )
        ) {
          // Update Prim Property: "status"
          // We need to update the Source File content essentially.
          // Since we don't have a direct "updatePrimProperty" action that writes to file yet,
          // we do it via existing mechanisms or assume we just update the runtime property and save later?
          // The request says "promoting... the object". This implies persistence.

          // Logic:
          // 1. Update runtime prim property
          // 2. Regenerate file content?
          // OR: Use `actions.updateLoadedFile` if we have a way to modify the specific specific prim in the string.

          // Simplest robust way:
          // 1. Get current file content
          // 2. Parse, Find Prim, Update "custom string status = '...'"
          // 3. Re-serialize / String replace?
          // USDA Parser/Composer round trip is safest but heavy.

          // Let's assume we update the property in memory and then auto-save/update current file.

          const file = objectToPromote._sourceFile;
          const path = objectToPromote.path;

          if (!file) {
            throw new ValidationError(
              "Object is missing source file reference",
              "_sourceFile",
              objectToPromote
            );
          }

          if (!path) {
            throw new ValidationError(
              "Object is missing path",
              "path",
              objectToPromote
            );
          }

          // Log promotion to statement
          try {
            logPromotionToStatement({
              layerPath: file,
              sourceStatus: currentSourceStatus,
              targetStatus: currentTargetStatus,
              objectPath: path, // Add this field to logging!
            });
          } catch (err) {
            console.warn("Failed to log object promotion to statement:", err);
            // Don't block promotion if logging fails
          }

          // Update Runtime Prims
          if (!objectToPromote.properties) {
            objectToPromote.properties = {};
          }
          objectToPromote.properties.status = currentTargetStatus;

          // Force re-render
          recomposeStage();
          updateView();

          console.log(
            `✅ Successfully promoted object '${objectToPromote.name}' (${currentSourceStatus} → ${currentTargetStatus})`
          );

          // Note: File persistence for single objects requires USDA roundtrip
          alert(
            `Promoted object '${objectToPromote.name}' to ${currentTargetStatus}. (Note: File persistence for single objects is WIP, but scene is updated).`
          );
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
          `Promote ${itemsToPromote.length} layers to ${currentTargetStatus}?`
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
          `✅ Successfully promoted ${promotedCount}/${itemsToPromote.length} layers (${currentSourceStatus} → ${currentTargetStatus})`
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
