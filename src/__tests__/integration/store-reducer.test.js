/**
 * Integration Tests: Store + Reducer
 * Tests the state management system with dispatched actions
 */

// Note: vi, describe, it, expect, beforeEach, afterEach are available globally via globals: true in vite.config.js
import { reducer } from "../../core/state/reducer.js";

describe("Integration: Store + Reducer", () => {
  let initialState;

  beforeEach(() => {
    initialState = {
      currentUser: "Architect",
      users: [
        "Architect",
        "Structural Engineer",
        "Project Manager",
        "Field Person",
      ],
      loadedFiles: {},
      stage: {
        layerStack: [],
        composedPrims: null,
        activeFilter: "All",
        colorizeByStatus: true,
      },
      composedHierarchy: [],
      stagedChanges: [],
      currentView: "stage",
      logEntryCounter: 0,
      isHistoryMode: false,
      history: {
        commits: new Map(),
        roots: [],
      },
      headCommitId: null,
    };
  });

  describe("User Actions", () => {
    it("should set current user", () => {
      const result = reducer(initialState, {
        type: "SET_CURRENT_USER",
        payload: { currentUser: "Project Manager" },
      });

      expect(result.currentUser).toBe("Project Manager");
    });
  });

  describe("Layer Actions", () => {
    it("should add a layer", () => {
      const layer = {
        id: "layer-1",
        filePath: "scene.usda",
        status: "WIP",
        active: true,
        visible: true,
      };
      const result = reducer(initialState, {
        type: "ADD_LAYER",
        payload: { layer },
      });

      expect(result.stage.layerStack).toHaveLength(1);
      expect(result.stage.layerStack[0]).toBe(layer);
    });

    it("should remove a layer", () => {
      initialState.stage.layerStack = [
        { id: "layer-1", filePath: "a.usda" },
        { id: "layer-2", filePath: "b.usda" },
      ];

      const result = reducer(initialState, {
        type: "REMOVE_LAYER",
        payload: { layerId: "layer-1" },
      });

      expect(result.stage.layerStack).toHaveLength(1);
      expect(result.stage.layerStack[0].id).toBe("layer-2");
    });

    it("should update a layer", () => {
      initialState.stage.layerStack = [
        { id: "layer-1", filePath: "scene.usda", status: "WIP", visible: true },
      ];

      const result = reducer(initialState, {
        type: "UPDATE_LAYER",
        payload: {
          layerId: "layer-1",
          updates: { status: "Shared", visible: false },
        },
      });

      expect(result.stage.layerStack[0].status).toBe("Shared");
      expect(result.stage.layerStack[0].visible).toBe(false);
    });

    it("should toggle layer visibility", () => {
      initialState.stage.layerStack = [
        { id: "layer-1", filePath: "scene.usda", visible: true },
      ];

      const result = reducer(initialState, {
        type: "TOGGLE_LAYER_VISIBILITY",
        payload: { layerId: "layer-1" },
      });

      expect(result.stage.layerStack[0].visible).toBe(false);
    });

    it("should toggle layer active state", () => {
      initialState.stage.layerStack = [
        { id: "layer-1", filePath: "scene.usda", active: false },
      ];

      const result = reducer(initialState, {
        type: "TOGGLE_LAYER_ACTIVE",
        payload: { layerId: "layer-1" },
      });

      expect(result.stage.layerStack[0].active).toBe(true);
    });

    it("should reorder layers", () => {
      const newStack = [
        { id: "layer-2", filePath: "b.usda" },
        { id: "layer-1", filePath: "a.usda" },
      ];

      const result = reducer(initialState, {
        type: "REORDER_LAYERS",
        payload: { layerStack: newStack },
      });

      expect(result.stage.layerStack[0].id).toBe("layer-2");
      expect(result.stage.layerStack[1].id).toBe("layer-1");
    });

    it("should update layer stack", () => {
      const newStack = [{ id: "layer-new", filePath: "new.usda" }];

      const result = reducer(initialState, {
        type: "UPDATE_LAYER_STACK",
        payload: { layerStack: newStack },
      });

      expect(result.stage.layerStack).toBe(newStack);
    });

    it("should set layer filter", () => {
      const result = reducer(initialState, {
        type: "SET_LAYER_FILTER",
        payload: { activeFilter: "WIP" },
      });

      expect(result.stage.activeFilter).toBe("WIP");
    });

    it("should toggle status color", () => {
      const result = reducer(initialState, {
        type: "TOGGLE_STATUS_COLOR",
        payload: {},
      });

      expect(result.stage.colorizeByStatus).toBe(false);
    });
  });

  describe("Prim Actions", () => {
    it("should set composed hierarchy", () => {
      const hierarchy = [{ path: "/World", type: "Xform", children: [] }];

      const result = reducer(initialState, {
        type: "SET_COMPOSED_HIERARCHY",
        payload: { composedHierarchy: hierarchy },
      });

      expect(result.composedHierarchy).toBe(hierarchy);
      expect(result.stage.composedPrims).toBe(hierarchy);
    });
  });

  describe("Staging Actions", () => {
    it("should stage a change", () => {
      const change = {
        primPath: "/World/Sphere",
        property: "radius",
        value: 2.0,
      };

      const result = reducer(initialState, {
        type: "STAGE_CHANGE",
        payload: { change },
      });

      expect(result.stagedChanges).toHaveLength(1);
      expect(result.stagedChanges[0]).toBe(change);
    });

    it("should unstage a change by index", () => {
      initialState.stagedChanges = [
        { primPath: "/A", property: "x", value: 1 },
        { primPath: "/B", property: "y", value: 2 },
      ];

      const result = reducer(initialState, {
        type: "UNSTAGE_CHANGE",
        payload: { changeIndex: 0 },
      });

      expect(result.stagedChanges).toHaveLength(1);
      expect(result.stagedChanges[0].primPath).toBe("/B");
    });

    it("should clear all staged changes", () => {
      initialState.stagedChanges = [
        { primPath: "/A", property: "x", value: 1 },
        { primPath: "/B", property: "y", value: 2 },
      ];

      const result = reducer(initialState, {
        type: "CLEAR_STAGED_CHANGES",
        payload: {},
      });

      expect(result.stagedChanges).toHaveLength(0);
    });
  });

  describe("Commit Actions", () => {
    it("should commit staged changes", () => {
      initialState.stagedChanges = [
        { primPath: "/World/Sphere", property: "radius", value: 2.0 },
      ];

      const action = {
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Update sphere radius" },
      };

      const result = reducer(initialState, action);

      expect(result.stagedChanges).toHaveLength(0);
      expect(result.headCommitId).toBeDefined();
      expect(result.history.commits.size).toBe(1);

      const commit = result.history.commits.values().next().value;
      expect(commit.message).toBe("Update sphere radius");
      expect(commit.author).toBe("Architect");
      expect(commit.changes).toHaveLength(1);
    });

    it("should not create empty commits", () => {
      initialState.stagedChanges = [];

      const result = reducer(initialState, {
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Empty commit" },
      });

      // Should return state unchanged
      expect(result).toBe(initialState);
    });
  });

  describe("History Actions", () => {
    it("should add a commit to history", () => {
      const commit = { id: "commit-1", message: "Initial", changes: [] };

      const result = reducer(initialState, {
        type: "ADD_COMMIT",
        payload: { commit },
      });

      expect(result.history.commits.has("commit-1")).toBe(true);
    });

    it("should set head commit", () => {
      const result = reducer(initialState, {
        type: "SET_HEAD_COMMIT",
        payload: { headCommitId: "commit-1" },
      });

      expect(result.headCommitId).toBe("commit-1");
    });

    it("should toggle history mode", () => {
      const result = reducer(initialState, {
        type: "TOGGLE_HISTORY_MODE",
        payload: { isHistoryMode: true },
      });

      expect(result.isHistoryMode).toBe(true);
    });

    it("should add root commit", () => {
      const result = reducer(initialState, {
        type: "ADD_ROOT_COMMIT",
        payload: { commitId: "root-1" },
      });

      expect(result.history.roots).toContain("root-1");
    });

    it("should increment log entry counter", () => {
      const action = {
        type: "INCREMENT_LOG_ENTRY_COUNTER",
        payload: {},
      };

      const result = reducer(initialState, action);

      expect(result.logEntryCounter).toBe(1);
      expect(action._returnValue).toBe(1);
    });
  });

  describe("View Actions", () => {
    it("should set current view", () => {
      const result = reducer(initialState, {
        type: "SET_CURRENT_VIEW",
        payload: { currentView: "file" },
      });

      expect(result.currentView).toBe("file");
    });
  });

  describe("File Actions", () => {
    it("should load a file", () => {
      const result = reducer(initialState, {
        type: "LOAD_FILE",
        payload: { filePath: "scene.usda", content: "#usda 1.0" },
      });

      expect(result.loadedFiles["scene.usda"]).toBe("#usda 1.0");
    });

    it("should unload a file", () => {
      initialState.loadedFiles = {
        "scene.usda": "#usda 1.0",
        "other.usda": "content",
      };

      const result = reducer(initialState, {
        type: "UNLOAD_FILE",
        payload: { filePath: "scene.usda" },
      });

      expect(result.loadedFiles["scene.usda"]).toBeUndefined();
      expect(result.loadedFiles["other.usda"]).toBe("content");
    });

    it("should update a file", () => {
      initialState.loadedFiles = { "scene.usda": "#usda 1.0" };

      const result = reducer(initialState, {
        type: "UPDATE_FILE",
        payload: {
          filePath: "scene.usda",
          content: '#usda 1.0\ndef Xform "Root" { }',
        },
      });

      expect(result.loadedFiles["scene.usda"]).toContain("Root");
    });

    it("should set current file", () => {
      const result = reducer(initialState, {
        type: "SET_CURRENT_FILE",
        payload: { currentFile: "scene.usda" },
      });

      expect(result.currentFile).toBe("scene.usda");
    });

    it("should set selected files", () => {
      const result = reducer(initialState, {
        type: "SET_SELECTED_FILES",
        payload: { selectedFiles: ["a.usda", "b.usda"] },
      });

      expect(result.selectedFiles).toEqual(["a.usda", "b.usda"]);
    });
  });

  describe("Unknown Actions", () => {
    it("should return empty object for unknown action types", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const result = reducer(initialState, {
        type: "UNKNOWN_ACTION",
        payload: {},
      });

      expect(result).toEqual({});
      expect(consoleSpy).toHaveBeenCalledWith(
        "Unknown action type: UNKNOWN_ACTION"
      );

      consoleSpy.mockRestore();
    });

    it("should return action for non-action objects", () => {
      const updates = { currentView: "file" };
      const result = reducer(initialState, updates);

      expect(result).toBe(updates);
    });
  });

  describe("Complex Workflows", () => {
    it("should handle full layer lifecycle", () => {
      let state = initialState;

      // Add a layer
      let updates = reducer(state, {
        type: "ADD_LAYER",
        payload: {
          layer: {
            id: "layer-1",
            filePath: "scene.usda",
            status: "WIP",
            active: true,
            visible: true,
          },
        },
      });
      state = { ...state, stage: { ...state.stage, ...updates.stage } };
      expect(state.stage.layerStack).toHaveLength(1);

      // Update layer status
      updates = reducer(state, {
        type: "UPDATE_LAYER",
        payload: { layerId: "layer-1", updates: { status: "Shared" } },
      });
      state = { ...state, stage: { ...state.stage, ...updates.stage } };
      expect(state.stage.layerStack[0].status).toBe("Shared");

      // Toggle visibility
      updates = reducer(state, {
        type: "TOGGLE_LAYER_VISIBILITY",
        payload: { layerId: "layer-1" },
      });
      state = { ...state, stage: { ...state.stage, ...updates.stage } };
      expect(state.stage.layerStack[0].visible).toBe(false);

      // Remove layer
      updates = reducer(state, {
        type: "REMOVE_LAYER",
        payload: { layerId: "layer-1" },
      });
      state = { ...state, stage: { ...state.stage, ...updates.stage } };
      expect(state.stage.layerStack).toHaveLength(0);
    });

    it("should handle staging and commit workflow", () => {
      let state = { ...initialState };

      // Stage changes
      let updates = reducer(state, {
        type: "STAGE_CHANGE",
        payload: { change: { primPath: "/World/A", property: "x", value: 1 } },
      });
      state = { ...state, ...updates };

      updates = reducer(state, {
        type: "STAGE_CHANGE",
        payload: { change: { primPath: "/World/B", property: "y", value: 2 } },
      });
      state = { ...state, ...updates };

      expect(state.stagedChanges).toHaveLength(2);

      // Unstage one change
      updates = reducer(state, {
        type: "UNSTAGE_CHANGE",
        payload: { changeIndex: 0 },
      });
      state = { ...state, ...updates };
      expect(state.stagedChanges).toHaveLength(1);

      // Commit remaining changes
      const action = {
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Update world" },
      };
      updates = reducer(state, action);
      state = { ...state, ...updates };

      expect(state.stagedChanges).toHaveLength(0);
      expect(state.headCommitId).toBeDefined();
      expect(state.history.commits.size).toBe(1);
    });

    it("should handle file load and view workflow", () => {
      let state = { ...initialState };

      // Load file
      let updates = reducer(state, {
        type: "LOAD_FILE",
        payload: {
          filePath: "scene.usda",
          content: '#usda 1.0\ndef Xform "Root" { }',
        },
      });
      state = { ...state, ...updates };
      expect(state.loadedFiles["scene.usda"]).toBeDefined();

      // Set current file
      updates = reducer(state, {
        type: "SET_CURRENT_FILE",
        payload: { currentFile: "scene.usda" },
      });
      state = { ...state, ...updates };

      // Switch view
      updates = reducer(state, {
        type: "SET_CURRENT_VIEW",
        payload: { currentView: "file" },
      });
      state = { ...state, ...updates };

      expect(state.currentView).toBe("file");
      expect(state.currentFile).toBe("scene.usda");
    });
  });
});
