/**
 * conflictDetector Unit Tests
 * Tests for conflict detection and permission checking in property updates
 */

import {
  detectConflict,
  checkPermission,
} from "../../../utils/conflictDetector.js";
import { store } from "../../../core/index.js";
import { USDA_PARSER } from "../../../viewer/usda/usdaParser.js";

// Mock dependencies
vi.mock("../../../core/index.js", () => ({
  store: {
    getState: vi.fn(),
  },
}));

vi.mock("../../../viewer/usda/usdaParser.js", () => ({
  USDA_PARSER: {
    getPrimHierarchy: vi.fn(),
  },
}));

describe("conflictDetector", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ===========================================
  // detectConflict() Tests
  // ===========================================

  describe("detectConflict()", () => {
    let mockPrim;
    let mockState;

    beforeEach(() => {
      mockPrim = {
        path: "/Root/TestPrim",
        name: "TestPrim",
        properties: {
          status: "WIP",
          displayName: "Test Display Name",
        },
        _sourceFile: "test.usda",
      };

      mockState = {
        currentUser: "User1",
        stage: {
          layerStack: [{ filePath: "test.usda", owner: "User1" }],
        },
        loadedFiles: {},
      };

      store.getState.mockReturnValue(mockState);
      USDA_PARSER.getPrimHierarchy.mockReturnValue([]);
    });

    describe("Same Value Check", () => {
      it("should return null when new value equals current value", () => {
        const result = detectConflict(mockPrim, "status", "WIP");
        expect(result).toBe(null);
      });

      it("should return null when both values are empty strings", () => {
        mockPrim.properties.customProp = "";
        const result = detectConflict(mockPrim, "customProp", "");
        expect(result).toBe(null);
      });

      it("should return null when both values are null", () => {
        mockPrim.properties.customProp = null;
        const result = detectConflict(mockPrim, "customProp", null);
        expect(result).toBe(null);
      });
    });

    describe("Source File Ownership Conflicts", () => {
      it("should detect ownership conflict when different user owns layer", () => {
        mockState.stage.layerStack[0].owner = "User2";
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        expect(result).toBeTruthy();
        expect(result).toHaveLength(1);
        expect(result[0].type).toBe("ownership");
        expect(result[0].owner).toBe("User2");
        expect(result[0].file).toBe("test.usda");
      });

      it("should not detect ownership conflict when same user owns layer", () => {
        mockState.stage.layerStack[0].owner = "User1";
        mockState.currentUser = "User1";
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const ownershipConflict = result.find((c) => c.type === "ownership");
          expect(ownershipConflict).toBeUndefined();
        }
      });

      it("should include currentValue in ownership conflict", () => {
        mockState.stage.layerStack[0].owner = "User2";
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        expect(result[0].currentValue).toBe("WIP");
      });

      it("should not detect ownership conflict when no owner specified", () => {
        mockState.stage.layerStack[0].owner = null;
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const ownershipConflict = result.find((c) => c.type === "ownership");
          expect(ownershipConflict).toBeUndefined();
        }
      });
    });

    describe("Source File Property Definition Conflicts", () => {
      it("should detect conflict when property defined in source file", () => {
        const sourceHierarchy = [
          {
            path: "/Root/TestPrim",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        const sourceDefConflict = result.find(
          (c) => c.type === "source_definition"
        );
        expect(sourceDefConflict).toBeTruthy();
        expect(sourceDefConflict.file).toBe("test.usda");
        expect(sourceDefConflict.currentValue).toBe("WIP");
      });

      it("should use _sourcePath if available", () => {
        mockPrim._sourcePath = "/Different/Path";
        const sourceHierarchy = [
          {
            path: "/Different/Path",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        const sourceDefConflict = result.find(
          (c) => c.type === "source_definition"
        );
        expect(sourceDefConflict).toBeTruthy();
      });

      it("should not detect conflict when property not in source file", () => {
        const sourceHierarchy = [
          {
            path: "/Root/TestPrim",
            properties: {},
            children: [],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const sourceDefConflict = result.find(
            (c) => c.type === "source_definition"
          );
          expect(sourceDefConflict).toBeUndefined();
        }
      });

      it("should handle source file not found in loadedFiles", () => {
        mockState.loadedFiles = {};
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const sourceDefConflict = result.find(
            (c) => c.type === "source_definition"
          );
          expect(sourceDefConflict).toBeUndefined();
        }
      });

      it("should set owner to unknown when not specified", () => {
        mockState.stage.layerStack[0].owner = null;
        const sourceHierarchy = [
          {
            path: "/Root/TestPrim",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        const sourceDefConflict = result.find(
          (c) => c.type === "source_definition"
        );
        expect(sourceDefConflict.owner).toBe("unknown");
      });

      it("should handle nested prims in hierarchy", () => {
        const sourceHierarchy = [
          {
            path: "/Root",
            properties: {},
            children: [
              {
                path: "/Root/TestPrim",
                properties: { status: "WIP" },
                children: [],
              },
            ],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        const sourceDefConflict = result.find(
          (c) => c.type === "source_definition"
        );
        expect(sourceDefConflict).toBeTruthy();
      });

      it("should handle deeply nested prims", () => {
        const sourceHierarchy = [
          {
            path: "/Root",
            properties: {},
            children: [
              {
                path: "/Root/Level1",
                properties: {},
                children: [
                  {
                    path: "/Root/Level1/TestPrim",
                    properties: { status: "WIP" },
                    children: [],
                  },
                ],
              },
            ],
          },
        ];

        mockPrim.path = "/Root/Level1/TestPrim";
        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        const sourceDefConflict = result.find(
          (c) => c.type === "source_definition"
        );
        expect(sourceDefConflict).toBeTruthy();
      });
    });

    describe("Statement.usda Override Conflicts", () => {
      it("should detect conflict when property overridden in statement.usda", () => {
        const statementHierarchy = [
          {
            path: "/Root/TestPrim",
            properties: { status: "Shared" },
            children: [],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        mockState.loadedFiles["statement.usda"] = 'over "TestPrim" { }';
        // First call: source file hierarchy (no status property)
        // Second call: statement.usda hierarchy (has status property)
        // Third call: layer stack iteration
        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce([
            { path: "/Root/TestPrim", properties: {}, children: [] },
          ])
          .mockReturnValueOnce(statementHierarchy)
          .mockReturnValueOnce([
            { path: "/Root/TestPrim", properties: {}, children: [] },
          ]);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Published");

        const stagedConflict = result.find((c) => c.type === "staged_override");
        expect(stagedConflict).toBeTruthy();
        expect(stagedConflict.file).toBe("statement.usda");
        expect(stagedConflict.owner).toBe("staged changes");
        expect(stagedConflict.currentValue).toBe("Shared");
      });

      it("should not detect conflict when property not in statement.usda", () => {
        const statementHierarchy = [
          {
            path: "/Root/TestPrim",
            properties: {},
            children: [],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        mockState.loadedFiles["statement.usda"] = 'over "TestPrim" { }';
        // First call: source file hierarchy (no status property)
        // Second call: statement.usda hierarchy (no status property)
        // Third call: layer stack iteration
        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce([
            { path: "/Root/TestPrim", properties: {}, children: [] },
          ])
          .mockReturnValueOnce(statementHierarchy)
          .mockReturnValueOnce([
            { path: "/Root/TestPrim", properties: {}, children: [] },
          ]);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const stagedConflict = result.find(
            (c) => c.type === "staged_override"
          );
          expect(stagedConflict).toBeUndefined();
        }
      });

      it("should handle statement.usda not in loadedFiles", () => {
        mockState.loadedFiles = { "test.usda": 'def "TestPrim" { }' };
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const stagedConflict = result.find(
            (c) => c.type === "staged_override"
          );
          expect(stagedConflict).toBeUndefined();
        }
      });

      it("should handle nested prims in statement.usda", () => {
        const statementHierarchy = [
          {
            path: "/Root",
            properties: {},
            children: [
              {
                path: "/Root/TestPrim",
                properties: { status: "Shared" },
                children: [],
              },
            ],
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        mockState.loadedFiles["statement.usda"] = 'over "TestPrim" { }';
        // First call: source file hierarchy (no status property)
        // Second call: statement.usda hierarchy (has nested prim with status)
        // Third call: layer stack iteration
        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce([
            { path: "/Root/TestPrim", properties: {}, children: [] },
          ])
          .mockReturnValueOnce(statementHierarchy)
          .mockReturnValueOnce([
            { path: "/Root/TestPrim", properties: {}, children: [] },
          ]);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Published");

        const stagedConflict = result.find((c) => c.type === "staged_override");
        expect(stagedConflict).toBeTruthy();
      });
    });

    describe("Multiple Layer Definition Conflicts", () => {
      it("should detect conflict when property in multiple layers", () => {
        // Remove source file since we're testing multi-layer
        delete mockPrim._sourceFile;

        mockState.stage.layerStack = [
          { filePath: "layer1.usda", owner: "User1" },
          { filePath: "layer2.usda", owner: "User2" },
        ];

        const hierarchy1 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        const hierarchy2 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "Shared" },
            children: [],
          },
        ];

        mockState.loadedFiles = {
          "layer1.usda": 'def "TestPrim" { }',
          "layer2.usda": 'def "TestPrim" { }',
        };

        // No source file, no statement.usda, just layer stack iterations
        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce(hierarchy1)
          .mockReturnValueOnce(hierarchy2);

        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Published");

        const multiLayerConflict = result.find(
          (c) => c.type === "multi_layer_definition"
        );
        expect(multiLayerConflict).toBeTruthy();
        expect(multiLayerConflict.layers).toHaveLength(2);
        expect(multiLayerConflict.layers[0].file).toBe("layer1.usda");
        expect(multiLayerConflict.layers[1].file).toBe("layer2.usda");
      });

      it("should include layer values in multi-layer conflict", () => {
        // Remove source file since we're testing multi-layer
        delete mockPrim._sourceFile;

        mockState.stage.layerStack = [
          { filePath: "layer1.usda", owner: "User1" },
          { filePath: "layer2.usda", owner: "User2" },
        ];

        const hierarchy1 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        const hierarchy2 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "Shared" },
            children: [],
          },
        ];

        mockState.loadedFiles = {
          "layer1.usda": 'def "TestPrim" { }',
          "layer2.usda": 'def "TestPrim" { }',
        };

        // No source file, no statement.usda, just layer stack iterations
        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce(hierarchy1)
          .mockReturnValueOnce(hierarchy2);

        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Published");

        const multiLayerConflict = result.find(
          (c) => c.type === "multi_layer_definition"
        );
        expect(multiLayerConflict.layers[0].value).toBe("WIP");
        expect(multiLayerConflict.layers[1].value).toBe("Shared");
      });

      it("should not detect multi-layer conflict when property in single layer", () => {
        mockState.stage.layerStack = [
          { filePath: "layer1.usda", owner: "User1" },
          { filePath: "layer2.usda", owner: "User2" },
        ];

        const hierarchy1 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        const hierarchy2 = [
          {
            path: "/Root/TestPrim",
            properties: {},
            children: [],
          },
        ];

        mockState.loadedFiles = {
          "layer1.usda": 'def "TestPrim" { }',
          "layer2.usda": 'def "TestPrim" { }',
        };

        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce([])
          .mockReturnValueOnce([])
          .mockReturnValueOnce(hierarchy1)
          .mockReturnValueOnce(hierarchy2);

        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Published");

        if (result) {
          const multiLayerConflict = result.find(
            (c) => c.type === "multi_layer_definition"
          );
          expect(multiLayerConflict).toBeUndefined();
        }
      });

      it("should set owner to unknown when not specified in layer", () => {
        // Reset the mock to clear any queued return values
        USDA_PARSER.getPrimHierarchy.mockReset();

        // Create fresh prim without source file
        const primWithoutSource = {
          path: "/Root/TestPrim",
          name: "TestPrim",
          properties: { status: "WIP" },
        };

        const stateForTest = {
          currentUser: "User1",
          stage: {
            layerStack: [
              { filePath: "layer1.usda" },
              { filePath: "layer2.usda" },
            ],
          },
          loadedFiles: {
            "layer1.usda": 'def "TestPrim" { }',
            "layer2.usda": 'def "TestPrim" { }',
          },
        };

        const hierarchy1 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "WIP" },
            children: [],
          },
        ];

        const hierarchy2 = [
          {
            path: "/Root/TestPrim",
            properties: { status: "Shared" },
            children: [],
          },
        ];

        store.getState.mockReturnValue(stateForTest);

        // No source file, no statement.usda, just layer stack iterations
        USDA_PARSER.getPrimHierarchy
          .mockReturnValueOnce(hierarchy1)
          .mockReturnValueOnce(hierarchy2);

        const result = detectConflict(primWithoutSource, "status", "Published");

        expect(result).toBeTruthy();
        const multiLayerConflict = result.find(
          (c) => c.type === "multi_layer_definition"
        );
        expect(multiLayerConflict).toBeTruthy();
        expect(multiLayerConflict.layers[0].owner).toBe("unknown");
        expect(multiLayerConflict.layers[1].owner).toBe("unknown");
      });
    });

    describe("Prim Without Source File", () => {
      it("should not detect source-related conflicts when no source file", () => {
        delete mockPrim._sourceFile;
        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const ownershipConflict = result.find((c) => c.type === "ownership");
          expect(ownershipConflict).toBeUndefined();
        }
      });

      it("should still check statement.usda when no source file", () => {
        delete mockPrim._sourceFile;
        const statementHierarchy = [
          {
            path: "/Root/TestPrim",
            properties: { status: "Shared" },
            children: [],
          },
        ];

        mockState.loadedFiles["statement.usda"] = 'over "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(statementHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Published");

        const stagedConflict = result.find((c) => c.type === "staged_override");
        expect(stagedConflict).toBeTruthy();
      });
    });

    describe("Source Layer Not Found", () => {
      it("should not detect source conflicts when layer not in stack", () => {
        mockPrim._sourceFile = "nonexistent.usda";
        mockState.stage.layerStack = [
          { filePath: "other.usda", owner: "User1" },
        ];
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const ownershipConflict = result.find((c) => c.type === "ownership");
          const sourceDefConflict = result.find(
            (c) => c.type === "source_definition"
          );
          expect(ownershipConflict).toBeUndefined();
          expect(sourceDefConflict).toBeUndefined();
        }
      });
    });

    describe("findPrimInHierarchy Edge Cases", () => {
      it("should handle null hierarchy", () => {
        // Reset and setup fresh mock
        USDA_PARSER.getPrimHierarchy.mockReset();
        USDA_PARSER.getPrimHierarchy.mockImplementation(() => null);

        const stateForTest = {
          currentUser: "User1",
          stage: {
            layerStack: [{ filePath: "test.usda", owner: "User1" }],
          },
          loadedFiles: {
            "test.usda": 'def "TestPrim" { }',
          },
        };

        store.getState.mockReturnValue(stateForTest);

        const result = detectConflict(mockPrim, "status", "Shared");

        // With null hierarchy, findPrimInHierarchy returns null, so no conflicts
        expect(result).toBe(null);
      });

      it("should handle non-array hierarchy", () => {
        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        // All calls return non-array
        USDA_PARSER.getPrimHierarchy.mockReturnValue({});
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        // Should not crash and should not find source_definition conflict
        if (result) {
          const sourceDefConflict = result.find(
            (c) => c.type === "source_definition"
          );
          expect(sourceDefConflict).toBeUndefined();
        } else {
          // Result can be null if no conflicts found
          expect(result).toBe(null);
        }
      });

      it("should handle prim without children property", () => {
        const sourceHierarchy = [
          {
            path: "/Root",
            properties: {},
          },
        ];

        mockState.loadedFiles["test.usda"] = 'def "TestPrim" { }';
        USDA_PARSER.getPrimHierarchy.mockReturnValue(sourceHierarchy);
        store.getState.mockReturnValue(mockState);

        const result = detectConflict(mockPrim, "status", "Shared");

        if (result) {
          const sourceDefConflict = result.find(
            (c) => c.type === "source_definition"
          );
          expect(sourceDefConflict).toBeUndefined();
        }
      });
    });
  });

  // ===========================================
  // checkPermission() Tests
  // ===========================================

  describe("checkPermission()", () => {
    let mockPrim;
    let mockState;

    beforeEach(() => {
      mockPrim = {
        path: "/Root/TestPrim",
        name: "TestPrim",
        properties: { status: "WIP" },
        _sourceFile: "test.usda",
      };

      mockState = {
        currentUser: "User1",
        stage: {
          layerStack: [{ filePath: "test.usda", owner: "User1" }],
        },
      };

      store.getState.mockReturnValue(mockState);
    });

    describe("Project Manager Permissions", () => {
      it("should allow Project Manager to edit", () => {
        mockState.currentUser = "Project Manager";
        store.getState.mockReturnValue(mockState);

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain("Project Manager");
      });

      it("should allow Project Manager even when another user owns layer", () => {
        mockState.currentUser = "Project Manager";
        mockState.stage.layerStack[0].owner = "User2";
        store.getState.mockReturnValue(mockState);

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(true);
      });
    });

    describe("Layer Owner Permissions", () => {
      it("should allow layer owner to edit", () => {
        mockState.currentUser = "User1";
        mockState.stage.layerStack[0].owner = "User1";
        store.getState.mockReturnValue(mockState);

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain("User owns this layer");
      });

      it("should not allow non-owner to edit", () => {
        mockState.currentUser = "User2";
        mockState.stage.layerStack[0].owner = "User1";
        store.getState.mockReturnValue(mockState);

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(false);
        expect(result.reason).toContain("owned by User1");
      });

      it("should include both owner and PM in denial reason", () => {
        mockState.currentUser = "User2";
        mockState.stage.layerStack[0].owner = "User1";
        store.getState.mockReturnValue(mockState);

        const result = checkPermission(mockPrim);

        expect(result.reason).toContain("owner or Project Manager");
      });
    });

    describe("Prim Without Source File", () => {
      it("should allow editing when no source file", () => {
        delete mockPrim._sourceFile;

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain("No ownership restrictions");
      });

      it("should allow editing for staged prims", () => {
        mockPrim._sourceFile = null;

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(true);
      });
    });

    describe("Source Layer Not Found", () => {
      it("should allow editing when source layer not in stack", () => {
        mockPrim._sourceFile = "nonexistent.usda";
        mockState.stage.layerStack = [
          { filePath: "other.usda", owner: "User1" },
        ];
        store.getState.mockReturnValue(mockState);

        const result = checkPermission(mockPrim);

        expect(result.allowed).toBe(true);
        expect(result.reason).toContain("No ownership restrictions");
      });
    });
  });
});
