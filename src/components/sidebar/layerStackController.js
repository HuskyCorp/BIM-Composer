// src/components/sidebar/layerStackController.js
// REFACTORED: Enhanced with error handling and core architecture
import {
  store,
  errorHandler,
  ValidationError,
  FileError,
  actions as coreActions,
} from "../../core/index.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";
import {
  composeLogPrim,
  writePackageRegistryToStatement,
} from "../../viewer/usda/usdaComposer.js";
import { sha256 } from "js-sha256";
import {
  explodeUsda,
  computePrimHashes,
} from "../../utils/atomicFileHandler.js";
import { ifcConverterAPI } from "../../services/ifcConverterAPI.js";
import { loadingIndicator } from "../loadingIndicator.js";
import {
  getDisciplineForUser,
  getDisciplineConfig,
  getDisciplineBranch,
} from "../../utils/precedenceMatrix.js";
import { actions } from "../../state/actions.js";
import { generateUrisForFile } from "../../utils/uriGenerator.js";
import {
  uriActions,
  designOptionActions,
} from "../../core/state/actions/index.js";
import { SUITABILITY_CODES } from "../../data/isoModels.js";
import { isProjectManager } from "../../utils/rolePermissions.js";

const STATUS_ORDER = ["WIP", "Shared", "Published", "Archived"];

/** Sync composedHierarchy → recordedHierarchy so the scene reflects the current layer state. */
function syncRecordedHierarchy() {
  store.dispatch(
    coreActions.setRecordedHierarchy(store.getState().composedHierarchy)
  );
}

// TODO: Future refactoring - Move business logic to LayerService:
// - Layer filtering logic (lines 22-34)
// - Layer grouping logic (lines 36-46)
// - Status promotion logic
// - Permission validation logic

// ─── Module-level helper: create a single layer <li> item ─────────────────
function createLayerItem(layer, displayName, state) {
  const li = document.createElement("li");
  li.draggable = true;
  li.dataset.layerId = layer.id;
  li.dataset.filePath = layer.filePath;

  const statusIndicator = `<span class="status-indicator ${layer.status.toLowerCase()}" title="Click to change status">${layer.status.charAt(0)}</span>`;
  const nameStr = displayName || layer.filePath;
  const visibilityToggle = `<span class="visibility-toggle ${layer.visible ? "" : "hidden-item"}">${layer.visible ? "👁️" : "➖"}</span>`;
  const layerBranch =
    layer.branch ||
    getDisciplineBranch(layer.owner || "", layer.status || "WIP");
  const branchDiscipline = getDisciplineForUser(layer.owner || "");
  const branchCfg = getDisciplineConfig(branchDiscipline);
  const suitabilityBadge = layer.suitabilityCode
    ? `<span class="suitability-badge" title="Suitability: ${layer.suitabilityCode}">${layer.suitabilityCode}</span>`
    : "";
  const immutableIcon = layer.immutable
    ? `<span class="archive-lock-icon" title="Archived — immutable">🔒</span>`
    : "";
  const branchBadge = `<span class="layer-branch-badge" style="border-color:${branchCfg.color}88;color:${branchCfg.color};" title="Branch: ${layerBranch}">${layerBranch}</span>`;

  li.innerHTML = `
    ${statusIndicator}
    <span class="layer-name" style="flex: 1; word-break: break-word; line-height: 1.4;" title="${layer.filePath}">${nameStr}</span>
    <div class="layer-item-controls">${suitabilityBadge}${immutableIcon}${branchBadge}${visibilityToggle}</div>
  `;

  if (state.currentView === "file" && state.currentFile === layer.filePath) {
    li.classList.add("selected");
  }
  return li;
}

// ─── Module-level helper: append discipline groups to a container element ──
const DISCIPLINE_ORDER = [
  "Management",
  "Architecture",
  "Structure",
  "MEP",
  "Field",
];

function appendDisciplineGroups(containerEl, layers, state) {
  // Group layers by discipline
  const disciplineGroups = {};
  layers.forEach((layer) => {
    const discipline = getDisciplineForUser(layer.owner || "");
    if (!disciplineGroups[discipline]) disciplineGroups[discipline] = [];
    disciplineGroups[discipline].push(layer);
  });

  const sortedDisciplines = Object.keys(disciplineGroups).sort(
    (a, b) =>
      (DISCIPLINE_ORDER.indexOf(a) + 1 || 99) -
      (DISCIPLINE_ORDER.indexOf(b) + 1 || 99)
  );

  sortedDisciplines.forEach((discipline) => {
    const disciplineLayers = disciplineGroups[discipline];
    const cfg = getDisciplineConfig(discipline);

    // Discipline header with toggle
    const header = document.createElement("li");
    header.className = "discipline-group-header";
    header.dataset.discipline = discipline;
    header.innerHTML = `
      <span class="discipline-dot" style="background:${cfg.color};"></span>
      <span class="discipline-label">${cfg.label} <span class="discipline-code">(${cfg.code})</span></span>
      <span class="discipline-count">${disciplineLayers.length}</span>
      <button class="discipline-toggle-btn" title="Toggle ${cfg.label} layers">▼</button>
    `;

    const groupContainer = document.createElement("ul");
    groupContainer.className = "discipline-layer-group";
    groupContainer.dataset.discipline = discipline;

    // Sort layers within discipline by STATUS_ORDER
    const sortedLayers = [...disciplineLayers].sort(
      (a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    );

    // Group by groupName within discipline
    const subGroups = {};
    const subUngrouped = [];
    sortedLayers.forEach((layer) => {
      if (layer.groupName) {
        if (!subGroups[layer.groupName]) subGroups[layer.groupName] = [];
        subGroups[layer.groupName].push(layer);
      } else {
        subUngrouped.push(layer);
      }
    });

    subUngrouped.forEach((layer) => {
      groupContainer.appendChild(createLayerItem(layer, null, state));
    });

    Object.keys(subGroups).forEach((groupName) => {
      const firstLayer = subGroups[groupName][0];
      const layerCount = subGroups[groupName].length;
      const displayName = `${groupName} (${layerCount})`;
      const groupItem = createLayerItem(firstLayer, displayName, state);
      groupItem.dataset.isGroup = "true";
      groupItem.dataset.groupName = groupName;
      groupItem.dataset.layerIds = subGroups[groupName]
        .map((l) => l.id)
        .join(",");
      groupContainer.appendChild(groupItem);
    });

    // Toggle button collapses/expands the group
    header
      .querySelector(".discipline-toggle-btn")
      .addEventListener("click", (e) => {
        e.stopPropagation();
        const btn = e.currentTarget;
        const isCollapsed = groupContainer.style.display === "none";
        groupContainer.style.display = isCollapsed ? "" : "none";
        btn.textContent = isCollapsed ? "▼" : "▶";
      });

    containerEl.appendChild(header);
    containerEl.appendChild(groupContainer);
  });
}

// ─── Stage Branch helpers (from stageBranchController.js) ─────────────────

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Scan commit history and return a Map of designOptionId → Set<primPath>.
 * Commits with no designOptionId are grouped under the key "wip".
 */
function getPrimsByBranch(state) {
  const map = new Map();
  const commits = state.history?.commits;
  if (!commits) return map;

  commits.forEach((commit) => {
    const key = commit.designOptionId || "wip";
    if (!map.has(key)) map.set(key, new Set());
    const prims = commit.stagedPrims || commit.addedPrims || [];
    prims.forEach((p) => map.get(key).add(p));
  });

  return map;
}

function renderDesignOptionCard(opt, packages, isPM, primsByBranch) {
  const optionPackages = packages.filter(
    (p) => p.designOptionId === opt.id && p.stageBranch === "Shared"
  );
  const suitLabel =
    SUITABILITY_CODES[opt.suitability]?.label || opt.suitability || "";
  const isApproved = opt.status === "approved";
  const isSuperseded = opt.status === "superseded";
  const optionPrims = primsByBranch
    ? primsByBranch.get(opt.id) || new Set()
    : new Set();

  const primItems =
    optionPrims.size === 0
      ? '<div class="branch-empty" style="font-size:10px;padding:2px 0;">No objects yet</div>'
      : `<ul class="branch-prim-list">${[...optionPrims]
          .map((p) => {
            const name = p.split("/").filter(Boolean).pop() || p;
            return `<li class="branch-prim-item" title="${p}">${name}</li>`;
          })
          .join("")}</ul>`;

  return `
    <li class="design-option-card ${isApproved ? "approved" : ""} ${isSuperseded ? "archived" : ""}">
      <div class="design-option-card-header">
        <span class="design-option-name">${opt.name}</span>
        <span class="suitability-badge" title="${suitLabel}">${opt.suitability || ""}</span>
        ${
          isPM && !isApproved && !isSuperseded
            ? `<button class="approve-option-btn design-option-approve-btn" data-option-id="${opt.id}">
               Approve for Published
             </button>`
            : isApproved
              ? '<span class="approved-badge">✓ Approved</span>'
              : ""
        }
      </div>
      ${
        optionPackages.length > 0
          ? `<div class="design-option-packages">
             ${optionPackages
               .map(
                 (p) => `
               <span class="option-package-chip" style="border-color:${p.color};color:${p.color};"
                     title="${p.name}">${p.isoNumber || p.name}</span>`
               )
               .join("")}
           </div>`
          : ""
      }
      ${primItems}
    </li>
  `;
}

function openNewDesignOptionDialog(updateView) {
  const name = prompt("Design Option name (e.g. 'Option A'):");
  if (!name || !name.trim()) return;

  const suitCodes = Object.entries(SUITABILITY_CODES)
    .filter(([, v]) => v.allowedStatus === "Shared")
    .map(([k]) => k)
    .join(" / ");

  const suitability = prompt(
    `Suitability code for "${name.trim()}":\n${suitCodes}`,
    "S1"
  )
    ?.trim()
    .toUpperCase();

  if (!suitability || !SUITABILITY_CODES[suitability]) {
    alert("Invalid suitability code.");
    return;
  }

  const newOption = {
    id: generateId("do"),
    name: name.trim(),
    suitability,
    color: "#4a90d9",
    status: "open",
    createdAt: new Date().toISOString(),
    createdBy: store.getState().currentUser || "System",
    approvedBy: null,
    approvedAt: null,
    packageIds: [],
  };

  store.dispatch(designOptionActions.addDesignOption(newOption));
  persistDesignOptions();
  if (updateView) updateView();
}

function persistDesignOptions() {
  const state = store.getState();
  const statementContent = state.loadedFiles?.["statement.usda"];
  if (!statementContent) return;
  const newContent = writePackageRegistryToStatement(
    statementContent,
    state.packages || [],
    state.designOptions || []
  );
  store.dispatch({
    type: "UPDATE_FILE",
    payload: { filePath: "statement.usda", content: newContent },
  });
}

// ─── Main render function ──────────────────────────────────────────────────

export function renderLayerStack() {
  const layerStackList = document.getElementById("layerStackList");
  layerStackList.innerHTML = "";

  if (!store.getState().stage || !store.getState().stage.layerStack) return;

  const state = store.getState();
  const layerStack = state.stage.layerStack;

  // Ownership filter: non-PMs only see their own layers
  const visibleLayers = layerStack.filter((layer) => {
    if (state.currentUser === "Project Manager") return true;
    if (layer.owner && layer.owner !== state.currentUser) return false;
    return true;
  });

  // Split layers by status into branch buckets
  const wipLayers = visibleLayers.filter((l) => l.status === "WIP");
  const sharedLayers = visibleLayers.filter((l) => l.status === "Shared");
  const publishedLayers = visibleLayers.filter((l) => l.status === "Published");
  const archivedLayers = visibleLayers.filter((l) => l.status === "Archived");

  const designOptions = state.designOptions || [];
  const packages = state.packages || [];
  const archiveVisible = state.stageBranches?.archive?.visible || false;
  const primsByBranch = getPrimsByBranch(state);

  const currentUserObj =
    state.users instanceof Map ? state.users.get(state.currentUserId) : null;
  const isPM = isProjectManager(currentUserObj || state.currentUser);

  const publishedPackage = packages.find(
    (p) => p.stageBranch === "Published" && p.approvalStatus === "approved"
  );
  const archivedPackages = packages.filter((p) => p.stageBranch === "Archived");

  // ── Helper to build a branch section wrapper ──
  function makeBranchSection(cssClass, labelHtml, bodyContent) {
    const section = document.createElement("div");
    section.className = `stage-branch-section ${cssClass}`;

    const header = document.createElement("div");
    header.className = "stage-branch-section-header";
    header.innerHTML = `
      <span class="branch-icon"></span>
      <span class="branch-label">${labelHtml}</span>
      <span class="branch-chevron">▾</span>
    `;

    section.appendChild(header);
    if (bodyContent) {
      const body = document.createElement("div");
      body.className = "stage-branch-section-body";
      if (typeof bodyContent === "string") {
        body.innerHTML = bodyContent;
      } else {
        body.appendChild(bodyContent);
      }
      section.appendChild(body);
    }
    return section;
  }

  // ── WIP section ──
  const wipSection = makeBranchSection("wip", "WIP", null);
  const wipBody = document.createElement("div");
  wipBody.className = "stage-branch-section-body";
  if (wipLayers.length === 0) {
    wipBody.innerHTML = '<div class="branch-empty">No WIP layers.</div>';
  } else {
    appendDisciplineGroups(wipBody, wipLayers, state);
  }
  wipSection.appendChild(wipBody);
  layerStackList.appendChild(wipSection);

  // ── Shared section ──
  const sharedSection = makeBranchSection("shared", "SHARED", null);
  const sharedHeader = sharedSection.querySelector(
    ".stage-branch-section-header"
  );
  // Insert "+" button into header span
  const addBtn = document.createElement("button");
  addBtn.id = "add-design-option-btn";
  addBtn.className = "um-add-btn";
  addBtn.style.cssText = "margin:0 6px;font-size:10px;";
  addBtn.textContent = "+ Option";
  sharedHeader.appendChild(addBtn);

  const sharedBody = document.createElement("div");
  sharedBody.className = "stage-branch-section-body";

  // Design option cards
  const designOptionsList = document.createElement("ul");
  designOptionsList.className = "design-options-list";
  designOptionsList.id = "design-options-list";
  if (designOptions.length === 0) {
    designOptionsList.innerHTML =
      '<li class="branch-empty">No design options yet. Create one to send records to Shared.</li>';
  } else {
    designOptionsList.innerHTML = designOptions
      .map((opt) => renderDesignOptionCard(opt, packages, isPM, primsByBranch))
      .join("");
  }
  sharedBody.appendChild(designOptionsList);

  // Unassigned Shared layers (no designOptionId)
  const unassignedShared = sharedLayers.filter((l) => !l.designOptionId);
  if (unassignedShared.length > 0) {
    appendDisciplineGroups(sharedBody, unassignedShared, state);
  }

  sharedSection.appendChild(sharedBody);
  layerStackList.appendChild(sharedSection);

  // ── Published section ──
  const publishedSection = makeBranchSection("published", "PUBLISHED", null);
  const publishedBody = document.createElement("div");
  publishedBody.className = "stage-branch-section-body";

  if (publishedPackage) {
    const pkgDiv = document.createElement("div");
    pkgDiv.className = "published-package-display";
    pkgDiv.innerHTML = `
      <span class="option-package-chip" style="border-color:#27ae60;color:#27ae60;">${publishedPackage.isoNumber || publishedPackage.name}</span>
      <span class="published-meta">Approved by ${publishedPackage.approvedBy || "PM"}</span>
    `;
    publishedBody.appendChild(pkgDiv);
  } else {
    publishedBody.innerHTML =
      '<div class="branch-empty">No published package yet.</div>';
  }

  if (publishedLayers.length > 0) {
    appendDisciplineGroups(publishedBody, publishedLayers, state);
  }

  publishedSection.appendChild(publishedBody);
  layerStackList.appendChild(publishedSection);

  // ── Archived section ──
  const archivedSection = makeBranchSection("archived", "ARCHIVED", null);
  const archivedHeader = archivedSection.querySelector(
    ".stage-branch-section-header"
  );
  if (isPM) {
    const toggleBtn = document.createElement("button");
    toggleBtn.id = "toggle-archive-visibility";
    toggleBtn.className = "archive-toggle-btn";
    toggleBtn.textContent = `${archiveVisible ? "Hide" : "Show"} Archive`;
    archivedHeader.appendChild(toggleBtn);
  }

  if (archiveVisible) {
    const archivedBody = document.createElement("div");
    archivedBody.className = "stage-branch-section-body";

    if (archivedPackages.length > 0) {
      archivedPackages.forEach((p) => {
        const card = document.createElement("div");
        card.className = "design-option-card archived";
        card.innerHTML = `
          <span class="archive-badge">ARCHIVED</span>
          <span class="archive-lock-icon">🔒</span>
          <span class="option-package-chip">${p.isoNumber || p.name}</span>
          ${p.archivedAt ? `<span class="archive-timestamp">${new Date(p.archivedAt).toLocaleDateString()}</span>` : ""}
        `;
        archivedBody.appendChild(card);
      });
    } else {
      archivedBody.innerHTML =
        '<div class="branch-empty">No archived states.</div>';
    }

    if (archivedLayers.length > 0) {
      appendDisciplineGroups(archivedBody, archivedLayers, state);
    }

    archivedSection.appendChild(archivedBody);
  }

  layerStackList.appendChild(archivedSection);
}

function handleLayerSelection(li, updateView) {
  if (!li.dataset.layerId) return;
  const allItems = document
    .getElementById("layerStackList")
    .querySelectorAll("li");
  allItems.forEach((item) => item.classList.remove("selected"));
  li.classList.add("selected");
  li.classList.add("selected");
  const filePath = li.dataset.filePath;
  store.dispatch(coreActions.setCurrentFile(filePath));

  // Update selectedFiles for renderer consistency
  const state = store.getState();
  if (state.loadedFiles[filePath]) {
    store.dispatch(
      coreActions.setSelectedFiles([
        {
          name: filePath,
          content: state.loadedFiles[filePath],
        },
      ])
    );
  }

  document.getElementById("currentFileTab").textContent = filePath;
  store.dispatch(coreActions.setCurrentView("file"));
  updateView();
}

export function logPromotionToStatement(details) {
  const { layerPath, sourceStatus, targetStatus, objectPath, type, packageId } =
    details;
  const entryNumber = store.dispatch(coreActions.incrementLogEntryCounter());
  const state = store.getState();
  const fileContent = state.loadedFiles[layerPath];
  if (!fileContent) return;

  const fileSize = new Blob([fileContent]).size;
  const contentHash = sha256(fileContent);
  const primsInFile = USDA_PARSER.getPrimHierarchy(fileContent);
  const allStagedPaths = [];
  function collectPaths(prims) {
    prims.forEach((p) => {
      allStagedPaths.push(p.path);
      if (p.children) collectPaths(p.children);
    });
  }
  collectPaths(primsInFile);

  const newId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const promotionBranch = getDisciplineBranch(state.currentUser, targetStatus);
  const logEntry = {
    ID: newId,
    Entry: entryNumber,
    Timestamp: new Date().toISOString(),
    "USD Reference Path": layerPath,
    "File Name": layerPath,
    "Content Hash": contentHash,
    "File Size": fileSize,
    Type: type || "Promotion",
    User: state.currentUser,
    branch: promotionBranch,
    packageId: packageId || state.activePackageId || null,
    Status: "New",
    SourceStatus: sourceStatus,
    TargetStatus: targetStatus,
    sourceStatus: sourceStatus,
    targetStatus: targetStatus,
    stagedPrims: allStagedPaths,
    parent: state.headCommitId,
  };

  if (objectPath) {
    logEntry["Object Path"] = objectPath;
    if (!type) {
      logEntry.Type = "Object Promotion";
    }
  }
  store.dispatch(coreActions.setHeadCommit(newId));

  const logPrimString = composeLogPrim(logEntry);
  const newContent = USDA_PARSER.appendToUsdaFile(
    state.loadedFiles["statement.usda"],
    logPrimString,
    "ChangeLog"
  );
  store.dispatch(coreActions.updateFile("statement.usda", newContent));
}

/**
 * Recomposes the stage hierarchy by resolving references and applying visibility filters
 * This is the core function for USD layer composition in the viewer
 *
 * Process:
 * 1. Filters staged prims based on user ownership (non-PMs only see their own layers)
 * 2. Resolves all references (@file.usda@</Path>) by loading and merging content
 * 3. Stamps source file metadata (_sourceFile, _sourcePath, _sourceLayerStatus) for renderer
 * 4. Recursively processes children and merges local edits with referenced content
 * 5. Updates composed hierarchy in store for 3D viewer
 *
 * Reference resolution patterns supported:
 * - @filename.usda@</Path> (full reference with path)
 * - @filename.usda@ (reference to default prim)
 * - filename.usda@</Path> (missing leading @)
 * - filename.usda (simple filename)
 *
 * @example
 * recomposeStage();
 * // Resolves all references in the layer stack and updates the composed hierarchy
 * // The 3D viewer will re-render based on the new composed hierarchy
 */
export function recomposeStage() {
  const state = store.getState();
  let stagedPrims = state.stage.composedPrims || [];

  // Strict Visibility Filter for 3D Viewer
  if (state.currentUser !== "Project Manager") {
    stagedPrims = stagedPrims.filter((prim) => {
      // If no source file, assume it's safe (or blocking it might break local edits)
      // But strict mode means we only show what we own.
      // However, newly added prims might not have _sourceFile yet until saved?
      // For now, check if it maps to a known layer.
      if (prim._sourceFile) {
        const layer = state.stage.layerStack.find(
          (l) => l.filePath === prim._sourceFile
        );
        if (layer && layer.owner && layer.owner !== state.currentUser) {
          return false; // Hide this prim
        }
      }
      return true;
    });
  }

  if (stagedPrims.length === 0) {
    store.dispatch(coreActions.setComposedHierarchy([]));
    console.log("[RECOMPOSE] No staged prims, cleared hierarchy");
    return;
  }

  console.log(
    "[RECOMPOSE] Recomposing stage with",
    stagedPrims.length,
    "prims"
  );

  // Recursive function to resolve references and build the full renderable tree
  function resolveHierarchy(prims) {
    if (!prims || !Array.isArray(prims)) {
      console.warn(
        "[RECOMPOSE] Invalid prims array passed to resolveHierarchy"
      );
      return [];
    }

    return prims.map((prim) => {
      // Clone the prim to avoid mutating the source of truth
      const resolvedPrim = {
        ...prim,
        children: [],
        properties: { ...prim.properties },
      };

      // 1. Resolve Reference if present
      if (resolvedPrim.references) {
        let fileName = null;
        let pathInFile = null;

        const ref = resolvedPrim.references.trim();

        const matchFull = ref.match(/^@([^@]+)@<([^>]+)>$/);
        const matchSimple = ref.match(/^@([^@]+)@$/);
        // Support: filename.usda@</path> (Missing leading @)
        const matchNoLeadingAt = ref.match(/^([^@]+)@<([^>]+)>$/);
        // Allow simple filenames too (e.g. from some USDA generators or user tweaks)
        const matchRaw = ref.match(/^([^@<>\s]+\.(?:usda|usd|usdc))$/i);

        if (matchFull) {
          fileName = matchFull[1];
          pathInFile = matchFull[2];
        } else if (matchNoLeadingAt) {
          fileName = matchNoLeadingAt[1];
          pathInFile = matchNoLeadingAt[2];
        } else if (matchSimple) {
          fileName = matchSimple[1];
        } else if (matchRaw) {
          fileName = matchRaw[1];
        }

        if (fileName) {
          const fileContent = state.loadedFiles[fileName];
          if (fileContent) {
            // Parse the source file
            const sourceHierarchy = USDA_PARSER.getPrimHierarchy(fileContent);

            // If no explicit path, use the first root prim as a heuristic for defaultPrim
            if (!pathInFile && sourceHierarchy.length > 0) {
              pathInFile = sourceHierarchy[0].path;
            }

            // Find the target prim in the source
            let targetPrim = null;

            if (pathInFile) {
              // Helper to find path in hierarchy
              const findPrim = (list, targetPath) => {
                if (!list || !Array.isArray(list)) return null;
                for (const p of list) {
                  if (p.path === targetPath) return p;
                  if (targetPath.startsWith(p.path + "/")) {
                    const child = findPrim(p.children || [], targetPath);
                    if (child) return child;
                  }
                }
                return null;
              };
              targetPrim = findPrim(sourceHierarchy, pathInFile);
            }

            if (targetPrim) {
              resolvedPrim.type = targetPrim.type;
              resolvedPrim.properties = {
                ...targetPrim.properties,
                ...resolvedPrim.properties,
              };
              // Merge Pset grouping metadata so dictionary properties from the
              // source file are shown grouped in the properties panel
              resolvedPrim._psets = {
                ...(targetPrim._psets || {}),
                ...(resolvedPrim._psets || {}),
              };
              resolvedPrim.children = targetPrim.children
                ? JSON.parse(JSON.stringify(targetPrim.children))
                : [];

              // Look up layer status - FORCE FRESH LOOKUP
              const currentLayer = state.stage.layerStack.find(
                (l) => l.filePath === fileName
              );
              const layerStatus = currentLayer
                ? currentLayer.status
                : "Published";

              // CRITICAL FIX: Stamp the SOURCE PATH so the renderer can find the geometry
              // The renderer keys geometry by the path in the source file, not the staged path.
              resolvedPrim._sourceFile = fileName;
              resolvedPrim._sourcePath = targetPrim.path;
              resolvedPrim._sourceLayerStatus = layerStatus;
              console.log(
                `[RECOMPOSE] Set _sourcePath for ${resolvedPrim.path} to ${targetPrim.path} from file ${fileName}`
              );

              // Recursively stamp source path on children
              const stampChildren = (children, source, status) => {
                if (!children || !Array.isArray(children)) return;
                children.forEach((child) => {
                  child._sourceFile = source;
                  child._sourceLayerStatus = status;
                  // The child path in the source hierarchy IS the source path
                  child._sourcePath = child.path;
                  if (child.children)
                    stampChildren(child.children, source, status);
                });
              };
              stampChildren(resolvedPrim.children, fileName, layerStatus);
            } else {
              console.warn(
                `[RECOMPOSE] Target prim '${pathInFile}' not found in '${fileName}'`
              );
            }
          } else {
            console.warn(
              `[RECOMPOSE] Reference '${fileName}' found in code but file not loaded in loadedFiles.`
            );
          }
        } else {
          console.warn(
            `[RECOMPOSE] Invalid reference format: ${resolvedPrim.references}`
          );
        }
      }

      if (prim.children && prim.children.length > 0) {
        const localChildren = resolveHierarchy(prim.children);
        resolvedPrim.children = [...resolvedPrim.children, ...localChildren];
      }

      if (resolvedPrim.children.length > 0) {
        const tagChildren = (list, source, status) => {
          if (!list || !Array.isArray(list)) return;
          list.forEach((c) => {
            if (!c._sourceFile) c._sourceFile = source;
            if (!c._sourceLayerStatus && status) c._sourceLayerStatus = status;
            if (c.children) tagChildren(c.children, source, status);
          });
        };
        if (resolvedPrim._sourceFile) {
          tagChildren(
            resolvedPrim.children,
            resolvedPrim._sourceFile,
            resolvedPrim._sourceLayerStatus
          );
        }
      }

      return resolvedPrim;
    });
  }

  store.dispatch(
    coreActions.setComposedHierarchy(resolveHierarchy(stagedPrims))
  );
  console.log(
    "[RECOMPOSE] Composed hierarchy with",
    store.getState().composedHierarchy.length,
    "root prims"
  );
}

export function initLayerStack(updateView, fileThreeScene, stageThreeScene) {
  const layerStackList = document.getElementById("layerStackList");
  const addFileButton = document.getElementById("add-file-button");
  const deleteFileButton = document.getElementById("delete-file-button");
  const setStageButton = document.getElementById("set-stage-button");
  const promoteLayerButton = document.getElementById("promote-layer-button");
  const demoteLayerButton = document.getElementById("demote-layer-button");
  const fileInput = document.getElementById("usdaFileInput");

  // ==================== Add File Button ====================
  const handleAddFile = errorHandler.wrap(() => {
    // Field Person cannot upload files
    const currentUser = store.getState().currentUser;
    if (currentUser === "Field Person") {
      throw new ValidationError(
        "Field Person users cannot upload files",
        "user",
        currentUser
      );
    }
    fileInput.click();
  });

  addFileButton.addEventListener("click", handleAddFile);

  // Migration: Fix legacy ownership + enforce system-file statuses
  const layerStack = store.getState().stage.layerStack.map((layer) => {
    if (layer.owner === "user1") return { ...layer, owner: "Architect" };
    if (layer.owner === "user2")
      return { ...layer, owner: "Structural Engineer" };
    // statement.usda is a system audit log — always Archived + immutable
    if (layer.filePath === "statement.usda") {
      return {
        ...layer,
        status: "Archived",
        immutable: true,
        active: false,
        visible: false,
        owner: layer.owner || "Project Manager",
        branch: "Archived/PM",
      };
    }
    return layer;
  });
  store.dispatch(coreActions.updateLayerStack(layerStack));
  renderLayerStack();

  // ==================== File Input Change Handler ====================
  const handleFileInput = errorHandler.wrap(async (event) => {
    const file = event.target.files[0];

    if (!file) {
      return; // No file selected, no error
    }

    // Detect file type
    const isIFC = file.name.toLowerCase().endsWith(".ifc");
    const isUSD = file.name.endsWith(".usda") || file.name.endsWith(".usd");

    // Validate file extension
    if (!isIFC && !isUSD) {
      throw new FileError(
        "Invalid file type. Please select a .usda, .usd, or .ifc file",
        file.name
      );
    }

    // Handle IFC files
    if (isIFC) {
      console.log(`🔄 Converting IFC file: ${file.name}`);

      // Show loading indicator
      loadingIndicator.show({
        title: "Converting IFC File",
        message: `Processing ${file.name}...`,
        indeterminate: true,
      });

      try {
        // Convert IFC to USD with progress reporting
        const usdContent = await ifcConverterAPI.convert(
          file,
          (percentage, message) => {
            loadingIndicator.updateProgress(percentage, message);
          }
        );

        // Create USD filename
        const usdFileName = file.name.replace(/\.ifc$/i, ".usda");
        const sizeKB = Math.round((usdContent?.length || 0) / 1024);
        console.log(
          `[IFC→USD] 📄 usdContent received in layerStackController: ${sizeKB} KB`
        );

        // Process as single USD file
        const existingPathsIfc = store
          .getState()
          .stage.layerStack.map((l) => l.filePath);
        if (existingPathsIfc.includes(usdFileName)) {
          console.warn(
            `[LayerStack] Skipping duplicate IFC-converted layer: ${usdFileName}`
          );
          loadingIndicator.hide();
          return;
        }

        console.time("[IFC→USD] loadFile dispatch");
        store.dispatch(coreActions.loadFile(usdFileName, usdContent));
        console.timeEnd("[IFC→USD] loadFile dispatch");

        // Register prim hashes for future re-upload diffing
        const ifcHashes = computePrimHashes(usdContent, usdFileName);
        actions.updatePrimHashRegistry(ifcHashes);

        // Create layer with current user as owner
        const newLayer = {
          id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          filePath: usdFileName,
          status: "WIP",
          visible: true,
          owner: store.getState().currentUser,
          groupName: null,
        };
        console.time("[IFC→USD] addLayer + renderLayerStack");
        store.dispatch(coreActions.addLayer(newLayer));

        loadingIndicator.updateProgress(100, "Conversion complete!");

        // Small delay to show completion before hiding
        await new Promise((resolve) => setTimeout(resolve, 500));

        renderLayerStack();
        console.timeEnd("[IFC→USD] addLayer + renderLayerStack");
        console.log(
          `✅ Successfully converted and loaded IFC file: ${file.name} → ${usdFileName}`
        );
      } catch (error) {
        console.error("IFC conversion failed:", error);
        throw new FileError(
          `Failed to convert IFC file: ${error.message}`,
          file.name,
          error
        );
      } finally {
        loadingIndicator.hide();
      }

      fileInput.value = ""; // Reset to allow re-importing
      return;
    }

    // Handle USD files (existing logic)
    const reader = new FileReader();

    reader.onerror = () => {
      throw new FileError(
        `Failed to read file: ${reader.error?.message || "Unknown error"}`,
        file.name,
        reader.error
      );
    };

    reader.onload = errorHandler.wrap(async (e) => {
      const fileContent = e.target.result;

      if (!fileContent || typeof fileContent !== "string") {
        throw new FileError("File content is empty or invalid", file.name);
      }

      // Show loading indicator for USD processing
      const fileCount = (fileContent.match(/def\s+\w+\s+"/g) || []).length;
      const isLargeFile = fileContent.length > 500000 || fileCount > 50;

      if (isLargeFile) {
        loadingIndicator.show({
          title: "Loading USD File",
          message: `Processing ${file.name}...`,
          indeterminate: false,
        });
      }

      try {
        if (isLargeFile) {
          loadingIndicator.updateProgress(30, "Parsing USD structure...");
        }

        // TODO: Use layerService.createLayer() here in future refactor
        const atomicFiles = explodeUsda(fileContent, file.name);

        if (isLargeFile) {
          loadingIndicator.updateProgress(
            60,
            `Processing ${Object.keys(atomicFiles).length} layer(s)...`
          );
        }

        Object.entries(atomicFiles).forEach(([fileName, content]) => {
          const state = store.getState();
          const existingPaths = state.stage.layerStack.map((l) => l.filePath);
          const isReUpload = existingPaths.includes(fileName);

          if (isReUpload) {
            // Phase B: diff against hash registry and auto-stage detected changes
            const newHashes = computePrimHashes(content, fileName);
            const registry = state.primHashRegistry || {};

            // Collect old hashes for this file
            const oldHashes = {};
            Object.entries(registry).forEach(([path, val]) => {
              if (val.sourceFile === fileName) oldHashes[path] = val;
            });

            const ts = new Date().toISOString();
            const user = state.currentUser;
            const reuploadUserId = state.currentUserId;
            const reuploadUserObj =
              state.users instanceof Map
                ? state.users.get(reuploadUserId)
                : null;

            // Modified and added prims
            Object.entries(newHashes).forEach(([path, { hash }]) => {
              if (!oldHashes[path]) {
                actions.addStagedChange({
                  type: "primAdded",
                  targetPath: path,
                  sourceFile: fileName,
                  user,
                  timestamp: ts,
                  sourceStatus: "WIP",
                });
              } else if (oldHashes[path].hash !== hash) {
                actions.addStagedChange({
                  type: "primUpdate",
                  targetPath: path,
                  sourceFile: fileName,
                  user,
                  timestamp: ts,
                  sourceStatus: "WIP",
                });
              }
            });

            // Removed prims
            Object.entries(oldHashes).forEach(([path]) => {
              if (!newHashes[path]) {
                actions.addStagedChange({
                  type: "primRemoved",
                  targetPath: path,
                  sourceFile: fileName,
                  user,
                  timestamp: ts,
                  sourceStatus: "WIP",
                });
              }
            });

            // Update file content and refresh hash registry for this file
            actions.clearFileFromHashRegistry(fileName);
            store.dispatch(coreActions.updateFile(fileName, content));
            actions.updatePrimHashRegistry(newHashes);

            // Regenerate URIs for changed/new prims (version bump)
            const existingLayer = state.stage.layerStack.find(
              (l) => l.filePath === fileName
            );
            const uriEntries = generateUrisForFile(
              { [fileName]: content },
              existingLayer || { status: "WIP", suitabilityCode: null },
              reuploadUserObj,
              store.getState()
            );
            store.dispatch(uriActions.registerUrisBatch(uriEntries));

            const changed =
              Object.keys(newHashes).length + Object.keys(oldHashes).length;
            console.log(
              `[Re-upload] ${fileName}: registry diffed (${changed} prims evaluated)`
            );
            return;
          }

          // First upload: load normally and register hashes
          store.dispatch(coreActions.loadFile(fileName, content));

          const uploadState = store.getState();
          const currentUser = uploadState.currentUser;
          const currentUserId = uploadState.currentUserId;
          const userObj =
            uploadState.users instanceof Map
              ? uploadState.users.get(currentUserId)
              : null;

          const newLayer = {
            id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            filePath: fileName,
            status: "WIP",
            visible: true,
            active: true,
            owner: currentUser,
            ownerId: currentUserId || null,
            companyCode: userObj?.company?.code || "AEC",
            teamCode: userObj?.taskTeams?.[0]?.code || "TEAM",
            suitabilityCode: null,
            immutable: false,
            branch: getDisciplineBranch(userObj || currentUser, "WIP"),
            groupName: Object.keys(atomicFiles).length > 1 ? file.name : null,
          };
          store.dispatch(coreActions.addLayer(newLayer));

          // Register prim hashes for future re-upload diffing
          const newHashes = computePrimHashes(content, fileName);
          actions.updatePrimHashRegistry(newHashes);

          // Generate and register ISO 19650 URIs for all prims in this file
          const uriEntries = generateUrisForFile(
            { [fileName]: content },
            newLayer,
            userObj,
            store.getState()
          );
          store.dispatch(uriActions.registerUrisBatch(uriEntries));
        });

        if (isLargeFile) {
          loadingIndicator.updateProgress(100, "Import complete!");
          await new Promise((resolve) => setTimeout(resolve, 300));
        }

        renderLayerStack();
        console.log(
          `✅ Successfully loaded ${Object.keys(atomicFiles).length} file(s) from ${file.name}`
        );
      } finally {
        if (isLargeFile) {
          loadingIndicator.hide();
        }
      }
    });

    reader.readAsText(file);
    fileInput.value = ""; // Reset to allow re-importing
  });

  fileInput.addEventListener("change", handleFileInput);

  // Helper to select prims belonging to specific layers
  const selectLayerPrims = (layerFilePath) => {
    if (store.getState().currentView !== "stage") return; // Only applicable in Stage View for now

    const targetPaths = [];
    const findPaths = (prims) => {
      for (const prim of prims) {
        if (prim._sourceFile === layerFilePath) {
          targetPaths.push(prim.path);
        }
        if (prim.children) findPaths(prim.children);
      }
    };
    if (store.getState().composedHierarchy) {
      findPaths(store.getState().composedHierarchy);
    }

    if (stageThreeScene && stageThreeScene.selectionController) {
      stageThreeScene.selectionController.selectPrims(targetPaths);
    }
  };

  layerStackList.addEventListener("click", (e) => {
    // Branch section header collapse/expand
    const sectionHeader = e.target.closest(".stage-branch-section-header");
    if (sectionHeader && !e.target.closest("button")) {
      const section = sectionHeader.closest(".stage-branch-section");
      if (section) {
        section.classList.toggle("collapsed");
        const chevron = sectionHeader.querySelector(".branch-chevron");
        if (chevron)
          chevron.textContent = section.classList.contains("collapsed")
            ? "▶"
            : "▾";
      }
      return;
    }

    // Add design option
    if (e.target.closest("#add-design-option-btn")) {
      openNewDesignOptionDialog(updateView);
      return;
    }

    // Approve design option
    const approveBtn = e.target.closest(".design-option-approve-btn");
    if (approveBtn) {
      const optionId = approveBtn.dataset.optionId;
      document.dispatchEvent(
        new CustomEvent("approveDesignOption", { detail: { optionId } })
      );
      return;
    }

    // Archive toggle
    if (e.target.closest("#toggle-archive-visibility")) {
      const archState = store.getState();
      const current = archState.stageBranches?.archive?.visible || false;
      store.dispatch({
        type: "SET_STAGE_BRANCHES_STATE",
        payload: { updates: { archive: { visible: !current } } },
      });
      renderLayerStack();
      return;
    }

    const targetLi = e.target.closest("li");
    if (!targetLi) return;

    // Check if this is a group item
    const isGroup = targetLi.dataset.isGroup === "true";
    const groupName = targetLi.dataset.groupName;
    const layerIds = isGroup
      ? targetLi.dataset.layerIds.split(",")
      : [targetLi.dataset.layerId];

    // Get all layers for this item (single or group)
    const currentLayerStack = store.getState().stage.layerStack;
    const layers = layerIds
      .map((id) => currentLayerStack.find((l) => l.id === id))
      .filter((l) => l);
    if (layers.length === 0) return;

    // Handle Visibility Toggle
    if (e.target.closest(".visibility-toggle")) {
      e.stopPropagation();
      // Toggle visibility for all layers in the group
      const newVisibility = !layers[0].visible;
      const updatedStack = currentLayerStack.map((l) => {
        if (layerIds.includes(l.id)) {
          return { ...l, visible: newVisibility };
        }
        return l;
      });
      store.dispatch(coreActions.updateLayerStack(updatedStack));

      renderLayerStack();
      recomposeStage();
      syncRecordedHierarchy();
      if (store.getState().currentView === "stage") updateView();
      // Also potentially select prims? User only clicked eye. Maybe not.
      return;
    }

    // Handle Status Click
    if (e.target.closest(".status-indicator")) {
      e.stopPropagation();

      // Permission Check: Only Owner or Project Manager can change status
      const currentUser = store.getState().currentUser;
      const unauthorizedLayers = layers.filter(
        (layer) =>
          currentUser !== "Project Manager" &&
          layer.owner &&
          layer.owner !== currentUser
      );

      if (unauthorizedLayers.length > 0) {
        alert(
          `Permission Denied: Only the owner or Project Manager can change the status of this layer.`
        );
        return;
      }

      const currentIndex = STATUS_ORDER.indexOf(layers[0].status);
      const nextIndex = (currentIndex + 1) % STATUS_ORDER.length;
      const newStatus = STATUS_ORDER[nextIndex];

      // Apply status change to all layers in the group
      const currentStack = store.getState().stage.layerStack;
      const updatedStack = currentStack.map((l) => {
        if (layers.find((target) => target.id === l.id)) {
          const updatedLayer = { ...l, status: newStatus };
          // We need to sync prim status here or after
          // syncPrimStatusFromLayer mutates prims, so we need to handle that carefully
          // For now, let's update the layer stack first
          return updatedLayer;
        }
        return l;
      });
      store.dispatch(coreActions.updateLayerStack(updatedStack));

      // Now sync prim status (which will update composedPrims)
      layers.forEach((layer) => {
        // We need to pass the UPDATED layer info
        syncPrimStatusFromLayer({ ...layer, status: newStatus });
      });

      renderLayerStack();
      recomposeStage();
      syncRecordedHierarchy();
      if (store.getState().currentView === "stage") {
        updateView();
        // Select prims from all layers in the group
        layers.forEach((layer) => selectLayerPrims(layer.filePath));
      }
      return;
    }

    // Handle Selection (Clicking Name/Row)
    if (e.ctrlKey || e.metaKey) {
      if (targetLi.classList.contains("selected")) {
        targetLi.classList.remove("selected");
      } else {
        targetLi.classList.add("selected");
      }

      // Re-calculate selectedFiles - for groups, include all layers
      const selectedElements = Array.from(
        document
          .getElementById("layerStackList")
          .querySelectorAll("li.selected")
      );
      const selectedFiles = [];

      selectedElements.forEach((el) => {
        const isGroupEl = el.dataset.isGroup === "true";
        if (isGroupEl) {
          // Add all files from the group
          const groupLayerIds = el.dataset.layerIds.split(",");
          groupLayerIds.forEach((id) => {
            const layer = store
              .getState()
              .stage.layerStack.find((l) => l.id === id);
            if (layer && store.getState().loadedFiles[layer.filePath]) {
              selectedFiles.push({
                name: layer.filePath,
                content: store.getState().loadedFiles[layer.filePath],
              });
            }
          });
        } else {
          // Single file
          const fp = el.dataset.filePath;
          if (store.getState().loadedFiles[fp]) {
            if (!selectedFiles.find((f) => f.name === fp)) {
              selectedFiles.push({
                name: fp,
                content: store.getState().loadedFiles[fp],
              });
            }
          }
        }
      });

      store.dispatch(coreActions.setSelectedFiles(selectedFiles));

      if (selectedFiles.length === 1) {
        store.dispatch(coreActions.setCurrentFile(selectedFiles[0].name));
        document.getElementById("currentFileTab").textContent =
          selectedFiles[0].name;
      } else if (selectedFiles.length > 1) {
        // Check if first file is valid before setting
        if (selectedFiles[0])
          store.dispatch(coreActions.setCurrentFile(selectedFiles[0].name));
        document.getElementById("currentFileTab").textContent =
          "Multiple Files";
      } else {
        store.dispatch(coreActions.setCurrentFile(null));
        document.getElementById("currentFileTab").textContent = "None";
      }

      store.dispatch(coreActions.setCurrentView("file"));
      updateView();
    } else {
      // Single Selection
      if (isGroup) {
        // For groups, select all files in the group
        const allItems = document
          .getElementById("layerStackList")
          .querySelectorAll("li");
        allItems.forEach((item) => item.classList.remove("selected"));
        targetLi.classList.add("selected");

        const state = store.getState(); // Get fresh state
        const newSelectedFiles = layers
          .map((layer) => ({
            name: layer.filePath,
            content: state.loadedFiles[layer.filePath],
          }))
          .filter((item) => item.content);

        store.dispatch(coreActions.setSelectedFiles(newSelectedFiles));

        const firstFileName = newSelectedFiles[0]?.name || null;
        store.dispatch(coreActions.setCurrentFile(firstFileName));

        document.getElementById("currentFileTab").textContent =
          newSelectedFiles.length > 1 ? groupName : firstFileName || "None";

        store.dispatch(coreActions.setCurrentView("file"));
        updateView();
      } else {
        // Single layer selection
        handleLayerSelection(targetLi, updateView);
      }
    }
  });

  // ==================== Drag-to-Reorder ====================
  let dragSrcEl = null;

  layerStackList.addEventListener("dragstart", (e) => {
    const li = e.target.closest("li");
    if (!li) return;
    dragSrcEl = li;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", li.dataset.layerId || "");
    li.classList.add("dragging");
  });

  layerStackList.addEventListener("dragend", (e) => {
    const li = e.target.closest("li");
    if (li) li.classList.remove("dragging");
    layerStackList.querySelectorAll(".drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });
    dragSrcEl = null;
  });

  layerStackList.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const li = e.target.closest("li");
    if (!li || li === dragSrcEl) return;
    layerStackList.querySelectorAll(".drag-over").forEach((el) => {
      el.classList.remove("drag-over");
    });
    li.classList.add("drag-over");
  });

  layerStackList.addEventListener("dragleave", (e) => {
    const li = e.target.closest("li");
    if (li) li.classList.remove("drag-over");
  });

  layerStackList.addEventListener("drop", (e) => {
    e.preventDefault();
    const targetLi = e.target.closest("li");
    if (!targetLi || !dragSrcEl || targetLi === dragSrcEl) return;

    // Reorder DOM
    const srcIdx = Array.from(layerStackList.querySelectorAll("li")).indexOf(
      dragSrcEl
    );
    const tgtIdx = Array.from(layerStackList.querySelectorAll("li")).indexOf(
      targetLi
    );
    if (srcIdx < tgtIdx) {
      targetLi.after(dragSrcEl);
    } else {
      targetLi.before(dragSrcEl);
    }
    targetLi.classList.remove("drag-over");

    // Rebuild ordered layerStack from DOM order
    const currentStack = store.getState().stage.layerStack;
    const newStack = [];
    const seen = new Set();
    Array.from(layerStackList.querySelectorAll("li")).forEach((li) => {
      const isGroup = li.dataset.isGroup === "true";
      const ids = isGroup
        ? li.dataset.layerIds.split(",")
        : [li.dataset.layerId];
      ids.forEach((id) => {
        if (!seen.has(id)) {
          seen.add(id);
          const layer = currentStack.find((l) => l.id === id);
          if (layer) newStack.push(layer);
        }
      });
    });
    // Append layers not shown in the current filtered view (preserve their relative order)
    currentStack.forEach((l) => {
      if (!seen.has(l.id)) newStack.push(l);
    });

    store.dispatch(coreActions.reorderLayers(newStack));
    recomposeStage();
    syncRecordedHierarchy();
    if (store.getState().currentView === "stage") updateView();
  });

  // ==================== Delete File Button ====================
  const handleDeleteFile = errorHandler.wrap(() => {
    const selectedLayerItems = layerStackList.querySelectorAll("li.selected");

    if (selectedLayerItems.length === 0) {
      throw new ValidationError(
        "Please select a layer to delete",
        "selection",
        null
      );
    }

    const state = store.getState();

    // Collect file paths, expanding groups if selected
    const filePaths = [];
    Array.from(selectedLayerItems).forEach((li) => {
      if (li.dataset.isGroup === "true") {
        // This is a group - get all layer IDs and their file paths
        const layerIds = li.dataset.layerIds.split(",");
        layerIds.forEach((layerId) => {
          const layer = state.stage.layerStack.find((l) => l.id === layerId);
          if (layer) {
            filePaths.push(layer.filePath);
          }
        });
      } else {
        // Single layer
        filePaths.push(li.dataset.filePath);
      }
    });

    // Check ownership before allowing deletion
    if (state.currentUser !== "Project Manager") {
      const unauthorizedLayers = state.stage.layerStack.filter(
        (layer) =>
          filePaths.includes(layer.filePath) &&
          layer.owner &&
          layer.owner !== state.currentUser
      );

      if (unauthorizedLayers.length > 0) {
        throw new ValidationError(
          `You can only delete layers owned by ${state.currentUser}. ${unauthorizedLayers.length} selected layer(s) belong to other users`,
          "permission",
          unauthorizedLayers.map((l) => l.filePath)
        );
      }
    }

    const confirmMessage =
      filePaths.length === 1
        ? `Are you sure you want to remove layer '${filePaths[0]}' from the stack?`
        : `Are you sure you want to remove ${filePaths.length} layers from the stack?`;

    if (!confirm(confirmMessage)) {
      return; // User cancelled
    }

    const newStack = state.stage.layerStack.filter(
      (layer) => !filePaths.includes(layer.filePath)
    );
    store.dispatch(coreActions.updateLayerStack(newStack));

    const currentFile = state.currentFile;
    const currentFileRemoved = currentFile && filePaths.includes(currentFile);

    renderLayerStack();
    recomposeStage();
    syncRecordedHierarchy();

    if (currentFileRemoved) {
      store.dispatch(coreActions.setCurrentFile(null));
      store.dispatch(coreActions.setCurrentView("stage"));
      updateView();
    } else {
      updateView();
    }

    console.log(`✅ Deleted ${filePaths.length} layer(s)`);
  });

  deleteFileButton.addEventListener("click", handleDeleteFile);

  // Helper to extract selected items (objects or layer fallback)
  const getSelectedItemsForStaging = (actionName) => {
    const items = [];
    let fileToOpen = store.getState().currentFile;

    // 1. Check for Object Selection in 3D View (Priority)
    const activeScene =
      store.getState().currentView === "stage"
        ? stageThreeScene
        : fileThreeScene;
    if (activeScene && activeScene.selectionController) {
      const { selectedMeshes, activeMesh } = activeScene.selectionController;

      const primPaths = new Set();
      if (selectedMeshes && selectedMeshes.size > 0) {
        selectedMeshes.forEach((m) => {
          if (m.userData.primPath && m.visible)
            primPaths.add(m.userData.primPath);
        });
      } else if (
        activeMesh &&
        activeMesh.userData.primPath &&
        activeMesh.visible
      ) {
        primPaths.add(activeMesh.userData.primPath);
      }

      if (primPaths.size > 0) {
        const state = store.getState();
        let hierarchySource = [];

        if (state.currentView === "stage") {
          hierarchySource = state.composedHierarchy || [];
        } else if (
          state.currentView === "file" &&
          state.currentFile &&
          state.loadedFiles[state.currentFile]
        ) {
          try {
            hierarchySource = USDA_PARSER.getPrimHierarchy(
              state.loadedFiles[state.currentFile]
            );
          } catch (e) {
            console.error(
              "[SELECTION] Failed to parse file hierarchy for selection",
              e
            );
          }
        }

        const findPrim = (nodes, path) => {
          for (const n of nodes) {
            if (n.path === path) return n;
            if (n.children) {
              const found = findPrim(n.children, path);
              if (found) return found;
            }
          }
          return null;
        };

        primPaths.forEach((path) => {
          const prim = findPrim(hierarchySource, path);
          if (prim) {
            items.push({
              primPath: prim.path,
              originFile: prim._sourceFile || state.currentFile,
              name: prim.name,
              type: prim.type,
            });
          }
        });

        if (items.length > 0) {
          fileToOpen = items[0].originFile; // Context file
          return { items, fileToOpen };
        }
      }
    }

    // 2. Fallback: Check for Layer Selection in Sidebar
    const selectedFileItems = Array.from(
      layerStackList.querySelectorAll("li.selected")
    );
    if (selectedFileItems.length > 0) {
      const state = store.getState();
      const filesToProcess = new Set();
      let hasPermissionError = false;

      selectedFileItems.forEach((li) => {
        const layerId = li.dataset.layerId;
        const layer = state.stage.layerStack.find((l) => l.id === layerId);

        if (
          layer &&
          state.currentUser !== "Project Manager" &&
          layer.owner &&
          layer.owner !== state.currentUser
        ) {
          hasPermissionError = true;
          throw new ValidationError(
            `Only the owner (${layer.owner}) or Project Manager can perform this action on items from layer ${layer.filePath}`,
            "permission",
            { user: state.currentUser, owner: layer.owner }
          );
        }
        if (layer) filesToProcess.add(layer.filePath);
      });

      if (!hasPermissionError) {
        filesToProcess.forEach((filePath) => {
          // Parse all root prims from this file directly
          const fileContent = state.loadedFiles[filePath];
          if (fileContent) {
            try {
              const fileHierarchy = USDA_PARSER.getPrimHierarchy(fileContent);
              fileHierarchy.forEach((prim) => {
                items.push({
                  primPath: prim.path,
                  originFile: filePath,
                  name: prim.name,
                  type: prim.type,
                });
              });
            } catch (e) {
              console.error(`Failed to parse hierarchy for ${filePath}`, e);
            }
          }
        });

        if (filesToProcess.size > 0) {
          fileToOpen = Array.from(filesToProcess)[0];
        }
        return { items, fileToOpen };
      }
    }

    return { items: [], fileToOpen: null };
  };

  // ==================== Set Stage Button ====================
  const handleSetStage = errorHandler.wrap(() => {
    const { items, fileToOpen } = getSelectedItemsForStaging("stage");

    if (items.length === 0) {
      throw new ValidationError(
        "Please select an object in the viewer or a layer in the stack to stage.",
        "selection",
        null
      );
    }

    document.dispatchEvent(
      new CustomEvent("openPrimModal", {
        detail: {
          fileName: fileToOpen,
          mode: "normal",
          preSelectedItems: items,
          isConfirmationOnly: true,
        },
      })
    );
  });

  setStageButton.addEventListener("click", handleSetStage);

  // ==================== Entity Stage Button ====================
  const entityStageButton = document.getElementById("entity-stage-button");
  if (entityStageButton) {
    const newBtn = entityStageButton.cloneNode(true);
    entityStageButton.parentNode.replaceChild(newBtn, entityStageButton);

    const handleEntityStage = errorHandler.wrap(() => {
      const { items, fileToOpen } =
        getSelectedItemsForStaging("entity placeholder");

      if (items.length === 0) {
        throw new ValidationError(
          "Please select an object in the viewer or a layer in the stack to create an entity placeholder.",
          "selection",
          null
        );
      }

      document.dispatchEvent(
        new CustomEvent("openPrimModal", {
          detail: {
            fileName: fileToOpen,
            mode: "entity",
            preSelectedItems: items,
            isConfirmationOnly: true,
          },
        })
      );
    });

    newBtn.addEventListener("click", handleEntityStage);
  }

  promoteLayerButton.addEventListener("click", () => {
    const { items } = getSelectedItemsForStaging("promote");

    if (items.length > 0) {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            mode: "object",
            prims: items,
            direction: "promote",
          },
        })
      );
    } else {
      alert(
        "Please select one or more objects in the viewer or a layer in the stack to promote."
      );
    }
  });

  demoteLayerButton.addEventListener("click", () => {
    const { items } = getSelectedItemsForStaging("demote");

    if (items.length > 0) {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            mode: "object",
            prims: items,
            direction: "demote",
          },
        })
      );
    } else {
      alert(
        "Please select one or more objects in the viewer or a layer in the stack to demote."
      );
    }
  });

  renderLayerStack();

  // Re-render when design options or packages change
  store.subscribe("designOptions", renderLayerStack);
  store.subscribe("packages", renderLayerStack);

  console.log("✅ Layer Stack Controller initialized with error handling");
}
// ... existing code ...

export function refreshComposedStage(
  modifiedFileName,
  specificPrimPath = null
) {
  console.log("[REFRESH] Starting refresh for file:", modifiedFileName);
  console.log("[REFRESH] Specific prim path:", specificPrimPath);

  const state = store.getState();
  if (!state.loadedFiles[modifiedFileName]) {
    console.warn("[REFRESH] File not found in loadedFiles:", modifiedFileName);
    return;
  }

  // 1. Get fresh hierarchy from the modified file
  let freshHierarchy = USDA_PARSER.getPrimHierarchy(
    state.loadedFiles[modifiedFileName]
  );
  console.log(
    "[REFRESH] Fresh hierarchy parsed:",
    freshHierarchy.length,
    "root prims"
  );

  // If a specific prim path is provided, only process that prim
  if (specificPrimPath) {
    console.log("[REFRESH] Filtering for specific prim:", specificPrimPath);

    // Helper function to recursively find a prim by path
    const findPrimByPath = (prims, targetPath) => {
      for (const prim of prims) {
        if (prim.path === targetPath) {
          return prim;
        }
        if (prim.children && prim.children.length > 0) {
          const found = findPrimByPath(prim.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };

    const targetPrim = findPrimByPath(freshHierarchy, specificPrimPath);

    if (targetPrim) {
      freshHierarchy = [targetPrim];
      console.log(
        "[REFRESH] Found specific prim:",
        targetPrim.name,
        "at path:",
        targetPrim.path
      );
    } else {
      console.warn(
        "[REFRESH] Specific prim not found in fresh hierarchy:",
        specificPrimPath
      );
      return;
    }
  }

  // 2. Update state.stage.composedPrims
  // Clone composedPrims to avoid direct mutation
  const composedPrims = state.stage.composedPrims
    ? JSON.parse(JSON.stringify(state.stage.composedPrims))
    : [];

  // Helper to merge a node into a list
  const mergeNode = (list, newNode) => {
    const existingNode = list.find((n) => n.name === newNode.name); // Match by name (assuming same scope)
    console.log(
      "[REFRESH] Merging node:",
      newNode.name,
      "Existing:",
      !!existingNode
    );

    // Determine Status
    const sourceLayer = state.stage.layerStack.find(
      (l) => l.filePath === modifiedFileName
    );
    const layerStatus = sourceLayer ? sourceLayer.status : "Published";
    console.log("[REFRESH] Layer status:", layerStatus);

    if (existingNode) {
      existingNode.type = newNode.type;

      // Merge properties (but preserve local overrides if any? For now, source wins for simplicity as per requirement)
      existingNode.properties = {
        ...existingNode.properties,
        ...newNode.properties,
      };

      // Fix: If this node is a reference, we do NOT want to explicitly list its children from the source
      // as they are already included by the reference.
      // We clear them here to "fix" any existing bad state.
      // (Note: This assumes we don't have *other* valid overrides we want to keep.
      //  Given the user's request, strictly enforcing reference semantics is the priority.)
      if (existingNode.references) {
        existingNode.children = [];
      } else {
        // Only recurse if it's NOT a reference (local grouping/hierarchy)
        if (newNode.children) {
          if (!existingNode.children) existingNode.children = [];
          newNode.children.forEach((child) =>
            mergeNode(existingNode.children, child)
          );
        }
      }
    } else {
      // New Node! Check if this prim already exists in the stage from another file
      // to avoid duplicates when the same prim is referenced in multiple files
      const existingInStage = list.find((p) => p.path === newNode.path);
      if (existingInStage) {
        console.log(
          "[REFRESH] Prim already exists in stage, skipping:",
          newNode.name
        );
        return; // Skip this prim to avoid duplicates
      }

      console.log("[REFRESH] Creating new prim for:", newNode.name);

      // CRITICAL FIX: Check if the prim already has a reference in the source file
      // - If it has a reference, preserve it (user explicitly set it)
      // - If it doesn't have a reference, it's a standalone prim definition (no reference needed)
      // This allows creating standalone prims when user selects "Reference: None"

      const refPrim = {
        specifier: "def",
        type: newNode.type,
        name: newNode.name,
        path: newNode.path,
        properties: { ...newNode.properties },
        children: [],
      };

      // Preserve existing reference if present, otherwise leave as standalone prim
      if (newNode.references) {
        // Prim has a reference, keep it
        refPrim.references = newNode.references;
        console.log(
          "[REFRESH] Preserved existing reference:",
          refPrim.references
        );
      } else {
        // Prim is a standalone definition (user chose "Reference: None")
        console.log("[REFRESH] Standalone prim (no reference)");
      }

      // recursively stamp source info (vital for renderer)
      const stamp = (n) => {
        n._sourceFile = modifiedFileName;
        n._sourceLayerStatus = layerStatus;
        n._sourcePath = n.path;

        if (n.children) n.children.forEach(stamp);
      };
      stamp(refPrim);

      list.push(refPrim);
    }
  };

  console.log(
    "[REFRESH] Merging",
    freshHierarchy.length,
    "fresh prims into stage"
  );
  freshHierarchy.forEach((rootPrim) => {
    mergeNode(composedPrims, rootPrim);
  });

  console.log(
    "[REFRESH] Before cleanup - composedPrims count:",
    composedPrims.length
  );
  console.log("[REFRESH] Fresh hierarchy count:", freshHierarchy.length);
  console.log(
    "[REFRESH] Fresh prim names:",
    freshHierarchy.map((p) => p.name)
  );

  // CRITICAL FIX: Only run cleanup when refreshing the ENTIRE file, not when adding a specific prim
  // If we're processing a specific prim, we don't want to remove other prims from the same file
  let finalPrims = composedPrims;
  if (!specificPrimPath) {
    console.log(
      "[REFRESH] Running cleanup (removing prims that no longer exist)"
    );
    // Remove prims that no longer exist in the source file
    // This prevents deleted prims from persisting in the stage
    const freshPrimNames = new Set(freshHierarchy.map((p) => p.name));
    const beforeCount = finalPrims.length;
    finalPrims = finalPrims.filter((prim) => {
      // Keep prims from other files (not affected by this deletion)
      if (prim._sourceFile !== modifiedFileName) {
        console.log(
          "[REFRESH] Keeping prim from other file:",
          prim.name,
          "from",
          prim._sourceFile
        );
        return true;
      }

      // Keep prims from this file that still exist in the fresh hierarchy
      const shouldKeep = freshPrimNames.has(prim.name);
      console.log(
        "[REFRESH] Prim",
        prim.name,
        "from",
        modifiedFileName,
        "- Keep:",
        shouldKeep
      );
      return shouldKeep;
    });
    const afterCount = finalPrims.length;
    console.log(
      "[REFRESH] After cleanup - composedPrims count:",
      afterCount,
      "(removed",
      beforeCount - afterCount,
      "prims)"
    );
  } else {
    console.log("[REFRESH] Skipping cleanup (processing specific prim only)");
  }

  // UPDATE STATE WITH NEW PRIMS
  store.dispatch(coreActions.setComposedHierarchy(finalPrims));

  console.log("[REFRESH] Calling recomposeStage to update hierarchy");
  recomposeStage();
  syncRecordedHierarchy();
  console.log("[REFRESH] Refresh complete for:", modifiedFileName);
}

export function syncPrimStatusFromLayer(layer) {
  const state = store.getState();
  if (!state.stage.composedPrims) return;

  const composedPrims = JSON.parse(JSON.stringify(state.stage.composedPrims));

  const updatePrimStatus = (list) => {
    list.forEach((p) => {
      if (p._sourceFile === layer.filePath) {
        p._sourceLayerStatus = layer.status;
      }
      if (p.children) updatePrimStatus(p.children);
    });
  };

  updatePrimStatus(composedPrims);
  store.dispatch(coreActions.setComposedHierarchy(composedPrims));
}

/**
 * Render the URI hashtag filter bar.
 * Reads all unique tags from state.uriRegistry and renders pill buttons.
 * Called from initSidebar after renderLayerStack.
 */
export function renderUriFilterBar() {
  const container = document.getElementById("uri-filter-bar");
  if (!container) return;

  const state = store.getState();
  const registry = state.uriRegistry;
  const activeFilters = state.activeUriFilters || [];

  if (!(registry instanceof Map) || registry.size === 0) {
    container.style.display = "none";
    return;
  }

  container.style.display = "";
  const { collectAllTags } = (() => {
    // Inline tag collection to avoid circular dep issues
    const tagSet = new Set();
    for (const entry of registry.values()) {
      const uri = entry.uri || "";
      if (!uri.startsWith("@") || !uri.endsWith("@")) continue;
      const inner = uri.slice(1, -1);
      inner.split("-").forEach((part) => {
        if (part && part.length > 1) tagSet.add(`#${part}`);
      });
    }
    return { collectAllTags: () => Array.from(tagSet).sort() };
  })();

  const allTags = collectAllTags();
  const tagList = container.querySelector(".uri-tag-list");
  if (!tagList) return;

  tagList.innerHTML = "";
  allTags.forEach((tag) => {
    const btn = document.createElement("button");
    btn.className =
      "uri-tag-pill" + (activeFilters.includes(tag) ? " active" : "");
    btn.textContent = tag;
    btn.title = `Filter by ${tag}`;
    btn.addEventListener("click", () => {
      store.dispatch({ type: "TOGGLE_URI_FILTER", payload: { tag } });
      renderUriFilterBar();
      // Trigger view refresh for Three.js dimming
      window.dispatchEvent(new CustomEvent("uriFilterChanged"));
    });
    tagList.appendChild(btn);
  });

  // Clear filters button
  if (activeFilters.length > 0) {
    const clearBtn = container.querySelector(".uri-filter-clear");
    if (clearBtn) {
      clearBtn.style.display = "";
      clearBtn.onclick = () => {
        store.dispatch({
          type: "SET_ACTIVE_URI_FILTERS",
          payload: { filters: [] },
        });
        renderUriFilterBar();
        window.dispatchEvent(new CustomEvent("uriFilterChanged"));
      };
    }
  } else {
    const clearBtn = container.querySelector(".uri-filter-clear");
    if (clearBtn) clearBtn.style.display = "none";
  }
}
