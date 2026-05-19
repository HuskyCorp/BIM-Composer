// src/components/conflictResolver.js
// GitHub-style diff modal for file re-uploads
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";

/**
 * Flatten a prim hierarchy into a path→prim Map.
 */
function flattenPrims(prims, result = new Map()) {
  prims.forEach((p) => {
    result.set(p.path, p);
    if (p.children?.length) flattenPrims(p.children, result);
  });
  return result;
}

/**
 * Build a property-level diff between two prim hierarchies.
 * Returns array of { path, kind, propertyChanges }.
 * @param {Array} oldPrims
 * @param {Array} newPrims
 */
function buildFileDiff(oldPrims, newPrims) {
  const oldMap = flattenPrims(oldPrims);
  const newMap = flattenPrims(newPrims);
  const diff = [];

  // Added prims
  newMap.forEach((newPrim, path) => {
    if (!oldMap.has(path)) {
      diff.push({ path, kind: "added", propertyChanges: [] });
    }
  });

  // Removed prims
  oldMap.forEach((oldPrim, path) => {
    if (!newMap.has(path)) {
      diff.push({ path, kind: "removed", propertyChanges: [] });
    }
  });

  // Modified prims — compare property values
  newMap.forEach((newPrim, path) => {
    if (!oldMap.has(path)) return; // already caught as added
    const oldPrim = oldMap.get(path);
    const oldProps = oldPrim.properties || {};
    const newProps = newPrim.properties || {};
    const allKeys = new Set([
      ...Object.keys(oldProps),
      ...Object.keys(newProps),
    ]);
    const changes = [];
    allKeys.forEach((key) => {
      const oldVal = oldProps[key] ?? null;
      const newVal = newProps[key] ?? null;
      const oldStr =
        typeof oldVal === "object"
          ? JSON.stringify(oldVal)
          : String(oldVal ?? "");
      const newStr =
        typeof newVal === "object"
          ? JSON.stringify(newVal)
          : String(newVal ?? "");
      if (oldStr !== newStr) {
        changes.push({ key, oldValue: oldStr, newValue: newStr });
      }
    });
    if (changes.length > 0) {
      diff.push({ path, kind: "modified", propertyChanges: changes });
    }
  });

  return diff;
}

/**
 * Populate and show the conflict resolver modal.
 */
function showModal(fileName, diff, resolve) {
  const modal = document.getElementById("conflict-resolver-modal");
  const diffBody = document.getElementById("cr-diff-body");
  const titleEl = document.getElementById("cr-modal-title");
  const summaryEl = document.getElementById("cr-modal-summary");

  if (!modal || !diffBody) return resolve({ accepted: false, diff: [] });

  const added = diff.filter((d) => d.kind === "added").length;
  const removed = diff.filter((d) => d.kind === "removed").length;
  const modified = diff.filter((d) => d.kind === "modified").length;

  titleEl.textContent = `File Updated: ${fileName}`;
  summaryEl.textContent = [
    added > 0 ? `${added} prim${added !== 1 ? "s" : ""} added` : "",
    modified > 0 ? `${modified} prim${modified !== 1 ? "s" : ""} modified` : "",
    removed > 0 ? `${removed} prim${removed !== 1 ? "s" : ""} removed` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  diffBody.innerHTML = "";

  diff.forEach((entry) => {
    // Prim section header row
    const headerRow = document.createElement("tr");
    headerRow.className = "cr-prim-header";
    const kindBadge =
      entry.kind === "added"
        ? `<span class="cr-prim-badge-new">NEW</span>`
        : entry.kind === "removed"
          ? `<span class="cr-prim-badge-removed">REMOVED</span>`
          : "";
    headerRow.innerHTML = `<td colspan="4"><span class="cr-prim-badge">${entry.path} ${kindBadge}</span></td>`;
    diffBody.appendChild(headerRow);

    if (entry.kind === "added" || entry.kind === "removed") {
      // One accept/reject row for whole prim
      const row = document.createElement("tr");
      row.className = "cr-diff-row";
      row.dataset.primPath = entry.path;
      row.dataset.kind = entry.kind;
      row.innerHTML = `
        <td class="cr-prop-key">(${entry.kind === "added" ? "new prim" : "prim removed"})</td>
        <td>${entry.kind === "removed" ? `<span class="diff-old">${entry.path.split("/").pop()}</span>` : `<span class="diff-empty">—</span>`}</td>
        <td>${entry.kind === "added" ? `<span class="diff-new">${entry.path.split("/").pop()}</span>` : `<span class="diff-empty">—</span>`}</td>
        <td class="cr-col-accept"><input type="checkbox" checked data-prim="${entry.path}" data-kind="${entry.kind}"></td>
      `;
      diffBody.appendChild(row);
    } else {
      // One row per changed property
      entry.propertyChanges.forEach((change) => {
        const row = document.createElement("tr");
        row.className = "cr-diff-row";
        row.innerHTML = `
          <td class="cr-prop-key">${change.key}</td>
          <td><span class="diff-old">${escapeHtml(change.oldValue)}</span></td>
          <td><span class="diff-new">${escapeHtml(change.newValue)}</span></td>
          <td class="cr-col-accept"><input type="checkbox" checked data-prim="${entry.path}" data-key="${change.key}"></td>
        `;
        diffBody.appendChild(row);
      });
    }
  });

  // Accept All / Reject All buttons
  document.getElementById("cr-accept-all-btn").onclick = () => {
    diffBody
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => (cb.checked = true));
  };
  document.getElementById("cr-reject-all-btn").onclick = () => {
    diffBody
      .querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => (cb.checked = false));
  };

  // Resolve button
  document.getElementById("cr-resolve-btn").onclick = () => {
    const accepted = collectAccepted(diffBody, diff);
    hideModal();
    resolve({ accepted: true, diff: accepted });
  };

  // Cancel
  document.getElementById("cr-cancel-btn").onclick = () => {
    hideModal();
    resolve({ accepted: false, diff: [] });
  };

  // Click outside
  modal.addEventListener("click", function outsideClick(e) {
    if (e.target === modal) {
      modal.removeEventListener("click", outsideClick);
      hideModal();
      resolve({ accepted: false, diff: [] });
    }
  });

  modal.style.display = "flex";
}

function hideModal() {
  const modal = document.getElementById("conflict-resolver-modal");
  if (modal) modal.style.display = "none";
}

function collectAccepted(diffBody, originalDiff) {
  const accepted = [];
  const checkboxes = diffBody.querySelectorAll(
    'input[type="checkbox"]:checked'
  );

  checkboxes.forEach((cb) => {
    const primPath = cb.dataset.prim;
    const kind = cb.dataset.kind;
    const key = cb.dataset.key;

    if (kind) {
      // Whole-prim accept (added / removed)
      accepted.push({ path: primPath, kind, propertyChanges: [] });
    } else if (key) {
      // Property-level accept
      let entry = accepted.find(
        (a) => a.path === primPath && a.kind === "modified"
      );
      if (!entry) {
        entry = { path: primPath, kind: "modified", propertyChanges: [] };
        accepted.push(entry);
      }
      // Find the original change for this property
      const origEntry = originalDiff.find((d) => d.path === primPath);
      const origChange = origEntry?.propertyChanges?.find((c) => c.key === key);
      if (origChange) entry.propertyChanges.push(origChange);
    }
  });

  return accepted;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Show the GitHub-style conflict resolver for a re-uploaded file.
 * Returns a Promise resolving to { accepted: boolean, diff: Array }.
 * @param {string} fileName
 * @param {string} oldContent - Previous file content
 * @param {string} newContent - Newly uploaded content
 */
export async function showFileConflictResolver(
  fileName,
  oldContent,
  newContent
) {
  let oldPrims = [];
  let newPrims = [];

  try {
    oldPrims = USDA_PARSER.getPrimHierarchy(oldContent);
  } catch {
    /* ignore parse errors on old content */
  }

  try {
    newPrims = USDA_PARSER.getPrimHierarchy(newContent);
  } catch {
    /* ignore parse errors on new content */
  }

  const diff = buildFileDiff(oldPrims, newPrims);

  // No changes detected — apply immediately without showing modal
  if (diff.length === 0) {
    return { accepted: true, diff: [] };
  }

  return new Promise((resolve) => {
    showModal(fileName, diff, resolve);
  });
}
