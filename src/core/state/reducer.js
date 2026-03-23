/**
 * State Reducer
 *
 * Transforms actions into state updates
 */

import {
  updatePrimInHierarchy,
  addPrimToHierarchy,
  removePrimFromHierarchy,
  generateId,
} from "./helpers.js";

function buildAllPrimsByPath(prims, map = new Map()) {
  for (const prim of prims || []) {
    if (prim.path) map.set(prim.path, prim);
    if (prim.children && prim.children.length)
      buildAllPrimsByPath(prim.children, map);
  }
  return map;
}

/**
 * Main reducer function
 * @param {Object} state - Current state
 * @param {Object} action - Action object with type and payload
 * @returns {Object} New state
 */
export function reducer(state, action) {
  if (!action || !action.type) {
    // Not an action, return as-is for direct state updates
    return action;
  }

  const { type, payload } = action;

  switch (type) {
    // ==================== Scene Actions ====================
    case "SET_SCENE_NAME":
      return { sceneName: payload.sceneName };

    case "SET_CURRENT_USER":
      return { currentUser: payload.currentUser };

    // ==================== Layer Actions ====================
    case "ADD_LAYER": {
      const currentStack = state.stage?.layerStack || [];
      return {
        stage: {
          ...state.stage,
          layerStack: [...currentStack, payload.layer],
        },
      };
    }

    case "REMOVE_LAYER": {
      const currentStack = state.stage?.layerStack || [];
      return {
        stage: {
          ...state.stage,
          layerStack: currentStack.filter(
            (layer) => layer.id !== payload.layerId
          ),
        },
      };
    }

    case "UPDATE_LAYER": {
      const currentStack = state.stage?.layerStack || [];
      return {
        stage: {
          ...state.stage,
          layerStack: currentStack.map((layer) =>
            layer.id === payload.layerId
              ? { ...layer, ...payload.updates }
              : layer
          ),
        },
      };
    }

    case "TOGGLE_LAYER_VISIBILITY": {
      const currentStack = state.stage?.layerStack || [];
      return {
        stage: {
          ...state.stage,
          layerStack: currentStack.map((layer) =>
            layer.id === payload.layerId
              ? { ...layer, visible: !layer.visible }
              : layer
          ),
        },
      };
    }

    case "TOGGLE_LAYER_ACTIVE": {
      const currentStack = state.stage?.layerStack || [];
      return {
        stage: {
          ...state.stage,
          layerStack: currentStack.map((layer) =>
            layer.id === payload.layerId
              ? { ...layer, active: !layer.active }
              : layer
          ),
        },
      };
    }

    case "REORDER_LAYERS":
      return {
        stage: {
          ...state.stage,
          layerStack: payload.layerStack,
        },
      };

    case "UPDATE_LAYER_STACK":
      return {
        stage: {
          ...state.stage,
          layerStack: payload.layerStack,
        },
      };

    case "SET_LAYER_FILTER":
      return {
        stage: {
          ...state.stage,
          activeFilter: payload.activeFilter,
        },
      };

    case "TOGGLE_STATUS_COLOR": {
      const currentValue = state.stage?.colorizeByStatus ?? true;
      return {
        stage: {
          ...state.stage,
          colorizeByStatus: !currentValue,
        },
      };
    }

    case "SET_SAVE_STATUS_FILTER":
      return {
        stage: {
          ...state.stage,
          saveStatusFilter: payload.saveStatusFilter,
        },
      };

    // ==================== Prim Actions ====================
    case "SET_COMPOSED_HIERARCHY":
      return {
        composedHierarchy: payload.composedHierarchy,
        allPrimsByPath: buildAllPrimsByPath(payload.composedHierarchy),
        stage: {
          ...state.stage,
          composedPrims: payload.composedHierarchy,
        },
      };

    case "UPDATE_PRIM": {
      const { primPath, updates } = payload;
      return {
        composedHierarchy: updatePrimInHierarchy(
          state.composedHierarchy,
          primPath,
          updates
        ),
      };
    }

    case "ADD_PRIM": {
      const { parentPath, prim } = payload;
      return {
        composedHierarchy: addPrimToHierarchy(
          state.composedHierarchy,
          parentPath,
          prim
        ),
      };
    }

    case "REMOVE_PRIM": {
      const { primPath } = payload;
      return {
        composedHierarchy: removePrimFromHierarchy(
          state.composedHierarchy,
          primPath
        ),
      };
    }

    case "SET_ALL_PRIMS_BY_PATH":
      return {
        allPrimsByPath: payload.allPrimsByPath,
      };

    // ==================== Staging Actions ====================
    case "STAGE_CHANGE": {
      const currentChanges = state.stagedChanges || [];
      return {
        stagedChanges: [...currentChanges, payload.change],
      };
    }

    case "UNSTAGE_CHANGE": {
      const currentChanges = state.stagedChanges || [];
      return {
        stagedChanges: currentChanges.filter(
          (_, index) => index !== payload.changeIndex
        ),
      };
    }

    case "CLEAR_STAGED_CHANGES":
      return {
        stagedChanges: [],
      };

    case "COMMIT_CHANGES": {
      const { commitMessage } = payload;

      // Don't create empty commits
      if (!state.stagedChanges || state.stagedChanges.length === 0) {
        return state;
      }

      const commit = {
        id: generateId(),
        timestamp: Date.now(),
        message: commitMessage,
        author: state.currentUser || "Unknown",
        changes: [...state.stagedChanges],
      };

      const currentHistory = state.history || { commits: new Map(), roots: [] };
      const newCommits = new Map(currentHistory.commits);
      newCommits.set(commit.id, commit);

      return {
        history: {
          ...currentHistory,
          commits: newCommits,
        },
        stagedChanges: [],
        headCommitId: commit.id,
      };
    }

    // ==================== History Actions ====================
    case "ADD_COMMIT": {
      const currentHistory = state.history || { commits: new Map(), roots: [] };
      const newCommits = new Map(currentHistory.commits);
      newCommits.set(payload.commit.id, payload.commit);
      return {
        history: {
          ...currentHistory,
          commits: newCommits,
        },
      };
    }

    case "SET_HEAD_COMMIT":
      return {
        headCommitId: payload.headCommitId,
      };

    case "TOGGLE_HISTORY_MODE":
      return {
        isHistoryMode: payload.isHistoryMode,
      };

    case "SET_HISTORY":
      return {
        history: payload.history,
      };

    case "ADD_ROOT_COMMIT": {
      const currentHistory = state.history || { commits: new Map(), roots: [] };
      return {
        history: {
          ...currentHistory,
          roots: [...currentHistory.roots, payload.commitId],
        },
      };
    }

    case "INCREMENT_LOG_ENTRY_COUNTER": {
      const currentCounter = state.logEntryCounter || 0;
      const newCounter = currentCounter + 1;
      // Store the return value for actions that need it
      action._returnValue = newCounter;
      return {
        logEntryCounter: newCounter,
      };
    }

    case "SET_LOG_ENTRY_COUNTER":
      return {
        logEntryCounter: payload.logEntryCounter,
      };

    // ==================== View Actions ====================
    case "SET_CURRENT_VIEW":
      return {
        currentView: payload.currentView,
      };

    // ==================== File Actions ====================
    case "LOAD_FILE": {
      const currentFiles = state.loadedFiles || {};
      return {
        loadedFiles: {
          ...currentFiles,
          [payload.filePath]: payload.content,
        },
      };
    }

    case "UNLOAD_FILE": {
      const currentFiles = state.loadedFiles || {};
      // eslint-disable-next-line no-unused-vars
      const { [payload.filePath]: _removed, ...remainingFiles } = currentFiles;
      return {
        loadedFiles: remainingFiles,
      };
    }

    case "UPDATE_FILE": {
      const currentFiles = state.loadedFiles || {};
      return {
        loadedFiles: {
          ...currentFiles,
          [payload.filePath]: payload.content,
        },
      };
    }

    case "SET_CURRENT_FILE":
      return {
        currentFile: payload.currentFile,
      };

    case "SET_SELECTED_FILES":
      return {
        selectedFiles: payload.selectedFiles,
      };

    // ==================== Unknown Action ====================
    default:
      console.warn(`Unknown action type: ${type}`);
      return {};
  }
}
