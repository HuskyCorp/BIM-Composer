// src/components/timelineController.js
import { store, errorHandler, actions as coreActions } from "../core/index.js";
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";
import { renderStageView } from "../viewer/rendering/stageViewRenderer.js";
import { buildPathTranslationRegistry } from "../viewer/usda/pathTranslationRegistry.js";
import {
  getDisciplineForUser,
  getDisciplineConfig,
  getDisciplineBranch,
} from "../utils/precedenceMatrix.js";

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
    flex-direction: column;
    overflow-x: auto;
    overflow-y: visible;
    padding: 6px 10px;
    gap: 4px;
    width: 100%;
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
        "No record entries found. Add prims to the stage to create records."
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

    // Populate package filter dropdown
    const pkgFilterEl = document.getElementById("timeline-package-filter");
    if (pkgFilterEl) {
      const currentVal = pkgFilterEl.value;
      pkgFilterEl.innerHTML = `<option value="All">All Packages</option>`;
      (store.getState().packages || []).forEach((pkg) => {
        const opt = document.createElement("option");
        opt.value = pkg.id;
        opt.textContent = pkg.name;
        pkgFilterEl.appendChild(opt);
      });
      // Restore selection if still valid
      if ([...pkgFilterEl.options].some((o) => o.value === currentVal)) {
        pkgFilterEl.value = currentVal;
      }
      pkgFilterEl.onchange = () => renderGraph();
    }

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
    label.textContent = "No Records";
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
    console.log("[HISTORY] Rendering commit graph with swimlanes...");
    graphContainer.innerHTML = "";

    const history = store.getState().history;
    const commitsMap =
      history.commits instanceof Map
        ? history.commits
        : new Map(Object.entries(history.commits));

    const allCommits = Array.from(commitsMap.values()).sort(
      (a, b) => a.entry - b.entry // chronological order left→right
    );

    // Apply package filter
    const pkgFilterEl = document.getElementById("timeline-package-filter");
    const pkgFilter = pkgFilterEl?.value || "All";
    const commits =
      pkgFilter === "All"
        ? allCommits
        : allCommits.filter((c) => c.packageId === pkgFilter);

    if (commits.length === 0) {
      showEmptyState(
        pkgFilter === "All"
          ? "No commits to display"
          : "No commits for this package"
      );
      renderStatementList(allCommits);
      return;
    }

    // Determine which disciplines are present
    const DISCIPLINE_ORDER = [
      "Management",
      "Architecture",
      "Structure",
      "MEP",
      "Field",
    ];
    const disciplinesPresent = new Set(
      commits.map((c) => getDisciplineForUser(c.user || ""))
    );
    const swimlaneDisciplines = DISCIPLINE_ORDER.filter((d) =>
      disciplinesPresent.has(d)
    );
    // Add any disciplines not in the ordered list
    disciplinesPresent.forEach((d) => {
      if (!swimlaneDisciplines.includes(d)) swimlaneDisciplines.push(d);
    });

    swimlaneDisciplines.forEach((discipline) => {
      const cfg = getDisciplineConfig(discipline);
      const laneCommits = commits.filter(
        (c) => getDisciplineForUser(c.user || "") === discipline
      );

      // Derive the canonical branch name for this lane (use most common branch in lane)
      const branchCounts = {};
      laneCommits.forEach((c) => {
        const b =
          c.branch ||
          getDisciplineBranch(c.user || "", c.sourceStatus || "WIP");
        branchCounts[b] = (branchCounts[b] || 0) + 1;
      });
      const laneBranch =
        Object.keys(branchCounts).sort(
          (a, b) => branchCounts[b] - branchCounts[a]
        )[0] ||
        getDisciplineBranch("", "WIP").replace("WIP/?", `WIP/${cfg.code}`);

      const swimlane = document.createElement("div");
      swimlane.className = "timeline-swimlane";
      swimlane.style.cssText = `
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 0;
        min-height: 28px;
      `;

      // Branch label (e.g. "WIP/ARCH")
      const laneLabel = document.createElement("div");
      laneLabel.className = "timeline-swimlane-label";
      laneLabel.style.cssText = `
        width: 72px;
        flex-shrink: 0;
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: ${cfg.color};
        text-align: right;
        padding-right: 8px;
        white-space: nowrap;
        line-height: 1.2;
      `;
      laneLabel.textContent = laneBranch;

      // Track for dots
      const track = document.createElement("div");
      track.className = "timeline-swimlane-track";
      track.style.cssText = `
        display: flex;
        flex-direction: row;
        align-items: center;
        gap: 10px;
        flex: 1;
        overflow-x: auto;
        padding: 4px 2px;
        border-left: 2px solid ${cfg.color}40;
      `;

      laneCommits.forEach((commit) => {
        const typeColor = getCommitTypeColor(commit.type);
        const commitTier = getTierFromCommit(commit);
        const node = document.createElement("div");
        const isArchiveNode =
          commitTier === "Archived" || commit.type?.startsWith("Archive");
        const isApprovalNode =
          commit.type?.startsWith("Approval") || commit.type === "Approve";
        node.className = `timeline-node${isArchiveNode ? " archived" : ""}${isApprovalNode ? " approval" : ""}`;
        node.dataset.commitId = commit.id;
        node.dataset.baseColor = typeColor;
        const commitBranch =
          commit.branch ||
          getDisciplineBranch(commit.user || "", commit.sourceStatus || "WIP");
        const designOption = commit.designOptionId
          ? (store.getState().designOptions || []).find(
              (o) => o.id === commit.designOptionId
            )
          : null;
        const doLabel = designOption
          ? `\nOption: ${designOption.name}${commit.suitabilityCode ? ` [${commit.suitabilityCode}]` : ""}`
          : "";
        node.title = `[${commitBranch}] ${commit.type}\nEntry #${commit.entry} · ${commit.user || "Unknown"}\n${new Date(commit.timestamp).toLocaleString()}\nPrims: ${commit.stagedPrims?.length || 0}${doLabel}${commit.commitMessage ? `\n"${commit.commitMessage}"` : ""}`;
        node.style.cssText = `
          width: 12px;
          height: 12px;
          background-color: ${typeColor};
          border-radius: 50%;
          cursor: pointer;
          border: 2px solid #333;
          flex-shrink: 0;
          transition: all 0.15s;
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
          graphContainer.querySelectorAll(".timeline-node").forEach((n) => {
            n.classList.remove("selected");
            n.style.borderColor = "#333";
            n.style.backgroundColor = n.dataset.baseColor;
          });
          node.classList.add("selected");
          node.style.borderColor = "#fff";
          node.style.backgroundColor = "#007aff";
          updateSceneFromHistory(commit.id);
        });

        track.appendChild(node);
      });

      swimlane.appendChild(laneLabel);
      swimlane.appendChild(track);
      graphContainer.appendChild(swimlane);
    });

    console.log("[HISTORY] Swimlane graph rendered");
    renderStatementList(commits);
  }

  function getPackageForCommit(commit) {
    const packages = store.getState().packages || [];
    return packages.find((p) => p.id === commit.packageId) || null;
  }

  function getTierFromCommit(commit) {
    const branch = (commit.branch || "").toLowerCase();
    const target = (commit.targetStatus || "").toLowerCase();
    if (branch.startsWith("shared") || target === "shared") return "Shared";
    if (branch.startsWith("published") || target === "published")
      return "Published";
    if (branch.startsWith("archived") || target === "archived")
      return "Archived";
    return "WIP";
  }

  const TIER_ORDER = ["WIP", "Shared", "Published", "Archived"];
  const TIER_COLORS = {
    WIP: "#ffa500",
    Shared: "#007aff",
    Published: "#28a745",
    Archived: "#808080",
  };

  function renderStatementList(commits) {
    historyList.innerHTML = "";

    const state = store.getState();
    const designOptions = state.designOptions || [];

    // Group into tiers for headers
    let lastTier = null;

    commits.forEach((commit) => {
      const tier = getTierFromCommit(commit);

      // Insert tier header when tier changes
      if (tier !== lastTier) {
        const header = document.createElement("li");
        header.className = "timeline-tier-header";
        header.style.cssText = `
          list-style: none;
          padding: 4px 10px;
          font-size: 9px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: ${TIER_COLORS[tier]};
          border-top: 1px solid ${TIER_COLORS[tier]}44;
          margin-top: 4px;
          pointer-events: none;
        `;
        header.textContent = `── ${tier} ──`;
        historyList.appendChild(header);
        lastTier = tier;
      }

      const li = document.createElement("li");
      li.className = "history-item";
      li.dataset.id = commit.id;

      // Format date
      const date = new Date(commit.timestamp);
      const timeStr = date.toLocaleTimeString();
      const dateStr = date.toLocaleDateString();

      const commitBranch =
        commit.branch ||
        getDisciplineBranch(commit.user || "", commit.sourceStatus || "WIP");
      const branchDiscipline = getDisciplineForUser(commit.user || "");
      const branchCfg = getDisciplineConfig(branchDiscipline);
      const branchBadgeStyle = `background:${branchCfg.color}22;border:1px solid ${branchCfg.color}88;color:${branchCfg.color};`;

      const pkg = getPackageForCommit(commit);
      const pkgBadge = pkg
        ? `<span class="commit-package-badge history-pkg-badge" style="background:${pkg.color}22;border:1px solid ${pkg.color}88;color:${pkg.color};">${pkg.name}</span>`
        : "";

      // Design option sub-label for Shared commits
      let designOptionLabel = "";
      if (commit.designOptionId) {
        const opt = designOptions.find((o) => o.id === commit.designOptionId);
        if (opt) {
          const suitBadge = commit.suitabilityCode
            ? ` <span style="font-size:9px;opacity:0.8;">[${commit.suitabilityCode}]</span>`
            : "";
          designOptionLabel = `<div class="history-item-details" style="color:${TIER_COLORS.Shared};">Option: ${opt.name}${suitBadge}</div>`;
        }
      }

      li.innerHTML = `
            <div class="history-item-header">
                <span>${dateStr} ${timeStr}</span>
                <span>${commit.user || "Unknown"}</span>
            </div>
            <div class="history-item-title">
              ${commit.type}
              <span class="commit-branch-badge" style="${branchBadgeStyle}">${commitBranch}</span>
              ${pkgBadge}
            </div>
            ${designOptionLabel}
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

    // Build diff: compare this commit's stagedPrims to parent's stagedPrims
    const parentCommit = commit.parent ? commitsMap.get(commit.parent) : null;
    const diffLines = buildCommitDiff(commit, parentCommit);

    const typeColor = getCommitTypeColor(commit.type);
    const integrityOk = !commit.parent || commitsMap.has(commit.parent);
    const infoBoxBranch =
      commit.branch ||
      getDisciplineBranch(commit.user || "", commit.sourceStatus || "WIP");
    const infoBoxDiscipline = getDisciplineForUser(commit.user || "");
    const infoBoxCfg = getDisciplineConfig(infoBoxDiscipline);

    historyInfoBox.style.display = "block";
    historyInfoBox.innerHTML = `
        <div class="info-box-title">Statement Trace</div>
        <div class="info-box-row">
            <span class="info-box-label">Entry</span>
            <span class="info-box-value">#${commit.entry}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Branch</span>
            <span class="info-box-value">
              <span class="commit-branch-badge" style="background:${infoBoxCfg.color}22;border:1px solid ${infoBoxCfg.color}88;color:${infoBoxCfg.color};">${infoBoxBranch}</span>
            </span>
        </div>
        ${(() => {
          const pkg = getPackageForCommit(commit);
          if (!pkg) return "";
          return `<div class="info-box-row">
            <span class="info-box-label">Package</span>
            <span class="info-box-value">
              <span class="commit-package-badge" style="background:${pkg.color}22;border:1px solid ${pkg.color}88;color:${pkg.color};">${pkg.name}</span>
            </span>
          </div>`;
        })()}
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
   * Produce a list of HTML snippets describing what this commit changed.
   * Phase D: uses pre-computed addedPrims/removedPrims/modifiedPrims when present;
   * falls back to stagedPrims comparison for legacy entries.
   */
  function buildCommitDiff(commit, parentCommit) {
    const lines = [];

    if (commit.type === "Rename" && commit.oldPath && commit.newPath) {
      lines.push(
        `<div style="color:#9b59b6;">&#8594; Renamed <strong>${commit.oldPath.split("/").pop()}</strong> → <strong>${commit.newPath.split("/").pop()}</strong></div>`
      );
      return lines;
    }

    // Phase D: prefer pre-computed diff arrays if present
    const hasPrecomputed =
      commit.addedPrims !== undefined ||
      commit.removedPrims !== undefined ||
      commit.modifiedPrims !== undefined;

    if (hasPrecomputed) {
      (commit.addedPrims || []).forEach((path) => {
        const name = path.split("/").pop();
        lines.push(
          `<div style="color:#27ae60;">+ ${name} <span style="color:#555;">${path}</span></div>`
        );
      });
      (commit.removedPrims || []).forEach((path) => {
        const name = path.split("/").pop();
        lines.push(`<div style="color:#e74c3c;">- ${name}</div>`);
      });
      (commit.modifiedPrims || []).forEach((path) => {
        const name = path.split("/").pop();
        lines.push(`<div style="color:#f39c12;">~ ${name}</div>`);
      });

      if (lines.length === 0 && (commit.stagedPrims?.length || 0) > 0) {
        lines.push(
          `<div style="color:#aaa;">${commit.stagedPrims.length} prim(s) recorded</div>`
        );
      }
      return lines;
    }

    // Legacy fallback: derive from stagedPrims sets
    const currentPaths = new Set(commit.stagedPrims || []);
    const parentPaths = new Set(parentCommit?.stagedPrims || []);

    currentPaths.forEach((path) => {
      if (!parentPaths.has(path)) {
        const shortPath = path.split("/").pop();
        lines.push(
          `<div style="color:#27ae60;">+ ${shortPath} <span style="color:#555;">${path}</span></div>`
        );
      }
    });

    parentPaths.forEach((path) => {
      if (!currentPaths.has(path)) {
        const shortPath = path.split("/").pop();
        lines.push(`<div style="color:#e74c3c;">- ${shortPath}</div>`);
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
    const reconstructed = reconstructStateAt(commitId);
    tempState.composedHierarchy = reconstructed;
    // recordedHierarchy drives the renderer; set it on the temp state for history playback
    delete tempState.recordedHierarchy;

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
   * Reconstruct the composed scene state at a given commit using the atomic
   * path-based model (stagedPrims arrays).
   *
   * 1. Resolve target commit's stagedPrims path list (snapshot at that point)
   * 2. Build base map from all loaded non-statement files
   * 3. Apply rename translations from genesis → target so paths match
   * 4. Filter base map to only prims present in stagedPrims
   * 5. Rebuild tree hierarchy from filtered map
   */
  function reconstructStateAt(targetCommitId) {
    console.log(`[HISTORY] Reconstructing state at commit ${targetCommitId}`);

    const state = store.getState();
    const history = state.history;
    const commitsMap =
      history.commits instanceof Map
        ? history.commits
        : new Map(Object.entries(history.commits));

    // Step 1: get the target commit's stagedPrims snapshot
    const targetCommit = commitsMap.get(targetCommitId);
    const stagedPaths = new Set(targetCommit?.stagedPrims || []);
    console.log(`[HISTORY] Target commit has ${stagedPaths.size} staged paths`);

    // Step 2: base map from all loaded non-statement files
    const composedMap = new Map();
    for (const fileName in state.loadedFiles) {
      if (fileName === "statement.usda") continue;
      const content = state.loadedFiles[fileName];
      const prims = USDA_PARSER.getPrimHierarchy(content);
      flattenHierarchyToMap(prims, composedMap, fileName);
    }
    console.log(`[HISTORY] Base map: ${composedMap.size} prims`);

    // Step 3: apply rename translations from genesis → target
    const orderedCommits = buildCommitPathToTarget(commitsMap, targetCommitId);
    for (const commit of orderedCommits) {
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
    }

    // Step 4: filter to only prims present in stagedPrims snapshot
    const filteredMap = new Map();
    composedMap.forEach((prim, path) => {
      if (stagedPaths.has(path)) {
        filteredMap.set(path, prim);
      }
    });
    console.log(`[HISTORY] Filtered map: ${filteredMap.size} prims`);

    // Step 5: rebuild tree
    const result = buildHierarchyFromMap(filteredMap);
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
      // Clear properties panel to prevent selection bleed during reconstruction
      document.dispatchEvent(
        new CustomEvent("primSelected", { detail: { primPath: null } })
      );
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
          "RECORD LOG MODE — Read Only. Click Record Log to return to editing.";
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
