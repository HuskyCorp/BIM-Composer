// src/__tests__/unit/core/state/reducer.test.js
/**
 * Tests for state reducer
 * Note: describe, it, expect are available globally via globals: true in vite.config.js
 */
import { reducer } from "../../../../core/state/reducer.js";
import * as helpers from "../../../../core/state/helpers.js";

describe("reducer", () => {
  describe("invalid actions", () => {
    it("should return action as-is when action is not an object", () => {
      expect(reducer({}, null)).toBe(null);
      expect(reducer({}, undefined)).toBe(undefined);
    });

    it("should return action as-is when action has no type", () => {
      const result = reducer({}, { payload: "test" });
      expect(result).toEqual({ payload: "test" });
    });

    it("should warn for unknown action types", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const result = reducer({}, { type: "UNKNOWN_ACTION" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "Unknown action type: UNKNOWN_ACTION"
      );
      expect(result).toEqual({});

      consoleSpy.mockRestore();
    });
  });

  describe("User Actions", () => {
    it("should handle SET_CURRENT_USER", () => {
      const state = {};
      const action = {
        type: "SET_CURRENT_USER",
        payload: { currentUser: "Alice" },
      };

      const newState = reducer(state, action);
      expect(newState.currentUser).toBe("Alice");
      expect(newState.currentUserId).toBe("Alice");
    });
  });

  describe("Layer Actions", () => {
    it("should handle ADD_LAYER", () => {
      const state = {
        stage: { layerStack: [{ id: "layer1", name: "Layer 1" }] },
      };
      const action = {
        type: "ADD_LAYER",
        payload: { layer: { id: "layer2", name: "Layer 2" } },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack).toHaveLength(2);
      expect(newState.stage.layerStack[1]).toEqual({
        id: "layer2",
        name: "Layer 2",
      });
    });

    it("should handle ADD_LAYER with no existing layers", () => {
      const state = {};
      const action = {
        type: "ADD_LAYER",
        payload: { layer: { id: "layer1", name: "Layer 1" } },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack).toHaveLength(1);
      expect(newState.stage.layerStack[0]).toEqual({
        id: "layer1",
        name: "Layer 1",
      });
    });

    it("should handle REMOVE_LAYER", () => {
      const state = {
        stage: {
          layerStack: [
            { id: "layer1", name: "Layer 1" },
            { id: "layer2", name: "Layer 2" },
          ],
        },
      };
      const action = {
        type: "REMOVE_LAYER",
        payload: { layerId: "layer1" },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack).toHaveLength(1);
      expect(newState.stage.layerStack[0].id).toBe("layer2");
    });

    it("should handle UPDATE_LAYER", () => {
      const state = {
        stage: {
          layerStack: [
            { id: "layer1", name: "Layer 1", status: "WIP" },
            { id: "layer2", name: "Layer 2" },
          ],
        },
      };
      const action = {
        type: "UPDATE_LAYER",
        payload: {
          layerId: "layer1",
          updates: { status: "Shared", name: "Updated Layer" },
        },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack[0]).toEqual({
        id: "layer1",
        name: "Updated Layer",
        status: "Shared",
      });
      expect(newState.stage.layerStack[1]).toEqual({
        id: "layer2",
        name: "Layer 2",
      });
    });

    it("should handle TOGGLE_LAYER_VISIBILITY", () => {
      const state = {
        stage: {
          layerStack: [
            { id: "layer1", visible: true },
            { id: "layer2", visible: false },
          ],
        },
      };
      const action = {
        type: "TOGGLE_LAYER_VISIBILITY",
        payload: { layerId: "layer1" },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack[0].visible).toBe(false);
      expect(newState.stage.layerStack[1].visible).toBe(false);
    });

    it("should handle TOGGLE_LAYER_ACTIVE", () => {
      const state = {
        stage: {
          layerStack: [
            { id: "layer1", active: true },
            { id: "layer2", active: false },
          ],
        },
      };
      const action = {
        type: "TOGGLE_LAYER_ACTIVE",
        payload: { layerId: "layer2" },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack[0].active).toBe(true);
      expect(newState.stage.layerStack[1].active).toBe(true);
    });

    it("should handle REORDER_LAYERS", () => {
      const state = {
        stage: {
          layerStack: [{ id: "layer1" }, { id: "layer2" }],
        },
      };
      const newStack = [{ id: "layer2" }, { id: "layer1" }];
      const action = {
        type: "REORDER_LAYERS",
        payload: { layerStack: newStack },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack).toEqual(newStack);
    });

    it("should handle UPDATE_LAYER_STACK", () => {
      const state = { stage: { layerStack: [] } };
      const newStack = [{ id: "layer1" }, { id: "layer2" }];
      const action = {
        type: "UPDATE_LAYER_STACK",
        payload: { layerStack: newStack },
      };

      const newState = reducer(state, action);
      expect(newState.stage.layerStack).toEqual(newStack);
    });

    it("should handle SET_LAYER_FILTER", () => {
      const state = { stage: {} };
      const action = {
        type: "SET_LAYER_FILTER",
        payload: { activeFilter: "WIP" },
      };

      const newState = reducer(state, action);
      expect(newState.stage.activeFilter).toBe("WIP");
    });

    it("should handle TOGGLE_STATUS_COLOR", () => {
      const state1 = { stage: { colorizeByStatus: true } };
      const action = { type: "TOGGLE_STATUS_COLOR", payload: {} };

      const newState1 = reducer(state1, action);
      expect(newState1.stage.colorizeByStatus).toBe(false);

      const state2 = { stage: { colorizeByStatus: false } };
      const newState2 = reducer(state2, action);
      expect(newState2.stage.colorizeByStatus).toBe(true);
    });

    it("should handle TOGGLE_STATUS_COLOR with undefined initial value", () => {
      const state = { stage: {} };
      const action = { type: "TOGGLE_STATUS_COLOR", payload: {} };

      const newState = reducer(state, action);
      expect(newState.stage.colorizeByStatus).toBe(false);
    });
  });

  describe("Prim Actions", () => {
    it("should handle SET_COMPOSED_HIERARCHY", () => {
      const hierarchy = [{ path: "/Root", children: [] }];
      const action = {
        type: "SET_COMPOSED_HIERARCHY",
        payload: { composedHierarchy: hierarchy },
      };

      const newState = reducer({}, action);
      expect(newState.composedHierarchy).toEqual(hierarchy);
      expect(newState.stage.composedPrims).toEqual(hierarchy);
    });

    it("should handle UPDATE_PRIM", () => {
      const hierarchy = [{ path: "/Root", name: "Root" }];
      const state = { composedHierarchy: hierarchy };
      const action = {
        type: "UPDATE_PRIM",
        payload: {
          primPath: "/Root",
          updates: { name: "UpdatedRoot" },
        },
      };

      vi.spyOn(helpers, "updatePrimInHierarchy").mockReturnValue([
        { path: "/Root", name: "UpdatedRoot" },
      ]);

      const newState = reducer(state, action);
      expect(helpers.updatePrimInHierarchy).toHaveBeenCalledWith(
        hierarchy,
        "/Root",
        { name: "UpdatedRoot" }
      );
      expect(newState.composedHierarchy).toEqual([
        { path: "/Root", name: "UpdatedRoot" },
      ]);

      vi.restoreAllMocks();
    });

    it("should handle ADD_PRIM", () => {
      const hierarchy = [{ path: "/Root", children: [] }];
      const state = { composedHierarchy: hierarchy };
      const newPrim = { path: "/Root/Child", name: "Child" };
      const action = {
        type: "ADD_PRIM",
        payload: {
          parentPath: "/Root",
          prim: newPrim,
        },
      };

      vi.spyOn(helpers, "addPrimToHierarchy").mockReturnValue([
        { path: "/Root", children: [newPrim] },
      ]);

      reducer(state, action);
      expect(helpers.addPrimToHierarchy).toHaveBeenCalledWith(
        hierarchy,
        "/Root",
        newPrim
      );

      vi.restoreAllMocks();
    });

    it("should handle REMOVE_PRIM", () => {
      const hierarchy = [
        { path: "/Root", children: [{ path: "/Root/Child" }] },
      ];
      const state = { composedHierarchy: hierarchy };
      const action = {
        type: "REMOVE_PRIM",
        payload: { primPath: "/Root/Child" },
      };

      vi.spyOn(helpers, "removePrimFromHierarchy").mockReturnValue([
        { path: "/Root", children: [] },
      ]);

      reducer(state, action);
      expect(helpers.removePrimFromHierarchy).toHaveBeenCalledWith(
        hierarchy,
        "/Root/Child"
      );

      vi.restoreAllMocks();
    });

    it("should handle SET_ALL_PRIMS_BY_PATH", () => {
      const primsByPath = { "/Root": { path: "/Root" } };
      const action = {
        type: "SET_ALL_PRIMS_BY_PATH",
        payload: { allPrimsByPath: primsByPath },
      };

      const newState = reducer({}, action);
      expect(newState.allPrimsByPath).toEqual(primsByPath);
    });
  });

  describe("Staging Actions", () => {
    it("should handle STAGE_CHANGE", () => {
      const state = { stagedChanges: [{ id: 1, change: "existing" }] };
      const action = {
        type: "STAGE_CHANGE",
        payload: { change: { id: 2, change: "new" } },
      };

      const newState = reducer(state, action);
      expect(newState.stagedChanges).toHaveLength(2);
      expect(newState.stagedChanges[1]).toEqual({ id: 2, change: "new" });
    });

    it("should handle STAGE_CHANGE with no existing changes", () => {
      const state = {};
      const action = {
        type: "STAGE_CHANGE",
        payload: { change: { id: 1, change: "first" } },
      };

      const newState = reducer(state, action);
      expect(newState.stagedChanges).toHaveLength(1);
      expect(newState.stagedChanges[0]).toEqual({ id: 1, change: "first" });
    });

    it("should handle UNSTAGE_CHANGE", () => {
      const state = {
        stagedChanges: [{ id: 1 }, { id: 2 }, { id: 3 }],
      };
      const action = {
        type: "UNSTAGE_CHANGE",
        payload: { changeIndex: 1 },
      };

      const newState = reducer(state, action);
      expect(newState.stagedChanges).toHaveLength(2);
      expect(newState.stagedChanges[0]).toEqual({ id: 1 });
      expect(newState.stagedChanges[1]).toEqual({ id: 3 });
    });

    it("should handle CLEAR_STAGED_CHANGES", () => {
      const state = { stagedChanges: [{ id: 1 }, { id: 2 }] };
      const action = { type: "CLEAR_STAGED_CHANGES", payload: {} };

      const newState = reducer(state, action);
      expect(newState.stagedChanges).toEqual([]);
    });

    it("should handle COMMIT_CHANGES", () => {
      const state = {
        stagedChanges: [{ id: 1, change: "test" }],
        currentUser: "Alice",
        history: { commits: new Map(), roots: [] },
      };
      const action = {
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Test commit" },
      };

      vi.spyOn(helpers, "generateId").mockReturnValue("commit-123");

      const newState = reducer(state, action);

      expect(newState.stagedChanges).toEqual([]);
      expect(newState.headCommitId).toBe("commit-123");
      expect(newState.history.commits.size).toBe(1);

      const commit = newState.history.commits.get("commit-123");
      expect(commit.message).toBe("Test commit");
      expect(commit.author).toBe("Alice");
      expect(commit.changes).toEqual([{ id: 1, change: "test" }]);

      vi.restoreAllMocks();
    });

    it("should not create empty commits", () => {
      const state = {
        stagedChanges: [],
        currentUser: "Alice",
      };
      const action = {
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Empty commit" },
      };

      const newState = reducer(state, action);
      expect(newState).toBe(state);
    });

    it("should use 'Unknown' author when no current user", () => {
      const state = {
        stagedChanges: [{ id: 1 }],
        history: { commits: new Map(), roots: [] },
      };
      const action = {
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Test" },
      };

      vi.spyOn(helpers, "generateId").mockReturnValue("commit-123");

      const newState = reducer(state, action);
      const commit = newState.history.commits.get("commit-123");
      expect(commit.author).toBe("Unknown");

      vi.restoreAllMocks();
    });
  });

  describe("History Actions", () => {
    it("should handle ADD_COMMIT", () => {
      const existingCommit = { id: "commit-1", message: "First" };
      const state = {
        history: {
          commits: new Map([["commit-1", existingCommit]]),
          roots: [],
        },
      };
      const newCommit = { id: "commit-2", message: "Second" };
      const action = {
        type: "ADD_COMMIT",
        payload: { commit: newCommit },
      };

      const newState = reducer(state, action);
      expect(newState.history.commits.size).toBe(2);
      expect(newState.history.commits.get("commit-2")).toEqual(newCommit);
    });

    it("should handle SET_HEAD_COMMIT", () => {
      const action = {
        type: "SET_HEAD_COMMIT",
        payload: { headCommitId: "commit-123" },
      };

      const newState = reducer({}, action);
      expect(newState.headCommitId).toBe("commit-123");
    });

    it("should handle TOGGLE_HISTORY_MODE", () => {
      const action = {
        type: "TOGGLE_HISTORY_MODE",
        payload: { isHistoryMode: true },
      };

      const newState = reducer({}, action);
      expect(newState.isHistoryMode).toBe(true);
    });

    it("should handle SET_HISTORY", () => {
      const history = {
        commits: new Map([["commit-1", { id: "commit-1" }]]),
        roots: ["commit-1"],
      };
      const action = {
        type: "SET_HISTORY",
        payload: { history },
      };

      const newState = reducer({}, action);
      expect(newState.history).toEqual(history);
    });

    it("should handle ADD_ROOT_COMMIT", () => {
      const state = {
        history: { commits: new Map(), roots: ["commit-1"] },
      };
      const action = {
        type: "ADD_ROOT_COMMIT",
        payload: { commitId: "commit-2" },
      };

      const newState = reducer(state, action);
      expect(newState.history.roots).toEqual(["commit-1", "commit-2"]);
    });

    it("should handle INCREMENT_LOG_ENTRY_COUNTER", () => {
      const state = { logEntryCounter: 5 };
      const action = { type: "INCREMENT_LOG_ENTRY_COUNTER", payload: {} };

      const newState = reducer(state, action);
      expect(newState.logEntryCounter).toBe(6);
      expect(action._returnValue).toBe(6);
    });

    it("should handle INCREMENT_LOG_ENTRY_COUNTER from zero", () => {
      const state = {};
      const action = { type: "INCREMENT_LOG_ENTRY_COUNTER", payload: {} };

      const newState = reducer(state, action);
      expect(newState.logEntryCounter).toBe(1);
    });

    it("should handle SET_LOG_ENTRY_COUNTER", () => {
      const action = {
        type: "SET_LOG_ENTRY_COUNTER",
        payload: { logEntryCounter: 42 },
      };

      const newState = reducer({}, action);
      expect(newState.logEntryCounter).toBe(42);
    });
  });

  describe("View Actions", () => {
    it("should handle SET_CURRENT_VIEW", () => {
      const action = {
        type: "SET_CURRENT_VIEW",
        payload: { currentView: "hierarchy" },
      };

      const newState = reducer({}, action);
      expect(newState.currentView).toBe("hierarchy");
    });
  });

  describe("File Actions", () => {
    it("should handle LOAD_FILE", () => {
      const state = {
        loadedFiles: { "file1.usda": "content1" },
      };
      const action = {
        type: "LOAD_FILE",
        payload: { filePath: "file2.usda", content: "content2" },
      };

      const newState = reducer(state, action);
      expect(newState.loadedFiles).toEqual({
        "file1.usda": "content1",
        "file2.usda": "content2",
      });
    });

    it("should handle LOAD_FILE with no existing files", () => {
      const state = {};
      const action = {
        type: "LOAD_FILE",
        payload: { filePath: "file1.usda", content: "content1" },
      };

      const newState = reducer(state, action);
      expect(newState.loadedFiles).toEqual({
        "file1.usda": "content1",
      });
    });

    it("should handle UNLOAD_FILE", () => {
      const state = {
        loadedFiles: {
          "file1.usda": "content1",
          "file2.usda": "content2",
        },
      };
      const action = {
        type: "UNLOAD_FILE",
        payload: { filePath: "file1.usda" },
      };

      const newState = reducer(state, action);
      expect(newState.loadedFiles).toEqual({
        "file2.usda": "content2",
      });
    });

    it("should handle UPDATE_FILE", () => {
      const state = {
        loadedFiles: { "file1.usda": "original" },
      };
      const action = {
        type: "UPDATE_FILE",
        payload: { filePath: "file1.usda", content: "updated" },
      };

      const newState = reducer(state, action);
      expect(newState.loadedFiles).toEqual({
        "file1.usda": "updated",
      });
    });

    it("should handle SET_CURRENT_FILE", () => {
      const action = {
        type: "SET_CURRENT_FILE",
        payload: { currentFile: "scene.usda" },
      };

      const newState = reducer({}, action);
      expect(newState.currentFile).toBe("scene.usda");
    });

    it("should handle SET_SELECTED_FILES", () => {
      const action = {
        type: "SET_SELECTED_FILES",
        payload: { selectedFiles: ["file1.usda", "file2.usda"] },
      };

      const newState = reducer({}, action);
      expect(newState.selectedFiles).toEqual(["file1.usda", "file2.usda"]);
    });
  });
});
