// src/components/timelineController.js
import { store, errorHandler, actions as coreActions } from "../core/index.js";
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";
import { renderStageView } from "../viewer/rendering/stageViewRenderer.js";
import { buildPathTranslationRegistry } from "../viewer/usda/pathTranslationRegistry.js";

export function initTimelineController(historyThreeScene) {
  const historyToggleButton = document.getElementById("history-toggle-button");
  const timelineControlsContainer = document.getElementById(
    "timeline-controls-container"
  );

  // Clean out the old slider UI logic
  timelineControlsContainer.innerHTML = "";

  // NEW UI Elements
  const historyOverlay = document.getElementById("history-overlay");
  const historyList = document.getElementById("history-list");
  const closeHistoryBtn = document.getElementById("close-history-overlay");
  const historyInfoBox = document.getElementById("history-info-box");

  closeHistoryBtn.addEventListener("click", () => {
    store.dispatch(coreActions.toggleHistoryMode(false));
    document.dispatchEvent(new CustomEvent("updateView"));
  });

  // Create Graph UI Elements
  const graphContainer = document.createElement("div");
  graphContainer.className = "timeline-graph-container";
  graphContainer.style.cssText = `
    display: flex;
    flex-direction: row-reverse;
    overflow-x: auto;
    padding: 10px;
    gap: 15px;
    align-items: center;
    height: 100%;
    min-height: 40px;
  `;
  timelineControlsContainer.appendChild(graphContainer);

  const label = document.createElement("span");
  label.id = "timeline-label";
  label.style.cssText = "margin-left: 10px; font-weight: bold; color: #007aff;";
  label.textContent = "Live";
  timelineControlsContainer.appendChild(label);

  historyToggleButton.addEventListener(
    "click",
    errorHandler.wrap(() => {
      const isHistoryMode = !store.getState().isHistoryMode;
      console.log(
        "[HISTORY] Button clicked. Toggling history mode to:",
        isHistoryMode
      );
      store.dispatch(coreActions.toggleHistoryMode(isHistoryMode));
      document.dispatchEvent(new CustomEvent("updateView"));
    })
  );

  // Path translation registry for handling renamed prims in history
  let pathTranslationRegistry = null;

  function setupTimeline() {
    console.log("[HISTORY] Setting up timeline...");

    const statementContent = store.getState().loadedFiles["statement.usda"];

    if (!statementContent) {
      console.warn("[HISTORY] No statement.usda found in loaded files");
      showEmptyState("No statement.usda file found");
      return;
    }

    console.log("[HISTORY] statement.usda length:", statementContent.length);

    // Repopulate prim cache
    console.log("[HISTORY] Repopulating prim cache...");
    const newPrimsMap = new Map();
    const state = store.getState();

    for (const fileName in state.loadedFiles) {
      if (fileName === "statement.usda") continue;
      const fileContent = state.loadedFiles[fileName];
      console.log(`[HISTORY] Processing file: ${fileName}`);
      const prims = USDA_PARSER.getPrimHierarchy(fileContent);
      console.log(`[HISTORY]   Found ${prims.length} root prims`);
      mapPrims(prims, fileName, newPrimsMap);
    }
    store.dispatch(coreActions.setAllPrimsByPath(newPrimsMap));

    console.log(`[HISTORY] Total prims in cache: ${newPrimsMap.size}`);

    if (newPrimsMap.size === 0) {
      console.warn("[HISTORY] No prims found in any files!");
    }

    // Parse History Graph
    console.log("[HISTORY] Parsing statement log...");
    const history = USDA_PARSER.parseStatementLog(statementContent);
    store.dispatch(coreActions.setHistory(history));
    console.log("[HISTORY] Commits found:", history.commits.size);
    console.log("[HISTORY] Root commits:", history.roots.length);

    if (history.commits.size === 0) {
      console.warn("[HISTORY] No commits found in statement.usda");
      showEmptyState(
        "No history entries found. Add prims to the stage to create history."
      );
      return;
    }

    // Hash chain integrity verification (TASK 6.3)
    console.log("[HISTORY] Verifying commit graph integrity...");
    const integrityResult = verifyHashChain(history.commits);
    if (!integrityResult.valid) {
      console.warn(
        "[HISTORY] Integrity issues detected:",
        integrityResult.issues
      );
    }

    // Build path translation registry (kept for external consumers / debug)
    pathTranslationRegistry = buildPathTranslationRegistry(history.commits);

    renderGraph();
  }

  function showEmptyState(message) {
    graphContainer.innerHTML = "";
    const emptyMessage = document.createElement("div");
    emptyMessage.style.cssText = `
      padding: 10px 20px;
      color: #888;
      font-style: italic;
      text-align: center;
      width: 100%;
    `;
    emptyMessage.textContent = message;
    graphContainer.appendChild(emptyMessage);
    label.textContent = "No History";
  }

  function mapPrims(primArray, sourceFile, map) {
    primArray.forEach((prim) => {
      prim._sourceFile = sourceFile;
      map.set(prim.path, prim);
      if (prim.children) {
        mapPrims(prim.children, sourceFile, map);
      }
    });
  }

  /** Returns a color hex string for a given commit type */
  function getCommitTypeColor(type) {
    const palette = {
      "Prim Selection": "#4a90d9",
      "Entity Placeholder": "#27ae60",
      "Property Edit": "#e67e22",
      Rename: "#9b59b6",
      Promotion: "#f39c12",
      promotion: "#f39c12",
    };
    return palette[type] || "#888";
  }

  function renderGraph() {
    console.log("[HISTORY] Rendering commit graph...");
    graphContainer.innerHTML = "";

    const history = store.getState().history;
    // Convert to Map if it's a plain object (happens after state serialization)
    const commitsMap =
      history.commits instanceof Map
        ? history.commits
        : new Map(Object.entries(history.commits));

    const commits = Array.from(commitsMap.values()).sort(
      (a, b) => b.entry - a.entry
    );

    console.log(`[HISTORY] Rendering ${commits.length} commit nodes`);

    if (commits.length === 0) {
      showEmptyState("No commits to display");
      return;
    }

    commits.forEach((commit) => {
      const typeColor = getCommitTypeColor(commit.type);
      const node = document.createElement("div");
      node.className = "timeline-node";
      node.dataset.commitId = commit.id;
      node.dataset.baseColor = typeColor;
      node.title = `[${commit.type}] Entry #${commit.entry}\nUser: ${commit.user || "Unknown"}\n${new Date(commit.timestamp).toLocaleString()}\nPrims: ${commit.stagedPrims?.length || 0}\nID: ${commit.id.substring(0, 12)}...`;
      node.style.cssText = `
            width: 14px;
            height: 14px;
            background-color: ${typeColor};
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid #333;
            flex-shrink: 0;
            transition: all 0.2s;
        `;

      node.addEventListener("mouseenter", () => {
        node.style.transform = "scale(1.4)";
        node.style.borderColor = "#fff";
        node.style.boxShadow = `0 0 6px ${typeColor}`;
      });

      node.addEventListener("mouseleave", () => {
        node.style.transform = "scale(1)";
        node.style.boxShadow = "";
        if (!node.classList.contains("selected")) {
          node.style.borderColor = "#333";
        }
      });

      node.addEventListener("click", () => {
        console.log(
          `[HISTORY] Commit node clicked: ${commit.id} (Entry ${commit.entry})`
        );
        // Deselect all nodes
        Array.from(graphContainer.querySelectorAll(".timeline-node")).forEach(
          (n) => {
            n.classList.remove("selected");
            n.style.borderColor = "#333";
            n.style.backgroundColor = n.dataset.baseColor;
          }
        );
        // Select this node
        node.classList.add("selected");
        node.style.borderColor = "#fff";
        node.style.backgroundColor = "#007aff";
        updateSceneFromHistory(commit.id);
      });

      graphContainer.appendChild(node);
    });

    console.log("[HISTORY] Graph rendered successfully");
    renderStatementList(commits);
  }

  function renderStatementList(commits) {
    historyList.innerHTML = "";

    commits.forEach((commit) => {
      const li = document.createElement("li");
      li.className = "history-item";
      li.dataset.id = commit.id;

      // Format date
      const date = new Date(commit.timestamp);
      const timeStr = date.toLocaleTimeString();
      const dateStr = date.toLocaleDateString();

      li.innerHTML = `
            <div class="history-item-header">
                <span>${dateStr} ${timeStr}</span>
                <span>${commit.user || "Unknown"}</span>
            </div>
            <div class="history-item-title">${commit.type}</div>
            ${commit.commitMessage ? `<div class="history-item-details" style="font-style:italic;color:#aaa;">${commit.commitMessage}</div>` : ""}
            <div class="history-item-details">Ref: ${commit.id.substring(0, 8)}...</div>
          `;

      li.addEventListener("click", () => {
        // Highlight selection
        document
          .querySelectorAll(".history-item")
          .forEach((item) => item.classList.remove("active"));
        li.classList.add("active");

        // Update scene and info box
        updateSceneFromHistory(commit.id);
      });

      historyList.appendChild(li);
    });
  }

  function updateInfoBox(commit) {
    const state = store.getState();
    const commitsMap =
      state.history.commits instanceof Map
        ? state.history.commits
        : new Map(Object.entries(state.history.commits));

    // Build diff: compare this commit's serializedPrims to parent's serializedPrims
    const parentCommit = commit.parent ? commitsMap.get(commit.parent) : null;
    const diffLines = buildCommitDiff(commit, parentCommit);

    const typeColor = getCommitTypeColor(commit.type);
    const integrityOk = !commit.parent || commitsMap.has(commit.parent);

    historyInfoBox.style.display = "block";
    historyInfoBox.innerHTML = `
        <div class="info-box-title">Statement Trace</div>
        <div class="info-box-row">
            <span class="info-box-label">Entry</span>
            <span class="info-box-value">#${commit.entry}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Type</span>
            <span class="info-box-value" style="color:${typeColor};font-weight:bold;">${commit.type}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">User</span>
            <span class="info-box-value">${commit.user || "System"}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Timestamp</span>
            <span class="info-box-value">${new Date(commit.timestamp).toLocaleString()}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Prims</span>
            <span class="info-box-value">${commit.stagedPrims ? commit.stagedPrims.length : 0}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Status</span>
            <span class="info-box-value">${commit.sourceStatus || "—"}</span>
        </div>
        ${
          commit.commitMessage
            ? `<div class="info-box-row" style="align-items:flex-start;">
            <span class="info-box-label">Message</span>
            <span class="info-box-value" style="font-style:italic;color:#ccc;">${commit.commitMessage}</span>
        </div>`
            : ""
        }
        <div class="info-box-row">
            <span class="info-box-label">Parent</span>
            <span class="info-box-value" style="color:${integrityOk ? "#aaa" : "#e74c3c"};">
              ${commit.parent ? commit.parent.substring(0, 12) + "…" : "genesis"}
              ${integrityOk ? "" : " ⚠ missing"}
            </span>
        </div>
        <div style="margin-top: 8px; padding: 6px 8px; background:#1a1a1a; border-radius:4px; font-size:11px; color:#888; word-break:break-all;">
            ${commit.id}
        </div>
        ${
          diffLines.length > 0
            ? `
        <div class="info-box-title" style="margin-top:10px;">Changes in this commit</div>
        <div style="font-size:11px; line-height:1.6; max-height:120px; overflow-y:auto;">
          ${diffLines.join("")}
        </div>`
            : ""
        }
      `;
  }

  /**
   * Produce a list of HTML snippets describing what this commit changed
   * relative to its parent commit.
   */
  function buildCommitDiff(commit, parentCommit) {
    const lines = [];

    if (commit.type === "Rename" && commit.oldPath && commit.newPath) {
      lines.push(
        `<div style="color:#9b59b6;">&#8594; Renamed <strong>${commit.oldPath.split("/").pop()}</strong> → <strong>${commit.newPath.split("/").pop()}</strong></div>`
      );
      return lines;
    }

    const currentPaths = new Set(
      (commit.serializedPrims || []).map((p) => p.path)
    );
    const parentPaths = new Set(
      (parentCommit?.serializedPrims || []).map((p) => p.path)
    );

    // Added prims (in this commit but not in parent)
    currentPaths.forEach((path) => {
      if (!parentPaths.has(path)) {
        const shortPath = path.split("/").pop();
        lines.push(
          `<div style="color:#27ae60;">+ ${shortPath} <span style="color:#555;">${path}</span></div>`
        );
      }
    });

    // Modified prims (in both — show changed properties)
    (commit.serializedPrims || []).forEach((prim) => {
      if (!parentPaths.has(prim.path)) return; // already shown as added
      const parentPrim = (parentCommit?.serializedPrims || []).find(
        (p) => p.path === prim.path
      );
      if (!parentPrim) return;

      const changedProps = [];
      Object.entries(prim.properties || {}).forEach(([key, val]) => {
        const oldVal = parentPrim.properties?.[key];
        if (JSON.stringify(oldVal) !== JSON.stringify(val)) {
          changedProps.push(
            `<span style="color:#e67e22;">${key}: ${JSON.stringify(oldVal)} → ${JSON.stringify(val)}</span>`
          );
        }
      });

      if (changedProps.length > 0) {
        lines.push(
          `<div style="color:#4a90d9;">~ ${prim.path.split("/").pop()} &nbsp; ${changedProps.join(", ")}</div>`
        );
      }
    });

    if (lines.length === 0 && currentPaths.size > 0) {
      lines.push(
        `<div style="color:#aaa;">${currentPaths.size} prim(s) recorded</div>`
      );
    }

    return lines;
  }

  function updateSceneFromHistory(commitId) {
    console.log(`[HISTORY] Updating scene for commit: ${commitId}`);

    const state = store.getState();
    const commit = state.history.commits.get(commitId);
    if (!commit) {
      console.error(`[HISTORY] Commit not found: ${commitId}`);
      label.textContent = "Error: Commit not found";
      return;
    }

    console.log(`[HISTORY] Commit details:`, commit);

    const tempState = { ...state };
    console.log("[HISTORY] Reconstructing state at commit...");
    tempState.composedHierarchy = reconstructStateAt(commitId);

    console.log(
      `[HISTORY] Reconstructed hierarchy has ${tempState.composedHierarchy.length} root prims`
    );

    label.textContent = `Entry ${commit.entry} - ${commit.type} (${commit.stagedPrims?.length || 0} prims)`;

    // Update Info Box
    updateInfoBox(commit);

    console.log("[HISTORY] Rendering stage view...");
    renderStageView(historyThreeScene, tempState);
    historyThreeScene.resize();
    console.log("[HISTORY] Scene updated successfully");
  }

  // ─── Algorithm B Helpers ────────────────────────────────────────────────────

  /**
   * Traverse parent pointers from targetCommitId back to genesis, then reverse
   * to get commits in chronological order (genesis → target).
   */
  function buildCommitPathToTarget(commitsMap, targetCommitId) {
    const path = [];
    let currentId = targetCommitId;
    const visited = new Set();

    while (currentId) {
      if (visited.has(currentId)) {
        console.error(
          "[HISTORY] Cycle detected in commit graph at:",
          currentId
        );
        break;
      }
      const commit = commitsMap.get(currentId);
      if (!commit) break;
      visited.add(currentId);
      path.unshift(commit); // prepend → chronological order
      currentId = commit.parent;
    }

    return path;
  }

  /**
   * Flatten a prim hierarchy into a path → prim Map (children cleared, to be rebuilt).
   */
  function flattenHierarchyToMap(prims, map, sourceFile) {
    prims.forEach((prim) => {
      const entry = {
        ...prim,
        properties: { ...prim.properties },
        children: [],
      };
      if (sourceFile && !entry._sourceFile) entry._sourceFile = sourceFile;
      map.set(prim.path, entry);
      if (prim.children && prim.children.length > 0) {
        flattenHierarchyToMap(prim.children, map, sourceFile);
      }
    });
  }

  /**
   * Rebuild a prim hierarchy tree from a flat path → prim Map.
   */
  function buildHierarchyFromMap(primMap) {
    const roots = [];
    primMap.forEach((prim) => {
      prim.children = []; // reset before rebuild
    });
    primMap.forEach((prim) => {
      const segments = prim.path.split("/").filter(Boolean);
      if (segments.length > 1) {
        const parentPath = "/" + segments.slice(0, -1).join("/");
        const parent = primMap.get(parentPath);
        if (parent) {
          parent.children.push(prim);
        } else {
          roots.push(prim);
        }
      } else {
        roots.push(prim);
      }
    });
    return roots;
  }

  // ─── TASK 6.3: Hash Chain Integrity Verification ────────────────────────────

  /**
   * Verifies the structural integrity of the commit graph:
   * - Every commit's parent pointer references an existing commit
   * - No circular references exist in the graph
   * Returns { valid: boolean, issues: string[] }
   */
  function verifyHashChain(commits) {
    const commitsMap =
      commits instanceof Map ? commits : new Map(Object.entries(commits));

    const issues = [];

    // Check 1: all parent pointers reference existing commits
    commitsMap.forEach((commit, id) => {
      if (commit.parent && !commitsMap.has(commit.parent)) {
        issues.push(
          `Commit ${id.substring(0, 8)} references missing parent ${commit.parent.substring(0, 8)}`
        );
      }
    });

    // Check 2: no cycles using DFS
    const visited = new Set();
    const inStack = new Set();

    const hasCycle = (id) => {
      if (inStack.has(id)) return true;
      if (visited.has(id)) return false;
      visited.add(id);
      inStack.add(id);
      const commit = commitsMap.get(id);
      if (commit && commit.parent && hasCycle(commit.parent)) {
        issues.push(`Cycle detected involving commit ${id.substring(0, 8)}`);
        inStack.delete(id);
        return true;
      }
      inStack.delete(id);
      return false;
    };
    commitsMap.forEach((_, id) => hasCycle(id));

    const valid = issues.length === 0;
    if (valid) {
      console.log(
        `[HISTORY] Chain integrity OK — ${commitsMap.size} commits verified`
      );
    } else {
      console.warn("[HISTORY] Chain integrity FAILED:", issues);
    }

    return { valid, issues };
  }

  // ─── Algorithm B: History Reconstruction Engine ──────────────────────────────

  /**
   * Reconstruct the composed scene state at a given commit by replaying all
   * commits from genesis up to and including targetCommitId (Algorithm B).
   *
   * 1. Build ordered commit path from genesis → target via parent pointers
   * 2. Start with base layer from all loaded non-statement files
   * 3. For each commit in order: apply serializedPrims as property overrides;
   *    for Rename commits, move prim paths in the composed map first
   * 4. Rebuild tree hierarchy from flat map
   */
  function reconstructStateAt(targetCommitId) {
    console.log(
      `[HISTORY] Algorithm B: cumulative replay to commit ${targetCommitId}`
    );

    const state = store.getState();
    const history = state.history;
    const commitsMap =
      history.commits instanceof Map
        ? history.commits
        : new Map(Object.entries(history.commits));

    // Step 1: ordered commits from genesis → target
    const orderedCommits = buildCommitPathToTarget(commitsMap, targetCommitId);
    console.log(`[HISTORY] Replaying ${orderedCommits.length} commits`);

    // Step 2: base map from all loaded non-statement files
    const composedMap = new Map();
    for (const fileName in state.loadedFiles) {
      if (fileName === "statement.usda") continue;
      const content = state.loadedFiles[fileName];
      const prims = USDA_PARSER.getPrimHierarchy(content);
      flattenHierarchyToMap(prims, composedMap, fileName);
    }
    console.log(`[HISTORY] Base map: ${composedMap.size} prims`);

    // Step 3: replay each commit in chronological order
    for (const commit of orderedCommits) {
      // Handle renames first: move all affected paths in the map
      if (commit.type === "Rename" && commit.oldPath && commit.newPath) {
        const toMove = [];
        composedMap.forEach((prim, path) => {
          if (
            path === commit.oldPath ||
            path.startsWith(commit.oldPath + "/")
          ) {
            toMove.push([path, prim]);
          }
        });
        toMove.forEach(([oldP, prim]) => {
          composedMap.delete(oldP);
          const newP = commit.newPath + oldP.substring(commit.oldPath.length);
          const segments = newP.split("/").filter(Boolean);
          prim.path = newP;
          prim.name = segments[segments.length - 1];
          composedMap.set(newP, prim);
        });
      }

      // Apply serialized prims as property overrides (or add new prims)
      if (commit.serializedPrims && commit.serializedPrims.length > 0) {
        const applyPrim = (prim) => {
          if (!prim._sourceFile)
            prim._sourceFile = commit["File Name"] || commit.fileName;
          const existing = composedMap.get(prim.path);
          if (existing) {
            Object.assign(existing.properties, prim.properties);
            if (prim._sourceFile) existing._sourceFile = prim._sourceFile;
            if (prim.references) existing.references = prim.references;
          } else {
            composedMap.set(prim.path, {
              ...prim,
              properties: { ...prim.properties },
              children: [],
            });
          }
          // Recurse into children embedded in the serialized prim
          if (prim.children && prim.children.length > 0) {
            prim.children.forEach(applyPrim);
          }
        };
        commit.serializedPrims.forEach(applyPrim);
      }
    }

    console.log(
      `[HISTORY] Composed map after replay: ${composedMap.size} prims`
    );

    // Step 4: rebuild tree
    const result = buildHierarchyFromMap(composedMap);
    console.log(`[HISTORY] Final hierarchy: ${result.length} root prims`);
    return result;
  }

  document.addEventListener("updateView", () => {
    const state = store.getState();
    console.log(
      "[HISTORY] updateView event fired. isHistoryMode:",
      state.isHistoryMode
    );

    if (state.isHistoryMode) {
      console.log("[HISTORY] Entering history mode");
      setupTimeline();
      historyToggleButton.classList.add("active");
      timelineControlsContainer.style.display = "flex";

      // Inject "History Mode" read-only banner
      let banner = document.getElementById("history-mode-banner");
      if (!banner) {
        banner = document.createElement("div");
        banner.id = "history-mode-banner";
        banner.style.cssText = `
          position: fixed;
          top: 0; left: 0; right: 0;
          z-index: 9999;
          background: linear-gradient(90deg, #7b2ff7, #007aff);
          color: #fff;
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.06em;
          text-align: center;
          padding: 5px 12px;
          pointer-events: none;
        `;
        banner.textContent =
          "HISTORY MODE — Read Only. Click Return to Live to resume editing.";
        document.body.appendChild(banner);
      }
      banner.style.display = "block";

      // Show/Reset Overlay
      historyOverlay.style.display = "flex";
      historyInfoBox.style.display = "none"; // Hide initially until selection

      if (state.history.commits.size > 0) {
        console.log("[HISTORY] Auto-selecting latest commit");
        // Auto-select latest commit
        const latest = Array.from(state.history.commits.values()).sort(
          (a, b) => b.entry - a.entry
        )[0];

        if (latest) {
          console.log(
            `[HISTORY] Latest commit: ${latest.id} (Entry ${latest.entry})`
          );
          updateSceneFromHistory(latest.id);

          // Highlight the latest node
          setTimeout(() => {
            const firstNode = graphContainer.querySelector(
              `.timeline-node[data-commit-id="${latest.id}"]`
            );
            if (firstNode) {
              firstNode.classList.add("selected");
              firstNode.style.borderColor = "#fff";
              firstNode.style.backgroundColor = "#007aff";
            }
          }, 100);
        }
      }
    } else {
      console.log("[HISTORY] Exiting history mode");
      historyToggleButton.classList.remove("active");
      timelineControlsContainer.style.display = "none";

      // Hide Overlay and banner
      historyOverlay.style.display = "none";
      historyInfoBox.style.display = "none";
      const banner = document.getElementById("history-mode-banner");
      if (banner) banner.style.display = "none";
      label.textContent = "Live";
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    timelineControlsContainer.style.display = "none";
  });
}
