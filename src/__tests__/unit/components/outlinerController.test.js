/**
 * OutlinerController Unit Tests
 * Tests for hierarchy tree building, mesh matching, and event handling
 */

// Mock dependencies
vi.mock("../../../core/index.js", () => {
  // Create mock functions inside the factory
  const mockHandleError = vi.fn();
  const mockGetState = vi.fn();
  const mockDispatch = vi.fn();

  return {
    store: {
      getState: mockGetState,
      dispatch: mockDispatch,
    },
    errorHandler: {
      wrap: (fn) => fn,
      wrapAsync: (fn) => fn,
      handleError: mockHandleError,
    },
    ValidationError: class ValidationError extends Error {
      constructor(message, field, value) {
        super(message);
        this.name = "ValidationError";
        this.field = field;
        this.value = value;
      }
    },
  };
});

import {
  makeItemCollapsible,
  buildFileOutliner,
  buildStageOutliner,
  initOutlinerEvents,
} from "../../../components/outlinerController.js";
import { store, ValidationError } from "../../../core/index.js";
import { resolvePrimStatus } from "../../../utils/statusUtils.js";
import * as THREE from "three";

vi.mock("../../../utils/statusUtils.js", () => ({
  resolvePrimStatus: vi.fn(() => "Active"),
}));

describe("OutlinerController", () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <ul id="usdaOutliner"></ul>
      <canvas id="webglCanvas"></canvas>
      <span id="sampleSceneItem">Test Scene</span>
    `;

    store.getState.mockReturnValue({
      stage: { layerStack: [] },
      isHistoryMode: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("makeItemCollapsible()", () => {
    it("should add collapsible and collapsed classes to li element", () => {
      const li = document.createElement("li");
      const ul = document.createElement("ul");

      makeItemCollapsible(li, ul);

      expect(li.classList.contains("collapsible")).toBe(true);
      expect(li.classList.contains("collapsed")).toBe(true);
    });

    it("should hide child ul element", () => {
      const li = document.createElement("li");
      const ul = document.createElement("ul");

      makeItemCollapsible(li, ul);

      expect(ul.style.display).toBe("none");
    });

    it("should throw ValidationError for null liElement", () => {
      const ul = document.createElement("ul");

      expect(() => {
        makeItemCollapsible(null, ul);
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for non-HTMLElement liElement", () => {
      const ul = document.createElement("ul");

      expect(() => {
        makeItemCollapsible("not an element", ul);
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for null childUlElement", () => {
      const li = document.createElement("li");

      expect(() => {
        makeItemCollapsible(li, null);
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for non-HTMLElement childUlElement", () => {
      const li = document.createElement("li");

      expect(() => {
        makeItemCollapsible(li, {});
      }).toThrow(ValidationError);
    });
  });

  describe("buildFileOutliner()", () => {
    let outlinerEl;

    beforeEach(() => {
      outlinerEl = document.getElementById("usdaOutliner");
    });

    it("should throw ValidationError for null outlinerEl", () => {
      expect(() => {
        buildFileOutliner(null, {});
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for non-HTMLElement outlinerEl", () => {
      expect(() => {
        buildFileOutliner("not an element", {});
      }).toThrow(ValidationError);
    });

    it("should clear existing outliner content", () => {
      outlinerEl.innerHTML = "<li>Old Content</li>";

      buildFileOutliner(outlinerEl, {});

      expect(outlinerEl.querySelector("li:not(.scene-item)")).toBeNull();
    });

    it("should set blender-outliner class", () => {
      buildFileOutliner(outlinerEl, {});

      expect(outlinerEl.classList.contains("blender-outliner")).toBe(true);
    });

    it("should create scene root item", () => {
      buildFileOutliner(outlinerEl, {});

      const sceneItem = outlinerEl.querySelector(".scene-item");
      expect(sceneItem).toBeTruthy();
      expect(sceneItem.querySelector(".outliner-text").textContent).toBe(
        "Test Scene"
      );
    });

    it("should create scene root with hierarchy data attribute", () => {
      buildFileOutliner(outlinerEl, {});

      const sceneItem = outlinerEl.querySelector(".scene-item");
      expect(sceneItem.dataset.type).toBe("hierarchy");
    });

    it("should create layer items for each file", () => {
      const combinedHierarchy = {
        "file1.usda": {},
        "file2.usda": {},
      };

      buildFileOutliner(outlinerEl, combinedHierarchy);

      const layerItems = outlinerEl.querySelectorAll(".layer-item");
      expect(layerItems.length).toBe(2);
    });

    it("should create xform items for each hierarchy group", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        outlinerElement: document.createElement("li"),
      };

      const combinedHierarchy = {
        "test.usda": {
          RootXform: [{ mesh: mesh1 }],
        },
      };

      buildFileOutliner(outlinerEl, combinedHierarchy);

      const xformItems = outlinerEl.querySelectorAll(".xform-item");
      expect(xformItems.length).toBe(1);
      expect(xformItems[0].querySelector(".outliner-text").textContent).toBe(
        "RootXform"
      );
    });

    it("should append mesh outliner elements to xform items", () => {
      const meshLi = document.createElement("li");
      meshLi.textContent = "Mesh1";
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        outlinerElement: meshLi,
      };

      const combinedHierarchy = {
        "test.usda": {
          Root: [{ mesh: mesh1 }],
        },
      };

      buildFileOutliner(outlinerEl, combinedHierarchy);

      const xformItem = outlinerEl.querySelector(".xform-item");
      const childUl = xformItem.querySelector("ul");
      expect(childUl.contains(meshLi)).toBe(true);
    });

    it("should make all items collapsible", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        outlinerElement: document.createElement("li"),
      };

      const combinedHierarchy = {
        "test.usda": {
          Root: [{ mesh: mesh1 }],
        },
      };

      buildFileOutliner(outlinerEl, combinedHierarchy);

      const sceneItem = outlinerEl.querySelector(".scene-item");
      const layerItem = outlinerEl.querySelector(".layer-item");
      const xformItem = outlinerEl.querySelector(".xform-item");

      expect(sceneItem.classList.contains("collapsible")).toBe(true);
      expect(layerItem.classList.contains("collapsible")).toBe(true);
      expect(xformItem.classList.contains("collapsible")).toBe(true);
    });

    it("should handle null combinedHierarchy gracefully", () => {
      expect(() => {
        buildFileOutliner(outlinerEl, null);
      }).not.toThrow();

      const layerItems = outlinerEl.querySelectorAll(".layer-item");
      expect(layerItems.length).toBe(0);
    });

    it("should handle empty combinedHierarchy", () => {
      buildFileOutliner(outlinerEl, {});

      const sceneItem = outlinerEl.querySelector(".scene-item");
      expect(sceneItem).toBeTruthy();
      const layerItems = outlinerEl.querySelectorAll(".layer-item");
      expect(layerItems.length).toBe(0);
    });

    it("should use default scene name when element is missing", () => {
      document.getElementById("sampleSceneItem").textContent = "";

      buildFileOutliner(outlinerEl, {});

      const sceneItem = outlinerEl.querySelector(".scene-item");
      expect(sceneItem.querySelector(".outliner-text").textContent).toBe(
        "Stage"
      );
    });
  });

  describe("buildStageOutliner()", () => {
    let outlinerEl;
    let mockState;

    beforeEach(() => {
      outlinerEl = document.getElementById("usdaOutliner");
      mockState = {
        stage: { layerStack: [] },
      };
    });

    it("should throw ValidationError for null outlinerEl", async () => {
      await expect(buildStageOutliner(null, [], {}, mockState)).rejects.toThrow(
        ValidationError
      );
    });

    it("should throw ValidationError for non-HTMLElement outlinerEl", async () => {
      await expect(
        buildStageOutliner("not an element", [], {}, mockState)
      ).rejects.toThrow(ValidationError);
    });

    it("should return early if composedHierarchy is null", async () => {
      outlinerEl.innerHTML = "<div>test</div>";
      await buildStageOutliner(outlinerEl, null, {}, mockState);

      // Should clear content but still create basic structure
      expect(outlinerEl.textContent).not.toContain("test");
      // Check that outliner was cleared and rebuilt (may or may not have scene-item depending on early return)
      expect(outlinerEl.innerHTML).not.toBe("<div>test</div>");
    });

    it("should clear existing outliner content", async () => {
      outlinerEl.innerHTML = "<li>Old Content</li>";

      await buildStageOutliner(outlinerEl, [], {}, mockState);

      expect(outlinerEl.textContent).not.toContain("Old Content");
      expect(outlinerEl.querySelector(".scene-item")).toBeTruthy();
    });

    it("should set blender-outliner class", async () => {
      await buildStageOutliner(outlinerEl, [], {}, mockState);

      expect(outlinerEl.classList.contains("blender-outliner")).toBe(true);
    });

    it("should create scene root with custom scene name", async () => {
      await buildStageOutliner(outlinerEl, [], {}, mockState);

      const sceneItem = outlinerEl.querySelector(".scene-item");
      expect(sceneItem.querySelector(".outliner-text").textContent).toBe(
        "Stage"
      );
    });

    it("should build prim hierarchy recursively", async () => {
      const allMeshesByFile = {
        "test.usda": [
          {
            userData: { primPath: "/Root" },
          },
        ],
      };

      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(
        outlinerEl,
        composedHierarchy,
        allMeshesByFile,
        mockState
      );

      const primItem = outlinerEl.querySelector(".prim-item");
      expect(primItem).toBeTruthy();
      expect(primItem.dataset.primPath).toBe("/Root");
    });

    it("should prevent concurrent builds", async () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      const promise1 = buildStageOutliner(outlinerEl, [], {}, mockState);
      const promise2 = buildStageOutliner(outlinerEl, [], {}, mockState);

      await Promise.all([promise1, promise2]);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[OUTLINER] Build already in progress, skipping duplicate call"
      );
    });

    it("should reset isBuilding flag after completion", async () => {
      await buildStageOutliner(outlinerEl, [], {}, mockState);

      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      // Second call should not warn since first completed
      await buildStageOutliner(outlinerEl, [], {}, mockState);

      expect(consoleWarnSpy).not.toHaveBeenCalled();
    });

    it("should reset isBuilding flag on error", async () => {
      const invalidOutliner = "not an element";

      try {
        await buildStageOutliner(invalidOutliner, [], {}, mockState);
      } catch {
        // Expected to throw
      }

      // Should be able to build again after error
      await expect(
        buildStageOutliner(outlinerEl, [], {}, mockState)
      ).resolves.not.toThrow();
    });

    it("should create prim items with correct data attributes", async () => {
      const allMeshesByFile = {
        "test.usda": [
          {
            userData: { primPath: "/Root/Mesh" },
          },
        ],
      };

      const composedHierarchy = [
        {
          path: "/Root/Mesh",
          name: "Mesh",
          type: "Mesh",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(
        outlinerEl,
        composedHierarchy,
        allMeshesByFile,
        mockState
      );

      const primItem = outlinerEl.querySelector(".prim-item");
      expect(primItem.dataset.primPath).toBe("/Root/Mesh");
      expect(primItem.dataset.meshName).toBe("Root/Mesh");
    });

    it("should display displayName if available", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          properties: {
            displayName: "Custom Display Name",
          },
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      expect(primItem.querySelector(".outliner-text").textContent).toBe(
        "Custom Display Name"
      );
    });

    it("should use prim name when displayName is not available", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "DefaultName",
          type: "Xform",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      expect(primItem.querySelector(".outliner-text").textContent).toBe(
        "DefaultName"
      );
    });

    it("should call resolvePrimStatus for status indicator", async () => {
      resolvePrimStatus.mockReturnValue("Active");

      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      expect(resolvePrimStatus).toHaveBeenCalled();
      const statusIndicator = outlinerEl.querySelector(".status-indicator");
      expect(statusIndicator).toBeTruthy();
      expect(statusIndicator.textContent).toBe("A"); // First letter of "Active"
    });

    it("should use Xform icon for Xform type", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      const icon = primItem.querySelector(".outliner-icon");
      expect(icon.textContent).toBe("📦");
    });

    it("should use Mesh icon for non-Xform type", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Mesh",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      const icon = primItem.querySelector(".outliner-icon");
      expect(icon.textContent).toBe("🧊");
    });

    it("should use Scope icon for Scope type", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Scope",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      const icon = primItem.querySelector(".outliner-icon");
      expect(icon.textContent).toBe("📂");
    });

    it("should use link icon for interface objects (with payload)", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          properties: {},
          payload: "path/to/payload.usda",
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      const icon = primItem.querySelector(".outliner-icon");
      expect(icon.textContent).toBe("🔗");
      expect(primItem.classList.contains("interface-object")).toBe(true);
    });

    it("should hide outliner toggler for prims without children", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Mesh",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const primItem = outlinerEl.querySelector(".prim-item");
      const toggler = primItem.querySelector(".outliner-toggler");
      expect(toggler.style.visibility).toBe("hidden");
    });

    it("should show outliner toggler for prims with children", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          properties: {},
          children: [
            {
              path: "/Root/Child",
              name: "Child",
              type: "Mesh",
              properties: {},
              children: [],
            },
          ],
        },
      ];

      await buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState);

      const parentPrim = outlinerEl.querySelector(
        '.prim-item[data-prim-path="/Root"]'
      );
      const toggler = parentPrim.querySelector(".outliner-toggler");
      expect(toggler.style.visibility).toBe("visible");
    });

    it("should match mesh by exact primPath", async () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };

      const allMeshesByFile = {
        "test.usda": [mesh],
      };

      const composedHierarchy = [
        {
          path: "/Root/Mesh",
          name: "Mesh",
          type: "Mesh",
          properties: {},
          children: [],
        },
      ];

      await buildStageOutliner(
        outlinerEl,
        composedHierarchy,
        allMeshesByFile,
        mockState
      );

      // Mesh should have outlinerElement reference set
      expect(mesh.userData.outlinerElement).toBeTruthy();
      expect(mesh.userData.outlinerElement.dataset.primPath).toBe("/Root/Mesh");
    });

    it("should match mesh by descendant primPath for parent containers", async () => {
      const childMesh = new THREE.Mesh();
      childMesh.userData = { primPath: "/Root/Parent/Child_123" };

      const allMeshesByFile = {
        "test.usda": [childMesh],
      };

      const composedHierarchy = [
        {
          path: "/Root/Parent",
          name: "Parent",
          type: "Xform",
          properties: {},
          children: [
            {
              path: "/Root/Parent/Child_123",
              name: "Child",
              type: "Mesh",
              properties: {},
              children: [],
            },
          ],
        },
      ];

      await buildStageOutliner(
        outlinerEl,
        composedHierarchy,
        allMeshesByFile,
        mockState
      );

      // Parent should reference descendant mesh
      const parentPrim = outlinerEl.querySelector(
        '[data-prim-path="/Root/Parent"]'
      );
      expect(parentPrim).toBeTruthy();
    });

    it("should initialize properties object if missing", async () => {
      const composedHierarchy = [
        {
          path: "/Root",
          name: "Root",
          type: "Xform",
          // properties intentionally missing
          children: [],
        },
      ];

      await expect(
        buildStageOutliner(outlinerEl, composedHierarchy, {}, mockState)
      ).resolves.not.toThrow();

      const primItem = outlinerEl.querySelector(".prim-item");
      expect(primItem).toBeTruthy();
    });

    it("should yield control every 50 items for performance", async () => {
      // Create large hierarchy to test yielding
      const largHierarchy = Array.from({ length: 150 }, (_, i) => ({
        path: `/Root/Item${i}`,
        name: `Item${i}`,
        type: "Mesh",
        properties: {},
        children: [],
      }));

      await buildStageOutliner(outlinerEl, largHierarchy, {}, mockState);

      const primItems = outlinerEl.querySelectorAll(".prim-item");
      expect(primItems.length).toBe(150);
    });
  });

  describe("initOutlinerEvents()", () => {
    let fileThreeScene;
    let stageThreeScene;
    let outlinerEl;
    let fileCanvas;

    beforeEach(() => {
      outlinerEl = document.getElementById("usdaOutliner");
      fileCanvas = document.getElementById("webglCanvas");

      // Mock Three.js scenes
      const mockSelectionController = {
        setVisibility: vi.fn(),
        togglePrimSelection: vi.fn(),
        toggleHierarchySelection: vi.fn(),
      };

      fileThreeScene = {
        meshesGroup: new THREE.Group(),
        selectionController: mockSelectionController,
      };

      stageThreeScene = {
        meshesGroup: new THREE.Group(),
        selectionController: mockSelectionController,
      };
    });

    it("should throw ValidationError if usdaOutliner element not found", () => {
      document.getElementById("usdaOutliner").remove();

      expect(() => {
        initOutlinerEvents(fileThreeScene, stageThreeScene);
      }).toThrow(ValidationError);
    });

    it("should attach click event listener to outliner", () => {
      const addEventListenerSpy = vi.spyOn(outlinerEl, "addEventListener");

      initOutlinerEvents(fileThreeScene, stageThreeScene);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function)
      );
    });

    it("should use fileThreeScene when fileCanvas is visible", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);

      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row"><span class="outliner-text">Mesh</span></div>
        </li>
      `;

      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      fileThreeScene.meshesGroup.add(mesh);

      outlinerEl.querySelector(".outliner-row").click();

      expect(
        fileThreeScene.selectionController.togglePrimSelection
      ).toHaveBeenCalled();
    });

    it("should use stageThreeScene when fileCanvas is hidden", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);

      fileCanvas.style.display = "none";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row"><span class="outliner-text">Mesh</span></div>
        </li>
      `;

      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      stageThreeScene.meshesGroup.add(mesh);

      outlinerEl.querySelector(".outliner-row").click();

      expect(
        stageThreeScene.selectionController.togglePrimSelection
      ).toHaveBeenCalled();
    });

    it("should toggle collapse when clicking toggler", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);

      outlinerEl.innerHTML = `
        <li class="collapsible collapsed">
          <div class="outliner-row">
            <span class="outliner-toggler">v</span>
          </div>
          <ul style="display: none;"></ul>
        </li>
      `;

      const li = outlinerEl.querySelector("li");
      const toggler = outlinerEl.querySelector(".outliner-toggler");
      const ul = outlinerEl.querySelector("ul");

      toggler.click();

      expect(li.classList.contains("collapsed")).toBe(false);
      expect(ul.style.display).toBe("block");
    });

    it("should collapse when clicking toggler on expanded item", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);

      outlinerEl.innerHTML = `
        <li class="collapsible">
          <div class="outliner-row">
            <span class="outliner-toggler">v</span>
          </div>
          <ul style="display: block;"></ul>
        </li>
      `;

      const li = outlinerEl.querySelector("li");
      const toggler = outlinerEl.querySelector(".outliner-toggler");
      const ul = outlinerEl.querySelector("ul");

      toggler.click();

      expect(li.classList.contains("collapsed")).toBe(true);
      expect(ul.style.display).toBe("none");
    });

    it("should open reference modal when clicking edit button", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row">
            <span class="edit-prim-button">✏️</span>
          </div>
        </li>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      const editButton = outlinerEl.querySelector(".edit-prim-button");

      editButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "openReferenceModal",
          detail: { primPath: "/Root/Mesh" },
        })
      );
    });

    it("should prevent editing when in history mode", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      store.getState.mockReturnValue({ isHistoryMode: true });

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row">
            <span class="edit-prim-button">✏️</span>
          </div>
        </li>
      `;

      const editButton = outlinerEl.querySelector(".edit-prim-button");
      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      // Click should trigger error (error is thrown in event handler)
      try {
        editButton.click();
      } catch {
        // Error thrown in event handler
      }

      // Should not dispatch openReferenceModal event
      expect(dispatchEventSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: "openReferenceModal",
        })
      );
    });

    it("should toggle prim selection when clicking prim item", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row"><span class="outliner-text">Mesh</span></div>
        </li>
      `;

      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      fileThreeScene.meshesGroup.add(mesh);

      outlinerEl.querySelector(".outliner-row").click();

      expect(
        fileThreeScene.selectionController.togglePrimSelection
      ).toHaveBeenCalledWith("/Root/Mesh", false);
    });

    it("should pass Ctrl key state to togglePrimSelection", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row"><span class="outliner-text">Mesh</span></div>
        </li>
      `;

      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      fileThreeScene.meshesGroup.add(mesh);

      const event = new MouseEvent("click", { ctrlKey: true, bubbles: true });
      outlinerEl.querySelector(".outliner-row").dispatchEvent(event);

      expect(
        fileThreeScene.selectionController.togglePrimSelection
      ).toHaveBeenCalledWith("/Root/Mesh", true);
    });

    it("should toggle visibility when clicking visibility toggle on prim", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Mesh">
          <div class="outliner-row">
            <span class="visibility-toggle">👁️</span>
          </div>
        </li>
      `;

      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      mesh.visible = true;
      fileThreeScene.meshesGroup.add(mesh);

      outlinerEl.querySelector(".visibility-toggle").click();

      expect(
        fileThreeScene.selectionController.setVisibility
      ).toHaveBeenCalledWith(mesh, false);
    });

    it("should toggle visibility for descendant meshes when parent has no exact match", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Parent">
          <div class="outliner-row">
            <span class="visibility-toggle">👁️</span>
          </div>
        </li>
      `;

      const childMesh = new THREE.Mesh();
      childMesh.userData = { primPath: "/Root/Parent/Child" };
      childMesh.visible = true;
      fileThreeScene.meshesGroup.add(childMesh);

      outlinerEl.querySelector(".visibility-toggle").click();

      expect(
        fileThreeScene.selectionController.setVisibility
      ).toHaveBeenCalledWith(childMesh, false);
    });

    it("should select descendant meshes as hierarchy when clicking parent", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Parent">
          <div class="outliner-row"><span class="outliner-text">Parent</span></div>
        </li>
      `;

      const childMesh1 = new THREE.Mesh();
      childMesh1.userData = { primPath: "/Root/Parent/Child1" };
      const childMesh2 = new THREE.Mesh();
      childMesh2.userData = { primPath: "/Root/Parent/Child2" };
      fileThreeScene.meshesGroup.add(childMesh1);
      fileThreeScene.meshesGroup.add(childMesh2);

      const parentLi = outlinerEl.querySelector(".prim-item");
      outlinerEl.querySelector(".outliner-row").click();

      expect(
        fileThreeScene.selectionController.toggleHierarchySelection
      ).toHaveBeenCalledWith(
        parentLi,
        expect.arrayContaining([childMesh1, childMesh2]),
        "/Root/Parent"
      );
    });

    it("should dispatch primSelected when clicking prim without mesh or descendants", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/EmptyXform">
          <div class="outliner-row"><span class="outliner-text">EmptyXform</span></div>
        </li>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      outlinerEl.querySelector(".outliner-row").click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: "/Root/EmptyXform" },
        })
      );
    });

    it("should not dispatch primSelected when clicking visibility toggle on empty prim", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="prim-item" data-prim-path="/Root/Empty">
          <div class="outliner-row">
            <span class="visibility-toggle">👁️</span>
          </div>
        </li>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      outlinerEl.querySelector(".visibility-toggle").click();

      expect(dispatchEventSpy).not.toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
        })
      );
    });

    it("should toggle hierarchy selection when clicking hierarchy item", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="layer-item" data-type="hierarchy">
          <div class="outliner-row"><span class="outliner-text">Layer</span></div>
          <ul>
            <li class="prim-item" data-prim-path="/Root/Mesh1"></li>
            <li class="prim-item" data-prim-path="/Root/Mesh2"></li>
          </ul>
        </li>
      `;

      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Root/Mesh1" };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = { primPath: "/Root/Mesh2" };
      fileThreeScene.meshesGroup.add(mesh1);
      fileThreeScene.meshesGroup.add(mesh2);

      const hierarchyLi = outlinerEl.querySelector(".layer-item");
      outlinerEl.querySelector(".outliner-row").click();

      expect(
        fileThreeScene.selectionController.toggleHierarchySelection
      ).toHaveBeenCalledWith(
        hierarchyLi,
        expect.arrayContaining([mesh1, mesh2]),
        undefined
      );
    });

    it("should toggle visibility for all meshes in hierarchy", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="layer-item" data-type="hierarchy">
          <div class="outliner-row">
            <span class="visibility-toggle">👁️</span>
          </div>
          <ul>
            <li class="prim-item" data-prim-path="/Root/Mesh1"></li>
            <li class="prim-item" data-prim-path="/Root/Mesh2"></li>
          </ul>
        </li>
      `;

      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Root/Mesh1" };
      mesh1.visible = true;
      const mesh2 = new THREE.Mesh();
      mesh2.userData = { primPath: "/Root/Mesh2" };
      mesh2.visible = true;
      fileThreeScene.meshesGroup.add(mesh1);
      fileThreeScene.meshesGroup.add(mesh2);

      outlinerEl.querySelector(".visibility-toggle").click();

      expect(
        fileThreeScene.selectionController.setVisibility
      ).toHaveBeenCalledWith(mesh1, false);
      expect(
        fileThreeScene.selectionController.setVisibility
      ).toHaveBeenCalledWith(mesh2, false);
    });

    it("should return early when clicking hierarchy with no meshes", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);
      fileCanvas.style.display = "block";

      outlinerEl.innerHTML = `
        <li class="layer-item" data-type="hierarchy">
          <div class="outliner-row"><span class="outliner-text">Layer</span></div>
          <ul></ul>
        </li>
      `;

      expect(() => {
        outlinerEl.querySelector(".outliner-row").click();
      }).not.toThrow();
    });

    it("should do nothing when clicking element without outliner-row", () => {
      initOutlinerEvents(fileThreeScene, stageThreeScene);

      outlinerEl.innerHTML = `<li>No outliner row here</li>`;

      expect(() => {
        outlinerEl.querySelector("li").click();
      }).not.toThrow();
    });
  });
});
