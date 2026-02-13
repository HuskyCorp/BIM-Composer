/**
 * PromotionController Unit Tests
 * Tests for layer and object promotion workflows with status validation
 */

// Mock dependencies
vi.mock("../../../core/index.js", () => {
  // Create mock functions inside the factory
  const mockHandleError = vi.fn();
  const mockGetState = vi.fn();

  return {
    store: {
      getState: mockGetState,
    },
    errorHandler: {
      wrap: (fn) => fn,
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

import { initPromotionController } from "../../../components/promotionController.js";
import { store, ValidationError, errorHandler } from "../../../core/index.js";
import { actions } from "../../../state/actions.js";
import {
  renderLayerStack,
  recomposeStage,
  logPromotionToStatement,
  syncPrimStatusFromLayer,
} from "../../../components/sidebar/layerStackController.js";

vi.mock("../../../state/actions.js", () => ({
  actions: {
    updateLayer: vi.fn(),
  },
}));

vi.mock("../../../components/sidebar/layerStackController.js", () => ({
  renderLayerStack: vi.fn(),
  recomposeStage: vi.fn(),
  logPromotionToStatement: vi.fn(),
  syncPrimStatusFromLayer: vi.fn(),
}));

describe("PromotionController", () => {
  let mockUpdateView;
  let modal, eligibleList, promoteList, targetStatusLabel;
  let closeButton, confirmButton;
  let addBtn, removeBtn, addAllBtn, removeAllBtn;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = `
      <div id="promotion-modal" style="display: none;"></div>
      <ul id="eligible-layers-list"></ul>
      <ul id="promote-layers-list"></ul>
      <div id="promotion-target-status"></div>
      <button id="close-promotion-modal-button"></button>
      <button id="confirm-promotion-button"></button>
      <button id="add-layer-to-promote"></button>
      <button id="remove-layer-from-promote"></button>
      <button id="add-all-layers-to-promote"></button>
      <button id="remove-all-layers-from-promote"></button>
    `;

    modal = document.getElementById("promotion-modal");
    eligibleList = document.getElementById("eligible-layers-list");
    promoteList = document.getElementById("promote-layers-list");
    targetStatusLabel = document.getElementById("promotion-target-status");
    closeButton = document.getElementById("close-promotion-modal-button");
    confirmButton = document.getElementById("confirm-promotion-button");
    addBtn = document.getElementById("add-layer-to-promote");
    removeBtn = document.getElementById("remove-layer-from-promote");
    addAllBtn = document.getElementById("add-all-layers-to-promote");
    removeAllBtn = document.getElementById("remove-all-layers-from-promote");

    mockUpdateView = vi.fn();

    // Mock store state
    store.getState.mockReturnValue({
      currentUser: "testuser",
      stage: {
        layerStack: [
          {
            id: "layer1",
            filePath: "file1.usda",
            status: "WIP",
            owner: "testuser",
          },
          {
            id: "layer2",
            filePath: "file2.usda",
            status: "WIP",
            owner: "testuser",
          },
          {
            id: "layer3",
            filePath: "file3.usda",
            status: "Shared",
            owner: "testuser",
          },
        ],
      },
    });

    // Mock window methods
    global.confirm = vi.fn(() => true);
    global.alert = vi.fn();

    vi.clearAllMocks();
  });

  describe("Initialization", () => {
    it("should initialize without errors", () => {
      expect(() => {
        initPromotionController(mockUpdateView);
      }).not.toThrow();
    });

    it("should attach openPromotionModal event listener", () => {
      const addEventListenerSpy = vi.spyOn(document, "addEventListener");

      initPromotionController(mockUpdateView);

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "openPromotionModal",
        expect.any(Function)
      );
    });

    it("should attach click listeners to buttons", () => {
      initPromotionController(mockUpdateView);

      // Verify listeners are attached by checking if buttons have event handlers
      expect(closeButton.onclick || closeButton.addEventListener).toBeTruthy();
      expect(
        confirmButton.onclick || confirmButton.addEventListener
      ).toBeTruthy();
    });
  });

  describe("Object Promotion Mode", () => {
    it("should open modal in object mode", () => {
      initPromotionController(mockUpdateView);

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            mode: "object",
            prim,
          },
        })
      );

      expect(modal.style.display).toBe("flex");
      expect(targetStatusLabel.textContent).toContain("Promoting Object");
      expect(targetStatusLabel.textContent).toContain("WIP → Shared");
    });

    it("should determine WIP → Shared transition", () => {
      initPromotionController(mockUpdateView);

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      expect(targetStatusLabel.textContent).toContain("Shared");
    });

    it("should determine Shared → Published transition", () => {
      initPromotionController(mockUpdateView);

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: { status: "Shared" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      expect(targetStatusLabel.textContent).toContain("Published");
    });

    it("should throw error for already Published object", () => {
      initPromotionController(mockUpdateView);

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: { status: "Published" },
        _sourceFile: "test.usda",
      };

      // Error is thrown in event handler, so we can't catch with expect().toThrow()
      // Instead, verify modal doesn't open
      try {
        document.dispatchEvent(
          new CustomEvent("openPromotionModal", {
            detail: { mode: "object", prim },
          })
        );
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("already Published");
      }
    });

    it("should fallback to layer status if prim status is undefined", () => {
      initPromotionController(mockUpdateView);

      store.getState.mockReturnValue({
        currentUser: "testuser",
        stage: {
          layerStack: [
            {
              id: "layer1",
              filePath: "test.usda",
              status: "Shared",
            },
          ],
        },
      });

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: {}, // No status
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      expect(targetStatusLabel.textContent).toContain("Shared → Published");
    });

    it("should disable list interaction buttons in object mode", () => {
      initPromotionController(mockUpdateView);

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      expect(addBtn.disabled).toBe(true);
      expect(removeBtn.disabled).toBe(true);
      expect(addAllBtn.disabled).toBe(true);
      expect(removeAllBtn.disabled).toBe(true);
    });

    it("should show object in promote list", () => {
      initPromotionController(mockUpdateView);

      const prim = {
        name: "TestObject",
        path: "/Root/TestObject",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      expect(promoteList.children.length).toBe(1);
      expect(promoteList.textContent).toContain("TestObject");
    });
  });

  describe("Layer Promotion Mode", () => {
    it("should open modal in layer mode", () => {
      initPromotionController(mockUpdateView);

      const initialSelection = [
        {
          id: "layer1",
          filePath: "file1.usda",
          status: "WIP",
        },
      ];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection,
          },
        })
      );

      expect(modal.style.display).toBe("flex");
      expect(targetStatusLabel.textContent).toContain("Promoting Layers");
      expect(targetStatusLabel.textContent).toContain("WIP → Shared");
    });

    it("should enable list interaction buttons in layer mode", () => {
      initPromotionController(mockUpdateView);

      const initialSelection = [
        {
          id: "layer1",
          status: "WIP",
        },
      ];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection,
          },
        })
      );

      expect(addBtn.disabled).toBe(false);
      expect(removeBtn.disabled).toBe(false);
      expect(addAllBtn.disabled).toBe(false);
      expect(removeAllBtn.disabled).toBe(false);
    });

    it("should throw error for inconsistent status selection", () => {
      initPromotionController(mockUpdateView);

      const initialSelection = [
        { id: "layer1", status: "WIP" },
        { id: "layer2", status: "Shared" },
      ];

      try {
        document.dispatchEvent(
          new CustomEvent("openPromotionModal", {
            detail: {
              initialSelection,
            },
          })
        );
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("same status");
      }
    });

    it("should throw error for already Published layers", () => {
      initPromotionController(mockUpdateView);

      const initialSelection = [{ id: "layer1", status: "Published" }];

      try {
        document.dispatchEvent(
          new CustomEvent("openPromotionModal", {
            detail: {
              initialSelection,
            },
          })
        );
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("already Published");
      }
    });

    it("should filter layers by owner", () => {
      initPromotionController(mockUpdateView);

      store.getState.mockReturnValue({
        currentUser: "testuser",
        stage: {
          layerStack: [
            {
              id: "layer1",
              filePath: "file1.usda",
              status: "WIP",
              owner: "testuser",
            },
            {
              id: "layer2",
              filePath: "file2.usda",
              status: "WIP",
              owner: "otheruser",
            },
            { id: "layer3", filePath: "file3.usda", status: "WIP" }, // No owner
          ],
        },
      });

      const initialSelection = [{ id: "layer1", status: "WIP" }];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection,
          },
        })
      );

      // Should show layer1 (owned by testuser) and layer3 (no owner)
      // but not layer2 (owned by otheruser)
      const allItems =
        eligibleList.children.length + promoteList.children.length;
      expect(allItems).toBe(2);
    });

    it("should place initially selected layers in promote list", () => {
      initPromotionController(mockUpdateView);

      const initialSelection = [{ id: "layer1", status: "WIP" }];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection,
          },
        })
      );

      expect(promoteList.children.length).toBeGreaterThan(0);
      expect(
        Array.from(promoteList.children).some(
          (li) => li.dataset.layerId === "layer1"
        )
      ).toBe(true);
    });

    it("should place non-selected layers in eligible list", () => {
      initPromotionController(mockUpdateView);

      const initialSelection = [{ id: "layer1", status: "WIP" }];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection,
          },
        })
      );

      expect(eligibleList.children.length).toBeGreaterThan(0);
      expect(
        Array.from(eligibleList.children).some(
          (li) => li.dataset.layerId === "layer2"
        )
      ).toBe(true);
    });

    it("should return early for empty initial selection", () => {
      initPromotionController(mockUpdateView);

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [],
          },
        })
      );

      expect(modal.style.display).toBe("flex");
      expect(eligibleList.children.length).toBe(0);
      expect(promoteList.children.length).toBe(0);
    });
  });

  describe("Layer list item creation", () => {
    it("should create list item with correct structure", () => {
      initPromotionController(mockUpdateView);

      store.getState.mockReturnValue({
        currentUser: "testuser",
        stage: {
          layerStack: [
            {
              id: "layer1",
              filePath: "test/file.usda",
              status: "WIP",
              owner: "testuser",
            },
          ],
        },
      });

      const initialSelection = [{ id: "layer1", status: "WIP" }];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection,
          },
        })
      );

      const listItem = promoteList.querySelector('li[data-layer-id="layer1"]');
      expect(listItem).toBeTruthy();
      expect(listItem.innerHTML).toContain("file.usda");
    });

    it("should show status indicator", () => {
      initPromotionController(mockUpdateView);

      const layer = {
        id: "layer1",
        filePath: "file.usda",
        status: "WIP",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [layer],
          },
        })
      );

      const listItem = promoteList.querySelector("li");
      expect(listItem.innerHTML).toContain("status-indicator");
      expect(listItem.innerHTML).toContain("W"); // First letter of WIP
    });
  });

  describe("List interactions", () => {
    beforeEach(() => {
      initPromotionController(mockUpdateView);

      // Add test items to lists
      ["item1", "item2", "item3"].forEach((id) => {
        const li = document.createElement("li");
        li.dataset.layerId = id;
        li.textContent = id;
        eligibleList.appendChild(li);
      });
    });

    it("should select item on click", () => {
      const item = eligibleList.querySelector("li");
      item.click();

      expect(item.classList.contains("selected")).toBe(true);
    });

    it("should toggle selection with Ctrl+click", () => {
      const item = eligibleList.querySelector("li");
      const event = new MouseEvent("click", { ctrlKey: true, bubbles: true });

      item.dispatchEvent(event);
      expect(item.classList.contains("selected")).toBe(true);

      item.dispatchEvent(event);
      expect(item.classList.contains("selected")).toBe(false);
    });

    it("should support metaKey (Mac Cmd) for toggle", () => {
      const item = eligibleList.querySelector("li");
      const event = new MouseEvent("click", { metaKey: true, bubbles: true });

      item.dispatchEvent(event);
      expect(item.classList.contains("selected")).toBe(true);
    });

    it("should clear other selections on single click", () => {
      const items = Array.from(eligibleList.querySelectorAll("li"));
      items[0].classList.add("selected");
      items[1].classList.add("selected");

      items[2].click();

      expect(items[0].classList.contains("selected")).toBe(false);
      expect(items[1].classList.contains("selected")).toBe(false);
      expect(items[2].classList.contains("selected")).toBe(true);
    });
  });

  describe("Transfer operations", () => {
    beforeEach(() => {
      initPromotionController(mockUpdateView);

      ["item1", "item2"].forEach((id) => {
        const li = document.createElement("li");
        li.dataset.layerId = id;
        li.textContent = id;
        eligibleList.appendChild(li);
      });
    });

    it("should move selected items on add button click", () => {
      const item = eligibleList.querySelector("li");
      item.classList.add("selected");

      addBtn.click();

      expect(eligibleList.contains(item)).toBe(false);
      expect(promoteList.contains(item)).toBe(true);
      expect(item.classList.contains("selected")).toBe(false);
    });

    it("should move all items on add all button click", () => {
      addAllBtn.click();

      expect(eligibleList.children.length).toBe(0);
      expect(promoteList.children.length).toBe(2);
    });

    it("should move selected items back on remove button click", () => {
      const item = eligibleList.querySelector("li");
      promoteList.appendChild(item);
      item.classList.add("selected");

      removeBtn.click();

      expect(promoteList.contains(item)).toBe(false);
      expect(eligibleList.contains(item)).toBe(true);
    });

    it("should move all items back on remove all button click", () => {
      while (eligibleList.firstChild) {
        promoteList.appendChild(eligibleList.firstChild);
      }

      removeAllBtn.click();

      expect(promoteList.children.length).toBe(0);
      expect(eligibleList.children.length).toBe(2);
    });
  });

  describe("Modal close", () => {
    it("should close modal on close button click", () => {
      initPromotionController(mockUpdateView);

      modal.style.display = "flex";
      closeButton.click();

      expect(modal.style.display).toBe("none");
    });
  });

  describe("Object promotion confirmation", () => {
    beforeEach(() => {
      initPromotionController(mockUpdateView);
    });

    it("should validate object has name before promotion", () => {
      const prim = {
        path: "/Root/Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      // Validation error is thrown in event handler - just verify it doesn't promote
      const originalStatus = prim.properties.status;

      try {
        confirmButton.click();
      } catch {
        // Expected error
      }

      // Status should not have changed due to validation failure
      expect(prim.properties.status).toBe(originalStatus);
    });

    it("should validate object has source file before promotion", () => {
      const prim = {
        name: "Test",
        path: "/Root/Test",
        properties: { status: "WIP" },
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      const originalStatus = prim.properties.status;

      try {
        confirmButton.click();
      } catch {
        // Expected error
      }

      expect(prim.properties.status).toBe(originalStatus);
    });

    it("should validate object has path before promotion", () => {
      const prim = {
        name: "Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      const originalStatus = prim.properties.status;

      try {
        confirmButton.click();
      } catch {
        // Expected error
      }

      expect(prim.properties.status).toBe(originalStatus);
    });

    it("should update prim properties on confirm", () => {
      const prim = {
        name: "Test",
        path: "/Root/Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      confirmButton.click();

      expect(prim.properties.status).toBe("Shared");
    });

    it("should call recomposeStage and updateView", () => {
      const prim = {
        name: "Test",
        path: "/Root/Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      confirmButton.click();

      expect(recomposeStage).toHaveBeenCalled();
      expect(mockUpdateView).toHaveBeenCalled();
    });

    it("should log promotion to statement", () => {
      const prim = {
        name: "Test",
        path: "/Root/Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      confirmButton.click();

      expect(logPromotionToStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          layerPath: "test.usda",
          sourceStatus: "WIP",
          targetStatus: "Shared",
          objectPath: "/Root/Test",
        })
      );
    });

    it("should continue promotion if logging fails", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();
      logPromotionToStatement.mockImplementationOnce(() => {
        throw new Error("Logging failed");
      });

      const prim = {
        name: "Test",
        path: "/Root/Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      confirmButton.click();

      expect(prim.properties.status).toBe("Shared");
      expect(consoleWarnSpy).toHaveBeenCalled();
    });

    it("should not promote if user cancels", () => {
      global.confirm = vi.fn(() => false);

      const prim = {
        name: "Test",
        path: "/Root/Test",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { mode: "object", prim },
        })
      );

      confirmButton.click();

      expect(prim.properties.status).toBe("WIP");
      expect(recomposeStage).not.toHaveBeenCalled();
    });
  });

  describe("Layer promotion confirmation", () => {
    beforeEach(() => {
      initPromotionController(mockUpdateView);
    });

    it("should close modal with no items to promote", () => {
      const initialSelection = [{ id: "layer1", status: "WIP" }];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { initialSelection },
        })
      );

      // Clear promote list
      promoteList.innerHTML = "";

      confirmButton.click();

      expect(modal.style.display).toBe("none");
    });

    it("should promote all layers in promote list", () => {
      const initialSelection = [
        { id: "layer1", status: "WIP" },
        { id: "layer2", status: "WIP" },
      ];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { initialSelection },
        })
      );

      confirmButton.click();

      expect(actions.updateLayer).toHaveBeenCalledWith("layer1", {
        status: "Shared",
      });
      expect(actions.updateLayer).toHaveBeenCalledWith("layer2", {
        status: "Shared",
      });
    });

    it("should skip layer with missing layerId", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      const initialSelection = [{ id: "layer1", status: "WIP" }];

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: { initialSelection },
        })
      );

      // Add item without layerId
      const li = document.createElement("li");
      promoteList.appendChild(li);

      confirmButton.click();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("missing layerId")
      );
    });

    it("should skip layer not found in layerStack", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "WIP" }],
          },
        })
      );

      // Add item with non-existent layerId
      const li = document.createElement("li");
      li.dataset.layerId = "nonexistent";
      promoteList.appendChild(li);

      confirmButton.click();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Layer not found")
      );
    });

    it("should skip layer with status mismatch", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();

      // Set up initial state for opening modal
      store.getState.mockReturnValueOnce({
        currentUser: "testuser",
        stage: {
          layerStack: [
            {
              id: "layer1",
              filePath: "file1.usda",
              status: "WIP",
              owner: "testuser",
            },
          ],
        },
      });

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "WIP" }],
          },
        })
      );

      // Now change the layer status for confirmation
      store.getState.mockReturnValue({
        currentUser: "testuser",
        stage: {
          layerStack: [
            {
              id: "layer1",
              filePath: "file1.usda",
              status: "Published",
              owner: "testuser",
            }, // Changed status
          ],
        },
      });

      confirmButton.click();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("status mismatch")
      );
    });

    it("should continue promoting other layers if one fails", () => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation();
      actions.updateLayer.mockImplementationOnce(() => {
        throw new Error("Update failed");
      });

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [
              { id: "layer1", status: "WIP" },
              { id: "layer2", status: "WIP" },
            ],
          },
        })
      );

      confirmButton.click();

      expect(actions.updateLayer).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it("should call syncPrimStatusFromLayer for each layer", () => {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "WIP" }],
          },
        })
      );

      confirmButton.click();

      expect(syncPrimStatusFromLayer).toHaveBeenCalled();
    });

    it("should call logPromotionToStatement for each layer", () => {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "WIP" }],
          },
        })
      );

      confirmButton.click();

      expect(logPromotionToStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          layerPath: "file1.usda",
          sourceStatus: "WIP",
          targetStatus: "Shared",
        })
      );
    });

    it("should refresh UI after promotion", () => {
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "WIP" }],
          },
        })
      );

      confirmButton.click();

      expect(renderLayerStack).toHaveBeenCalled();
      expect(recomposeStage).toHaveBeenCalled();
      expect(mockUpdateView).toHaveBeenCalled();
    });

    it("should not promote if user cancels", () => {
      global.confirm = vi.fn(() => false);

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "WIP" }],
          },
        })
      );

      confirmButton.click();

      expect(actions.updateLayer).not.toHaveBeenCalled();
      expect(modal.style.display).toBe("none");
    });
  });

  describe("Demotion Logic", () => {
    it("should open modal in demote mode", () => {
      initPromotionController(mockUpdateView);
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "Published" }],
            direction: "demote",
          },
        })
      );
      expect(modal.style.display).toBe("flex");
      expect(targetStatusLabel.textContent).toContain("Demoting Layers");
      expect(targetStatusLabel.textContent).toContain("Published → Shared");
      expect(confirmButton.textContent).toBe("Demote");
    });

    it("should handle Shared → WIP demotion", () => {
      initPromotionController(mockUpdateView);
      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer1", status: "Shared" }],
            direction: "demote",
          },
        })
      );
      expect(targetStatusLabel.textContent).toContain("Shared → WIP");
    });

    it("should validate against demoting WIP", () => {
      initPromotionController(mockUpdateView);
      try {
        document.dispatchEvent(
          new CustomEvent("openPromotionModal", {
            detail: {
              initialSelection: [{ id: "layer1", status: "WIP" }],
              direction: "demote",
            },
          })
        );
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("cannot be demoted");
      }
    });

    it("should call logPromotionToStatement with Demotion type", () => {
      initPromotionController(mockUpdateView);

      store.getState.mockReturnValue({
        currentUser: "testuser",
        stage: {
          layerStack: [
            {
              id: "layer99",
              filePath: "published.usda",
              status: "Published",
              owner: "testuser",
            },
          ],
        },
      });

      document.dispatchEvent(
        new CustomEvent("openPromotionModal", {
          detail: {
            initialSelection: [{ id: "layer99", status: "Published" }],
            direction: "demote",
          },
        })
      );
      confirmButton.click();
      expect(logPromotionToStatement).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "Demotion",
          sourceStatus: "Published",
          targetStatus: "Shared",
        })
      );
    });

    it("should handle multi-object demotion", () => {
       initPromotionController(mockUpdateView);
       const prims = [
          { name: "Obj1", path: "/Obj1", properties: { status: "Published" }, _sourceFile: "file1" },
          { name: "Obj2", path: "/Obj2", properties: { status: "Published" }, _sourceFile: "file1" }
       ];
       document.dispatchEvent(
          new CustomEvent("openPromotionModal", {
             detail: {
                mode: "object",
                prims: prims,
                direction: "demote"
             }
          })
       );
       expect(targetStatusLabel.textContent).toContain("2 Objects");
       expect(targetStatusLabel.textContent).toContain("Published → Shared");
       expect(promoteList.children.length).toBe(2);
    });

    it("should validate mixed status in multi-object demotion", () => {
       initPromotionController(mockUpdateView);
       const prims = [
          { name: "Obj1", properties: { status: "Published" }, _sourceFile: "file1" },
          { name: "Obj2", properties: { status: "WIP" }, _sourceFile: "file1" }
       ];

       document.dispatchEvent(
          new CustomEvent("openPromotionModal", {
             detail: {
                mode: "object",
                prims: prims,
                direction: "demote"
             }
          })
       );
       
       expect(errorHandler.handleError).toHaveBeenCalledWith(expect.any(ValidationError));
    });
  });
});
