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
    // ==================== User Actions ====================
    case "SET_CURRENT_USER": {
      // Accepts both new format { currentUserId } and legacy format { currentUser }
      const userId = payload.currentUserId || payload.currentUser;
      const userObj =
        state.users instanceof Map ? state.users.get(userId) : null;
      return {
        currentUserId: userId,
        // Keep currentUser string in sync for backward compat
        currentUser: userObj?.name ?? userId,
      };
    }

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
      const targetLayer = currentStack.find((l) => l.id === payload.layerId);
      // Immutable layers cannot be modified
      if (targetLayer?.immutable) {
        console.warn(
          `[Reducer] Blocked mutation of immutable layer: ${payload.layerId}`
        );
        return {};
      }
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

    case "SET_RECORDED_HIERARCHY":
      return { recordedHierarchy: payload.recordedHierarchy };

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

      const authorUser =
        state.users instanceof Map
          ? state.users.get(state.currentUserId)
          : null;
      const commit = {
        id: generateId(),
        timestamp: Date.now(),
        message: commitMessage,
        author: authorUser?.name || state.currentUser || "Unknown",
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

    // ==================== Hash Registry Actions ====================
    case "UPDATE_PRIM_HASH_REGISTRY": {
      const current = state.primHashRegistry || {};
      return {
        primHashRegistry: { ...current, ...payload.entries },
      };
    }

    case "CLEAR_FILE_FROM_HASH_REGISTRY": {
      const current = state.primHashRegistry || {};
      const updated = {};
      Object.entries(current).forEach(([path, val]) => {
        if (val.sourceFile !== payload.fileName) updated[path] = val;
      });
      return { primHashRegistry: updated };
    }

    // ==================== Package Actions ====================
    case "ADD_PACKAGE": {
      const currentPackages = state.packages || [];
      const newPackages = [...currentPackages, payload.pkg];
      const newActiveId =
        currentPackages.length === 0 ? payload.pkg.id : state.activePackageId;
      return {
        packages: newPackages,
        activePackageId: newActiveId,
      };
    }

    case "REMOVE_PACKAGE": {
      const currentPackages = state.packages || [];
      const filtered = currentPackages.filter(
        (p) => p.id !== payload.packageId
      );
      const newActiveId =
        state.activePackageId === payload.packageId
          ? filtered[0]?.id || null
          : state.activePackageId;
      return {
        packages: filtered,
        activePackageId: newActiveId,
      };
    }

    case "UPDATE_PACKAGE": {
      const currentPackages = state.packages || [];
      return {
        packages: currentPackages.map((p) =>
          p.id === payload.packageId ? { ...p, ...payload.updates } : p
        ),
      };
    }

    case "SET_ACTIVE_PACKAGE":
      return {
        activePackageId: payload.packageId,
      };

    case "SET_PACKAGE_FILTER":
      return {
        stage: {
          ...state.stage,
          activePackageFilter: payload.packageId,
        },
      };

    // ==================== User Management Actions ====================
    case "ADD_USER": {
      const currentUsers =
        state.users instanceof Map ? new Map(state.users) : new Map();
      currentUsers.set(payload.user.id, payload.user);
      return { users: currentUsers };
    }

    case "UPDATE_USER": {
      if (!(state.users instanceof Map)) return {};
      const updatedUsers = new Map(state.users);
      const existing = updatedUsers.get(payload.userId);
      if (existing)
        updatedUsers.set(payload.userId, { ...existing, ...payload.updates });
      return { users: updatedUsers };
    }

    case "REMOVE_USER": {
      if (!(state.users instanceof Map)) return {};
      const filteredUsers = new Map(state.users);
      filteredUsers.delete(payload.userId);
      const newCurrentId =
        state.currentUserId === payload.userId
          ? filteredUsers.keys().next().value || null
          : state.currentUserId;
      return { users: filteredUsers, currentUserId: newCurrentId };
    }

    case "ADD_COMPANY": {
      const currentCompanies = state.companies || [];
      return { companies: [...currentCompanies, payload.company] };
    }

    case "UPDATE_COMPANY": {
      return {
        companies: (state.companies || []).map((c) =>
          c.id === payload.companyId ? { ...c, ...payload.updates } : c
        ),
      };
    }

    case "REMOVE_COMPANY": {
      return {
        companies: (state.companies || []).filter(
          (c) => c.id !== payload.companyId
        ),
      };
    }

    case "ADD_TASK_TEAM": {
      return { taskTeams: [...(state.taskTeams || []), payload.team] };
    }

    case "UPDATE_TASK_TEAM": {
      return {
        taskTeams: (state.taskTeams || []).map((t) =>
          t.id === payload.teamId ? { ...t, ...payload.updates } : t
        ),
      };
    }

    case "REMOVE_TASK_TEAM": {
      return {
        taskTeams: (state.taskTeams || []).filter(
          (t) => t.id !== payload.teamId
        ),
      };
    }

    // ==================== URI Actions ====================
    case "REGISTER_URIS_BATCH": {
      const currentRegistry =
        state.uriRegistry instanceof Map
          ? new Map(state.uriRegistry)
          : new Map();
      for (const [primPath, entry] of Object.entries(payload.entries)) {
        currentRegistry.set(primPath, entry);
      }
      return { uriRegistry: currentRegistry };
    }

    case "CLEAR_URIS_FOR_FILE": {
      if (!(state.uriRegistry instanceof Map)) return {};
      const filtered = new Map();
      for (const [path, entry] of state.uriRegistry) {
        if (entry.sourceFile !== payload.fileName) filtered.set(path, entry);
      }
      return { uriRegistry: filtered };
    }

    case "SET_ACTIVE_URI_FILTERS":
      return { activeUriFilters: payload.filters };

    case "TOGGLE_URI_FILTER": {
      const current = state.activeUriFilters || [];
      const idx = current.indexOf(payload.tag);
      return {
        activeUriFilters:
          idx >= 0
            ? current.filter((t) => t !== payload.tag)
            : [...current, payload.tag],
      };
    }

    // ==================== Design Option Actions ====================
    case "ADD_DESIGN_OPTION": {
      return {
        designOptions: [...(state.designOptions || []), payload.option],
      };
    }

    case "REMOVE_DESIGN_OPTION": {
      return {
        designOptions: (state.designOptions || []).filter(
          (o) => o.id !== payload.optionId
        ),
        activeDesignOptionId:
          state.activeDesignOptionId === payload.optionId
            ? null
            : state.activeDesignOptionId,
      };
    }

    case "UPDATE_DESIGN_OPTION": {
      return {
        designOptions: (state.designOptions || []).map((o) =>
          o.id === payload.optionId ? { ...o, ...payload.updates } : o
        ),
      };
    }

    case "SET_ACTIVE_DESIGN_OPTION":
      return { activeDesignOptionId: payload.optionId };

    case "APPROVE_DESIGN_OPTION": {
      return {
        designOptions: (state.designOptions || []).map((o) =>
          o.id === payload.optionId
            ? {
                ...o,
                status: "approved",
                approvedBy: payload.approvedBy,
                approvedAt: payload.approvedAt,
              }
            : o
        ),
      };
    }

    case "ARCHIVE_DESIGN_OPTION": {
      return {
        designOptions: (state.designOptions || []).map((o) =>
          o.id === payload.optionId
            ? {
                ...o,
                status: "superseded",
                archivedBy: payload.archivedBy,
                archivedAt: payload.archivedAt,
              }
            : o
        ),
      };
    }

    case "SET_STAGE_BRANCHES_STATE": {
      return {
        stageBranches: { ...(state.stageBranches || {}), ...payload.updates },
      };
    }

    // ==================== Unknown Action ====================
    default:
      console.warn(`Unknown action type: ${type}`);
      return {};
  }
}
