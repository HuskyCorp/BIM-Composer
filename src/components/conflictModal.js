// src/components/conflictModal.js
import { store } from "../core/index.js";
import { checkPermission } from "../utils/conflictDetector.js";

let resolveCallback = null;

export function initConflictModal() {
  const modal = document.getElementById("conflict-modal");
  const cancelButton = document.getElementById("conflict-cancel-button");
  const applyButton = document.getElementById("conflict-apply-button");

  cancelButton.addEventListener("click", () => {
    hideConflictModal();
    if (resolveCallback) {
      resolveCallback(null); // User cancelled
    }
  });

  applyButton.addEventListener("click", () => {
    console.log("[CONFLICT MODAL] ========== APPLY BUTTON CLICKED ==========");
    const radioButtons = document.querySelectorAll(
      'input[name="conflict-resolution"]'
    );
    console.log("[CONFLICT MODAL] All radio buttons:", radioButtons);
    radioButtons.forEach((rb) => {
      console.log(
        `[CONFLICT MODAL] Radio ${rb.value}: checked=${rb.checked}, disabled=${rb.disabled}`
      );
    });

    const selectedResolution = document.querySelector(
      'input[name="conflict-resolution"]:checked'
    ).value;
    console.log("[CONFLICT MODAL] Selected resolution:", selectedResolution);
    console.log("[CONFLICT MODAL] Callback exists:", !!resolveCallback);

    // CRITICAL: Save callback reference BEFORE hiding modal (which clears it)
    const callbackToExecute = resolveCallback;

    hideConflictModal();

    if (callbackToExecute) {
      console.log(
        "[CONFLICT MODAL] Calling resolveCallback with:",
        selectedResolution
      );
      callbackToExecute(selectedResolution);
      console.log("[CONFLICT MODAL] Callback completed");
    } else {
      console.error("[CONFLICT MODAL] No callback function!");
    }
    console.log("[CONFLICT MODAL] ========== END APPLY CLICK ==========");
  });

  // Close modal when clicking outside
  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      hideConflictModal();
      if (resolveCallback) {
        resolveCallback(null);
      }
    }
  });
}

/**
 * Show the conflict resolution modal
 * @param {Object} conflictData - Conflict information
 * @param {Object} conflictData.prim - The prim being edited
 * @param {string} conflictData.propertyName - Name of the property
 * @param {string} conflictData.newValue - New value being set
 * @param {Array} conflictData.conflicts - Array of conflict sources
 * @param {Function} onResolve - Callback when user makes a choice
 */
export function showConflictModal(conflictData, onResolve) {
  console.log("[CONFLICT MODAL] ========== SHOW MODAL CALLED ==========");
  console.log("[CONFLICT MODAL] Conflict data:", conflictData);
  console.log("[CONFLICT MODAL] Callback provided:", !!onResolve);

  resolveCallback = onResolve;
  console.log("[CONFLICT MODAL] Callback stored:", !!resolveCallback);

  const modal = document.getElementById("conflict-modal");
  const propertyNameEl = document.getElementById("conflict-property-name");
  const currentValueEl = document.getElementById("conflict-current-value");
  const currentSourceEl = document.getElementById("conflict-current-source");
  const newValueEl = document.getElementById("conflict-new-value");
  const newOwnerEl = document.getElementById("conflict-new-owner");
  const warningEl = document.getElementById("conflict-warning");
  const warningTextEl = document.getElementById("conflict-warning-text");

  // Populate modal content
  propertyNameEl.textContent = conflictData.propertyName;
  currentValueEl.textContent = conflictData.currentValue || "(not set)";
  newValueEl.textContent = conflictData.newValue;

  // Determine current source
  const conflict = conflictData.conflicts[0]; // Use first conflict for now
  if (conflict) {
    currentSourceEl.textContent = `${conflict.file} (${conflict.owner})`;
  } else {
    currentSourceEl.textContent = "Current file";
  }

  const currentUser = store.getState().currentUser;
  newOwnerEl.textContent = currentUser;

  // Check if user has permission to make changes
  const prim = conflictData.prim;
  const permission = checkPermission(prim);

  // Show warning if user is trying to override another user's property
  if (conflict && conflict.owner !== currentUser) {
    if (!permission.allowed) {
      // User does not have permission
      warningTextEl.textContent =
        "You do not have permission to modify this property. Only the owner or Project Manager can make changes.";
      warningEl.style.display = "block";
      // Disable the "use new" option
      document.getElementById("conflict-use-new").disabled = true;
    } else if (currentUser === "Project Manager" || currentUser === "Field Engineer") {
      // User has elevated permissions, show warning
      warningTextEl.textContent =
        "You are about to override a property owned by another user. This action will be logged.";
      warningEl.style.display = "block";
    } else {
      // User owns the layer, no warning needed
      warningEl.style.display = "none";
      document.getElementById("conflict-use-new").disabled = false;
    }
  } else {
    warningEl.style.display = "none";
    document.getElementById("conflict-use-new").disabled = false;
  }

  // Reset radio selection
  // For users with permission overriding another user's property, default to "use-new"
  if (
    conflict &&
    conflict.owner !== currentUser &&
    permission.allowed &&
    (currentUser === "Project Manager" || currentUser === "Field Engineer")
  ) {
    document.getElementById("conflict-use-new").checked = true;
  } else {
    document.getElementById("conflict-keep-current").checked = true;
  }

  modal.style.display = "flex";
}

export function hideConflictModal() {
  const modal = document.getElementById("conflict-modal");
  modal.style.display = "none";
  resolveCallback = null;
}
