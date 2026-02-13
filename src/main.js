// src/main.js
// Import from new core module
import {
  store,
  applyMiddleware,
  createLoggerMiddleware,
  createAsyncMiddleware,
} from "./core/index.js";

import { ThreeScene } from "./viewer/ThreeScene.js";
import { USDA_PARSER } from "./viewer/usda/usdaParser.js";
import { initSidebar } from "./components/sidebarController.js";
import { initViewControls } from "./components/viewControls.js";
import { initModal } from "./components/modalController.js";
import { initReferenceModal } from "./components/referenceModalController.js";
import { initTimelineController } from "./components/timelineController.js";
import { initPropertiesController } from "./components/properties/index.js";
import { initOutlinerEvents } from "./components/outlinerController.js";
import { initDataInspector } from "./components/dataInspector.js";
import { initPromotionController } from "./components/promotionController.js";
import { initUserController } from "./components/userController.js";
import { initConflictModal } from "./components/conflictModal.js";

function initSidebarResizing() {
  const sidebar = document.querySelector(".sidebar");
  const resizer = document.querySelector(".sidebar-resizer");
  if (!sidebar || !resizer) return;
  let isResizing = false;
  resizer.addEventListener("mousedown", (e) => {
    isResizing = true;
    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    const startX = e.clientX;
    const startWidth = sidebar.offsetWidth;
    const doDrag = (e) => {
      if (!isResizing) return;
      const newWidth = startWidth + e.clientX - startX;
      if (newWidth > 150 && newWidth < window.innerWidth * 0.7) {
        sidebar.style.width = `${newWidth}px`;
      }
    };
    const stopDrag = () => {
      isResizing = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", doDrag);
      document.removeEventListener("mouseup", stopDrag);
    };
    document.addEventListener("mousemove", doDrag);
    document.addEventListener("mouseup", stopDrag);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  // ==================== Initialize Core Modules ====================
  console.log("🚀 Initializing USDA Composer...");

  // Apply middleware to store
  applyMiddleware(
    store,
    createAsyncMiddleware(),
    createLoggerMiddleware({
      collapsed: true,
      enabled: import.meta.env.DEV, // Only in development
    })
  );

  console.log("✅ Core modules initialized");
  console.log("📦 State management with middleware active");
  console.log("🛡️ Global error handler active");

  // ==================== Initialize Three.js Scenes ====================
  const fileSceneContainer = document.getElementById("webglCanvas");
  const stageSceneContainer = document.getElementById("stageCanvas");
  const historySceneContainer = document.getElementById("historyCanvas");

  if (!fileSceneContainer || !stageSceneContainer || !historySceneContainer) {
    throw new Error("Essential canvas elements are missing from the DOM.");
  }

  const fileThreeScene = new ThreeScene(
    fileSceneContainer,
    USDA_PARSER,
    "file"
  );
  fileThreeScene.animate();
  const stageThreeScene = new ThreeScene(
    stageSceneContainer,
    USDA_PARSER,
    "stage"
  );
  stageThreeScene.animate();
  const historyThreeScene = new ThreeScene(
    historySceneContainer,
    USDA_PARSER,
    "history"
  );
  historyThreeScene.animate();

  const { updateView } = initViewControls(
    fileThreeScene,
    stageThreeScene,
    historyThreeScene
  );

  initUserController(updateView);
  initSidebar(fileThreeScene, stageThreeScene, updateView);
  initModal(updateView);
  initOutlinerEvents(fileThreeScene, stageThreeScene);
  initReferenceModal(updateView);
  initPromotionController(updateView);
  initTimelineController(historyThreeScene, updateView);
  initPropertiesController(updateView);
  initDataInspector();
  initConflictModal();
  initSidebarResizing();

  document.getElementById("sampleSceneItem").textContent =
    store.getState().sceneName;
  updateView();
});
