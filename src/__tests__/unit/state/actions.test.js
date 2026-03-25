/**
 * Tests for Action Creators
 */

// Note: vi, describe, it, expect, beforeEach, afterEach are available globally via globals: true in vite.config.js
import {
  sceneActions,
  layerActions,
  primActions,
  stagingActions,
  historyActions,
  viewActions,
  fileActions,
  actions,
  ActionTypes,
} from "../../../core/state/actions/index.js";

describe("Action Creators", () => {
  describe("sceneActions", () => {
    it("setCurrentUser should create correct action", () => {
      const action = sceneActions.setCurrentUser("artist1");
      expect(action).toEqual({
        type: "SET_CURRENT_USER",
        payload: { currentUserId: "artist1" },
      });
    });
  });

  describe("layerActions", () => {
    it("addLayer should create correct action", () => {
      const layer = { id: "1", filePath: "test.usda" };
      const action = layerActions.addLayer(layer);
      expect(action).toEqual({
        type: "ADD_LAYER",
        payload: { layer },
      });
    });

    it("removeLayer should create correct action", () => {
      const action = layerActions.removeLayer("layer-1");
      expect(action).toEqual({
        type: "REMOVE_LAYER",
        payload: { layerId: "layer-1" },
      });
    });

    it("updateLayer should create correct action", () => {
      const action = layerActions.updateLayer("layer-1", { status: "Shared" });
      expect(action).toEqual({
        type: "UPDATE_LAYER",
        payload: { layerId: "layer-1", updates: { status: "Shared" } },
      });
    });

    it("toggleLayerVisibility should create correct action", () => {
      const action = layerActions.toggleLayerVisibility("layer-1");
      expect(action).toEqual({
        type: "TOGGLE_LAYER_VISIBILITY",
        payload: { layerId: "layer-1" },
      });
    });

    it("toggleLayerActive should create correct action", () => {
      const action = layerActions.toggleLayerActive("layer-1");
      expect(action).toEqual({
        type: "TOGGLE_LAYER_ACTIVE",
        payload: { layerId: "layer-1" },
      });
    });

    it("reorderLayers should create correct action", () => {
      const stack = [{ id: "2" }, { id: "1" }];
      const action = layerActions.reorderLayers(stack);
      expect(action).toEqual({
        type: "REORDER_LAYERS",
        payload: { layerStack: stack },
      });
    });

    it("updateLayerStack should create correct action", () => {
      const stack = [{ id: "1" }];
      const action = layerActions.updateLayerStack(stack);
      expect(action).toEqual({
        type: "UPDATE_LAYER_STACK",
        payload: { layerStack: stack },
      });
    });

    it("setLayerFilter should create correct action", () => {
      const action = layerActions.setLayerFilter("WIP");
      expect(action).toEqual({
        type: "SET_LAYER_FILTER",
        payload: { activeFilter: "WIP" },
      });
    });

    it("toggleStatusColor should create correct action", () => {
      const action = layerActions.toggleStatusColor();
      expect(action).toEqual({
        type: "TOGGLE_STATUS_COLOR",
      });
    });
  });

  describe("primActions", () => {
    it("setComposedHierarchy should create correct action", () => {
      const hierarchy = [{ name: "Root" }];
      const action = primActions.setComposedHierarchy(hierarchy);
      expect(action).toEqual({
        type: "SET_COMPOSED_HIERARCHY",
        payload: { composedHierarchy: hierarchy },
      });
    });

    it("updatePrim should create correct action", () => {
      const action = primActions.updatePrim("/Root/Cube", { size: 2.0 });
      expect(action).toEqual({
        type: "UPDATE_PRIM",
        payload: { primPath: "/Root/Cube", updates: { size: 2.0 } },
      });
    });

    it("addPrim should create correct action", () => {
      const prim = { name: "Cube", type: "Mesh" };
      const action = primActions.addPrim("/Root", prim);
      expect(action).toEqual({
        type: "ADD_PRIM",
        payload: { parentPath: "/Root", prim },
      });
    });

    it("removePrim should create correct action", () => {
      const action = primActions.removePrim("/Root/Cube");
      expect(action).toEqual({
        type: "REMOVE_PRIM",
        payload: { primPath: "/Root/Cube" },
      });
    });

    it("setAllPrimsByPath should create correct action", () => {
      const primsMap = { "/Root": { name: "Root" } };
      const action = primActions.setAllPrimsByPath(primsMap);
      expect(action).toEqual({
        type: "SET_ALL_PRIMS_BY_PATH",
        payload: { allPrimsByPath: primsMap },
      });
    });
  });

  describe("stagingActions", () => {
    it("stageChange should create correct action", () => {
      const change = { path: "/Root/Cube", property: "size", value: 3.0 };
      const action = stagingActions.stageChange(change);
      expect(action).toEqual({
        type: "STAGE_CHANGE",
        payload: { change },
      });
    });

    it("unstageChange should create correct action", () => {
      const action = stagingActions.unstageChange(2);
      expect(action).toEqual({
        type: "UNSTAGE_CHANGE",
        payload: { changeIndex: 2 },
      });
    });

    it("clearStagedChanges should create correct action", () => {
      const action = stagingActions.clearStagedChanges();
      expect(action).toEqual({
        type: "CLEAR_STAGED_CHANGES",
      });
    });

    it("commitChanges should create correct action", () => {
      const action = stagingActions.commitChanges("Fix cube size");
      expect(action).toEqual({
        type: "COMMIT_CHANGES",
        payload: { commitMessage: "Fix cube size" },
      });
    });
  });

  describe("historyActions", () => {
    it("addCommit should create correct action", () => {
      const commit = { id: "c1", message: "Initial" };
      const action = historyActions.addCommit(commit);
      expect(action).toEqual({
        type: "ADD_COMMIT",
        payload: { commit },
      });
    });

    it("setHeadCommit should create correct action", () => {
      const action = historyActions.setHeadCommit("c2");
      expect(action).toEqual({
        type: "SET_HEAD_COMMIT",
        payload: { headCommitId: "c2" },
      });
    });

    it("toggleHistoryMode should create correct action", () => {
      const action = historyActions.toggleHistoryMode(true);
      expect(action).toEqual({
        type: "TOGGLE_HISTORY_MODE",
        payload: { isHistoryMode: true },
      });
    });

    it("setHistory should create correct action", () => {
      const history = { commits: {}, headCommitId: null };
      const action = historyActions.setHistory(history);
      expect(action).toEqual({
        type: "SET_HISTORY",
        payload: { history },
      });
    });

    it("addRootCommit should create correct action", () => {
      const action = historyActions.addRootCommit("c0");
      expect(action).toEqual({
        type: "ADD_ROOT_COMMIT",
        payload: { commitId: "c0" },
      });
    });

    it("incrementLogEntryCounter should create correct action", () => {
      const action = historyActions.incrementLogEntryCounter();
      expect(action).toEqual({
        type: "INCREMENT_LOG_ENTRY_COUNTER",
      });
    });

    it("setLogEntryCounter should create correct action", () => {
      const action = historyActions.setLogEntryCounter(5);
      expect(action).toEqual({
        type: "SET_LOG_ENTRY_COUNTER",
        payload: { logEntryCounter: 5 },
      });
    });
  });

  describe("viewActions", () => {
    it("setCurrentView should create correct action", () => {
      const action = viewActions.setCurrentView("history");
      expect(action).toEqual({
        type: "SET_CURRENT_VIEW",
        payload: { currentView: "history" },
      });
    });
  });

  describe("fileActions", () => {
    it("loadFile should create correct action", () => {
      const action = fileActions.loadFile("scene.usda", "#usda 1.0");
      expect(action).toEqual({
        type: "LOAD_FILE",
        payload: { filePath: "scene.usda", content: "#usda 1.0" },
      });
    });

    it("unloadFile should create correct action", () => {
      const action = fileActions.unloadFile("scene.usda");
      expect(action).toEqual({
        type: "UNLOAD_FILE",
        payload: { filePath: "scene.usda" },
      });
    });

    it("updateFile should create correct action", () => {
      const action = fileActions.updateFile("scene.usda", "new content");
      expect(action).toEqual({
        type: "UPDATE_FILE",
        payload: { filePath: "scene.usda", content: "new content" },
      });
    });

    it("setCurrentFile should create correct action", () => {
      const action = fileActions.setCurrentFile("scene.usda");
      expect(action).toEqual({
        type: "SET_CURRENT_FILE",
        payload: { currentFile: "scene.usda" },
      });
    });

    it("setSelectedFiles should create correct action", () => {
      const files = ["a.usda", "b.usda"];
      const action = fileActions.setSelectedFiles(files);
      expect(action).toEqual({
        type: "SET_SELECTED_FILES",
        payload: { selectedFiles: files },
      });
    });
  });

  describe("combined actions object", () => {
    it("should include all action creators", () => {
      expect(actions.setCurrentUser).toBe(sceneActions.setCurrentUser);
      expect(actions.addLayer).toBe(layerActions.addLayer);
      expect(actions.setComposedHierarchy).toBe(
        primActions.setComposedHierarchy
      );
      expect(actions.stageChange).toBe(stagingActions.stageChange);
      expect(actions.addCommit).toBe(historyActions.addCommit);
      expect(actions.setCurrentView).toBe(viewActions.setCurrentView);
      expect(actions.loadFile).toBe(fileActions.loadFile);
    });
  });

  describe("ActionTypes", () => {
    it("should have user action types", () => {
      expect(ActionTypes.SET_CURRENT_USER).toBe("SET_CURRENT_USER");
    });

    it("should have all layer action types", () => {
      expect(ActionTypes.ADD_LAYER).toBe("ADD_LAYER");
      expect(ActionTypes.REMOVE_LAYER).toBe("REMOVE_LAYER");
      expect(ActionTypes.UPDATE_LAYER).toBe("UPDATE_LAYER");
      expect(ActionTypes.TOGGLE_LAYER_VISIBILITY).toBe(
        "TOGGLE_LAYER_VISIBILITY"
      );
      expect(ActionTypes.TOGGLE_LAYER_ACTIVE).toBe("TOGGLE_LAYER_ACTIVE");
      expect(ActionTypes.REORDER_LAYERS).toBe("REORDER_LAYERS");
      expect(ActionTypes.UPDATE_LAYER_STACK).toBe("UPDATE_LAYER_STACK");
      expect(ActionTypes.SET_LAYER_FILTER).toBe("SET_LAYER_FILTER");
      expect(ActionTypes.TOGGLE_STATUS_COLOR).toBe("TOGGLE_STATUS_COLOR");
    });

    it("should have all prim action types", () => {
      expect(ActionTypes.SET_COMPOSED_HIERARCHY).toBe("SET_COMPOSED_HIERARCHY");
      expect(ActionTypes.UPDATE_PRIM).toBe("UPDATE_PRIM");
      expect(ActionTypes.ADD_PRIM).toBe("ADD_PRIM");
      expect(ActionTypes.REMOVE_PRIM).toBe("REMOVE_PRIM");
      expect(ActionTypes.SET_ALL_PRIMS_BY_PATH).toBe("SET_ALL_PRIMS_BY_PATH");
    });

    it("should have all staging action types", () => {
      expect(ActionTypes.STAGE_CHANGE).toBe("STAGE_CHANGE");
      expect(ActionTypes.UNSTAGE_CHANGE).toBe("UNSTAGE_CHANGE");
      expect(ActionTypes.CLEAR_STAGED_CHANGES).toBe("CLEAR_STAGED_CHANGES");
      expect(ActionTypes.COMMIT_CHANGES).toBe("COMMIT_CHANGES");
    });

    it("should have all history action types", () => {
      expect(ActionTypes.ADD_COMMIT).toBe("ADD_COMMIT");
      expect(ActionTypes.SET_HEAD_COMMIT).toBe("SET_HEAD_COMMIT");
      expect(ActionTypes.TOGGLE_HISTORY_MODE).toBe("TOGGLE_HISTORY_MODE");
      expect(ActionTypes.SET_HISTORY).toBe("SET_HISTORY");
      expect(ActionTypes.ADD_ROOT_COMMIT).toBe("ADD_ROOT_COMMIT");
      expect(ActionTypes.INCREMENT_LOG_ENTRY_COUNTER).toBe(
        "INCREMENT_LOG_ENTRY_COUNTER"
      );
      expect(ActionTypes.SET_LOG_ENTRY_COUNTER).toBe("SET_LOG_ENTRY_COUNTER");
    });

    it("should have all view and file action types", () => {
      expect(ActionTypes.SET_CURRENT_VIEW).toBe("SET_CURRENT_VIEW");
      expect(ActionTypes.LOAD_FILE).toBe("LOAD_FILE");
      expect(ActionTypes.UNLOAD_FILE).toBe("UNLOAD_FILE");
      expect(ActionTypes.UPDATE_FILE).toBe("UPDATE_FILE");
      expect(ActionTypes.SET_CURRENT_FILE).toBe("SET_CURRENT_FILE");
      expect(ActionTypes.SET_SELECTED_FILES).toBe("SET_SELECTED_FILES");
    });
  });
});
