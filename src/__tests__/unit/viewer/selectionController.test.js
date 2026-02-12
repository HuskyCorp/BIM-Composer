/**
 * SelectionController Unit Tests
 * Tests for 3D mesh selection, outliner highlighting, and visibility management
 */

import { SelectionController } from "../../../viewer/selectionController.js";
import * as THREE from "three";
import { store } from "../../../core/index.js";

// Mock store
vi.mock("../../../core/index.js", () => ({
  store: {
    getState: vi.fn(),
    dispatch: vi.fn(),
  },
}));

describe("SelectionController", () => {
  let controller;
  let mockCamera;
  let mockRenderer;
  let mockMeshesGroup;
  let mockScene;
  let mockCanvas;
  let renameButton;
  let sendToStageButton;
  let entitySceneButton;

  beforeEach(() => {
    // Set up DOM elements
    document.body.innerHTML = `
      <button id="rename-object-button"></button>
      <button id="send-to-stage-button"></button>
      <button id="entity-scene-button"></button>
      <canvas></canvas>
      <ul id="usdaOutliner"></ul>
    `;

    renameButton = document.getElementById("rename-object-button");
    sendToStageButton = document.getElementById("send-to-stage-button");
    entitySceneButton = document.getElementById("entity-scene-button");

    // Mock Three.js objects
    mockCamera = new THREE.PerspectiveCamera();
    mockRenderer = {
      domElement: document.querySelector("canvas"),
      render: vi.fn(),
    };
    mockMeshesGroup = new THREE.Group();
    mockScene = new THREE.Scene();
    mockCanvas = document.querySelector("canvas");

    // Mock store
    store.getState.mockReturnValue({
      currentFile: "test.usda",
      viewType: "file",
    });

    // Initialize controller
    controller = new SelectionController(
      mockCamera,
      mockRenderer,
      mockMeshesGroup,
      mockScene,
      mockCanvas,
      "file"
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Constructor and initialization", () => {
    it("should initialize with correct properties", () => {
      expect(controller.camera).toBe(mockCamera);
      expect(controller.renderer).toBe(mockRenderer);
      expect(controller.meshesGroup).toBe(mockMeshesGroup);
      expect(controller.scene).toBe(mockScene);
      expect(controller.canvas).toBe(mockCanvas);
      expect(controller.viewType).toBe("file");
      expect(controller.raycaster).toBeInstanceOf(THREE.Raycaster);
      expect(controller.mouse).toBeInstanceOf(THREE.Vector2);
      expect(controller.selectedMeshes).toBeInstanceOf(Set);
      expect(controller.selectedOutlinerElements).toBeInstanceOf(Set);
      expect(controller.activeMesh).toBeNull();
    });

    it("should attach mousedown event listener to renderer", () => {
      const addEventListenerSpy = vi.spyOn(
        mockRenderer.domElement,
        "addEventListener"
      );
      new SelectionController(
        mockCamera,
        mockRenderer,
        mockMeshesGroup,
        mockScene,
        mockCanvas,
        "file"
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "mousedown",
        expect.any(Function),
        false
      );
    });

    it("should attach click event to rename button", () => {
      const addEventListenerSpy = vi.spyOn(renameButton, "addEventListener");
      new SelectionController(
        mockCamera,
        mockRenderer,
        mockMeshesGroup,
        mockScene,
        mockCanvas,
        "stage"
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function)
      );
    });

    it("should attach click event to sendToStage button", () => {
      const addEventListenerSpy = vi.spyOn(
        sendToStageButton,
        "addEventListener"
      );
      new SelectionController(
        mockCamera,
        mockRenderer,
        mockMeshesGroup,
        mockScene,
        mockCanvas,
        "file"
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function)
      );
    });

    it("should attach click event to entityScene button if it exists", () => {
      const addEventListenerSpy = vi.spyOn(
        entitySceneButton,
        "addEventListener"
      );
      new SelectionController(
        mockCamera,
        mockRenderer,
        mockMeshesGroup,
        mockScene,
        mockCanvas,
        "file"
      );
      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "click",
        expect.any(Function)
      );
    });
  });

  describe("Rename button click handler", () => {
    it("should not open modal when canvas is hidden", () => {
      mockCanvas.style.display = "none";
      renameButton.dataset.primPath = "/Root/Mesh";

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      renameButton.click();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("should open reference modal when canvas is visible and primPath exists", () => {
      mockCanvas.style.display = "block";
      renameButton.dataset.primPath = "/Root/Mesh";

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      renameButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "openReferenceModal",
          detail: { primPath: "/Root/Mesh" },
        })
      );
    });

    it("should not open modal when primPath is missing", () => {
      mockCanvas.style.display = "block";
      delete renameButton.dataset.primPath;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      renameButton.click();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });
  });

  describe("Modal opening handlers (sendToStage and entityScene)", () => {
    it("should not open modal when canvas is hidden", () => {
      mockCanvas.style.display = "none";

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
    });

    it("should use currentFile from store when no active mesh", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "default.usda" });

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "openPrimModal",
          detail: expect.objectContaining({
            fileName: "default.usda",
            mode: "normal",
          }),
        })
      );
    });

    it("should prioritize activeMesh originFile over currentFile", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "default.usda" });

      const mockMesh = new THREE.Mesh();
      mockMesh.userData = { originFile: "specific.usda", primPath: "/Root" };
      controller.activeMesh = mockMesh;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            fileName: "specific.usda",
          }),
        })
      );
    });

    it("should collect selected prim paths and pass them to modal", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Root/Mesh1" };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = { primPath: "/Root/Mesh2" };

      controller.selectedMeshes.add(mesh1);
      controller.selectedMeshes.add(mesh2);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            preSelectedItems: expect.arrayContaining([
              expect.objectContaining({ primPath: "/Root/Mesh1" }),
              expect.objectContaining({ primPath: "/Root/Mesh2" }),
            ]),
          }),
        })
      );
    });

    it("should filter out meshes without primPath", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Root/Mesh1" };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = {}; // No primPath

      controller.selectedMeshes.add(mesh1);
      controller.selectedMeshes.add(mesh2);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            preSelectedItems: expect.arrayContaining([
              expect.objectContaining({ primPath: "/Root/Mesh1" }),
            ]),
          }),
        })
      );
    });

    it("should include parent object when mesh has parent with primPath", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      const parent = new THREE.Group();
      parent.name = "Slab";
      parent.userData = { primPath: "/Slab", originFile: "test.usda" };

      const mesh = new THREE.Mesh();
      mesh.name = "Mesh";
      mesh.userData = { primPath: "/Slab/Mesh", originFile: "test.usda" };
      parent.add(mesh); // Establish hierarchy

      controller.selectedMeshes.add(mesh);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      // Expect specific item structure
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            preSelectedItems: expect.arrayContaining([
              expect.objectContaining({ primPath: "/Slab/Mesh", type: "Mesh" }),
              expect.objectContaining({ primPath: "/Slab", type: "Group" }),
            ]),
          }),
        })
      );
    });

    it("should derive parent from path when mesh parent lacks metadata", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      // Parent exists but has no userData
      const parent = new THREE.Group();
      parent.name = "SlabNode";

      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Slab/Mesh", originFile: "test.usda" };
      parent.add(mesh);

      controller.selectedMeshes.add(mesh);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            preSelectedItems: expect.arrayContaining([
              expect.objectContaining({ primPath: "/Slab/Mesh" }),
              // Should derive parent "/Slab" from "/Slab/Mesh"
              expect.objectContaining({ primPath: "/Slab", name: "Slab" }),
            ]),
          }),
        })
      );
    });

    it("should deduplicate parents when multiple meshes share same parent", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Slab/Mesh1", originFile: "test.usda" };

      const mesh2 = new THREE.Mesh();
      mesh2.userData = { primPath: "/Slab/Mesh2", originFile: "test.usda" };

      controller.selectedMeshes.add(mesh1);
      controller.selectedMeshes.add(mesh2);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      const callArgs = dispatchEventSpy.mock.calls[0][0];
      const items = callArgs.detail.preSelectedItems;

      // Should have Mesh1, Mesh2, and exactly one "/Slab" parent
      const parents = items.filter((i) => i.primPath === "/Slab");
      expect(parents.length).toBe(1);
      expect(items.length).toBe(3); // Mesh1 + Mesh2 + Parent
    });

    it("should open modal with 'normal' mode for sendToStage button", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            mode: "normal",
          }),
        })
      );
    });

    it("should open modal with 'entity' mode for entityScene button", () => {
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: "test.usda" });

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      entitySceneButton.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            mode: "entity",
          }),
        })
      );
    });

    it("should warn when no file is available", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();
      mockCanvas.style.display = "block";
      store.getState.mockReturnValue({ currentFile: null });
      controller.activeMesh = null;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      sendToStageButton.click();

      expect(dispatchEventSpy).not.toHaveBeenCalled();
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "No active file to open prim modal for."
      );
    });
  });

  describe("update() - Button visibility and positioning", () => {
    it("should hide all buttons when canvas is hidden and viewType is stage", () => {
      controller.viewType = "stage";
      mockCanvas.style.display = "none";

      controller.update();

      expect(renameButton.style.display).toBe("none");
    });

    it("should hide all buttons when canvas is hidden and viewType is file", () => {
      controller.viewType = "file";
      mockCanvas.style.display = "none";

      controller.update();

      expect(sendToStageButton.style.display).toBe("none");
      expect(entitySceneButton.style.display).toBe("none");
    });

    it("should hide all buttons when no meshes are selected", () => {
      mockCanvas.style.display = "block";
      controller.selectedMeshes.clear();

      controller.update();

      expect(renameButton.style.display).toBe("none");
      expect(sendToStageButton.style.display).toBe("none");
      expect(entitySceneButton.style.display).toBe("none");
    });

    it("should hide buttons when selected meshes are not visible", () => {
      mockCanvas.style.display = "block";
      const mesh = new THREE.Mesh(new THREE.BoxGeometry());
      mesh.visible = false;
      controller.selectedMeshes.add(mesh);

      controller.update();

      expect(renameButton.style.display).toBe("none");
      expect(sendToStageButton.style.display).toBe("none");
    });

    it("should show rename button in stage view with visible selected mesh", () => {
      controller.viewType = "stage";
      mockCanvas.style.display = "block";

      const mesh = new THREE.Mesh(new THREE.BoxGeometry());
      mesh.visible = true;
      mesh.position.set(0, 0, 0);
      controller.selectedMeshes.add(mesh);

      // Mock getBoundingClientRect
      mockRenderer.domElement.getBoundingClientRect = vi
        .fn()
        .mockReturnValue({ width: 800, height: 600 });

      controller.update();

      expect(renameButton.style.display).toBe("flex");
      expect(sendToStageButton.style.display).toBe("none");
      expect(entitySceneButton.style.display).toBe("none");
    });

    it("should show sendToStage and entityScene buttons in file view", () => {
      controller.viewType = "file";
      mockCanvas.style.display = "block";

      const mesh = new THREE.Mesh(new THREE.BoxGeometry());
      mesh.visible = true;
      controller.selectedMeshes.add(mesh);

      mockRenderer.domElement.getBoundingClientRect = vi
        .fn()
        .mockReturnValue({ width: 800, height: 600 });

      controller.update();

      expect(sendToStageButton.style.display).toBe("flex");
      expect(entitySceneButton.style.display).toBe("flex");
      expect(renameButton.style.display).toBe("none");
    });

    it("should show buttons in file view with visible selected mesh", () => {
      controller.viewType = "file";
      mockCanvas.style.display = "block";

      const geometry = new THREE.BoxGeometry(1, 2, 1);
      const mesh = new THREE.Mesh(geometry);
      mesh.visible = true;
      mesh.position.set(0, 0, 0);
      mesh.updateMatrixWorld(true);
      controller.selectedMeshes.add(mesh);

      mockRenderer.domElement.getBoundingClientRect = vi
        .fn()
        .mockReturnValue({ width: 800, height: 600, left: 0, top: 0 });

      controller.update();

      // Buttons should be displayed in file view
      expect(sendToStageButton.style.display).toBe("flex");
      expect(entitySceneButton.style.display).toBe("flex");
      expect(renameButton.style.display).toBe("none");
    });
  });

  describe("setVisibility()", () => {
    it("should set mesh visibility to true", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      mesh.visible = false;

      controller.setVisibility(mesh, true);

      expect(mesh.visible).toBe(true);
      expect(mockRenderer.render).toHaveBeenCalled();
    });

    it("should set mesh visibility to false", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      mesh.visible = true;

      controller.setVisibility(mesh, false);

      expect(mesh.visible).toBe(false);
      expect(mockRenderer.render).toHaveBeenCalled();
    });

    it("should update outliner element eye icon when visible", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `
        <li data-prim-path="/Root/Mesh">
          <span class="visibility-toggle">➖</span>
        </li>
      `;

      controller.setVisibility(mesh, true);

      const eyeIcon = outliner.querySelector(".visibility-toggle");
      expect(eyeIcon.textContent).toBe("👁️");
      expect(eyeIcon.classList.contains("hidden-item")).toBe(false);
    });

    it("should update outliner element eye icon when hidden", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `
        <li data-prim-path="/Root/Mesh">
          <span class="visibility-toggle">👁️</span>
        </li>
      `;

      controller.setVisibility(mesh, false);

      const eyeIcon = outliner.querySelector(".visibility-toggle");
      expect(eyeIcon.textContent).toBe("➖");
      expect(eyeIcon.classList.contains("hidden-item")).toBe(true);
    });

    it("should handle missing outliner element gracefully", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/NonExistent" };

      expect(() => {
        controller.setVisibility(mesh, true);
      }).not.toThrow();
    });
  });

  describe("clearSelection()", () => {
    it("should restore original materials to selected meshes", () => {
      const mesh1 = new THREE.Mesh();
      const originalMaterial = new THREE.MeshBasicMaterial();
      mesh1.userData = { originalMaterial };
      mesh1.material = new THREE.MeshStandardMaterial({ color: 0x007aff });

      controller.selectedMeshes.add(mesh1);
      controller.clearSelection();

      expect(mesh1.material).toBe(originalMaterial);
    });

    it("should remove selected class from outliner elements", () => {
      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `<li class="selected"></li>`;
      const element = outliner.querySelector("li");

      controller.selectedOutlinerElements.add(element);
      controller.clearSelection();

      expect(element.classList.contains("selected")).toBe(false);
    });

    it("should clear selectedMeshes set", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { originalMaterial: new THREE.MeshBasicMaterial() };
      controller.selectedMeshes.add(mesh);

      controller.clearSelection();

      expect(controller.selectedMeshes.size).toBe(0);
    });

    it("should clear selectedOutlinerElements set", () => {
      const element = document.createElement("li");
      controller.selectedOutlinerElements.add(element);

      controller.clearSelection();

      expect(controller.selectedOutlinerElements.size).toBe(0);
    });

    it("should reset activeMesh to null", () => {
      controller.activeMesh = new THREE.Mesh();

      controller.clearSelection();

      expect(controller.activeMesh).toBeNull();
    });

    it("should dispatch primSelected event with null", () => {
      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      controller.clearSelection();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: null },
        })
      );
    });

    it("should trigger re-render", () => {
      controller.clearSelection();

      expect(mockRenderer.render).toHaveBeenCalledWith(mockScene, mockCamera);
    });
  });

  describe("highlightElement()", () => {
    it("should add selected class when highlighting", () => {
      const element = document.createElement("li");

      controller.highlightElement(element, true);

      expect(element.classList.contains("selected")).toBe(true);
      expect(controller.selectedOutlinerElements.has(element)).toBe(true);
    });

    it("should remove selected class when unhighlighting", () => {
      const element = document.createElement("li");
      element.classList.add("selected");
      controller.selectedOutlinerElements.add(element);

      controller.highlightElement(element, false);

      expect(element.classList.contains("selected")).toBe(false);
      expect(controller.selectedOutlinerElements.has(element)).toBe(false);
    });

    it("should expand parent collapsible elements when highlighting", () => {
      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `
        <li class="collapsible collapsed">
          <ul style="display: none;">
            <li id="child-element"></li>
          </ul>
        </li>
      `;

      const childElement = document.getElementById("child-element");
      const parentLi = outliner.querySelector(".collapsible");
      const parentUl = parentLi.querySelector("ul");

      controller.highlightElement(childElement, true);

      expect(parentUl.style.display).toBe("block");
      expect(parentLi.classList.contains("collapsed")).toBe(false);
    });

    it("should warn when called with null element", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      controller.highlightElement(null, true);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[SELECTION] highlightElement called with null/undefined element"
      );
    });

    it("should handle element without parents gracefully", () => {
      const element = document.createElement("li");

      expect(() => {
        controller.highlightElement(element, true);
      }).not.toThrow();
    });

    it("should stop traversing at usdaOutliner root", () => {
      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `<li id="child"></li>`;
      const child = document.getElementById("child");

      controller.highlightElement(child, true);

      expect(child.classList.contains("selected")).toBe(true);
    });
  });

  describe("togglePrimSelection()", () => {
    it("should warn when called with null primPath", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      controller.togglePrimSelection(null, false);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[SELECTION] togglePrimSelection called with null/undefined primPath"
      );
    });

    it("should select mesh and highlight outliner element", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `<li data-prim-path="/Root/Mesh"></li>`;

      controller.togglePrimSelection("/Root/Mesh", false);

      expect(controller.selectedMeshes.has(mesh)).toBe(true);
      expect(mesh.material).toBeInstanceOf(THREE.MeshStandardMaterial);
      expect(mesh.material.color.getHex()).toBe(0x007aff);
      expect(controller.activeMesh).toBe(mesh);
    });

    it("should clear previous selection when not holding Ctrl", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh1);

      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Mesh2",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh2);

      controller.selectedMeshes.add(mesh1);
      controller.togglePrimSelection("/Root/Mesh2", false);

      expect(controller.selectedMeshes.has(mesh1)).toBe(false);
      expect(controller.selectedMeshes.has(mesh2)).toBe(true);
    });

    it("should keep previous selection when holding Ctrl", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh1);
      controller.selectedMeshes.add(mesh1);

      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Mesh2",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh2);

      controller.togglePrimSelection("/Root/Mesh2", true);

      expect(controller.selectedMeshes.has(mesh1)).toBe(true);
      expect(controller.selectedMeshes.has(mesh2)).toBe(true);
    });

    it("should deselect mesh when already selected and holding Ctrl", () => {
      const mesh = new THREE.Mesh();
      const originalMaterial = new THREE.MeshBasicMaterial();
      mesh.userData = { primPath: "/Root/Mesh", originalMaterial };
      mesh.material = new THREE.MeshStandardMaterial({ color: 0x007aff });
      mockMeshesGroup.add(mesh);

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `<li data-prim-path="/Root/Mesh" class="selected"></li>`;
      const element = outliner.querySelector("li");
      controller.selectedOutlinerElements.add(element);
      controller.selectedMeshes.add(mesh);
      controller.activeMesh = mesh;

      controller.togglePrimSelection("/Root/Mesh", true);

      expect(controller.selectedMeshes.has(mesh)).toBe(false);
      expect(mesh.material).toBe(originalMaterial);
    });

    it("should find mesh by exact primPath match", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      controller.togglePrimSelection("/Root/Mesh", false);

      expect(controller.selectedMeshes.has(mesh)).toBe(true);
    });

    it("should find mesh by child primPath (startsWith)", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Parent/Mesh_123",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      controller.togglePrimSelection("/Root/Parent", false);

      expect(controller.selectedMeshes.has(mesh)).toBe(true);
    });

    it("should warn when mesh not found", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      controller.togglePrimSelection("/NonExistent", false);

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        "[SELECTION] Mesh not found for primPath:",
        "/NonExistent"
      );
    });

    it("should work without outliner element (file view)", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      controller.togglePrimSelection("/Root/Mesh", false);

      expect(controller.selectedMeshes.has(mesh)).toBe(true);
      expect(controller.activeMesh).toBe(mesh);
    });

    it("should highlight parent xform-item or prim-item", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `
        <div class="xform-item">
          <li data-prim-path="/Root/Mesh"></li>
        </div>
      `;
      const parentDiv = outliner.querySelector(".xform-item");

      controller.togglePrimSelection("/Root/Mesh", false);

      expect(parentDiv.classList.contains("selected")).toBe(true);
    });

    it("should update renameButton dataset with primPath", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      controller.togglePrimSelection("/Root/Mesh", false);

      expect(renameButton.dataset.primPath).toBe("/Root/Mesh");
    });

    it("should dispatch primSelected event", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      controller.togglePrimSelection("/Root/Mesh", false);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: "/Root/Mesh" },
        })
      );
    });

    it("should update activeMesh when deselecting current active", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Mesh2",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh1);
      mockMeshesGroup.add(mesh2);

      controller.selectedMeshes.add(mesh1);
      controller.selectedMeshes.add(mesh2);
      controller.activeMesh = mesh2;

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `
        <li data-prim-path="/Root/Mesh1"></li>
        <li data-prim-path="/Root/Mesh2" class="selected"></li>
      `;
      const element2 = outliner.querySelector('[data-prim-path="/Root/Mesh2"]');
      controller.selectedOutlinerElements.add(element2);

      controller.togglePrimSelection("/Root/Mesh2", true);

      expect(controller.activeMesh).toBe(mesh1);
    });
  });

  describe("toggleHierarchySelection()", () => {
    it("should select all child meshes and highlight parent", () => {
      const parentLi = document.createElement("li");
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Child1",
        originalMaterial: new THREE.MeshBasicMaterial(),
        outlinerElement: document.createElement("li"),
      };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Child2",
        originalMaterial: new THREE.MeshBasicMaterial(),
        outlinerElement: document.createElement("li"),
      };

      controller.toggleHierarchySelection(
        parentLi,
        [mesh1, mesh2],
        "/Root/Parent"
      );

      expect(controller.selectedMeshes.has(mesh1)).toBe(true);
      expect(controller.selectedMeshes.has(mesh2)).toBe(true);
      expect(mesh1.material.color.getHex()).toBe(0x007aff);
      expect(mesh2.material.color.getHex()).toBe(0x007aff);
      expect(parentLi.classList.contains("selected")).toBe(true);
    });

    it("should set activeMesh to last child mesh", () => {
      const parentLi = document.createElement("li");
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        originalMaterial: new THREE.MeshBasicMaterial(),
        outlinerElement: document.createElement("li"),
      };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Child2",
        originalMaterial: new THREE.MeshBasicMaterial(),
        outlinerElement: document.createElement("li"),
      };

      controller.toggleHierarchySelection(parentLi, [mesh1, mesh2], "/Root");

      expect(controller.activeMesh).toBe(mesh2);
      expect(renameButton.dataset.primPath).toBe("/Root/Child2");
    });

    it("should handle empty child_meshes array", () => {
      const parentLi = document.createElement("li");

      controller.toggleHierarchySelection(parentLi, [], "/Root");

      expect(controller.activeMesh).toBeNull();
    });

    it("should dispatch primSelected with parent primPath", () => {
      const parentLi = document.createElement("li");
      const mesh = new THREE.Mesh();
      mesh.userData = {
        originalMaterial: new THREE.MeshBasicMaterial(),
        outlinerElement: document.createElement("li"),
      };

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      controller.toggleHierarchySelection(parentLi, [mesh], "/Root/Parent");

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: "/Root/Parent" },
        })
      );
    });

    it("should clear previous selection before selecting new hierarchy", () => {
      const previousMesh = new THREE.Mesh();
      previousMesh.userData = {
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      controller.selectedMeshes.add(previousMesh);

      const parentLi = document.createElement("li");
      const newMesh = new THREE.Mesh();
      newMesh.userData = {
        originalMaterial: new THREE.MeshBasicMaterial(),
        outlinerElement: document.createElement("li"),
      };

      controller.toggleHierarchySelection(parentLi, [newMesh], "/Root");

      expect(controller.selectedMeshes.has(previousMesh)).toBe(false);
      expect(controller.selectedMeshes.has(newMesh)).toBe(true);
    });
  });

  describe("selectPrims()", () => {
    it("should select multiple prims by paths", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Mesh2",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh1);
      mockMeshesGroup.add(mesh2);

      controller.selectPrims(["/Root/Mesh1", "/Root/Mesh2"]);

      expect(controller.selectedMeshes.has(mesh1)).toBe(true);
      expect(controller.selectedMeshes.has(mesh2)).toBe(true);
    });

    it("should handle empty primPaths array", () => {
      controller.selectPrims([]);

      expect(controller.selectedMeshes.size).toBe(0);
    });

    it("should handle null primPaths", () => {
      controller.selectPrims(null);

      expect(controller.selectedMeshes.size).toBe(0);
    });

    it("should highlight outliner elements for all selected prims", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Root/Mesh1" };
      mockMeshesGroup.add(mesh1);

      const outliner = document.getElementById("usdaOutliner");
      outliner.innerHTML = `
        <li data-prim-path="/Root/Mesh1"></li>
      `;

      controller.selectPrims(["/Root/Mesh1"]);

      const element = outliner.querySelector("li");
      expect(element.classList.contains("selected")).toBe(true);
    });

    it("should set last mesh as activeMesh", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = { primPath: "/Root/Mesh1" };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = { primPath: "/Root/Mesh2" };
      mockMeshesGroup.add(mesh1);
      mockMeshesGroup.add(mesh2);

      controller.selectPrims(["/Root/Mesh1", "/Root/Mesh2"]);

      expect(controller.activeMesh).toBe(mesh2);
    });

    it("should dispatch primSelected for activeMesh", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh" };
      mockMeshesGroup.add(mesh);

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      controller.selectPrims(["/Root/Mesh"]);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: "/Root/Mesh" },
        })
      );
    });

    it("should skip non-existent paths gracefully", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { primPath: "/Root/Mesh1" };
      mockMeshesGroup.add(mesh);

      controller.selectPrims(["/Root/Mesh1", "/NonExistent"]);

      expect(controller.selectedMeshes.has(mesh)).toBe(true);
      expect(controller.selectedMeshes.size).toBe(1);
    });

    it("should clear previous selection before selecting new prims", () => {
      const oldMesh = new THREE.Mesh();
      oldMesh.userData = {
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      controller.selectedMeshes.add(oldMesh);

      const newMesh = new THREE.Mesh();
      newMesh.userData = { primPath: "/Root/New" };
      mockMeshesGroup.add(newMesh);

      controller.selectPrims(["/Root/New"]);

      expect(controller.selectedMeshes.has(oldMesh)).toBe(false);
      expect(controller.selectedMeshes.has(newMesh)).toBe(true);
    });
  });

  describe("onMouseDown() - Raycasting", () => {
    beforeEach(() => {
      // Mock getBoundingClientRect for mouse position calculation
      mockRenderer.domElement.getBoundingClientRect = vi.fn().mockReturnValue({
        left: 0,
        top: 0,
        width: 800,
        height: 600,
      });
    });

    it("should not handle events from other elements", () => {
      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
      });
      Object.defineProperty(event, "target", {
        value: document.createElement("div"),
      });

      const clearSelectionSpy = vi.spyOn(controller, "clearSelection");

      controller.onMouseDown(event);

      expect(clearSelectionSpy).not.toHaveBeenCalled();
    });

    it("should select mesh on click", () => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial()
      );
      mesh.userData = {
        primPath: "/Root/Mesh",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh);

      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
        bubbles: true,
      });
      Object.defineProperty(event, "target", {
        value: mockRenderer.domElement,
        writable: false,
      });

      // Mock raycaster to return intersection
      vi.spyOn(controller.raycaster, "intersectObjects").mockReturnValue([
        { object: mesh, distance: 1 },
      ]);

      controller.onMouseDown(event);

      expect(controller.selectedMeshes.has(mesh)).toBe(true);
    });

    it("should clear selection when clicking empty space without Ctrl", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { originalMaterial: new THREE.MeshBasicMaterial() };
      controller.selectedMeshes.add(mesh);

      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
      });
      Object.defineProperty(event, "target", {
        value: mockRenderer.domElement,
      });

      vi.spyOn(controller.raycaster, "intersectObjects").mockReturnValue([]);

      controller.onMouseDown(event);

      expect(controller.selectedMeshes.size).toBe(0);
    });

    it("should not clear selection when clicking empty space with Ctrl", () => {
      const mesh = new THREE.Mesh();
      mesh.userData = { originalMaterial: new THREE.MeshBasicMaterial() };
      controller.selectedMeshes.add(mesh);

      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
        ctrlKey: true,
      });
      Object.defineProperty(event, "target", {
        value: mockRenderer.domElement,
      });

      vi.spyOn(controller.raycaster, "intersectObjects").mockReturnValue([]);

      controller.onMouseDown(event);

      expect(controller.selectedMeshes.size).toBe(1);
    });

    it("should traverse up hierarchy to find mesh with primPath", () => {
      const parentMesh = new THREE.Mesh();
      parentMesh.userData = {
        primPath: "/Root/Parent",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      const childMesh = new THREE.Mesh();
      parentMesh.add(childMesh);
      mockMeshesGroup.add(parentMesh);

      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
      });
      Object.defineProperty(event, "target", {
        value: mockRenderer.domElement,
      });

      vi.spyOn(controller.raycaster, "intersectObjects").mockReturnValue([
        { object: childMesh, distance: 1 },
      ]);

      controller.onMouseDown(event);

      expect(controller.selectedMeshes.has(parentMesh)).toBe(true);
    });

    it("should handle metaKey (Mac Cmd) as Ctrl", () => {
      const mesh1 = new THREE.Mesh();
      mesh1.userData = {
        primPath: "/Root/Mesh1",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      const mesh2 = new THREE.Mesh();
      mesh2.userData = {
        primPath: "/Root/Mesh2",
        originalMaterial: new THREE.MeshBasicMaterial(),
      };
      mockMeshesGroup.add(mesh1);
      mockMeshesGroup.add(mesh2);

      controller.selectedMeshes.add(mesh1);

      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
        metaKey: true,
      });
      Object.defineProperty(event, "target", {
        value: mockRenderer.domElement,
      });

      vi.spyOn(controller.raycaster, "intersectObjects").mockReturnValue([
        { object: mesh2, distance: 1 },
      ]);

      controller.onMouseDown(event);

      expect(controller.selectedMeshes.has(mesh1)).toBe(true);
      expect(controller.selectedMeshes.has(mesh2)).toBe(true);
    });

    it("should stop traversing at scene or meshesGroup", () => {
      const childMesh = new THREE.Mesh();
      mockScene.add(childMesh);

      const event = new MouseEvent("mousedown", {
        clientX: 400,
        clientY: 300,
      });
      Object.defineProperty(event, "target", {
        value: mockRenderer.domElement,
      });

      vi.spyOn(controller.raycaster, "intersectObjects").mockReturnValue([
        { object: childMesh, distance: 1 },
      ]);

      expect(() => {
        controller.onMouseDown(event);
      }).not.toThrow();
    });
  });
});
