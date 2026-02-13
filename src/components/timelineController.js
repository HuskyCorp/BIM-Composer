// src/components/timelineController.js
import { store, errorHandler, actions as coreActions } from "../core/index.js";
import { USDA_PARSER } from "../viewer/usda/usdaParser.js";
import { renderStageView } from "../viewer/rendering/stageViewRenderer.js";

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
      const node = document.createElement("div");
      node.className = "timeline-node";
      node.title = `Entry: ${commit.entry}\nType: ${commit.type}\nID: ${commit.id}\nPrims: ${commit.stagedPrims?.length || 0}`;
      node.style.cssText = `
            width: 14px;
            height: 14px;
            background-color: #888;
            border-radius: 50%;
            cursor: pointer;
            border: 2px solid #444;
            flex-shrink: 0;
            transition: all 0.2s;
        `;

      node.addEventListener("mouseenter", () => {
        node.style.transform = "scale(1.3)";
        node.style.borderColor = "#007aff";
      });

      node.addEventListener("mouseleave", () => {
        node.style.transform = "scale(1)";
        if (node.style.backgroundColor !== "rgb(0, 122, 255)") {
          node.style.borderColor = "#444";
        }
      });

      node.addEventListener("click", () => {
        console.log(
          `[HISTORY] Commit node clicked: ${commit.id} (Entry ${commit.entry})`
        );
        Array.from(graphContainer.children).forEach((c) => {
          if (c.style) c.style.backgroundColor = "#888";
        });
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
      
      commits.forEach(commit => {
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
                <span>${commit.user || 'Unknown'}</span>
            </div>
            <div class="history-item-title">${commit.type}</div>
            <div class="history-item-details">Ref: ${commit.id.substring(0, 8)}...</div>
          `;
          
          li.addEventListener("click", () => {
              // Highlight selection
              document.querySelectorAll(".history-item").forEach(item => item.classList.remove("active"));
              li.classList.add("active");
              
              // Update scene and info box
              updateSceneFromHistory(commit.id);
          });
          
          historyList.appendChild(li);
      });
  }

  function updateInfoBox(commit) {
      historyInfoBox.style.display = "block";
      historyInfoBox.innerHTML = `
        <div class="info-box-title">Statement Trace</div>
        <div class="info-box-row">
            <span class="info-box-label">Entry ID</span>
            <span class="info-box-value">#${commit.entry}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Timestamp</span>
            <span class="info-box-value">${new Date(commit.timestamp).toLocaleString()}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">User</span>
            <span class="info-box-value">${commit.user || 'System'}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Action</span>
            <span class="info-box-value">${commit.type}</span>
        </div>
        <div class="info-box-row">
            <span class="info-box-label">Staged Prims</span>
            <span class="info-box-value">${commit.stagedPrims ? commit.stagedPrims.length : 0}</span>
        </div>
        <div style="margin-top: 10px; font-size: 11px; color: #aaa;">
            Commit Hash: ${commit.id}
        </div>
      `;
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

  function getPrimWithAncestors(path) {
    console.log(`[HISTORY]   Getting prim with ancestors for: ${path}`);

    const prims = [];
    const pathSegments = path.split("/").filter(Boolean);

    for (let i = 0; i < pathSegments.length; i++) {
      const currentPath = "/" + pathSegments.slice(0, i + 1).join("/");
      const primFromMasterList = store
        .getState()
        .allPrimsByPath.get(currentPath);

      if (primFromMasterList) {
        const clonedPrim = JSON.parse(JSON.stringify(primFromMasterList));
        clonedPrim.children = [];
        prims.push(clonedPrim);
        console.log(`[HISTORY]     Found: ${currentPath}`);
      } else {
        console.warn(`[HISTORY]     Missing: ${currentPath}`);
      }
    }

    console.log(`[HISTORY]   Got ${prims.length} prims (including ancestors)`);
    return prims;
  }

  function reconstructStateAt(targetCommitId) {
    console.log(`[HISTORY] Reconstructing state at commit: ${targetCommitId}`);

    // ISOLATION VIEW: Only show the objects attached to this specific entry.
    // Instead of building the full state from root, we only process the target commit.
    
    const history = store.getState().history;
    const curr = history.commits.get(targetCommitId);

    if (!curr) {
      console.error(`[HISTORY] Target commit not found: ${targetCommitId}`);
      return [];
    }

    const commitPath = [curr]; // Only the target commit
    
    console.log(`[HISTORY] Isolating commit: ${curr.id} (Entry ${curr.entry})`);

    const primsToReconstruct = new Map();

    commitPath.forEach((logEntry, index) => {
      console.log(
        `[HISTORY] Processing isolated commit: ${logEntry.id}`
      );
      
      // NEW LOGIC: Use serialized prims directly from the log
      if (logEntry.serializedPrims && logEntry.serializedPrims.length > 0) {
          console.log(`[HISTORY]   Found ${logEntry.serializedPrims.length} serialized prims`);
          logEntry.serializedPrims.forEach(prim => {
             // In logs, we might have stored "status" in properties.
             // We need to ensure it's applied correctly.
             // The serialized prim ALREADY contains the properties as they were at that time.
             // We just need to put it into the map, overwriting previous states.
             
             // Ensure _sourceFile is preserved if possible? 
             // History view doesn't necessarily need to know source file for rendering, 
             // but stage renderer might look for it.
             // We can infer it from logEntry['File Name'] if missing?
             if (!prim._sourceFile) prim._sourceFile = logEntry['File Name'];
             
             // Force status from log metadata if present, or trust the prim properties?
             // Trust serialized prim properties first.
             
             primsToReconstruct.set(prim.path, prim);
          });
      } else if (logEntry.stagedPrims && logEntry.stagedPrims.length > 0) {
        // FALLBACK for legacy logs or incomplete data: Try to find in current state (Warning: this is "Live" state leaking into history)
        console.warn(`[HISTORY]   No serialized prims found, falling back to live state lookup (Legacy behavior)`);
        logEntry.stagedPrims.forEach((path) => {
            const primAndAncestors = getPrimWithAncestors(path);
            primAndAncestors.forEach((p) => {
              // Create a localized copy to avoid mutating the live state cache
              const pClone = JSON.parse(JSON.stringify(p));
              pClone._historicalStatus = logEntry.sourceStatus || "History";
              primsToReconstruct.set(pClone.path, pClone);
            });
        });
      }
    });

    console.log(
      `[HISTORY] Total unique prims to reconstruct: ${primsToReconstruct.size}`
    );

    // Rebuild hierarchy
    const finalHierarchy = [];
    primsToReconstruct.forEach((prim) => {
      const pathSegments = prim.path.split("/").filter(Boolean);
      if (pathSegments.length > 1) {
        const parentPath = "/" + pathSegments.slice(0, -1).join("/");
        const parent = primsToReconstruct.get(parentPath);
        if (parent) {
            if (!parent.children) parent.children = [];
            if (!parent.children.some((c) => c.path === prim.path)) {
                parent.children.push(prim);
            }
        } else {
            // Parent missing in history? 
            // This can happen if only the child was modified and logged, and parent wasn't included in the serialized set?
            // Ideally we should serialize ancestors too, or have a base state.
            // For now, if parent is missing, treat as root? Or try to fetch ancestor from live state?
            // FETCH ANCESTOR FROM LIVE STATE is safer for structure.
            console.warn(`[HISTORY] Parent ${parentPath} missing for ${prim.path}. Fetching from live...`);
            const liveParent = store.getState().allPrimsByPath.get(parentPath);
            if (liveParent) {
                const liveParentClone = JSON.parse(JSON.stringify(liveParent));
                liveParentClone.children = [prim];
                primsToReconstruct.set(parentPath, liveParentClone);
                // We'll process this parent in the loop? No, map iteration order is fixed? 
                // We might need to restart or ensure parents are processed.
                // Map iteration handles insertion? Yes in JS Maps.
                // But better to just push to finalHierarchy if we can't find parent, 
                // OR ensuring all ancestors are in primsToReconstruct.
                
                // Let's rely on getPrimWithAncestors logic if we are missing parents?
                // But that uses live state properties.
                
                // If we treat it as root for now, it renders.
                // But hierarchy indentation will be wrong.
                finalHierarchy.push(prim);
            } else {
                 finalHierarchy.push(prim);
            }
        }
      } else {
        finalHierarchy.push(prim);
      }
    });

    console.log(
      `[HISTORY] Final hierarchy has ${finalHierarchy.length} root prims`
    );
    return finalHierarchy;
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
      // timelineControlsContainer.style.visibility = "visible";
      
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
            const nodes = graphContainer.querySelectorAll(".timeline-node");
            if (nodes.length > 0) {
              nodes[0].style.backgroundColor = "#007aff";
            }
          }, 100);
        }
      }
    } else {
      console.log("[HISTORY] Exiting history mode");
      historyToggleButton.classList.remove("active");
      timelineControlsContainer.style.display = "none";
      // timelineControlsContainer.style.visibility = "hidden";
      
      // Hide Overlay
      historyOverlay.style.display = "none";
      historyInfoBox.style.display = "none";
      label.textContent = "Live";
    }
  });

  document.addEventListener("DOMContentLoaded", () => {
    timelineControlsContainer.style.display = "none";
  });
}
