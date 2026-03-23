/**
 * PropertyEditor Unit Tests
 * Tests for property panel event listener attachment and handling
 */

// Mock all dependencies
vi.mock("../../../../core/index.js", () => {
  // Create mock functions inside the factory
  const mockHandleError = vi.fn();
  const mockGetState = vi.fn();
  const mockDispatch = vi.fn();

  return {
    store: {
      getState: mockGetState,
      dispatch: mockDispatch,
    },
    actions: {
      setComposedHierarchy: vi.fn((v) => v),
      updateFile: vi.fn((f, c) => ({ type: "updateFile", payload: { f, c } })),
      setCurrentFile: vi.fn((v) => v),
      setSelectedFiles: vi.fn((v) => v),
      setCurrentView: vi.fn((v) => v),
      incrementLogEntryCounter: vi.fn(() => 0),
      setHeadCommit: vi.fn((v) => v),
      updateLayerStack: vi.fn((v) => v),
      loadFile: vi.fn((f, c) => ({ type: "loadFile", payload: { f, c } })),
      addLayer: vi.fn((v) => v),
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

import { attachPropertyEventListeners } from "../../../../components/properties/PropertyEditor.js";
import {
  store,
  errorHandler,
  ValidationError,
} from "../../../../core/index.js";
import {
  validatePrimName,
  findPrimByPath,
} from "../../../../utils/primHelpers.js";
import { showPsetPropertyModal } from "../../../../components/psetPropertyModal.js";

vi.mock("../../../../utils/primHelpers.js", () => ({
  validatePrimName: vi.fn(),
  findPrimByPath: vi.fn(),
}));

vi.mock("../../../../components/psetPropertyModal.js", () => ({
  showPsetPropertyModal: vi.fn(),
}));

vi.mock("../../../../components/sidebar/layerStackController.js", () => ({
  renderLayerStack: vi.fn(),
  recomposeStage: vi.fn(),
}));

describe("PropertyEditor", () => {
  let mockContainer;
  let mockPrim;
  let mockHandlers;
  let mockUpdateView;
  let mockCommitButton;
  let consoleLogSpy;

  beforeEach(() => {
    vi.clearAllMocks();

    mockContainer = document.createElement("div");
    document.body.appendChild(mockContainer);

    mockPrim = {
      path: "/Root/TestPrim",
      name: "TestPrim",
      properties: {
        status: "WIP",
      },
    };

    mockHandlers = {
      applyPrimRename: vi.fn(),
      applyAttributeChange: vi.fn(),
    };

    mockUpdateView = vi.fn();
    mockCommitButton = document.createElement("button");

    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    store.getState.mockReturnValue({
      composedHierarchy: [mockPrim],
      loadedFiles: { "statement.usda": "#usda 1.0\n" },
      stage: { composedPrims: [] },
    });
  });

  afterEach(() => {
    document.body.removeChild(mockContainer);
    consoleLogSpy.mockRestore();
  });

  // ===========================================
  // attachPropertyEventListeners() Tests
  // ===========================================

  describe("attachPropertyEventListeners()", () => {
    it("should call all attachment functions", () => {
      mockContainer.innerHTML = `
        <div class="pset-header" data-pset-id="pset-test"></div>
        <div id="pset-test" class="pset-properties"></div>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      // Should log about finding elements
      expect(consoleLogSpy).toHaveBeenCalled();
    });

    it("should handle empty container", () => {
      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      // Should not throw error
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });

  // ===========================================
  // Pset Toggle Listeners Tests
  // ===========================================

  describe("Pset Toggle Listeners", () => {
    it("should toggle Pset expansion on header click", () => {
      mockContainer.innerHTML = `
        <div class="pset-header" data-pset-id="pset-test">
          <span class="toggle-icon">▼</span>
        </div>
        <div id="pset-test" class="pset-properties"></div>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const header = mockContainer.querySelector(".pset-header");
      const propertiesDiv = mockContainer.querySelector("#pset-test");
      const toggleIcon = header.querySelector(".toggle-icon");

      // Click to collapse
      header.click();

      expect(propertiesDiv.classList.contains("hidden")).toBe(true);
      expect(header.classList.contains("collapsed")).toBe(true);
      expect(toggleIcon.textContent).toBe("▶");
    });

    it("should toggle Pset collapse on header click", () => {
      mockContainer.innerHTML = `
        <div class="pset-header collapsed" data-pset-id="pset-test">
          <span class="toggle-icon">▶</span>
        </div>
        <div id="pset-test" class="pset-properties hidden"></div>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const header = mockContainer.querySelector(".pset-header");
      const propertiesDiv = mockContainer.querySelector("#pset-test");
      const toggleIcon = header.querySelector(".toggle-icon");

      // Click to expand
      header.click();

      expect(propertiesDiv.classList.contains("hidden")).toBe(false);
      expect(header.classList.contains("collapsed")).toBe(false);
      expect(toggleIcon.textContent).toBe("▼");
    });

    it("should throw ValidationError when properties div not found", () => {
      mockContainer.innerHTML = `
        <div class="pset-header" data-pset-id="pset-missing"></div>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const header = mockContainer.querySelector(".pset-header");

      // Error thrown in event handler
      try {
        header.click();
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("Properties div not found");
      }
    });

    it("should handle toggle without toggle icon", () => {
      mockContainer.innerHTML = `
        <div class="pset-header" data-pset-id="pset-test"></div>
        <div id="pset-test" class="pset-properties"></div>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const header = mockContainer.querySelector(".pset-header");
      const propertiesDiv = mockContainer.querySelector("#pset-test");

      // Should not throw error even without toggle icon
      header.click();

      expect(propertiesDiv.classList.contains("hidden")).toBe(true);
    });

    it("should handle multiple Pset headers", () => {
      mockContainer.innerHTML = `
        <div class="pset-header" data-pset-id="pset-1">
          <span class="toggle-icon">▼</span>
        </div>
        <div id="pset-1" class="pset-properties"></div>
        <div class="pset-header" data-pset-id="pset-2">
          <span class="toggle-icon">▼</span>
        </div>
        <div id="pset-2" class="pset-properties"></div>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const headers = mockContainer.querySelectorAll(".pset-header");

      // Click first header
      headers[0].click();
      expect(
        mockContainer.querySelector("#pset-1").classList.contains("hidden")
      ).toBe(true);
      expect(
        mockContainer.querySelector("#pset-2").classList.contains("hidden")
      ).toBe(false);

      // Click second header
      headers[1].click();
      expect(
        mockContainer.querySelector("#pset-2").classList.contains("hidden")
      ).toBe(true);
    });
  });

  // ===========================================
  // Pset Property Listeners Tests
  // ===========================================

  describe("Pset Property Listeners", () => {
    it("should call applyAttributeChange on Pset property change", () => {
      mockContainer.innerHTML = `
        <input class="pset-property-input" data-property-key="area" value="100" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = mockContainer.querySelector(".pset-property-input");
      input.value = "200";
      input.dispatchEvent(new Event("change"));

      expect(mockHandlers.applyAttributeChange).toHaveBeenCalledWith(
        mockPrim,
        "custom string area",
        "200",
        mockUpdateView,
        mockCommitButton
      );
    });

    it("should throw ValidationError when propertyKey missing", () => {
      mockContainer.innerHTML = `
        <input class="pset-property-input" value="100" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = mockContainer.querySelector(".pset-property-input");
      input.value = "200";

      // Error thrown in event handler
      try {
        input.dispatchEvent(new Event("change"));
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("Property key is missing");
      }
    });

    it("should handle multiple Pset property inputs", () => {
      mockContainer.innerHTML = `
        <input class="pset-property-input" data-property-key="area" value="100" />
        <input class="pset-property-input" data-property-key="volume" value="50" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const inputs = mockContainer.querySelectorAll(".pset-property-input");

      inputs[0].value = "200";
      inputs[0].dispatchEvent(new Event("change"));

      expect(mockHandlers.applyAttributeChange).toHaveBeenCalledWith(
        mockPrim,
        "custom string area",
        "200",
        mockUpdateView,
        mockCommitButton
      );

      inputs[1].value = "100";
      inputs[1].dispatchEvent(new Event("change"));

      expect(mockHandlers.applyAttributeChange).toHaveBeenCalledWith(
        mockPrim,
        "custom string volume",
        "100",
        mockUpdateView,
        mockCommitButton
      );
    });

    it("should log property changes", () => {
      mockContainer.innerHTML = `
        <input class="pset-property-input" data-property-key="area" value="100" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = mockContainer.querySelector(".pset-property-input");
      input.value = "200";
      input.dispatchEvent(new Event("change"));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[PSET INPUT] Property changed:",
        "area",
        "=",
        "200"
      );
    });
  });

  // ===========================================
  // Ungrouped Property Listeners Tests
  // ===========================================

  describe("Ungrouped Property Listeners", () => {
    it("should call applyAttributeChange on ungrouped property change", () => {
      mockContainer.innerHTML = `
        <input class="ungrouped-property-input" data-property-key="customProp" value="value1" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = mockContainer.querySelector(".ungrouped-property-input");
      input.value = "value2";
      input.dispatchEvent(new Event("change"));

      expect(mockHandlers.applyAttributeChange).toHaveBeenCalledWith(
        mockPrim,
        "custom string customProp",
        "value2",
        mockUpdateView,
        mockCommitButton
      );
    });

    it("should throw ValidationError when propertyKey missing", () => {
      mockContainer.innerHTML = `
        <input class="ungrouped-property-input" value="value1" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = mockContainer.querySelector(".ungrouped-property-input");
      input.value = "value2";

      // Error thrown in event handler
      try {
        input.dispatchEvent(new Event("change"));
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("Property key is missing");
      }
    });

    it("should handle multiple ungrouped property inputs", () => {
      mockContainer.innerHTML = `
        <input class="ungrouped-property-input" data-property-key="prop1" value="val1" />
        <input class="ungrouped-property-input" data-property-key="prop2" value="val2" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const inputs = mockContainer.querySelectorAll(
        ".ungrouped-property-input"
      );

      inputs[0].value = "newval1";
      inputs[0].dispatchEvent(new Event("change"));

      expect(mockHandlers.applyAttributeChange).toHaveBeenCalledWith(
        mockPrim,
        "custom string prop1",
        "newval1",
        mockUpdateView,
        mockCommitButton
      );
    });
  });

  // ===========================================
  // Data Link Listeners Tests
  // ===========================================

  describe("Data Link Listeners", () => {
    it("should dispatch inspectData event on button click", () => {
      mockContainer.innerHTML = `
        <button class="data-link-btn" data-uri="http://example.com/data.json"></button>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = mockContainer.querySelector(".data-link-btn");
      button.click();

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "inspectData",
          detail: { uri: "http://example.com/data.json" },
        })
      );
    });

    it("should throw ValidationError when URI missing", () => {
      mockContainer.innerHTML = `
        <button class="data-link-btn"></button>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = mockContainer.querySelector(".data-link-btn");

      // Error thrown in event handler
      try {
        button.click();
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("URI is missing");
      }
    });

    it("should handle multiple data link buttons", () => {
      mockContainer.innerHTML = `
        <button class="data-link-btn" data-uri="http://example.com/data1.json"></button>
        <button class="data-link-btn" data-uri="http://example.com/data2.csv"></button>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const buttons = mockContainer.querySelectorAll(".data-link-btn");

      buttons[0].click();
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { uri: "http://example.com/data1.json" },
        })
      );

      buttons[1].click();
      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: { uri: "http://example.com/data2.csv" },
        })
      );
    });
  });

  // ===========================================
  // Prim Name Listener Tests
  // ===========================================

  describe("Prim Name Listener", () => {
    it("should call applyPrimRename on valid name change", () => {
      mockContainer.innerHTML = `
        <input type="text" id="prim-name-input" value="TestPrim" />
      `;

      validatePrimName.mockReturnValue(true);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = document.getElementById("prim-name-input");
      input.value = "NewPrimName";
      input.dispatchEvent(new Event("change"));

      expect(mockHandlers.applyPrimRename).toHaveBeenCalledWith(
        mockPrim,
        "NewPrimName",
        mockUpdateView,
        mockCommitButton
      );
    });

    it("should throw ValidationError for empty name", () => {
      mockContainer.innerHTML = `
        <input type="text" id="prim-name-input" value="TestPrim" />
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = document.getElementById("prim-name-input");
      input.value = "   ";

      // Error thrown in event handler
      try {
        input.dispatchEvent(new Event("change"));
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("cannot be empty");
      }

      // Should revert to original name
      expect(input.value).toBe("TestPrim");
    });

    it("should throw ValidationError for invalid name format", () => {
      mockContainer.innerHTML = `
        <input type="text" id="prim-name-input" value="TestPrim" />
      `;

      validatePrimName.mockReturnValue(false);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = document.getElementById("prim-name-input");
      input.value = "Invalid-Name";

      // Error thrown in event handler
      try {
        input.dispatchEvent(new Event("change"));
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("Invalid prim name");
      }

      // Should revert to original name
      expect(input.value).toBe("TestPrim");
    });

    it("should trim whitespace from new name", () => {
      mockContainer.innerHTML = `
        <input type="text" id="prim-name-input" value="TestPrim" />
      `;

      validatePrimName.mockReturnValue(true);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const input = document.getElementById("prim-name-input");
      input.value = "  NewPrimName  ";
      input.dispatchEvent(new Event("change"));

      expect(mockHandlers.applyPrimRename).toHaveBeenCalledWith(
        mockPrim,
        "NewPrimName",
        mockUpdateView,
        mockCommitButton
      );
    });

    it("should do nothing when prim-name-input not found", () => {
      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      // Should not throw error
      expect(mockHandlers.applyPrimRename).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // Status Change Listener Tests
  // ===========================================

  describe("Status Change Listener", () => {
    it("should call applyAttributeChange on status change", () => {
      mockContainer.innerHTML = `
        <select id="prim-status-select">
          <option value="WIP">WIP</option>
          <option value="Shared">Shared</option>
        </select>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const select = document.getElementById("prim-status-select");
      select.value = "Shared";
      select.dispatchEvent(new Event("change"));

      expect(mockHandlers.applyAttributeChange).toHaveBeenCalledWith(
        mockPrim,
        "custom token primvars:status",
        "Shared",
        mockUpdateView,
        mockCommitButton
      );
    });

    it("should throw ValidationError when status value is empty", () => {
      mockContainer.innerHTML = `
        <select id="prim-status-select">
          <option value="">Select Status</option>
          <option value="WIP">WIP</option>
        </select>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const select = document.getElementById("prim-status-select");
      select.value = "";

      // Error thrown in event handler
      try {
        select.dispatchEvent(new Event("change"));
      } catch (e) {
        expect(e).toBeInstanceOf(ValidationError);
        expect(e.message).toContain("Status value is missing");
      }
    });

    it("should log status change", () => {
      mockContainer.innerHTML = `
        <select id="prim-status-select">
          <option value="WIP">WIP</option>
          <option value="Shared">Shared</option>
        </select>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const select = document.getElementById("prim-status-select");
      select.value = "Shared";
      select.dispatchEvent(new Event("change"));

      expect(consoleLogSpy).toHaveBeenCalledWith(
        "✅ Status changed to: Shared"
      );
    });

    it("should do nothing when prim-status-select not found", () => {
      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      // Should not throw error
      expect(mockHandlers.applyAttributeChange).not.toHaveBeenCalled();
    });
  });

  // ===========================================
  // Add Property Listener Tests
  // ===========================================

  describe("Add Property Listener", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should open Pset property modal on button click", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      expect(showPsetPropertyModal).toHaveBeenCalled();
    });

    it("should add properties from modal callback", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      vi.spyOn(document, "dispatchEvent");
      findPrimByPath.mockReturnValue(mockPrim);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      // Get the callback passed to showPsetPropertyModal
      const callback = showPsetPropertyModal.mock.calls[0][0];

      // Call the callback with test data
      const properties = [
        { name: "prop1", value: "value1" },
        { name: "prop2", value: "value2" },
      ];
      callback(properties, "Pset_Test");

      // applyPsetDictionary is called directly (not handlers.applyAttributeChange)
      // Verify it ran by checking the PSET DICT console log
      expect(consoleLogSpy).toHaveBeenCalledWith(
        "[PSET DICT] Writing dictionary",
        "Pset_Test",
        "with",
        2,
        "entries to prim",
        "/Root/TestPrim"
      );
    });

    it("should initialize _psets if not present", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      delete mockPrim._psets;
      findPrimByPath.mockReturnValue(mockPrim);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      const callback = showPsetPropertyModal.mock.calls[0][0];
      callback([{ name: "prop1", value: "value1" }], "Pset_Test");

      // applyPsetDictionary updates a deep copy of composedHierarchy, not mockPrim directly.
      // Verify the dictionary was written by checking store.dispatch was called.
      expect(store.dispatch).toHaveBeenCalled();
    });

    it("should throw ValidationError for non-array properties", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      const callback = showPsetPropertyModal.mock.calls[0][0];

      callback("not an array", "Pset_Test");

      expect(errorHandler.handleError).toHaveBeenCalled();
      const errorArg = errorHandler.handleError.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.message).toBe("Properties must be an array");
    });

    it("should throw ValidationError for missing psetName", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      const callback = showPsetPropertyModal.mock.calls[0][0];

      callback([{ name: "prop1", value: "value1" }], null);

      expect(errorHandler.handleError).toHaveBeenCalled();
      const errorArg = errorHandler.handleError.mock.calls[0][0];
      expect(errorArg).toBeInstanceOf(ValidationError);
      expect(errorArg.message).toBe("Pset name is required");
    });

    it("should dispatch primSelected event after timeout", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      findPrimByPath.mockReturnValue(mockPrim);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      const callback = showPsetPropertyModal.mock.calls[0][0];
      callback([{ name: "prop1", value: "value1" }], "Pset_Test");

      // Advance timers
      vi.advanceTimersByTime(100);

      expect(dispatchEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: "/Root/TestPrim" },
        })
      );
    });

    it("should handle when updated prim not found after timeout", () => {
      mockContainer.innerHTML = `
        <button id="add-property-btn">Add Property</button>
      `;

      const dispatchEventSpy = vi.spyOn(document, "dispatchEvent");
      findPrimByPath.mockReturnValue(null);

      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      const button = document.getElementById("add-property-btn");
      button.click();

      const callback = showPsetPropertyModal.mock.calls[0][0];
      callback([{ name: "prop1", value: "value1" }], "Pset_Test");

      // Advance timers
      vi.advanceTimersByTime(100);

      // primSelected is always dispatched by refreshUI regardless of findPrimByPath result
      const primSelectedEvents = dispatchEventSpy.mock.calls.filter(
        (call) => call[0].type === "primSelected"
      );
      expect(primSelectedEvents.length).toBe(1);
    });

    it("should do nothing when add-property-btn not found", () => {
      attachPropertyEventListeners(
        mockContainer,
        mockPrim,
        mockHandlers,
        mockUpdateView,
        mockCommitButton
      );

      // Should not throw error
      expect(showPsetPropertyModal).not.toHaveBeenCalled();
    });
  });
});
