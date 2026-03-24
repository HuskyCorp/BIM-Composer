// src/components/staging/stagingPanelController.js
// Renders the Staged Changes sidebar panel and drives the commit modal workflow.

import { store } from "../../core/index.js";
import { actions } from "../../state/actions.js";
import { actions as coreActions } from "../../core/state/actions/index.js";
import { composeLogPrim } from "../../viewer/usda/usdaComposer.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import { sha256 } from "js-sha256";
import {
  getDisciplineBranch,
  getDisciplineForUser,
  getDisciplineConfig,
} from "../../utils/precedenceMatrix.js";

/**
 * Classify a set of staged changes into a single commit type string.
 * Priority: deletion > renamePrim > entityStaging > primStaging > reparent > file-diff > propertyEdit
 */
function classifyCommitType(changes) {
  const types = new Set(changes.map((c) => c.type));
  if (types.has("deletion") || types.has("primRemoved")) return "Deletion";
  if (types.has("renamePrim")) return "Rename";
  if (types.has("entityStaging")) return "Entity Placeholder";
  if (types.has("primStaging")) return "Prim Selection";
  if (types.has("reparent")) return "Reparent";
  if (types.has("primAdded")) return "Addition";
  if (types.has("primUpdate")) return "Update";
  return "propertyEdit";
}

/**
 * Collect all prim paths from a composed hierarchy (recursive).
 */
function collectAllPaths(prims, out = []) {
  (prims || []).forEach((p) => {
    out.push(p.path);
    if (p.children?.length) collectAllPaths(p.children, out);
  });
  return out;
}

/**
 * Write all staged changes as one commit entry to statement.usda.
 * Phase D: captures full composed-prims snapshot and computes added/modified/removed diff.
 */
function writeCommitToStatement(changes, message) {
  const state = store.getState();
  const newId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const entryNumber = actions.incrementLogEntryCounter();
  const fileContent = state.loadedFiles["statement.usda"] || "#usda 1.0\n";
  const fileSize = new Blob([fileContent]).size;
  const contentHash = sha256(fileContent);

  const commitType = classifyCommitType(changes);
  const firstChange = changes[0] || {};

  // Phase D: full composed-prims snapshot (for reconstruction in Record Log)
  const allComposedPaths = collectAllPaths(state.stage?.composedPrims);

  // Phase D: compute diff vs parent commit
  const parentCommit = state.headCommitId
    ? state.history?.commits?.get(state.headCommitId)
    : null;
  const parentPaths = new Set(parentCommit?.stagedPrims || []);
  const currentPaths = new Set(allComposedPaths);

  const addedPrims = allComposedPaths.filter((p) => !parentPaths.has(p));
  const removedPrims = [...parentPaths].filter((p) => !currentPaths.has(p));
  const modifiedPrims = [
    ...new Set(
      changes
        .filter(
          (c) =>
            c.type === "propertyEdit" ||
            c.type === "setAttribute" ||
            c.type === "primUpdate"
        )
        .map((c) => c.targetPath)
        .filter(Boolean)
    ),
  ];

  const branch = getDisciplineBranch(state.currentUser || "Unknown", "WIP");

  const logEntry = {
    ID: newId,
    Entry: entryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": allComposedPaths[0] || "",
    "File Name": firstChange.sourceFile || "unknown",
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: commitType,
    User: state.currentUser || "Unknown",
    branch,
    commitMessage: message,
    sourceStatus: firstChange.sourceStatus || "WIP",
    targetStatus: firstChange.targetStatus || "WIP",
    stagedPrims: allComposedPaths,
    addedPrims,
    removedPrims,
    modifiedPrims,
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
  const commitBranchBadge = document.getElementById("commit-branch-badge");
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

    const state = store.getState();
    // Populate author and branch badge
    if (commitUserDisplay) {
      commitUserDisplay.value = state.currentUser || "Unknown";
    }
    if (commitBranchBadge) {
      const branch = getDisciplineBranch(state.currentUser || "Unknown", "WIP");
      const discipline = getDisciplineForUser(state.currentUser || "");
      const cfg = getDisciplineConfig(discipline);
      commitBranchBadge.textContent = branch;
      commitBranchBadge.style.backgroundColor = cfg.color + "33"; // 20% opacity
      commitBranchBadge.style.borderColor = cfg.color;
      commitBranchBadge.style.color = cfg.color;
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

    // Snapshot composedHierarchy → recordedHierarchy so the scene shows the newly committed state
    store.dispatch(
      coreActions.setRecordedHierarchy(store.getState().composedHierarchy)
    );

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
    const typeLabel =
      {
        primStaging: "Mark",
        entityStaging: "Mark Entity",
        renamePrim: "Rename",
        deletion: "Remove",
        reparent: "Reparent",
        propertyEdit: "Edit",
        setAttribute: "Edit",
        primAdded: "File Add",
        primUpdate: "File Update",
        primRemoved: "File Remove",
      }[change.type] || change.type;
    const detail =
      change.type === "propertyEdit" || change.type === "setAttribute"
        ? `${typeLabel} · ${primName} · ${change.propertyName || change.attributeName || ""}`
        : `${typeLabel} · ${primName}`;

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
    if (c.type === "propertyEdit" || c.type === "setAttribute") {
      const prop = c.propertyName || c.attributeName || "";
      const val = c.attributeValue !== undefined ? c.attributeValue : "";
      li.textContent = `${c.targetPath}  ·  ${prop} = ${val}`;
    } else if (c.type === "renamePrim") {
      li.textContent = `Rename: ${c.oldName} → ${c.newName}  (${c.targetPath})`;
    } else if (c.type === "deletion") {
      li.textContent = `Remove: ${c.primName}  (${c.targetPath})`;
    } else if (c.type === "primStaging" || c.type === "entityStaging") {
      li.textContent = `Mark: ${c.targetPath}`;
    } else if (c.type === "reparent") {
      li.textContent = `Reparent: ${c.oldPath} → ${c.targetPath}`;
    } else if (c.type === "primAdded") {
      li.textContent = `File Add: ${c.targetPath}  (${c.sourceFile})`;
    } else if (c.type === "primUpdate") {
      li.textContent = `File Update: ${c.targetPath}  (${c.sourceFile})`;
    } else if (c.type === "primRemoved") {
      li.textContent = `File Remove: ${c.targetPath}  (${c.sourceFile})`;
    } else {
      li.textContent = `${c.type}: ${c.targetPath}`;
    }
    previewEl.appendChild(li);
  });
}
