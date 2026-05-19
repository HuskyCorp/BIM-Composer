// src/components/properties/index.js
// REFACTORED: Enhanced with error handling and core architecture
// Main orchestrator for the properties panel

import { store, errorHandler } from "../../core/index.js";
import { findPrimByPath } from "../../utils/primHelpers.js";
import {
  renderPropertiesPanel,
  renderPlaceholder,
} from "./PropertyRenderer.js";
import { applyPrimRename } from "./PrimRenamer.js";
import { applyAttributeChange } from "./AttributeUpdater.js";
import { attachPropertyEventListeners } from "./PropertyEditor.js";
import { USDA_PARSER } from "../../viewer/usda/usdaParser.js";

// Max file size (chars) to attempt on-demand parsing for file-view prims
const FILE_PARSE_CHAR_LIMIT = 500_000;

/**
 * Initializes the properties controller.
 * Properties are shown in the in-scene floating overlay (#scene-properties-overlay).
 * The sidebar #propertiesPanel / #properties-content is kept as a fallback for code view.
 */
export function initPropertiesController(updateView) {
  // Sidebar fallback (code view)
  const propertiesContent = document.getElementById("properties-content");
  const commitButton = document.getElementById("commitButton");

  // In-scene overlay elements
  const overlay = document.getElementById("scene-properties-overlay");
  const overlayContent = document.getElementById("spo-properties-content");
  const overlayPrimName = document.getElementById("spo-prim-name");
  const overlayCloseBtn = document.getElementById("spo-close-btn");

  function showOverlay(primData) {
    if (!overlay || !overlayContent) return;
    overlayPrimName.textContent =
      primData.name || primData.path || "Properties";
    renderPropertiesPanel(overlayContent, primData);
    attachPropertyEventListeners(
      overlayContent,
      primData,
      { applyPrimRename, applyAttributeChange },
      updateView,
      commitButton
    );
    overlay.classList.remove("hidden");
  }

  function hideOverlay() {
    if (!overlay) return;
    overlay.classList.add("hidden");
    if (overlayContent) overlayContent.innerHTML = "";
  }

  if (overlayCloseBtn) {
    overlayCloseBtn.addEventListener("click", hideOverlay);
  }

  // Listen for prim selection events
  const handlePrimSelected = errorHandler.wrap((e) => {
    // Guard: don't render properties while in Record Log (history) mode
    if (store.getState().isHistoryMode) return;

    const { primPath } = e.detail;

    // No prim selected — hide overlay
    if (!primPath) {
      hideOverlay();
      if (propertiesContent) renderPlaceholder(propertiesContent);
      return;
    }

    // Find the prim in the composed hierarchy
    let primData = findPrimByPath(store.getState().composedHierarchy, primPath);

    // Fallback: prim not yet staged — look it up in the currently open file
    if (!primData) {
      const state = store.getState();
      const fileContent =
        state.currentFile && state.loadedFiles
          ? state.loadedFiles[state.currentFile]
          : null;
      if (fileContent && fileContent.length <= FILE_PARSE_CHAR_LIMIT) {
        try {
          const fileHierarchy = USDA_PARSER.getPrimHierarchy(fileContent);
          primData = findPrimByPath(fileHierarchy, primPath);
        } catch (parseErr) {
          console.warn(
            "[PROPERTIES] Failed to parse file hierarchy for fallback lookup:",
            parseErr
          );
        }
      }
    }

    if (primData) {
      // Show in-scene overlay (primary)
      showOverlay(primData);

      // Also sync sidebar panel for code-view fallback
      if (propertiesContent) {
        renderPropertiesPanel(propertiesContent, primData);
        attachPropertyEventListeners(
          propertiesContent,
          primData,
          { applyPrimRename, applyAttributeChange },
          updateView,
          commitButton
        );
      }

      console.log(`✅ Rendered properties for prim: ${primPath}`);
    } else {
      hideOverlay();
      if (propertiesContent)
        renderPlaceholder(propertiesContent, `No data found for ${primPath}`);
    }
  });

  document.addEventListener("primSelected", handlePrimSelected);

  // Hide overlay when switching to history mode
  store.subscribe("isHistoryMode", (_prev, nextState) => {
    if (nextState?.isHistoryMode) hideOverlay();
  });

  console.log("✅ Properties Controller initialized with error handling");
}
