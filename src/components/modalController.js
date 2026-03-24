// src/components/modalController.js
import {
  store,
  errorHandler,
  ValidationError,
  FileError,
} from "../core/index.js";
import { stagePrims } from "./staging/primStaging.js";

// Items captured when the modal opens; used by handleSaveHierarchy.
let _pendingItems = [];

export function initModal(updateView) {
  const modal = document.getElementById("prim-selection-modal");
  const confirmList = document.getElementById("prim-confirm-list");
  const titleEl = document.getElementById("prim-modal-title");
  const fileBadge = document.getElementById("prim-modal-file-badge");
  const countEl = document.getElementById("prim-modal-count");
  const saveHierarchyButton = document.getElementById("save-hierarchy-button");
  const closeModalButton = document.getElementById("close-modal-button");

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

    modal.dataset.mode = mode || "normal";
    openConfirmModal(fileName, mode || "normal", preSelectedItems || []);
  });

  document.addEventListener("openPrimModal", handleOpenModal);

  // Legacy sendToStage (bypasses modal entirely)
  document.addEventListener("sendToStage", (e) => {
    const { primPaths, mode } = e.detail;
    stagePrims(primPaths, { isEntity: mode === "entity" });
    updateView();
  });

  // ==================== Open Confirmation Modal ====================
  function openConfirmModal(fileName, mode, preSelectedItems) {
    const isEntity = mode === "entity";

    // Title
    if (titleEl) {
      titleEl.textContent = isEntity
        ? "Mark as Entity Placeholders"
        : "Mark as Real Elements";
    }

    // Collect unique source files for the badge
    const sourceFiles = [
      ...new Set(preSelectedItems.map((i) => i.originFile || fileName)),
    ];
    if (fileBadge) {
      fileBadge.textContent =
        sourceFiles.length === 1
          ? sourceFiles[0]
          : `${sourceFiles.length} files`;
    }

    // Count badge
    if (countEl) {
      const n = preSelectedItems.length;
      countEl.textContent = `${n} prim${n !== 1 ? "s" : ""}`;
    }

    // Build confirm list
    confirmList.innerHTML = "";
    preSelectedItems.forEach((item) => {
      const li = document.createElement("li");
      li.className = "prim-confirm-item";
      li.dataset.primPath = item.primPath;
      li.dataset.sourceFile = item.originFile || fileName;
      li.dataset.prim = JSON.stringify({
        path: item.primPath,
        name: item.name || item.primPath.split("/").pop(),
        type: item.type || "Mesh",
        sourceFile: item.originFile || fileName,
        properties: {},
      });

      const icon = item.type === "Xform" || item.type === "Group" ? "📦" : "🧊";
      const name = item.name || item.primPath.split("/").pop();
      const src = item.originFile || fileName;
      const badgeClass = isEntity
        ? "prim-type-badge prim-type-placeholder"
        : "prim-type-badge prim-type-real";
      const badgeLabel = isEntity ? "Placeholder" : "Real Element";

      li.innerHTML = `
        <span class="prim-confirm-icon">${icon}</span>
        <span class="prim-confirm-name" title="${item.primPath}">${name}</span>
        <span class="prim-confirm-source">${src}</span>
        <span class="${badgeClass}">${badgeLabel}</span>
      `;
      confirmList.appendChild(li);
    });

    // Store for save handler
    _pendingItems = preSelectedItems.map((item) => ({
      path: item.primPath,
      sourceFile: item.originFile || fileName,
    }));

    modal.style.display = "flex";
    console.log(
      `✅ Opened confirm staging modal: ${preSelectedItems.length} items, mode=${mode}`
    );
  }

  // ==================== Confirm (Save Hierarchy) ====================
  const handleSaveHierarchy = errorHandler.wrap(() => {
    if (_pendingItems.length === 0) {
      modal.style.display = "none";
      return;
    }

    const currentMode = modal.dataset.mode || "normal";
    const count = _pendingItems.length;
    stagePrims(_pendingItems, { isEntity: currentMode === "entity" });

    modal.style.display = "none";
    _pendingItems = [];
    updateView();

    console.log(`✅ Staged ${count} prim(s)`);
  });

  const handleCloseModal = errorHandler.wrap(() => {
    modal.style.display = "none";
    _pendingItems = [];
    console.log("Modal closed");
  });

  saveHierarchyButton.addEventListener("click", handleSaveHierarchy);
  closeModalButton.addEventListener("click", handleCloseModal);

  console.log("✅ Modal Controller initialized");
}
