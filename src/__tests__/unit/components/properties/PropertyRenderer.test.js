/**
 * PropertyRenderer Unit Tests
 * Tests for property panel rendering, permission checks, and custom property grouping
 */

import {
  renderPlaceholder,
  canUserEditPrim,
  renderPropertiesPanel,
} from "../../../../components/properties/PropertyRenderer.js";
import { store, ValidationError } from "../../../../core/index.js";
import { getAllPrimPaths } from "../../../../utils/primHelpers.js";
import { resolvePrimStatus } from "../../../../utils/statusUtils.js";

// Mock all dependencies
vi.mock("../../../../core/index.js", () => ({
  store: {
    getState: vi.fn(),
  },
  errorHandler: {
    wrap: (fn) => fn,
  },
  ValidationError: class ValidationError extends Error {
    constructor(message, field, value) {
      super(message);
      this.name = "ValidationError";
      this.field = field;
      this.value = value;
    }
  },
}));

vi.mock("../../../../utils/primHelpers.js", () => ({
  getAllPrimPaths: vi.fn(() => ["/Root", "/Root/Child1", "/Root/Child2"]),
}));

vi.mock("../../../../utils/statusUtils.js", () => ({
  resolvePrimStatus: vi.fn((prim) => prim.properties?.status || "WIP"),
}));

describe("PropertyRenderer", () => {
  let mockContainer;

  beforeEach(() => {
    vi.clearAllMocks();
    mockContainer = document.createElement("div");
    document.body.appendChild(mockContainer);
  });

  afterEach(() => {
    document.body.removeChild(mockContainer);
  });

  // ===========================================
  // renderPlaceholder() Tests
  // ===========================================

  describe("renderPlaceholder()", () => {
    it("should render default placeholder message", () => {
      renderPlaceholder(mockContainer);
      expect(mockContainer.innerHTML).toContain("placeholder-text");
      expect(mockContainer.innerHTML).toContain(
        "Select a prim to view its properties."
      );
    });

    it("should render custom placeholder message", () => {
      const customMessage = "No prim selected";
      renderPlaceholder(mockContainer, customMessage);
      expect(mockContainer.innerHTML).toContain(customMessage);
    });

    it("should clear previous content", () => {
      mockContainer.innerHTML = "<div>Previous content</div>";
      renderPlaceholder(mockContainer);
      expect(mockContainer.innerHTML).not.toContain("Previous content");
    });
  });

  // ===========================================
  // canUserEditPrim() Tests
  // ===========================================

  describe("canUserEditPrim()", () => {
    describe("Validation", () => {
      it("should throw ValidationError for null prim", () => {
        expect(() => canUserEditPrim(null)).toThrow(ValidationError);
      });

      it("should throw ValidationError for undefined prim", () => {
        expect(() => canUserEditPrim(undefined)).toThrow(ValidationError);
      });

      it("should throw error with correct message for missing prim", () => {
        try {
          canUserEditPrim(null);
        } catch (error) {
          expect(error.message).toContain(
            "Prim is required to check permissions"
          );
          expect(error.field).toBe("prim");
        }
      });
    });

    describe("History Mode", () => {
      it("should return false in history mode regardless of user role", () => {
        store.getState.mockReturnValue({
          isHistoryMode: true,
          currentUser: "Project Manager",
        });

        const prim = { path: "/Root/Test", name: "Test" };
        expect(canUserEditPrim(prim)).toBe(false);
      });

      it("should return false in history mode for Field Engineer", () => {
        store.getState.mockReturnValue({
          isHistoryMode: true,
          currentUser: "Field Engineer",
        });

        const prim = { path: "/Root/Test", name: "Test" };
        expect(canUserEditPrim(prim)).toBe(false);
      });
    });

    describe("Project Manager Permissions", () => {
      it("should allow Project Manager to edit any prim", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "Project Manager",
          stage: { layerStack: [] },
        });

        const prim = { path: "/Root/Test", name: "Test" };
        expect(canUserEditPrim(prim)).toBe(true);
      });

      it("should allow Project Manager even without source file", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "Project Manager",
          stage: { layerStack: [] },
        });

        const prim = { path: "/Root/Test", name: "Test", _sourceFile: null };
        expect(canUserEditPrim(prim)).toBe(true);
      });
    });

    describe("Field Engineer Permissions", () => {
      it("should allow Field Engineer to edit any prim", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "Field Engineer",
          stage: { layerStack: [] },
        });

        const prim = { path: "/Root/Test", name: "Test" };
        expect(canUserEditPrim(prim)).toBe(true);
      });

      it("should allow Field Engineer even without source file", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "Field Engineer",
          stage: { layerStack: [] },
        });

        const prim = { path: "/Root/Test", name: "Test", _sourceFile: null };
        expect(canUserEditPrim(prim)).toBe(true);
      });
    });

    describe("Field Person Permissions", () => {
      it("should not allow Field Person to edit any prim", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "Field Person",
          stage: { layerStack: [] },
        });

        const prim = { path: "/Root/Test", name: "Test" };
        expect(canUserEditPrim(prim)).toBe(false);
      });

      it("should not allow Field Person even if they own the source file", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "Field Person",
          stage: {
            layerStack: [{ filePath: "test.usda", owner: "Field Person" }],
          },
        });

        const prim = {
          path: "/Root/Test",
          name: "Test",
          _sourceFile: "test.usda",
        };
        expect(canUserEditPrim(prim)).toBe(false);
      });
    });

    describe("Source File Owner Permissions", () => {
      it("should allow owner of source file to edit", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "User1",
          stage: {
            layerStack: [{ filePath: "test.usda", owner: "User1" }],
          },
        });

        const prim = {
          path: "/Root/Test",
          name: "Test",
          _sourceFile: "test.usda",
        };
        expect(canUserEditPrim(prim)).toBe(true);
      });

      it("should not allow non-owner to edit", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "User2",
          stage: {
            layerStack: [{ filePath: "test.usda", owner: "User1" }],
          },
        });

        const prim = {
          path: "/Root/Test",
          name: "Test",
          _sourceFile: "test.usda",
        };
        expect(canUserEditPrim(prim)).toBe(false);
      });

      it("should return true when source file not found in layer stack (no ownership restriction)", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "User1",
          stage: {
            layerStack: [{ filePath: "other.usda", owner: "User1" }],
          },
        });

        const prim = {
          path: "/Root/Test",
          name: "Test",
          _sourceFile: "test.usda",
        };
        expect(canUserEditPrim(prim)).toBe(true);
      });

      it("should return true when prim has no source file (no ownership restriction)", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "User1",
          stage: {
            layerStack: [{ filePath: "test.usda", owner: "User1" }],
          },
        });

        const prim = { path: "/Root/Test", name: "Test" };
        expect(canUserEditPrim(prim)).toBe(true);
      });

      it("should return true when layer stack is empty (no ownership restriction)", () => {
        store.getState.mockReturnValue({
          isHistoryMode: false,
          currentUser: "User1",
          stage: { layerStack: [] },
        });

        const prim = {
          path: "/Root/Test",
          name: "Test",
          _sourceFile: "test.usda",
        };
        expect(canUserEditPrim(prim)).toBe(true);
      });
    });
  });

  // ===========================================
  // renderPropertiesPanel() Tests
  // ===========================================

  describe("renderPropertiesPanel()", () => {
    let mockPrim;
    let mockState;

    beforeEach(() => {
      mockPrim = {
        path: "/Root/TestPrim",
        name: "TestPrim",
        type: "Xform",
        properties: {
          status: "WIP",
          entityType: "Real Element",
        },
      };

      mockState = {
        isHistoryMode: false,
        currentUser: "Project Manager",
        composedHierarchy: [mockPrim],
        stage: { layerStack: [] },
      };

      store.getState.mockReturnValue(mockState);
      resolvePrimStatus.mockReturnValue("WIP");
    });

    describe("Validation", () => {
      it("should throw ValidationError for null container", () => {
        expect(() => renderPropertiesPanel(null, mockPrim)).toThrow(
          ValidationError
        );
      });

      it("should throw ValidationError for non-HTMLElement container", () => {
        expect(() => renderPropertiesPanel({}, mockPrim)).toThrow(
          ValidationError
        );
      });

      it("should throw error with correct message for invalid container", () => {
        try {
          renderPropertiesPanel("not-an-element", mockPrim);
        } catch (error) {
          expect(error.message).toContain(
            "Container must be a valid HTML element"
          );
          expect(error.field).toBe("container");
        }
      });

      it("should throw ValidationError for null prim", () => {
        expect(() => renderPropertiesPanel(mockContainer, null)).toThrow(
          ValidationError
        );
      });

      it("should throw ValidationError for prim without path", () => {
        const invalidPrim = { name: "Test", type: "Xform" };
        expect(() => renderPropertiesPanel(mockContainer, invalidPrim)).toThrow(
          ValidationError
        );
      });

      it("should throw error with correct message for invalid prim", () => {
        try {
          renderPropertiesPanel(mockContainer, null);
        } catch (error) {
          expect(error.message).toContain("Prim is missing or invalid");
          expect(error.field).toBe("prim");
        }
      });
    });

    describe("Basic Rendering", () => {
      it("should render prim name input", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const nameInput = mockContainer.querySelector("#prim-name-input");
        expect(nameInput).toBeTruthy();
        expect(nameInput.value).toBe("TestPrim");
      });

      it("should render prim path select", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const pathSelect = mockContainer.querySelector("#prim-path-select");
        expect(pathSelect).toBeTruthy();
        expect(pathSelect.disabled).toBe(true);
      });

      it("should render prim type input as disabled", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const typeInputs = mockContainer.querySelectorAll("input[disabled]");
        const typeInput = Array.from(typeInputs).find(
          (input) => input.value === "Xform"
        );
        expect(typeInput).toBeTruthy();
      });

      it("should render status select", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const statusSelect = mockContainer.querySelector("#prim-status-select");
        expect(statusSelect).toBeTruthy();
        expect(statusSelect.value).toBe("WIP");
      });

      it("should render entity type select", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const entityTypeSelect = mockContainer.querySelector(
          "#prim-entityType-select"
        );
        expect(entityTypeSelect).toBeTruthy();
        expect(entityTypeSelect.value).toBe("Real Element");
      });

      it("should return HTML string", () => {
        const result = renderPropertiesPanel(mockContainer, mockPrim);
        expect(typeof result).toBe("string");
        expect(result).toContain("prim-name-input");
      });
    });

    describe("Status Dropdown", () => {
      it("should render all status options", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const statusSelect = mockContainer.querySelector("#prim-status-select");
        const options = Array.from(statusSelect.querySelectorAll("option"));
        const values = options.map((o) => o.value);

        expect(values).toContain("WIP");
        expect(values).toContain("Shared");
        expect(values).toContain("Published");
        expect(values).toContain("Archived");
      });

      it("should select current status from resolvePrimStatus", () => {
        resolvePrimStatus.mockReturnValue("Shared");
        renderPropertiesPanel(mockContainer, mockPrim);
        const statusSelect = mockContainer.querySelector("#prim-status-select");
        expect(statusSelect.value).toBe("Shared");
      });

      it("should use resolvePrimStatus with layer stack", () => {
        const layerStack = [{ filePath: "test.usda", owner: "User1" }];
        store.getState.mockReturnValue({
          ...mockState,
          stage: { layerStack },
        });

        renderPropertiesPanel(mockContainer, mockPrim);
        expect(resolvePrimStatus).toHaveBeenCalledWith(mockPrim, layerStack);
      });
    });

    describe("Entity Type Dropdown", () => {
      it("should render entity type options", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const entityTypeSelect = mockContainer.querySelector(
          "#prim-entityType-select"
        );
        const options = Array.from(entityTypeSelect.querySelectorAll("option"));
        const values = options.map((o) => o.value);

        expect(values).toContain("Real Element");
        expect(values).toContain("placeholder");
      });

      it("should select current entity type", () => {
        mockPrim.properties.entityType = "placeholder";
        renderPropertiesPanel(mockContainer, mockPrim);
        const entityTypeSelect = mockContainer.querySelector(
          "#prim-entityType-select"
        );
        expect(entityTypeSelect.value).toBe("placeholder");
      });

      it("should default to Real Element when entityType not specified", () => {
        delete mockPrim.properties.entityType;
        renderPropertiesPanel(mockContainer, mockPrim);
        const entityTypeSelect = mockContainer.querySelector(
          "#prim-entityType-select"
        );
        expect(entityTypeSelect.value).toBe("Real Element");
      });

      it("should disable entity type select", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const entityTypeSelect = mockContainer.querySelector(
          "#prim-entityType-select"
        );
        expect(entityTypeSelect.disabled).toBe(true);
      });
    });

    describe("Prim Path Select", () => {
      it("should call getAllPrimPaths with composed hierarchy", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        expect(getAllPrimPaths).toHaveBeenCalledWith(
          mockState.composedHierarchy
        );
      });

      it("should render all prim paths as options", () => {
        getAllPrimPaths.mockReturnValue(["/Root", "/Root/A", "/Root/B"]);
        renderPropertiesPanel(mockContainer, mockPrim);
        const pathSelect = mockContainer.querySelector("#prim-path-select");
        const options = Array.from(pathSelect.querySelectorAll("option"));
        expect(options).toHaveLength(3);
      });

      it("should select current prim path", () => {
        getAllPrimPaths.mockReturnValue([
          "/Root",
          "/Root/TestPrim",
          "/Root/Other",
        ]);
        renderPropertiesPanel(mockContainer, mockPrim);
        const pathSelect = mockContainer.querySelector("#prim-path-select");
        expect(pathSelect.value).toBe("/Root/TestPrim");
      });
    });

    describe("Edit Permissions", () => {
      it("should enable inputs when user can edit (Project Manager)", () => {
        store.getState.mockReturnValue({
          ...mockState,
          currentUser: "Project Manager",
        });

        renderPropertiesPanel(mockContainer, mockPrim);
        const nameInput = mockContainer.querySelector("#prim-name-input");
        const statusSelect = mockContainer.querySelector("#prim-status-select");

        expect(nameInput.disabled).toBe(false);
        expect(statusSelect.disabled).toBe(false);
      });

      it("should disable inputs when user cannot edit (Field Person)", () => {
        store.getState.mockReturnValue({
          ...mockState,
          currentUser: "Field Person",
        });

        renderPropertiesPanel(mockContainer, mockPrim);
        const nameInput = mockContainer.querySelector("#prim-name-input");
        const statusSelect = mockContainer.querySelector("#prim-status-select");

        expect(nameInput.disabled).toBe(true);
        expect(statusSelect.disabled).toBe(true);
      });

      it("should disable inputs in history mode", () => {
        store.getState.mockReturnValue({
          ...mockState,
          isHistoryMode: true,
        });

        renderPropertiesPanel(mockContainer, mockPrim);
        const nameInput = mockContainer.querySelector("#prim-name-input");
        const statusSelect = mockContainer.querySelector("#prim-status-select");

        expect(nameInput.disabled).toBe(true);
        expect(statusSelect.disabled).toBe(true);
      });
    });

    describe("Add Custom Property Button", () => {
      it("should show button when user can edit", () => {
        store.getState.mockReturnValue({
          ...mockState,
          currentUser: "Project Manager",
        });

        renderPropertiesPanel(mockContainer, mockPrim);
        const addButton = mockContainer.querySelector("#add-property-btn");
        expect(addButton).toBeTruthy();
      });

      it("should show button for Field Person (special case)", () => {
        store.getState.mockReturnValue({
          ...mockState,
          currentUser: "Field Person",
        });

        renderPropertiesPanel(mockContainer, mockPrim);
        const addButton = mockContainer.querySelector("#add-property-btn");
        expect(addButton).toBeTruthy();
      });

      it("should always show the add property button regardless of edit permissions", () => {
        store.getState.mockReturnValue({
          ...mockState,
          currentUser: "User1",
          stage: {
            layerStack: [{ filePath: "other.usda", owner: "User2" }],
          },
        });

        mockPrim._sourceFile = "other.usda";
        renderPropertiesPanel(mockContainer, mockPrim);
        const addButton = mockContainer.querySelector("#add-property-btn");
        expect(addButton).toBeTruthy();
      });
    });

    describe("Custom Properties - Ungrouped", () => {
      it("should render ungrouped custom properties", () => {
        mockPrim.properties.customProp = "CustomValue";
        renderPropertiesPanel(mockContainer, mockPrim);

        const inputs = mockContainer.querySelectorAll(
          ".ungrouped-property-input"
        );
        const input = Array.from(inputs).find(
          (i) => i.dataset.propertyKey === "customProp"
        );
        expect(input).toBeTruthy();
        expect(input.value).toBe("CustomValue");
      });

      it("should not render system properties (status)", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const inputs = mockContainer.querySelectorAll(
          ".ungrouped-property-input"
        );
        const statusInput = Array.from(inputs).find(
          (i) => i.dataset.propertyKey === "status"
        );
        expect(statusInput).toBeFalsy();
      });

      it("should not render system properties (entityType)", () => {
        renderPropertiesPanel(mockContainer, mockPrim);
        const inputs = mockContainer.querySelectorAll(
          ".ungrouped-property-input"
        );
        const entityTypeInput = Array.from(inputs).find(
          (i) => i.dataset.propertyKey === "entityType"
        );
        expect(entityTypeInput).toBeFalsy();
      });

      it("should not render system properties (displayName)", () => {
        mockPrim.properties.displayName = "Display Name";
        renderPropertiesPanel(mockContainer, mockPrim);
        const inputs = mockContainer.querySelectorAll(
          ".ungrouped-property-input"
        );
        const displayNameInput = Array.from(inputs).find(
          (i) => i.dataset.propertyKey === "displayName"
        );
        expect(displayNameInput).toBeFalsy();
      });

      it("should format color objects as color(r, g, b)", () => {
        mockPrim.properties.color = { r: 0.5, g: 0.3, b: 0.7 };
        renderPropertiesPanel(mockContainer, mockPrim);

        const inputs = mockContainer.querySelectorAll(
          ".ungrouped-property-input"
        );
        const colorInput = Array.from(inputs).find(
          (i) => i.dataset.propertyKey === "color"
        );
        expect(colorInput).toBeTruthy();
        expect(colorInput.value).toBe("color(0.5, 0.3, 0.7)");
      });

      it("should detect HTTP links", () => {
        mockPrim.properties.url = "http://example.com/data";
        renderPropertiesPanel(mockContainer, mockPrim);

        const linkBtn = mockContainer.querySelector(".data-link-btn");
        expect(linkBtn).toBeTruthy();
        expect(linkBtn.dataset.uri).toBe("http://example.com/data");
      });

      it("should detect .json file links", () => {
        mockPrim.properties.dataFile = "data.json";
        renderPropertiesPanel(mockContainer, mockPrim);

        const linkBtn = mockContainer.querySelector(".data-link-btn");
        expect(linkBtn).toBeTruthy();
      });

      it("should detect .csv file links", () => {
        mockPrim.properties.csvFile = "report.csv";
        renderPropertiesPanel(mockContainer, mockPrim);

        const linkBtn = mockContainer.querySelector(".data-link-btn");
        expect(linkBtn).toBeTruthy();
      });

      it("should sanitize property key for input ID", () => {
        mockPrim.properties["custom:prop-name"] = "Value";
        renderPropertiesPanel(mockContainer, mockPrim);

        const input = mockContainer.querySelector(
          "#ungrouped-input-custom-prop-name"
        );
        expect(input).toBeTruthy();
      });
    });

    describe("Custom Properties - Pset Grouping", () => {
      it("should group properties by Pset", () => {
        mockPrim.properties.area = "100";
        mockPrim.properties.volume = "50";
        mockPrim._psets = {
          area: "Pset_Geometry",
          volume: "Pset_Geometry",
        };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetGroup = mockContainer.querySelector(".pset-group");
        expect(psetGroup).toBeTruthy();
      });

      it("should render Pset header with name", () => {
        mockPrim.properties.area = "100";
        mockPrim._psets = { area: "Pset_Geometry" };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetName = mockContainer.querySelector(".pset-name");
        expect(psetName.textContent).toBe("Pset_Geometry");
      });

      it("should render toggle icon in Pset header", () => {
        mockPrim.properties.area = "100";
        mockPrim._psets = { area: "Pset_Geometry" };

        renderPropertiesPanel(mockContainer, mockPrim);

        const toggleIcon = mockContainer.querySelector(".toggle-icon");
        expect(toggleIcon).toBeTruthy();
        expect(toggleIcon.textContent).toBe("▼");
      });

      it("should render Pset properties with correct class", () => {
        mockPrim.properties.area = "100";
        mockPrim._psets = { area: "Pset_Geometry" };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetInput = mockContainer.querySelector(".pset-property-input");
        expect(psetInput).toBeTruthy();
        expect(psetInput.dataset.propertyKey).toBe("area");
      });

      it("should include Pset name in input data attribute", () => {
        mockPrim.properties.area = "100";
        mockPrim._psets = { area: "Pset_Geometry" };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetInput = mockContainer.querySelector(".pset-property-input");
        expect(psetInput.dataset.psetName).toBe("Pset_Geometry");
      });

      it("should sanitize Pset name for element ID", () => {
        mockPrim.properties.area = "100";
        mockPrim._psets = { area: "Pset:Custom-Geometry" };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetContainer = mockContainer.querySelector(
          "#pset-Pset-Custom-Geometry"
        );
        expect(psetContainer).toBeTruthy();
      });

      it("should render multiple properties in same Pset", () => {
        mockPrim.properties.area = "100";
        mockPrim.properties.volume = "50";
        mockPrim._psets = {
          area: "Pset_Geometry",
          volume: "Pset_Geometry",
        };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetInputs = mockContainer.querySelectorAll(
          ".pset-property-input"
        );
        expect(psetInputs.length).toBe(2);
      });

      it("should render multiple Pset groups", () => {
        mockPrim.properties.area = "100";
        mockPrim.properties.manufacturer = "ACME";
        mockPrim._psets = {
          area: "Pset_Geometry",
          manufacturer: "Pset_Product",
        };

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetGroups = mockContainer.querySelectorAll(".pset-group");
        expect(psetGroups.length).toBe(2);
      });

      it("should handle prim without _psets property", () => {
        mockPrim.properties.customProp = "Value";
        delete mockPrim._psets;

        renderPropertiesPanel(mockContainer, mockPrim);

        const psetGroup = mockContainer.querySelector(".pset-group");
        expect(psetGroup).toBe(null);

        const ungroupedInput = mockContainer.querySelector(
          ".ungrouped-property-input"
        );
        expect(ungroupedInput).toBeTruthy();
      });

      it("should render ungrouped properties when not in any Pset", () => {
        mockPrim.properties.area = "100";
        mockPrim.properties.customProp = "Value";
        mockPrim._psets = { area: "Pset_Geometry" };

        renderPropertiesPanel(mockContainer, mockPrim);

        const ungroupedInput = mockContainer.querySelector(
          '.ungrouped-property-input[data-property-key="customProp"]'
        );
        expect(ungroupedInput).toBeTruthy();
      });
    });

    describe("Console Logging", () => {
      let consoleLogSpy;

      beforeEach(() => {
        consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      });

      afterEach(() => {
        consoleLogSpy.mockRestore();
      });

      it("should log prim._psets for debugging", () => {
        mockPrim._psets = { area: "Pset_Geometry" };
        renderPropertiesPanel(mockContainer, mockPrim);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          "[PSET DEBUG] prim._psets:",
          mockPrim._psets
        );
      });

      it("should log property keys for debugging", () => {
        renderPropertiesPanel(mockContainer, mockPrim);

        expect(consoleLogSpy).toHaveBeenCalledWith(
          "[PSET DEBUG] prim.properties:",
          expect.arrayContaining(["status", "entityType"])
        );
      });
    });
  });
});
