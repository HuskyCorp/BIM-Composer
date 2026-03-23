// src/components/staging/stagingPanelController.js
// Renders the Staged Changes sidebar panel and drives the commit modal workflow.

import { store } from "../../core/index.js";
import { actions } from "../../state/actions.js";
import { actions as coreActions } from "../../core/state/actions/index.js";
import { composeLogPrim } from "../../viewer/usda/usdaComposer.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import { sha256 } from "js-sha256";

/**
 * Classify a set of staged changes into a single commit type string.
 * Priority: rename > entityStaging > propertyEdit
 */
function classifyCommitType(changes) {
  const types = new Set(changes.map((c) => c.type));
  if (types.has("rename")) return "rename";
  if (types.has("entityStaging")) return "entityStaging";
  return "propertyEdit";
}

/**
 * Write all staged changes as one commit entry to statement.usda.
 */
function writeCommitToStatement(changes, message) {
  const state = store.getState();
  const newId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const entryNumber = actions.incrementLogEntryCounter();
  const fileContent = state.loadedFiles["statement.usda"] || "#usda 1.0\n";
  const fileSize = new Blob([fileContent]).size;
  const contentHash = sha256(fileContent);

  const commitType = classifyCommitType(changes);
  const stagedPaths = [...new Set(changes.map((c) => c.targetPath))];
  const firstChange = changes[0] || {};

  const logEntry = {
    ID: newId,
    Entry: entryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": stagedPaths[0] || "",
    "File Name": firstChange.sourceFile || "unknown",
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: commitType,
    User: state.currentUser || "Unknown",
    commitMessage: message,
    sourceStatus: firstChange.sourceStatus || "WIP",
    targetStatus: firstChange.targetStatus || "WIP",
    stagedPrims: stagedPaths,
    parent: state.headCommitId,
  };

  actions.setHeadCommitId(newId);

  const logPrimString = composeLogPrim(logEntry);
  const newContent = USDA_PARSER.appendToUsdaFile(
    state.loadedFiles["statement.usda"],
    logPrimString,
    "ChangeLog"
  );
  actions.updateLoadedFile("statement.usda", newContent);
}

/**
 * Initialise the staged-changes panel and commit modal.
 * @param {Function} updateView - View refresh callback
 */
export function initStagingPanel(updateView) {
  const commitBtn = document.getElementById("commitButton");
  const commitModal = document.getElementById("commit-modal");
  const commitMessageInput = document.getElementById("commit-message-input");
  const commitUserDisplay = document.getElementById("commit-user-display");
  const commitConfirmBtn = document.getElementById("commit-confirm-button");
  const commitCancelBtn = document.getElementById("commit-cancel-button");
  const changeCountEl = document.getElementById("commit-change-count");

  if (!commitBtn || !commitModal) return;

  // Re-render panel whenever stagedChanges changes
  store.subscribe("stagedChanges", renderStagingPanel);
  renderStagingPanel();

  // Open commit modal
  commitBtn.addEventListener("click", () => {
    const changes = store.getState().stagedChanges || [];
    if (changes.length === 0) return;

    // Populate author and preview
    if (commitUserDisplay) {
      commitUserDisplay.value = store.getState().currentUser || "Unknown";
    }
    if (changeCountEl) changeCountEl.textContent = changes.length;
    populateCommitPreview(changes);
    commitMessageInput.value = "";
    commitModal.style.display = "flex";
    commitMessageInput.focus();
  });

  // Cancel commit
  commitCancelBtn.addEventListener("click", () => {
    commitModal.style.display = "none";
  });

  // Close on backdrop click
  commitModal.addEventListener("click", (e) => {
    if (e.target === commitModal) commitModal.style.display = "none";
  });

  // Confirm commit
  commitConfirmBtn.addEventListener("click", () => {
    const message = commitMessageInput.value.trim() || "(no message)";
    const changes = store.getState().stagedChanges || [];
    if (changes.length === 0) return;

    writeCommitToStatement(changes, message);
    store.dispatch(coreActions.clearStagedChanges());
    commitModal.style.display = "none";

    if (typeof updateView === "function") updateView();
  });

  // Unstage individual changes (event delegation on the list)
  const list = document.getElementById("staged-changes-list");
  if (list) {
    list.addEventListener("click", (e) => {
      const btn = e.target.closest(".unstage-btn");
      if (!btn) return;
      const index = parseInt(btn.dataset.index, 10);
      store.dispatch(coreActions.unstageChange(index));
      if (typeof updateView === "function") updateView();
    });
  }
}

function renderStagingPanel() {
  const changes = store.getState().stagedChanges || [];
  const list = document.getElementById("staged-changes-list");
  const badge = document.getElementById("staged-count-badge");
  const commitBtn = document.getElementById("commitButton");

  if (badge) badge.textContent = changes.length;
  if (commitBtn) {
    commitBtn.disabled = changes.length === 0;
    commitBtn.classList.toggle("has-changes", changes.length > 0);
  }

  if (!list) return;
  list.innerHTML = "";

  if (changes.length === 0) {
    const empty = document.createElement("li");
    empty.className = "placeholder-text";
    empty.textContent = "No staged changes.";
    list.appendChild(empty);
    return;
  }

  changes.forEach((change, index) => {
    const li = document.createElement("li");
    li.className = "staged-change-item";

    const primName = change.targetPath
      ? change.targetPath.split("/").pop()
      : "?";
    const detail =
      change.type === "propertyEdit" || change.type === "setAttribute"
        ? `${primName} · ${change.propertyName || change.attributeName || ""}`
        : `${change.type} · ${primName}`;

    li.innerHTML = `
      <span class="staged-change-type-dot staged-dot-${(change.type || "").replace(/[^a-z]/gi, "")}"></span>
      <span class="staged-change-label" title="${change.targetPath}">${detail}</span>
      <button class="unstage-btn" data-index="${index}" title="Unstage this change">✕</button>
    `;
    list.appendChild(li);
  });
}

function populateCommitPreview(changes) {
  const previewEl = document.getElementById("commit-preview-list");
  if (!previewEl) return;
  previewEl.innerHTML = "";
  changes.forEach((c) => {
    const li = document.createElement("li");
    li.style.cssText =
      "padding: 3px 0; border-bottom: 1px solid rgba(255,255,255,0.06)";
    if (c.type === "propertyEdit" || c.type === "setAttribute") {
      const prop = c.propertyName || c.attributeName || "";
      const val = c.attributeValue !== undefined ? c.attributeValue : "";
      li.textContent = `${c.targetPath}  ·  ${prop} = ${val}`;
    } else {
      li.textContent = `${c.type}: ${c.targetPath}`;
    }
    previewEl.appendChild(li);
  });
}
