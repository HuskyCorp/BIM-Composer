// src/components/sidebarController.js
import { store, actions as coreActions, errorHandler } from "../core/index.js";
import { initLayerStack } from "./sidebar/layerStackController.js";
import { initHierarchyPanel } from "./sidebar/hierarchyPanelController.js";
import { initPanelDockers } from "./sidebar/panelDockerController.js"; // <-- Import

export function initSidebar(fileThreeScene, stageThreeScene, updateView) {
  initLayerStack(updateView, fileThreeScene, stageThreeScene);
  initHierarchyPanel(updateView);

  // Toggle status color button (moved from removed scene panel)
  const toggleStatusColorButton = document.getElementById(
    "toggle-status-color-button"
  );
  if (toggleStatusColorButton) {
    const handleToggleStatus = errorHandler.wrap(() => {
      store.dispatch(coreActions.toggleStatusColor());
      toggleStatusColorButton.classList.toggle(
        "active",
        store.getState().stage.colorizeByStatus
      );
      if (store.getState().currentView === "stage") updateView();
    });
    toggleStatusColorButton.addEventListener("click", handleToggleStatus);
    toggleStatusColorButton.classList.toggle(
      "active",
      store.getState().stage.colorizeByStatus
    );
  }

  // Initialize the new docker/pin logic
  initPanelDockers();
}
