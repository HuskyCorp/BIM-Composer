// src/components/viewControls.js
import { store } from "../core/index.js";
import { actions } from "../state/actions.js";
import { generateStageUsda } from "../viewer/usda/usdaComposer.js";
import { renderFileView } from "../viewer/rendering/fileViewRenderer.js";
import { renderStageView } from "../viewer/rendering/stageViewRenderer.js";

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
    saveButton.addEventListener("click", async () => {
      if (typeof window.JSZip === "undefined") {
        alert("JSZip library is missing. Cannot save.");
        return;
      }
      const zip = new window.JSZip();
      const state = store.getState(); // Get fresh state

      // 1. Generate the Root Stage Content first
      // This is the source of truth for what is actually in the scene.
      // We name it based on the scene name.
      const rootFileName = `${state.sceneName.replace(/\s+/g, "_")}.usda`;
      const stageContent = generateStageUsda(
        state.sceneName,
        state.stage.composedPrims || []
      );
      zip.file(rootFileName, stageContent);

      // 2. Identify Dependencies via Reference Tracing
      // We implicitly trust that the stageContent contains the necessary references.
      // e.g. references = @cube.usda@
      const allowedFiles = new Set();
      const stack = [stageContent]; // Start scanning the root content

      while (stack.length > 0) {
        const content = stack.pop();
        // Reset regex state for each new content string if we were reusing the regex object,
        // but valid locally created regex is safer or just loop.
        // Since we use the same regex object in a loop, we must be careful or just re-create it/reset lastIndex.
        // Using strict new regex or matchAll is safer.
        const matches = content.matchAll(/@([^@]+)@/g);

        for (const m of matches) {
          const referencedRef = m[1];
          // The reference string might be "base.usda" or "base.usda@</Prim>"
          // We need to extract the filename part.
          // Regex to split filename from internal path if present:
          // Matches: file.usda OR file.usda<...>
          // However, the outer regex @...@ usually captures the whole reference string.
          // If the USD reference is @file.usda@</Prim>, our outer regex captures "file.usda".
          // Wait, standard USD syntax is references = @file.usda@</Prim>
          // OR references = @file.usda@
          // So the @...@ delimiters enclose the Asset Path (filename).

          const filename = referencedRef; // The part inside the @s is the asset path.

          if (state.loadedFiles[filename] && !allowedFiles.has(filename)) {
            allowedFiles.add(filename);
            stack.push(state.loadedFiles[filename]);
          }
        }
      }

      // 3. Add Discovered Files to Zip
      allowedFiles.forEach((fileName) => {
        zip.file(fileName, state.loadedFiles[fileName]);
      });

      // 4. Generate and Download USDZ
      const blob = await zip.generateAsync({ type: "blob" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `Project_${state.sceneName.replace(
        /\s+/g,
        "_"
      )}_${Date.now()}.usdz`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  }

  document.addEventListener("updateView", updateView);
  return { updateView };
}
