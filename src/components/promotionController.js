// REFACTORED: Enhanced with error handling and core architecture
import { store, errorHandler, ValidationError } from "../core/index.js";
import { actions } from "../state/actions.js"; // TODO: Migrate to dispatch pattern
import { actions as coreActions } from "../core/state/actions/index.js";
import {
  generatePackageId,
  generateIsoPackageNumber,
  getNextColor,
  persistPackages,
} from "./packages/packageController.js";
import {
  renderLayerStack,
  recomposeStage,
  logPromotionToStatement,
  syncPrimStatusFromLayer,
} from "./sidebar/layerStackController.js";
import {
  updateParentStatus,
  updateChildrenStatus,
} from "./properties/AttributeUpdater.js";
import {
  canUserPromote,
  canUserDemote,
  getPermissionError,
} from "../utils/rolePermissions.js";
import {
  runQualityGatesForPrims,
  collectPrimsForLayer,
} from "../utils/qualityGates.js";

/** ISO 19650 status maturity order (lowest → highest) */
const STATUS_ORDER = ["WIP", "Shared", "Published", "Archived"];

/**
 * TASK 3.2: Collect all descendant prims whose status is higher than targetStatus.
 * Used to warn the user before overwriting with a lower-maturity promotion.
 */
function collectHigherStatusChildren(prim, targetStatus) {
  const targetIdx = STATUS_ORDER.indexOf(targetStatus);
  const higher = [];

  function traverse(p) {
    if (!p.children) return;
    for (const child of p.children) {
      const childIdx = STATUS_ORDER.indexOf(child.properties?.status);
      if (childIdx > targetIdx) higher.push(child);
      traverse(child);
    }
  }
  traverse(prim);
  return higher;
}

export function initPromotionController(updateView) {
  const modal = document.getElementById("promotion-modal");
  const eligibleList = document.getElementById("eligible-layers-list");
  const promoteList = document.getElementById("promote-layers-list");
  const targetStatusLabel = document.getElementById("promotion-target-status");
  const packageSelect = document.getElementById("promotion-package-select");

  const closeButton = document.getElementById("close-promotion-modal-button");
  const confirmButton = document.getElementById("confirm-promotion-button");

  const addBtn = document.getElementById("add-layer-to-promote");
  const removeBtn = document.getElementById("remove-layer-from-promote");
  const addAllBtn = document.getElementById("add-all-layers-to-promote");
  const removeAllBtn = document.getElementById(
    "remove-all-layers-from-promote"
  );

  // ── Quality Gate Modal wiring ────────────────────────────────────────────
  const qgModal = document.getElementById("quality-gate-modal");
  const qgSummary = document.getElementById("quality-gate-summary");
  const qgList = document.getElementById("quality-gate-list");
  const qgForceBtn = document.getElementById("quality-gate-force-btn");
  const qgCancelBtn = document.getElementById("quality-gate-cancel-btn");

  /** @type {Function|null}  Callback to invoke when the user chooses Force Proceed */
  let _qgProceedCallback = null;

  if (qgForceBtn) {
    qgForceBtn.addEventListener("click", () => {
      qgModal.style.display = "none";
      if (typeof _qgProceedCallback === "function") _qgProceedCallback();
      _qgProceedCallback = null;
    });
  }
  if (qgCancelBtn) {
    qgCancelBtn.addEventListener("click", () => {
      qgModal.style.display = "none";
      _qgProceedCallback = null;
    });
  }

  /**
   * Show the quality-gate results modal.
   * @param {Array<{prim, results}>} failures  — output of runQualityGatesForPrims
   * @param {Function} onForceProceed          — called if user overrides
   */
  function showQualityGateModal(failures, onForceProceed) {
    if (!qgModal) return;
    qgSummary.textContent = `${failures.length} prim(s) failed quality gates. Review before proceeding.`;
    qgList.innerHTML = "";
    failures.forEach(({ prim, results }) => {
      const primLi = document.createElement("li");
      primLi.className = "qg-prim";

      const nameDiv = document.createElement("div");
      nameDiv.className = "qg-prim-name";
      nameDiv.textContent = `${prim.name || prim.path} (${prim.path})`;
      primLi.appendChild(nameDiv);

      results.forEach((r) => {
        const gateLi = document.createElement("div");
        gateLi.className = `qg-gate ${r.passed ? "pass" : "fail"}`;

        const icon = document.createElement("span");
        icon.className = "qg-gate-icon";
        icon.textContent = r.passed ? "✓" : "✗";

        const text = document.createElement("div");
        text.innerHTML = `<strong>${r.label}</strong>`;
        if (!r.passed && r.issues.length) {
          const issues = document.createElement("div");
          issues.className = "qg-issues";
          issues.textContent = r.issues.join(" · ");
          text.appendChild(issues);
        }

        gateLi.appendChild(icon);
        gateLi.appendChild(text);
        primLi.appendChild(gateLi);
      });

      qgList.appendChild(primLi);
    });

    _qgProceedCallback = onForceProceed;
    qgModal.style.display = "flex";
  }

  // ── Permission-denied banner helper ──────────────────────────────────────
  /**
   * Show or hide a permission-denied banner inside the promotion modal.
   * @param {string|null} message — pass null to hide
   */
  function setPermissionBanner(message) {
    let banner = modal.querySelector(".permission-denied-banner");
    if (!message) {
      if (banner) banner.remove();
      return;
    }
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "permission-denied-banner";
      const modalBody = modal.querySelector(".modal-body");
      if (modalBody) {
        modalBody.before(banner);
      } else {
        modal.prepend(banner);
      }
    }
    banner.textContent = message;
    confirmButton.disabled = true;
  }

  function clearPermissionBanner() {
    const banner = modal.querySelector(".permission-denied-banner");
    if (banner) banner.remove();
    confirmButton.disabled = false;
  }

  // ── Package selector helper ───────────────────────────────────────────────
  function populatePackageSelect() {
    if (!packageSelect) return;
    const state = store.getState();
    const packages = state.packages || [];
    const activeId = state.activePackageId;

    packageSelect.innerHTML = "";

    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "-- Select Package --";
    packageSelect.appendChild(placeholder);

    packages.forEach((pkg) => {
      const opt = document.createElement("option");
      opt.value = pkg.id;
      opt.textContent = pkg.name;
      packageSelect.appendChild(opt);
    });

    // Pre-select the active package
    if (activeId) packageSelect.value = activeId;
  }

  // ── Inline package quick-create (inside promotion modal) ─────────────────
  const newPackageBtn = document.getElementById("promotion-new-package-btn");
  const packageCreateRow = document.getElementById("promotion-package-create");
  const packageNameInput = document.getElementById(
    "promotion-package-name-input"
  );
  const packageCreateConfirm = document.getElementById(
    "promotion-package-create-confirm"
  );
  const packageCreateCancel = document.getElementById(
    "promotion-package-create-cancel"
  );
  const packageControls = document.querySelector(".promotion-package-controls");

  function showPackageCreateForm() {
    if (packageCreateRow) packageCreateRow.style.display = "flex";
    if (packageControls) packageControls.style.display = "none";
    if (packageNameInput) {
      packageNameInput.value = "";
      packageNameInput.focus();
    }
  }

  function hidePackageCreateForm() {
    if (packageCreateRow) packageCreateRow.style.display = "none";
    if (packageControls) packageControls.style.display = "flex";
  }

  function commitNewPackage() {
    const name = packageNameInput?.value.trim();
    if (!name) {
      hidePackageCreateForm();
      return;
    }

    const state = store.getState();
    const packages = state.packages || [];
    const newPkg = {
      id: generatePackageId(),
      name,
      color: getNextColor(packages),
      createdAt: new Date().toISOString(),
      createdBy: state.currentUser || "System",
      isoNumber: generateIsoPackageNumber(state),
      designOptionId: null,
      stageBranch: "WIP",
      approvalStatus: "pending",
    };
    store.dispatch(coreActions.addPackage(newPkg));
    store.dispatch(coreActions.setActivePackage(newPkg.id));
    persistPackages(store.getState().packages);
    populatePackageSelect();
    if (packageSelect) packageSelect.value = newPkg.id;
    hidePackageCreateForm();
  }

  if (newPackageBtn)
    newPackageBtn.addEventListener("click", showPackageCreateForm);
  if (packageCreateConfirm)
    packageCreateConfirm.addEventListener("click", commitNewPackage);
  if (packageCreateCancel)
    packageCreateCancel.addEventListener("click", hidePackageCreateForm);
  if (packageNameInput) {
    packageNameInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commitNewPackage();
      if (e.key === "Escape") hidePackageCreateForm();
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  let currentTargetStatus = null;
  let currentSourceStatus = null;
  let promotionMode = "layer"; // "layer" or "object"
  let objectsToPromote = []; // Array of prims

  let promotionDirection = "promote"; // "promote" or "demote"

  document.addEventListener("openPromotionModal", (e) => {
    try {
      const {
        initialSelection,
        mode,
        prim,
        prims,
        direction = "promote",
      } = e.detail;
      promotionDirection = direction;

      // Populate the Design Package selector
      populatePackageSelect();

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

        // Resolve stub items (shape: { primPath, originFile, name, type }) to full prim
        // objects from composedHierarchy so that properties, children, and _sourceFile
        // are all available during the promotion loop.
        const rawItems = prims || [prim];
        const findInHierarchy = (nodes, targetPath) => {
          for (const n of nodes) {
            if (n.path === targetPath) return n;
            if (n.children) {
              const found = findInHierarchy(n.children, targetPath);
              if (found) return found;
            }
          }
          return null;
        };
        const hier = store.getState().composedHierarchy || [];
        objectsToPromote = rawItems.map((item) => {
          const p = item.path || item.primPath;
          return findInHierarchy(hier, p) || item;
        });

        // Determine Status based on first prim
        const firstPrim = objectsToPromote[0];

        // Lookup layer status for context of first prim
        const state = store.getState();
        let layerStatus = "Published";
        const firstSourceFile = firstPrim.originFile || firstPrim._sourceFile;
        if (firstSourceFile) {
          const layer = state.stage.layerStack.find(
            (l) => l.filePath === firstSourceFile
          );
          if (layer) layerStatus = layer.status;
        }

        currentSourceStatus = firstPrim?.properties?.status || layerStatus;

        // Validate all have same status?
        const inconsistent = objectsToPromote.some((p) => {
          let pStatus = "Published"; // Default
          const pSourceFile = p.originFile || p._sourceFile;
          if (pSourceFile) {
            const l = state.stage.layerStack.find(
              (la) => la.filePath === pSourceFile
            );
            if (l) pStatus = l.status;
          }
          const actualStatus = p?.properties?.status || pStatus;
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

        // ── ROLE CHECK (object mode) ────────────────────────────────────
        {
          const state = store.getState();
          const _userObj =
            state.users instanceof Map
              ? state.users.get(state.currentUserId)
              : null;
          const user = _userObj || state.currentUser;
          const permitted =
            promotionDirection === "demote"
              ? canUserDemote(user, currentSourceStatus)
              : canUserPromote(user, currentSourceStatus);
          if (!permitted) {
            const msg = getPermissionError(
              user,
              promotionDirection,
              currentSourceStatus
            );
            setPermissionBanner(msg);
          } else {
            clearPermissionBanner();
          }
        }

        const objCountText =
          objectsToPromote.length > 1
            ? `${objectsToPromote.length} Objects`
            : `Object: ${firstPrim.name}`;
        targetStatusLabel.textContent = `${actionTextPresent} ${objCountText} (${currentSourceStatus} ${actionArrow} ${currentTargetStatus})`;

        // Disable and hide list interactions for object mode
        addBtn.disabled = true;
        removeBtn.disabled = true;
        addAllBtn.disabled = true;
        removeAllBtn.disabled = true;

        // Hide the Eligible Lists and Transfer Buttons
        const eligibleContainer = eligibleList.closest(".prim-list-container");
        if (eligibleContainer) eligibleContainer.style.display = "none";

        const transferButtons = modal.querySelector(".prim-transfer-buttons");
        if (transferButtons) transferButtons.style.display = "none";

        const promoteContainer = promoteList.closest(".prim-list-container");
        if (promoteContainer) promoteContainer.style.width = "100%";

        // Show the objects in the "Promote" list
        objectsToPromote.forEach((p) => {
          const li = document.createElement("li");
          li.innerHTML = `<span class="outliner-icon">📦</span> ${p.name} <span style="opacity:0.6">(${p.path})</span>`;
          promoteList.appendChild(li);
        });

        return;
      }

      promotionMode = "layer";
      objectsToPromote = []; // Clear

      // Re-enable and show list interactions for layer mode (if ever used)
      addBtn.disabled = false;
      removeBtn.disabled = false;
      addAllBtn.disabled = false;
      removeAllBtn.disabled = false;

      const eligibleContainer = eligibleList.closest(".prim-list-container");
      if (eligibleContainer) eligibleContainer.style.display = "flex";

      const transferButtons = modal.querySelector(".prim-transfer-buttons");
      if (transferButtons) transferButtons.style.display = "flex";

      const promoteContainer = promoteList.closest(".prim-list-container");
      if (promoteContainer) promoteContainer.style.width = "45%";

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

      // ── ROLE CHECK (layer mode) ─────────────────────────────────────────
      {
        const state = store.getState();
        const _userObj =
          state.users instanceof Map
            ? state.users.get(state.currentUserId)
            : null;
        const user = _userObj || state.currentUser;
        const permitted =
          promotionDirection === "demote"
            ? canUserDemote(user, currentSourceStatus)
            : canUserPromote(user, currentSourceStatus);
        if (!permitted) {
          setPermissionBanner(
            getPermissionError(user, promotionDirection, currentSourceStatus)
          );
        } else {
          clearPermissionBanner();
        }
      }

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
      const actionArrow = "→";

      // ── Package guard — require a Design Package selection ──────────────
      if (packageSelect && !packageSelect.value) {
        setPermissionBanner("Please select a Design Package before promoting.");
        packageSelect.focus();
        return;
      }

      // ── Role guard — refuse if button somehow clicked while denied ──────
      {
        const state = store.getState();
        const _userObj =
          state.users instanceof Map
            ? state.users.get(state.currentUserId)
            : null;
        const user = _userObj || state.currentUser;
        const permitted =
          promotionDirection === "demote"
            ? canUserDemote(user, currentSourceStatus)
            : canUserPromote(user, currentSourceStatus);
        if (!permitted) {
          alert(
            getPermissionError(user, promotionDirection, currentSourceStatus)
          );
          return;
        }
      }

      // ── Object mode ─────────────────────────────────────────────────────
      if (promotionMode === "object" && objectsToPromote.length > 0) {
        if (!currentTargetStatus) {
          throw new ValidationError(
            "Target status is not defined",
            "targetStatus",
            currentTargetStatus
          );
        }

        const doObjectPromotion = () => {
          if (
            !confirm(
              `${actionText} ${objectsToPromote.length} object(s) to ${currentTargetStatus}?`
            )
          ) {
            modal.style.display = "none";
            return;
          }
          let successCount = 0;
          objectsToPromote.forEach((obj) => {
            // Handle both full prim shape { path, _sourceFile } and stub shape
            // { primPath, originFile } returned by getSelectedItemsForStaging.
            const objPath = obj.path || obj.primPath;
            const objSource = obj._sourceFile || obj.originFile;
            if (!obj.name || !objSource || !objPath) {
              console.warn("Skipping invalid object:", obj);
              return;
            }
            try {
              logPromotionToStatement({
                layerPath: objSource,
                sourceStatus: currentSourceStatus,
                targetStatus: currentTargetStatus,
                objectPath: objPath,
                packageId: packageSelect?.value || null,
                type:
                  promotionDirection === "demote"
                    ? "Object Demotion"
                    : "Object Promotion",
              });
            } catch (err) {
              console.warn("Log failed for", obj.name, err);
            }

            // Update the prim's status in the canonical composedHierarchy via
            // a proper state dispatch (direct mutation of obj is insufficient
            // because recomposeStage rebuilds from state.stage.composedPrims).
            const updatePrimInTree = (nodes, targetPath, status) => {
              for (const n of nodes) {
                if (n.path === targetPath) {
                  if (!n.properties) n.properties = {};
                  n.properties.status = status;
                  return true;
                }
                if (
                  n.children &&
                  updatePrimInTree(n.children, targetPath, status)
                )
                  return true;
              }
              return false;
            };
            if (!obj.properties) obj.properties = {};
            obj.properties.status = currentTargetStatus;

            const ch = JSON.parse(
              JSON.stringify(store.getState().composedHierarchy || [])
            );
            updatePrimInTree(ch, objPath, currentTargetStatus);
            store.dispatch(coreActions.setComposedHierarchy(ch));

            updateParentStatus(objPath, currentTargetStatus);

            // Warn if any children have a higher maturity status
            const higherChildren = collectHigherStatusChildren(
              obj,
              currentTargetStatus
            );
            if (higherChildren.length > 0) {
              const names = higherChildren
                .map((c) => `${c.path} (${c.properties?.status})`)
                .join("\n  ");
              if (
                !confirm(
                  `Warning: ${higherChildren.length} child prim(s) have a higher status than "${currentTargetStatus}":\n\n  ${names}\n\nDowngrading them may lose maturity. Continue?`
                )
              ) {
                return;
              }
            }
            updateChildrenStatus(objPath, currentTargetStatus);
            successCount++;
          });
          recomposeStage();
          renderLayerStack();
          updateView();
          alert(
            `${actionText}d ${successCount} object(s) to ${currentTargetStatus}.`
          );
          modal.style.display = "none";
        };

        // ── Quality gates (object mode) ──────────────────────────────────
        const { passed, failures } = runQualityGatesForPrims(
          objectsToPromote,
          currentTargetStatus
        );
        if (!passed) {
          showQualityGateModal(failures, doObjectPromotion);
          return;
        }
        doObjectPromotion();
        return;
      }

      // ── Layer mode ───────────────────────────────────────────────────────
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

      const doLayerPromotion = () => {
        if (
          !confirm(
            `${actionText} ${itemsToPromote.length} layers to ${currentTargetStatus}?`
          )
        ) {
          modal.style.display = "none";
          return;
        }
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
            const selectedPackageId = packageSelect?.value || null;
            actions.updateLayer(layerId, {
              status: currentTargetStatus,
              packageId: selectedPackageId,
              // ISO 19650: Archived is the terminal immutable state
              ...(currentTargetStatus === "Archived"
                ? { immutable: true }
                : {}),
            });
            // Sync the package's own stageBranch so the package card in the
            // Shared/Published/Archived section reflects the new maturity level.
            if (selectedPackageId) {
              store.dispatch(
                coreActions.updatePackage(selectedPackageId, {
                  stageBranch: currentTargetStatus,
                })
              );
            }
            const updatedLayer = { ...layer, status: currentTargetStatus };
            syncPrimStatusFromLayer(updatedLayer);
            logPromotionToStatement({
              layerPath: layer.filePath,
              sourceStatus: currentSourceStatus,
              targetStatus: currentTargetStatus,
              packageId: selectedPackageId,
              type: promotionDirection === "demote" ? "Demotion" : "Promotion",
            });
            promotedCount++;
          } catch (err) {
            console.error(`Failed to promote layer ${layer.filePath}:`, err);
          }
        });

        renderLayerStack();
        recomposeStage();
        updateView();

        console.log(
          `✅ Successfully ${actionTextPresent.toLowerCase()} ${promotedCount}/${
            itemsToPromote.length
          } layers (${currentSourceStatus} ${actionArrow} ${currentTargetStatus})`
        );
        modal.style.display = "none";
      };

      // ── Quality gates (layer mode) ───────────────────────────────────────
      const state = store.getState();
      const layerPrims = itemsToPromote.flatMap((li) => {
        const layerId = li.dataset.layerId;
        const layer = state.stage.layerStack.find((l) => l.id === layerId);
        if (!layer) return [];
        return collectPrimsForLayer(
          state.stage.composedHierarchy || [],
          layer.filePath
        );
      });

      const { passed, failures } = runQualityGatesForPrims(
        layerPrims,
        currentTargetStatus
      );
      if (!passed) {
        showQualityGateModal(failures, doLayerPromotion);
        return;
      }
      doLayerPromotion();
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
