// src/components/viewControls.js
import { store } from "../core/index.js";
import { actions } from "../state/actions.js";
import { generateStageUsda } from "../viewer/usda/usdaComposer.js";
import { renderFileView } from "../viewer/rendering/fileViewRenderer.js";
import { renderStageView } from "../viewer/rendering/stageViewRenderer.js";
import { validateUsdaSyntax } from "../utils/atomicFileHandler.js";

export function initViewControls(
  fileThreeScene,
  stageThreeScene,
  historyThreeScene
) {
  const view3dButton = document.getElementById("view3d");
  const viewCodeButton = document.getElementById("viewCode");
  const editor = document.getElementById("usdaEditor");
  const fileCanvas = document.getElementById("webglCanvas");
  const stageCanvas = document.getElementById("stageCanvas");
  const historyCanvas = document.getElementById("historyCanvas");
  const saveButton = document.getElementById("saveButton");
  const themeToggle = document.getElementById("themeToggle");

  // --- Theme Toggle Logic ---
  let isDarkMode = false; // Default is now light mode (SketchUp style)

  // Check local storage for theme preference
  const savedTheme = localStorage.getItem("usda-composer-theme");
  if (savedTheme === "dark") {
    isDarkMode = true;
    document.body.classList.add("dark-theme");
    if (themeToggle) themeToggle.textContent = "☀️";
  }

  function updateThreeJSColors() {
    const bgColor = isDarkMode ? 0x2e2e2e : 0xffffff;
    const gridColor = isDarkMode ? 0xffffff : 0xcccccc;
    const gridOpacity = isDarkMode ? 0.2 : 0.5;

    // Update File View Scene
    if (fileThreeScene && fileThreeScene.scene) {
      fileThreeScene.scene.background.setHex(bgColor);
      // Find and update grid
      fileThreeScene.scene.children.forEach((child) => {
        if (child.isGridHelper) {
          child.material.color.setHex(gridColor);
          child.material.opacity = gridOpacity;
        }
        if (child.isAxesHelper) {
          child.visible = !isDarkMode; // Hide axes in dark mode
        }
      });
    }

    // Update Stage View Scene
    if (stageThreeScene && stageThreeScene.scene) {
      stageThreeScene.scene.background.setHex(bgColor);
      stageThreeScene.scene.children.forEach((child) => {
        if (child.isGridHelper) {
          child.material.color.setHex(gridColor);
          child.material.opacity = gridOpacity;
        }
        if (child.isAxesHelper) {
          child.visible = !isDarkMode;
        }
      });
    }
  }

  // Apply initial colors
  // Wait a tick for scenes to be fully initialized if needed, or apply immediately
  setTimeout(updateThreeJSColors, 100);

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      isDarkMode = !isDarkMode;
      if (isDarkMode) {
        document.body.classList.add("dark-theme");
        themeToggle.textContent = "☀️";
        localStorage.setItem("usda-composer-theme", "dark");
      } else {
        document.body.classList.remove("dark-theme");
        themeToggle.textContent = "🌚";
        localStorage.setItem("usda-composer-theme", "light");
      }
      updateThreeJSColors();
    });
  }

  function updateView() {
    const state = store.getState();
    console.log(
      "[VIEW] updateView called. isHistoryMode:",
      state.isHistoryMode
    );

    if (state.isHistoryMode) {
      console.log("[VIEW] Showing history canvas");
      fileCanvas.style.display = "none";
      stageCanvas.style.display = "none";
      editor.style.display = "none";
      historyCanvas.style.display = "block";
      if (historyThreeScene) historyThreeScene.resize();
      console.log(
        "[VIEW] History canvas display:",
        historyCanvas.style.display
      );
      return;
    }

    console.log("[VIEW] Hiding history canvas");
    historyCanvas.style.display = "none";
    const isCodeViewActive = viewCodeButton.classList.contains("active");

    if (isCodeViewActive) {
      fileCanvas.style.display = "none";
      stageCanvas.style.display = "none";
      editor.style.display = "block";

      if (state.currentView === "file") {
        if (state.selectedFiles && state.selectedFiles.length > 0) {
          // Concatenate all selected files for the editor view
          editor.value = state.selectedFiles
            .map((f) => `# File: ${f.name}\n${f.content}`)
            .join("\n\n");
        } else if (state.currentFile && state.loadedFiles[state.currentFile]) {
          editor.value = state.loadedFiles[state.currentFile];
        } else {
          editor.value = "";
        }
      } else {
        // Fix: Use state.stage.composedPrims (The Stage Definition) instead of state.composedHierarchy (The Resolved/Rendered Tree)
        // This ensures that we show the "Source Code" structure (References) rather than the fully expanded tree.
        editor.value = generateStageUsda(
          state.sceneName,
          state.stage.composedPrims
        );
      }
    } else {
      editor.style.display = "none";
      if (state.currentView === "file") {
        // PERMISSION CHECK:
        // If the current file is not owned by the current user (and they are not PM),
        // we must NOT render it.
        if (state.currentFile && state.currentUser !== "Project Manager") {
          const layer = state.stage.layerStack.find(
            (l) => l.filePath === state.currentFile
          );
          if (layer && layer.owner && layer.owner !== state.currentUser) {
            console.warn(
              `[VIEW] Permission denied for ${state.currentFile}. Switching to default view.`
            );
            actions.setCurrentFile(null);
            actions.setSelectedFiles([]);
            actions.setCurrentView("stage"); // Fallback to stage view
            // Recursive call or just flow through?
            // Better to flow through by toggling logic or just resetting UI.
            // Since we are inside the 'if file' block, we should exit or re-run updateView.
            // Simplest: just render NOTHING here, or force a re-update.
            const currentFileTab = document.getElementById("currentFileTab");
            if (currentFileTab) currentFileTab.textContent = "None"; // Clear tab

            // Now force switch to stage logic below or return?
            // If we change state.currentView to "stage", we should re-run updateView to hit the 'else' block
            updateView();
            return;
          }
        }

        fileCanvas.style.display = "block";
        stageCanvas.style.display = "none";

        let filesToRender = [];
        if (state.selectedFiles && state.selectedFiles.length > 0) {
          filesToRender = state.selectedFiles;
        } else if (state.currentFile && state.loadedFiles[state.currentFile]) {
          // Fallback for single selection if state.selectedFiles wasn't populated
          filesToRender = [
            {
              name: state.currentFile,
              content: state.loadedFiles[state.currentFile],
            },
          ];
        }

        renderFileView(fileThreeScene, filesToRender);
        fileThreeScene.resize();
      } else {
        fileCanvas.style.display = "none";
        stageCanvas.style.display = "block";
        renderStageView(stageThreeScene, state);
        stageThreeScene.resize();
      }
    }
  }

  view3dButton.addEventListener("click", () => {
    if (view3dButton.classList.contains("active")) return;
    const state = store.getState(); // Get fresh state
    view3dButton.classList.add("active");
    viewCodeButton.classList.remove("active");
    if (
      state.currentView === "file" &&
      state.currentFile &&
      editor.style.display === "block"
    ) {
      actions.updateLoadedFile(state.currentFile, editor.value);
    }
    updateView();
  });

  viewCodeButton.addEventListener("click", () => {
    if (viewCodeButton.classList.contains("active")) return;
    viewCodeButton.classList.add("active");
    view3dButton.classList.remove("active");
    updateView();
  });

  if (saveButton) {
    // Open save options modal instead of immediate save
    saveButton.addEventListener("click", () => {
      const modal = document.getElementById("save-options-modal");
      const state = store.getState();

      // Restore previous filter selections
      const savedFilters = state.stage.saveStatusFilter || [
        "WIP",
        "Shared",
        "Published",
      ];
      document.getElementById("save-filter-wip").checked =
        savedFilters.includes("WIP");
      document.getElementById("save-filter-shared").checked =
        savedFilters.includes("Shared");
      document.getElementById("save-filter-published").checked =
        savedFilters.includes("Published");
      document.getElementById("save-filter-archived").checked =
        savedFilters.includes("Archived");

      modal.style.display = "flex";
    });

    // Handle modal actions
    const modal = document.getElementById("save-options-modal");
    const cancelButton = document.getElementById("cancel-save-button");
    const confirmButton = document.getElementById("confirm-save-button");

    cancelButton.addEventListener("click", () => {
      modal.style.display = "none";
    });

    confirmButton.addEventListener("click", async () => {
      // Collect selected filters
      const selectedFilters = [];
      if (document.getElementById("save-filter-wip").checked)
        selectedFilters.push("WIP");
      if (document.getElementById("save-filter-shared").checked)
        selectedFilters.push("Shared");
      if (document.getElementById("save-filter-published").checked)
        selectedFilters.push("Published");
      if (document.getElementById("save-filter-archived").checked)
        selectedFilters.push("Archived");

      // Validate at least one filter is selected
      if (selectedFilters.length === 0) {
        alert("Please select at least one status to include in the save.");
        return;
      }

      // Save filter selection to state
      actions.setSaveStatusFilter(selectedFilters);

      // Close modal
      modal.style.display = "none";

      // Perform the actual save with filtering
      await performFilteredSave(selectedFilters);
    });
  }

  /**
   * Performs a filtered save operation based on status filters
   * @param {Array<string>} statusFilters - Array of status values to include
   */
  async function performFilteredSave(statusFilters) {
    if (typeof window.JSZip === "undefined") {
      alert("JSZip library is missing. Cannot save.");
      return;
    }

    const zip = new window.JSZip();
    const state = store.getState();

    // 1. Filter composed prims by status
    const filteredPrims = filterPrimsByStatus(
      state.stage.composedPrims || [],
      statusFilters
    );

    if (filteredPrims.length === 0) {
      alert("No prims match the selected status filters. Nothing to save.");
      return;
    }

    // 2. Generate the Root Stage Content with filtered prims
    const rootFileName = `${state.sceneName.replace(/\s+/g, "_")}.usda`;
    const stageContent = generateStageUsda(state.sceneName, filteredPrims);

    // 2.5. Validate USD syntax before adding to zip
    const validation = validateUsdaSyntax(stageContent);
    if (!validation.valid) {
      console.error("[SAVE] USD Validation Errors:", validation.errors);
      const errorMsg = `USD Validation Failed:\n\n${validation.errors.join("\n")}\n\nThe file may not be compatible with usdchecker or other USD tools. Do you want to continue anyway?`;
      if (!confirm(errorMsg)) {
        return; // Cancel save
      }
    } else if (validation.warnings.length > 0) {
      console.warn("[SAVE] USD Validation Warnings:", validation.warnings);
      // Show warnings but allow save
      const warningMsg = `USD Validation Warnings:\n\n${validation.warnings.join("\n")}\n\nThe file should work but may have minor issues. Continue with save?`;
      if (!confirm(warningMsg)) {
        return; // Cancel save
      }
    } else {
      console.log("[SAVE] ✓ USD validation passed");
    }

    zip.file(rootFileName, stageContent);

    // 3. Identify Dependencies via Reference Tracing
    const allowedFiles = new Set();
    const stack = [stageContent];

    while (stack.length > 0) {
      const content = stack.pop();
      const matches = content.matchAll(/@([^@]+)@/g);

      for (const m of matches) {
        const filename = m[1];
        if (state.loadedFiles[filename] && !allowedFiles.has(filename)) {
          allowedFiles.add(filename);
          stack.push(state.loadedFiles[filename]);
        }
      }
    }

    // 4. Add Discovered Files to Zip with validation
    let totalWarnings = 0;
    let totalErrors = 0;

    allowedFiles.forEach((fileName) => {
      const fileContent = state.loadedFiles[fileName];
      const fileValidation = validateUsdaSyntax(fileContent);

      if (!fileValidation.valid) {
        console.error(
          `[SAVE] Validation errors in ${fileName}:`,
          fileValidation.errors
        );
        totalErrors += fileValidation.errors.length;
      }

      if (fileValidation.warnings.length > 0) {
        console.warn(
          `[SAVE] Validation warnings in ${fileName}:`,
          fileValidation.warnings
        );
        totalWarnings += fileValidation.warnings.length;
      }

      zip.file(fileName, fileContent);
    });

    // Report validation summary
    if (totalErrors > 0 || totalWarnings > 0) {
      console.log(
        `[SAVE] Validation Summary: ${totalErrors} errors, ${totalWarnings} warnings across ${allowedFiles.size} referenced files`
      );
    }

    // 5. Generate and Download USDZ
    const blob = await zip.generateAsync({ type: "blob" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);

    // Include filter info in filename for clarity
    const filterSuffix =
      statusFilters.length === 4 ? "All" : statusFilters.join("-");
    link.download = `Project_${state.sceneName.replace(
      /\s+/g,
      "_"
    )}_${filterSuffix}_${Date.now()}.usdz`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    console.log(`[SAVE] Saved with filters: ${statusFilters.join(", ")}`);
  }

  /**
   * Recursively filters prims by status
   * @param {Array} prims - Array of prim objects
   * @param {Array<string>} statusFilters - Array of status values to include
   * @returns {Array} Filtered prims with children also filtered
   */
  function filterPrimsByStatus(prims, statusFilters) {
    if (!prims || prims.length === 0) return [];

    return prims
      .map((prim) => {
        // Determine prim status (check both locations)
        const primStatus =
          prim.properties?.status || prim._sourceLayerStatus || "Published";

        // Check if prim matches filter
        const matches = statusFilters.includes(primStatus);

        // Recursively filter children
        const filteredChildren = prim.children
          ? filterPrimsByStatus(prim.children, statusFilters)
          : [];

        // Include prim if it matches OR has matching children
        if (matches || filteredChildren.length > 0) {
          return {
            ...prim,
            children: filteredChildren,
          };
        }

        return null;
      })
      .filter((prim) => prim !== null);
  }

  document.addEventListener("updateView", updateView);
  return { updateView };
}
