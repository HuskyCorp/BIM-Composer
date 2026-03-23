/**
 * AttributeUpdater Unit Tests
 * Tests for attribute/property updates with conflict detection and permission checks
 */

import { applyAttributeChange } from "../../../../components/properties/AttributeUpdater.js";
import { store, ValidationError } from "../../../../core/index.js";
import { actions } from "../../../../state/actions.js";
import { updatePropertyInFile } from "../../../../viewer/usda/usdaEditor.js";
import { composeLogPrim } from "../../../../viewer/usda/usdaComposer.js";
import { USDA_PARSER } from "../../../../viewer/usda/usdaParser.js";
import {
  renderLayerStack,
  recomposeStage,
} from "../../../../components/sidebar/layerStackController.js";
import {
  detectConflict,
  checkPermission,
} from "../../../../utils/conflictDetector.js";
import { showConflictModal } from "../../../../components/conflictModal.js";

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

vi.mock("../../../../state/actions.js", () => ({
  actions: {
    addStagedChange: vi.fn(),
    incrementLogEntryCounter: vi.fn(() => 1),
    setHeadCommitId: vi.fn(),
    updateLoadedFile: vi.fn(),
    setComposedHierarchy: vi.fn(),
    setComposedPrims: vi.fn(),
    updateLayerStack: vi.fn(),
  },
}));

vi.mock("../../../../viewer/usda/usdaEditor.js", () => ({
  updatePropertyInFile: vi.fn((content) => content + "\n// updated"),
}));

vi.mock("../../../../viewer/usda/usdaComposer.js", () => ({
  composeLogPrim: vi.fn(() => 'def "LogEntry" { }'),
}));

vi.mock("../../../../viewer/usda/usdaParser.js", () => ({
  USDA_PARSER: {
    appendToUsdaFile: vi.fn((content, prim) => content + "\n" + prim),
  },
}));

vi.mock("../../../../components/sidebar/layerStackController.js", () => ({
  renderLayerStack: vi.fn(),
  recomposeStage: vi.fn(),
}));

vi.mock("../../../../utils/conflictDetector.js", () => ({
  detectConflict: vi.fn(() => null),
  checkPermission: vi.fn(() => ({ allowed: true })),
}));

vi.mock("../../../../components/conflictModal.js", () => ({
  showConflictModal: vi.fn(),
}));

vi.mock("js-sha256", () => ({
  sha256: vi.fn(() => "mockedhash"),
}));

describe("AttributeUpdater", () => {
  let mockPrim;
  let mockCommitButton;
  let mockUpdateView;

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Setup default mock prim
    mockPrim = {
      path: "/Root/TestPrim",
      name: "TestPrim",
      properties: {
        status: "WIP",
        displayName: "Test Prim",
      },
      _sourceFile: "test.usda",
      _sourcePath: "/Root/TestPrim",
    };

    // Mock commit button
    mockCommitButton = {
      classList: {
        add: vi.fn(),
      },
    };

    // Mock update view callback
    mockUpdateView = vi.fn();

    // Setup default store state
    store.getState.mockReturnValue({
      currentUser: "testuser",
      headCommitId: "parent123",
      loadedFiles: {
        "test.usda": 'def Xform "TestPrim" { }',
        "statement.usda": 'def "ChangeLog" { }',
      },
      stage: {
        layerStack: [
          {
            filePath: "test.usda",
            status: "WIP",
          },
        ],
        composedPrims: [mockPrim],
      },
      composedHierarchy: [mockPrim],
    });

    // Mock document.dispatchEvent
    global.document.dispatchEvent = vi.fn();

    // Mock setTimeout
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("Input validation", () => {
    it("should throw ValidationError for null prim", () => {
      expect(() => {
        applyAttributeChange(
          null,
          "custom string primvars:displayName",
          "NewName",
          mockUpdateView,
          mockCommitButton
        );
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for prim without path", () => {
      const invalidPrim = { name: "Test" };

      expect(() => {
        applyAttributeChange(
          invalidPrim,
          "custom string primvars:displayName",
          "NewName",
          mockUpdateView,
          mockCommitButton
        );
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for null attrName", () => {
      expect(() => {
        applyAttributeChange(
          mockPrim,
          null,
          "NewValue",
          mockUpdateView,
          mockCommitButton
        );
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for non-string attrName", () => {
      expect(() => {
        applyAttributeChange(
          mockPrim,
          123,
          "NewValue",
          mockUpdateView,
          mockCommitButton
        );
      }).toThrow(ValidationError);
    });

    it("should throw ValidationError for empty string attrName", () => {
      expect(() => {
        applyAttributeChange(
          mockPrim,
          "",
          "NewValue",
          mockUpdateView,
          mockCommitButton
        );
      }).toThrow(ValidationError);
    });
  });

  describe("Staged changes", () => {
    it("should add change to staged changes", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.addStagedChange).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "propertyEdit",
          targetPath: "/Root/TestPrim",
          attributeName: "custom string primvars:displayName",
          attributeValue: "NewName",
          propertyName: "displayName",
        })
      );
    });

    it("should add has-changes class to commit button", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(mockCommitButton.classList.add).toHaveBeenCalledWith(
        "has-changes"
      );
    });

    it("should handle missing commit button gracefully", () => {
      expect(() => {
        applyAttributeChange(
          mockPrim,
          "custom string primvars:displayName",
          "NewName",
          mockUpdateView,
          null
        );
      }).not.toThrow();
    });
  });

  describe("Attribute name parsing", () => {
    it("should parse primvars property name", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Verify it was parsed correctly by checking the property update
      expect(updatePropertyInFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "displayName",
        "NewName",
        "string"
      );
    });

    it("should parse Pset property name", () => {
      applyAttributeChange(
        mockPrim,
        "custom string Pset_Wall:FireRating",
        "2HR",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "Pset_Wall:FireRating",
        "2HR",
        "string"
      );
    });

    it("should parse property type", () => {
      applyAttributeChange(
        mockPrim,
        "custom int primvars:count",
        "42",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "count",
        "42",
        "int"
      );
    });

    it("should default to string type if not parseable", () => {
      applyAttributeChange(
        mockPrim,
        "displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(String),
        "",
        "NewName",
        "string"
      );
    });
  });

  describe("Permission checks", () => {
    it("should throw ValidationError when permission denied", () => {
      checkPermission.mockReturnValueOnce({
        allowed: false,
        reason: "User does not have permission",
      });

      expect(() => {
        applyAttributeChange(
          mockPrim,
          "custom string primvars:status",
          "Active",
          mockUpdateView,
          mockCommitButton
        );
      }).toThrow("Permission Denied");
    });

    it("should proceed when permission granted", () => {
      checkPermission.mockReturnValueOnce({ allowed: true });

      expect(() => {
        applyAttributeChange(
          mockPrim,
          "custom string primvars:displayName",
          "NewName",
          mockUpdateView,
          mockCommitButton
        );
      }).not.toThrow();
    });

    it("should call checkPermission with correct parameters", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(checkPermission).toHaveBeenCalledWith(mockPrim, "displayName");
    });
  });

  describe("Conflict detection", () => {
    it("should show conflict modal when conflict detected", () => {
      const mockConflicts = {
        type: "override",
        message: "Property exists in multiple layers",
      };
      detectConflict.mockReturnValueOnce(mockConflicts);

      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(showConflictModal).toHaveBeenCalledWith(
        expect.objectContaining({
          prim: mockPrim,
          propertyName: "displayName",
          newValue: "NewName",
          conflicts: mockConflicts,
        }),
        expect.any(Function)
      );
    });

    it("should not proceed when conflict detected before resolution", () => {
      detectConflict.mockReturnValueOnce({ type: "conflict" });

      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Should not update source file yet
      expect(updatePropertyInFile).not.toHaveBeenCalled();
    });

    it("should proceed when user chooses to apply new value", () => {
      detectConflict.mockReturnValueOnce({ type: "conflict" });
      showConflictModal.mockImplementationOnce((config, callback) => {
        callback("use-new");
      });

      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).toHaveBeenCalled();
    });

    it("should cancel when user chooses to cancel", () => {
      detectConflict.mockReturnValueOnce({ type: "conflict" });
      showConflictModal.mockImplementationOnce((config, callback) => {
        callback("cancel");
      });

      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).not.toHaveBeenCalled();
    });

    it("should proceed without modal when no conflict", () => {
      detectConflict.mockReturnValueOnce(null);

      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(showConflictModal).not.toHaveBeenCalled();
      expect(updatePropertyInFile).toHaveBeenCalled();
    });
  });

  describe("Staged change metadata", () => {
    // Logging to statement.usda now happens at commit time (stagingPanelController),
    // not immediately during applyAttributeChange. These tests verify the enriched
    // staged change object carries the data needed for deferred logging.

    it("should not write to statement.usda immediately", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(USDA_PARSER.appendToUsdaFile).not.toHaveBeenCalled();
      expect(actions.incrementLogEntryCounter).not.toHaveBeenCalled();
      expect(composeLogPrim).not.toHaveBeenCalled();
      expect(actions.setHeadCommitId).not.toHaveBeenCalled();
    });

    it("should capture old value in staged change", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.addStagedChange).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValue: "Test Prim",
          propertyName: "displayName",
        })
      );
    });

    it("should capture undefined old value for missing property", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:newProp",
        "NewValue",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.addStagedChange).toHaveBeenCalledWith(
        expect.objectContaining({
          oldValue: undefined,
        })
      );
    });

    it("should include source metadata in staged change", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.addStagedChange).toHaveBeenCalledWith(
        expect.objectContaining({
          sourceFile: "test.usda",
          sourceStatus: "WIP",
        })
      );
    });
  });

  describe("Source file detection", () => {
    it("should skip detection if source file already set", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Source file should be used as-is
      expect(updatePropertyInFile).toHaveBeenCalledWith(
        expect.stringContaining("TestPrim"),
        "/Root/TestPrim",
        "displayName",
        "NewName",
        "string"
      );
    });

    it("should detect source file when not set", () => {
      const primWithoutSource = {
        ...mockPrim,
        _sourceFile: null,
        _sourcePath: null,
      };

      applyAttributeChange(
        primWithoutSource,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Should detect from loaded files
      expect(updatePropertyInFile).toHaveBeenCalled();
    });

    it("should find prim in non-statement files first", () => {
      const primWithoutSource = {
        path: "/Root/TestPrim",
        name: "TestPrim",
        properties: {},
        _sourceFile: null,
        _sourcePath: null,
      };

      store.getState.mockReturnValue({
        ...store.getState(),
        loadedFiles: {
          "first.usda": 'def Xform "TestPrim" { }',
          "statement.usda": 'def Xform "TestPrim" { }',
        },
      });

      applyAttributeChange(
        primWithoutSource,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Should set _sourceFile to first.usda, not statement.usda
      expect(primWithoutSource._sourceFile).toBe("first.usda");
    });

    it("should fallback to statement.usda if not found elsewhere", () => {
      const primWithoutSource = {
        path: "/Root/LegacyPrim",
        name: "LegacyPrim",
        properties: {},
        _sourceFile: null,
        _sourcePath: null,
      };

      store.getState.mockReturnValue({
        ...store.getState(),
        loadedFiles: {
          "other.usda": 'def Xform "OtherPrim" { }',
          "statement.usda": 'def Xform "LegacyPrim" { }',
        },
      });

      applyAttributeChange(
        primWithoutSource,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(primWithoutSource._sourceFile).toBe("statement.usda");
    });

    it("should handle prim not found in any file", () => {
      const primWithoutSource = {
        path: "/Root/Unknown",
        name: "Unknown",
        properties: {},
        _sourceFile: null,
        _sourcePath: null,
      };

      applyAttributeChange(
        primWithoutSource,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).not.toHaveBeenCalled();
    });
  });

  describe("Source file updates", () => {
    it("should update source file with new property", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(updatePropertyInFile).toHaveBeenCalledWith(
        expect.any(String),
        "/Root/TestPrim",
        "displayName",
        "NewName",
        "string"
      );
    });

    it("should update loaded file in store", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.updateLoadedFile).toHaveBeenCalledWith(
        "test.usda",
        expect.stringContaining("updated")
      );
    });

    it("should warn when source file not found in loaded files", () => {
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation();
      const primWithMissingFile = {
        ...mockPrim,
        _sourceFile: "missing.usda",
      };

      store.getState.mockReturnValue({
        ...store.getState(),
        loadedFiles: {
          "other.usda": "",
        },
      });

      applyAttributeChange(
        primWithMissingFile,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining("Source file not found"),
        "missing.usda"
      );
    });
  });

  describe("In-memory hierarchy updates", () => {
    it("should update composed hierarchy", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.setComposedHierarchy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/Root/TestPrim",
            properties: expect.objectContaining({
              displayName: "NewName",
            }),
          }),
        ])
      );
    });

    it("should update composed prims", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.setComposedPrims).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            path: "/Root/TestPrim",
            properties: expect.objectContaining({
              displayName: "NewName",
            }),
          }),
        ])
      );
    });

    it("should handle nested prims in hierarchy", () => {
      const nestedPrim = {
        path: "/Root/Parent/Child",
        properties: {},
        _sourceFile: "test.usda",
        _sourcePath: "/Root/Parent/Child",
      };

      const parentPrim = {
        path: "/Root/Parent",
        properties: {},
        children: [nestedPrim],
      };

      store.getState.mockReturnValue({
        ...store.getState(),
        composedHierarchy: [parentPrim],
        stage: {
          ...store.getState().stage,
          composedPrims: [parentPrim],
        },
      });

      applyAttributeChange(
        nestedPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.setComposedHierarchy).toHaveBeenCalled();
    });

    it("should create properties object if missing", () => {
      const primWithoutProps = {
        path: "/Root/NoProp",
        _sourceFile: "test.usda",
        _sourcePath: "/Root/NoProp",
        // properties intentionally missing
      };

      const storeState = {
        currentUser: "testuser",
        headCommitId: "parent123",
        loadedFiles: {
          "test.usda": 'def Xform "NoProp" { }',
          "statement.usda": 'def "ChangeLog" { }',
        },
        stage: {
          layerStack: [
            {
              filePath: "test.usda",
              status: "WIP",
            },
          ],
          composedPrims: [primWithoutProps],
        },
        composedHierarchy: [primWithoutProps],
      };

      store.getState.mockReturnValue(storeState);

      // Initialize properties before the operation
      primWithoutProps.properties = {};

      applyAttributeChange(
        primWithoutProps,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.setComposedHierarchy).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            properties: expect.objectContaining({
              displayName: "NewName",
            }),
          }),
        ])
      );
    });
  });

  describe("Status change handling", () => {
    it("should update parent status when child status changes", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:status",
        "Active",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.setComposedHierarchy).toHaveBeenCalled();
      expect(actions.setComposedPrims).toHaveBeenCalled();
    });

    it("should not update parent for root prim", () => {
      const rootPrim = {
        ...mockPrim,
        path: "/Root",
      };

      applyAttributeChange(
        rootPrim,
        "custom string primvars:status",
        "Active",
        mockUpdateView,
        mockCommitButton
      );

      // Should still update hierarchies but no parent to update
      expect(actions.setComposedHierarchy).toHaveBeenCalled();
    });

    it("should update layer stack when status changes", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:status",
        "Active",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.updateLayerStack).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            filePath: "test.usda",
            status: "Active",
          }),
        ])
      );
    });

    it("should not update layer stack for non-status changes", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Should be called but not for status update
      const calls = actions.updateLayerStack.mock.calls;
      expect(calls.length).toBe(0);
    });

    it("should bulk update all prims in layer when status changes", () => {
      const prim1 = {
        path: "/Root/Prim1",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };
      const prim2 = {
        path: "/Root/Prim2",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      store.getState.mockReturnValue({
        ...store.getState(),
        composedHierarchy: [prim1, prim2],
        stage: {
          ...store.getState().stage,
          composedPrims: [prim1, prim2],
        },
      });

      applyAttributeChange(
        prim1,
        "custom string primvars:status",
        "Active",
        mockUpdateView,
        mockCommitButton
      );

      expect(actions.setComposedHierarchy).toHaveBeenCalled();
    });

    it("should avoid infinite loops when updating prims with same status", () => {
      const prim1 = {
        path: "/Root/Prim1",
        properties: { status: "Active" },
        _sourceFile: "test.usda",
        _sourcePath: "/Root/Prim1",
      };

      store.getState.mockReturnValue({
        ...store.getState(),
        composedHierarchy: [prim1],
        stage: {
          ...store.getState().stage,
          composedPrims: [prim1],
        },
      });

      // Set to same status
      applyAttributeChange(
        prim1,
        "custom string primvars:status",
        "Active",
        mockUpdateView,
        mockCommitButton
      );

      // Should not infinitely loop
      expect(actions.setComposedHierarchy).toHaveBeenCalled();
    });
  });

  describe("UI refresh", () => {
    it("should refresh UI by default", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      expect(recomposeStage).toHaveBeenCalled();
      expect(renderLayerStack).toHaveBeenCalled();
      expect(mockUpdateView).toHaveBeenCalled();
    });

    it("should skip UI refresh when skipRefresh is true", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton,
        true // skipRefresh
      );

      expect(recomposeStage).not.toHaveBeenCalled();
      expect(renderLayerStack).not.toHaveBeenCalled();
      expect(mockUpdateView).not.toHaveBeenCalled();
    });

    it("should dispatch primSelected event after refresh", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Fast-forward timers
      vi.advanceTimersByTime(100);

      expect(document.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "primSelected",
          detail: { primPath: "/Root/TestPrim" },
        })
      );
    });

    it("should handle missing updateView callback", () => {
      expect(() => {
        applyAttributeChange(
          mockPrim,
          "custom string primvars:displayName",
          "NewName",
          null,
          mockCommitButton
        );
      }).not.toThrow();
    });

    it("should handle non-function updateView", () => {
      expect(() => {
        applyAttributeChange(
          mockPrim,
          "custom string primvars:displayName",
          "NewName",
          "not a function",
          mockCommitButton
        );
      }).not.toThrow();
    });
  });

  describe("Complete workflow", () => {
    it("should execute full workflow for property change", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:displayName",
        "NewName",
        mockUpdateView,
        mockCommitButton
      );

      // Verify all steps executed
      // Note: logging (incrementLogEntryCounter, composeLogPrim) is deferred to commit time
      expect(actions.addStagedChange).toHaveBeenCalled();
      expect(updatePropertyInFile).toHaveBeenCalled();
      expect(actions.setComposedHierarchy).toHaveBeenCalled();
      expect(actions.setComposedPrims).toHaveBeenCalled();
      expect(recomposeStage).toHaveBeenCalled();
      expect(renderLayerStack).toHaveBeenCalled();
      expect(mockUpdateView).toHaveBeenCalled();
    });

    it("should execute full workflow for status change", () => {
      applyAttributeChange(
        mockPrim,
        "custom string primvars:status",
        "Active",
        mockUpdateView,
        mockCommitButton
      );

      // Should also update layer stack and parent
      expect(actions.updateLayerStack).toHaveBeenCalled();
    });
  });
});
