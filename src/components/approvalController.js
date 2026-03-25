// src/components/approvalController.js
// ISO 19650 Approval Workflow: Shared → Published, with automatic archive of previous Published

import { store } from "../core/index.js";
import {
  layerActions,
  designOptionActions,
  packageActions,
} from "../core/state/actions/index.js";
import { isProjectManager } from "../utils/rolePermissions.js";
import { writePackageRegistryToStatement } from "../viewer/usda/usdaComposer.js";

function getCurrentUser(state) {
  return state.users instanceof Map
    ? state.users.get(state.currentUserId)
    : null;
}

function persistPackageRegistry() {
  const state = store.getState();
  const content = state.loadedFiles?.["statement.usda"];
  if (!content) return;
  const newContent = writePackageRegistryToStatement(
    content,
    state.packages || [],
    state.designOptions || []
  );
  store.dispatch({
    type: "UPDATE_FILE",
    payload: { filePath: "statement.usda", content: newContent },
  });
}

/**
 * Initialise the approval controller.
 * Listens for the `approveDesignOption` CustomEvent dispatched from stageBranchController.
 */
export function initApprovalController(updateView) {
  document.addEventListener("approveDesignOption", (e) => {
    const { optionId } = e.detail || {};
    if (!optionId) return;

    const state = store.getState();
    const currentUser = getCurrentUser(state);

    if (!isProjectManager(currentUser || state.currentUser)) {
      alert("Only Project Managers can approve design options for publishing.");
      return;
    }

    const option = (state.designOptions || []).find((o) => o.id === optionId);
    if (!option) return;

    const confirmed = confirm(
      `Approve "${option.name}" for Published?\n\nThe current Published state will be archived.`
    );
    if (!confirmed) return;

    _runApprovalWorkflow(optionId, currentUser, updateView);
  });

  console.log("✅ Approval controller initialized");
}

function _runApprovalWorkflow(optionId, currentUser, updateView) {
  const state = store.getState();
  const pmName = currentUser?.name || state.currentUser || "PM";
  const now = new Date().toISOString();

  // ── 1. Archive current Published packages ──────────────────────────────────
  const publishedPackages = (state.packages || []).filter(
    (p) => p.stageBranch === "Published" && p.approvalStatus === "approved"
  );

  publishedPackages.forEach((pkg) => {
    store.dispatch(
      packageActions.updatePackageBranch(pkg.id, "Archived", "archived")
    );

    // Mark associated layers as immutable and archived
    (state.stage?.layerStack || []).forEach((layer) => {
      if (layer.packageId === pkg.id && layer.status === "Published") {
        store.dispatch(
          layerActions.updateLayer(layer.id, {
            status: "Archived",
            visible: false,
            active: false,
            immutable: true,
            archivedAt: now,
            archivedBy: pmName,
          })
        );
      }
    });
  });

  // ── 2. Promote design option's Shared packages to Published ────────────────
  const sharedPackages = (store.getState().packages || []).filter(
    (p) => p.designOptionId === optionId && p.stageBranch === "Shared"
  );

  sharedPackages.forEach((pkg) => {
    store.dispatch(
      packageActions.updatePackageBranch(pkg.id, "Published", "approved")
    );

    // Promote associated layers to Published
    (store.getState().stage?.layerStack || []).forEach((layer) => {
      if (layer.packageId === pkg.id && layer.status === "Shared") {
        store.dispatch(
          layerActions.updateLayer(layer.id, {
            status: "Published",
            active: true,
            suitabilityCode: "S6",
          })
        );
      }
    });
  });

  // ── 3. Mark design option as approved ─────────────────────────────────────
  store.dispatch(designOptionActions.approveDesignOption(optionId, pmName));

  // ── 4. Supersede other open design options ─────────────────────────────────
  (store.getState().designOptions || [])
    .filter((o) => o.id !== optionId && o.status === "open")
    .forEach((o) => {
      store.dispatch(designOptionActions.archiveDesignOption(o.id, pmName));
    });

  // ── 5. Persist to statement.usda ──────────────────────────────────────────
  persistPackageRegistry();

  if (typeof updateView === "function") updateView();
}
