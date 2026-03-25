/**
 * Action Creators for State Management
 *
 * Benefits:
 * - Type safety (when using TypeScript)
 * - Centralized action logic
 * - Easy to test
 * - Self-documenting
 */

// ==================== Scene Actions ====================

export const sceneActions = {
  /**
   * Set current user by ID (UUID)
   * @param {string} userId - UUID of the user in state.users Map
   */
  setCurrentUser: (userId) => ({
    type: "SET_CURRENT_USER",
    payload: { currentUserId: userId },
  }),
};

// ==================== Layer Actions ====================

export const layerActions = {
  /**
   * Add a new layer to the stack
   */
  addLayer: (layer) => ({
    type: "ADD_LAYER",
    payload: { layer },
  }),

  /**
   * Remove a layer from the stack
   */
  removeLayer: (layerId) => ({
    type: "REMOVE_LAYER",
    payload: { layerId },
  }),

  /**
   * Update layer properties
   */
  updateLayer: (layerId, updates) => ({
    type: "UPDATE_LAYER",
    payload: { layerId, updates },
  }),

  /**
   * Toggle layer visibility
   */
  toggleLayerVisibility: (layerId) => ({
    type: "TOGGLE_LAYER_VISIBILITY",
    payload: { layerId },
  }),

  /**
   * Toggle layer active state
   */
  toggleLayerActive: (layerId) => ({
    type: "TOGGLE_LAYER_ACTIVE",
    payload: { layerId },
  }),

  /**
   * Reorder layers
   */
  reorderLayers: (layerStack) => ({
    type: "REORDER_LAYERS",
    payload: { layerStack },
  }),

  /**
   * Update entire layer stack
   */
  updateLayerStack: (layerStack) => ({
    type: "UPDATE_LAYER_STACK",
    payload: { layerStack },
  }),

  /**
   * Set layer filter
   */
  setLayerFilter: (filter) => ({
    type: "SET_LAYER_FILTER",
    payload: { activeFilter: filter },
  }),

  /**
   * Toggle status colorization
   */
  toggleStatusColor: () => ({
    type: "TOGGLE_STATUS_COLOR",
  }),

  /**
   * Set save status filter
   */
  setSaveStatusFilter: (filters) => ({
    type: "SET_SAVE_STATUS_FILTER",
    payload: { saveStatusFilter: filters },
  }),
};

// ==================== Prim Actions ====================

export const primActions = {
  /**
   * Set composed hierarchy
   */
  setComposedHierarchy: (hierarchy) => ({
    type: "SET_COMPOSED_HIERARCHY",
    payload: { composedHierarchy: hierarchy },
  }),

  setRecordedHierarchy: (hierarchy) => ({
    type: "SET_RECORDED_HIERARCHY",
    payload: { recordedHierarchy: hierarchy },
  }),

  /**
   * Update prim in hierarchy
   */
  updatePrim: (primPath, updates) => ({
    type: "UPDATE_PRIM",
    payload: { primPath, updates },
  }),

  /**
   * Add prim to hierarchy
   */
  addPrim: (parentPath, prim) => ({
    type: "ADD_PRIM",
    payload: { parentPath, prim },
  }),

  /**
   * Remove prim from hierarchy
   */
  removePrim: (primPath) => ({
    type: "REMOVE_PRIM",
    payload: { primPath },
  }),

  /**
   * Set all prims by path map
   */
  setAllPrimsByPath: (primsMap) => ({
    type: "SET_ALL_PRIMS_BY_PATH",
    payload: { allPrimsByPath: primsMap },
  }),
};

// ==================== Staging Actions ====================

export const stagingActions = {
  /**
   * Add change to staging area
   */
  stageChange: (change) => ({
    type: "STAGE_CHANGE",
    payload: { change },
  }),

  /**
   * Remove change from staging area
   */
  unstageChange: (changeIndex) => ({
    type: "UNSTAGE_CHANGE",
    payload: { changeIndex },
  }),

  /**
   * Clear all staged changes
   */
  clearStagedChanges: () => ({
    type: "CLEAR_STAGED_CHANGES",
  }),

  /**
   * Commit staged changes
   */
  commitChanges: (commitMessage) => ({
    type: "COMMIT_CHANGES",
    payload: { commitMessage },
  }),
};

// ==================== History Actions ====================

export const historyActions = {
  /**
   * Add commit to history
   */
  addCommit: (commit) => ({
    type: "ADD_COMMIT",
    payload: { commit },
  }),

  /**
   * Set head commit
   */
  setHeadCommit: (commitId) => ({
    type: "SET_HEAD_COMMIT",
    payload: { headCommitId: commitId },
  }),

  /**
   * Toggle history mode
   */
  toggleHistoryMode: (enabled) => ({
    type: "TOGGLE_HISTORY_MODE",
    payload: { isHistoryMode: enabled },
  }),

  /**
   * Set history object
   */
  setHistory: (history) => ({
    type: "SET_HISTORY",
    payload: { history },
  }),

  /**
   * Add root commit
   */
  addRootCommit: (commitId) => ({
    type: "ADD_ROOT_COMMIT",
    payload: { commitId },
  }),

  /**
   * Increment log entry counter
   */
  incrementLogEntryCounter: () => ({
    type: "INCREMENT_LOG_ENTRY_COUNTER",
  }),

  /**
   * Set log entry counter
   */
  setLogEntryCounter: (counter) => ({
    type: "SET_LOG_ENTRY_COUNTER",
    payload: { logEntryCounter: counter },
  }),
};

// ==================== View Actions ====================

export const viewActions = {
  /**
   * Set current view
   */
  setCurrentView: (view) => ({
    type: "SET_CURRENT_VIEW",
    payload: { currentView: view },
  }),
};

// ==================== File Actions ====================

export const fileActions = {
  /**
   * Load file content
   */
  loadFile: (filePath, content) => ({
    type: "LOAD_FILE",
    payload: { filePath, content },
  }),

  /**
   * Unload file
   */
  unloadFile: (filePath) => ({
    type: "UNLOAD_FILE",
    payload: { filePath },
  }),

  updateFile: (filePath, content) => ({
    type: "UPDATE_FILE",
    payload: { filePath, content },
  }),

  /**
   * Set current file
   */
  setCurrentFile: (fileName) => ({
    type: "SET_CURRENT_FILE",
    payload: { currentFile: fileName },
  }),

  /**
   * Set selected files
   */
  setSelectedFiles: (files) => ({
    type: "SET_SELECTED_FILES",
    payload: { selectedFiles: files },
  }),
};

// ==================== Hash Registry Actions ====================

export const hashRegistryActions = {
  updatePrimHashRegistry: (entries) => ({
    type: "UPDATE_PRIM_HASH_REGISTRY",
    payload: { entries },
  }),

  clearFileFromHashRegistry: (fileName) => ({
    type: "CLEAR_FILE_FROM_HASH_REGISTRY",
    payload: { fileName },
  }),
};

// ==================== Package Actions ====================

export const packageActions = {
  /**
   * Add a new design package
   */
  addPackage: (pkg) => ({
    type: "ADD_PACKAGE",
    payload: { pkg },
  }),

  /**
   * Remove a design package by ID
   */
  removePackage: (packageId) => ({
    type: "REMOVE_PACKAGE",
    payload: { packageId },
  }),

  /**
   * Update properties of an existing design package
   */
  updatePackage: (packageId, updates) => ({
    type: "UPDATE_PACKAGE",
    payload: { packageId, updates },
  }),

  /**
   * Set the active design package
   */
  setActivePackage: (packageId) => ({
    type: "SET_ACTIVE_PACKAGE",
    payload: { packageId },
  }),

  /**
   * Set the stage package filter ("All" or a package ID)
   */
  setPackageFilter: (packageId) => ({
    type: "SET_PACKAGE_FILTER",
    payload: { packageId },
  }),

  /**
   * Update a package's branch assignment and approval status
   */
  updatePackageBranch: (packageId, stageBranch, approvalStatus) => ({
    type: "UPDATE_PACKAGE",
    payload: { packageId, updates: { stageBranch, approvalStatus } },
  }),
};

// ==================== User Management Actions ====================

export const userManagementActions = {
  addUser: (user) => ({ type: "ADD_USER", payload: { user } }),
  updateUser: (userId, updates) => ({
    type: "UPDATE_USER",
    payload: { userId, updates },
  }),
  removeUser: (userId) => ({ type: "REMOVE_USER", payload: { userId } }),
};

export const companyActions = {
  addCompany: (company) => ({ type: "ADD_COMPANY", payload: { company } }),
  updateCompany: (companyId, updates) => ({
    type: "UPDATE_COMPANY",
    payload: { companyId, updates },
  }),
  removeCompany: (companyId) => ({
    type: "REMOVE_COMPANY",
    payload: { companyId },
  }),
};

export const taskTeamActions = {
  addTaskTeam: (team) => ({ type: "ADD_TASK_TEAM", payload: { team } }),
  updateTaskTeam: (teamId, updates) => ({
    type: "UPDATE_TASK_TEAM",
    payload: { teamId, updates },
  }),
  removeTaskTeam: (teamId) => ({
    type: "REMOVE_TASK_TEAM",
    payload: { teamId },
  }),
};

// ==================== URI Actions ====================

export const uriActions = {
  registerUrisBatch: (entries) => ({
    type: "REGISTER_URIS_BATCH",
    payload: { entries },
  }),
  clearUrisForFile: (fileName) => ({
    type: "CLEAR_URIS_FOR_FILE",
    payload: { fileName },
  }),
  setActiveUriFilters: (filters) => ({
    type: "SET_ACTIVE_URI_FILTERS",
    payload: { filters },
  }),
  toggleUriFilter: (tag) => ({ type: "TOGGLE_URI_FILTER", payload: { tag } }),
};

// ==================== Design Option Actions ====================

export const designOptionActions = {
  addDesignOption: (option) => ({
    type: "ADD_DESIGN_OPTION",
    payload: { option },
  }),
  removeDesignOption: (optionId) => ({
    type: "REMOVE_DESIGN_OPTION",
    payload: { optionId },
  }),
  updateDesignOption: (optionId, updates) => ({
    type: "UPDATE_DESIGN_OPTION",
    payload: { optionId, updates },
  }),
  setActiveDesignOption: (optionId) => ({
    type: "SET_ACTIVE_DESIGN_OPTION",
    payload: { optionId },
  }),
  approveDesignOption: (optionId, approvedBy) => ({
    type: "APPROVE_DESIGN_OPTION",
    payload: { optionId, approvedBy, approvedAt: new Date().toISOString() },
  }),
  archiveDesignOption: (optionId, archivedBy) => ({
    type: "ARCHIVE_DESIGN_OPTION",
    payload: { optionId, archivedBy, archivedAt: new Date().toISOString() },
  }),
  setStageBranchesState: (updates) => ({
    type: "SET_STAGE_BRANCHES_STATE",
    payload: { updates },
  }),
};

// ==================== Combined Actions ====================

/**
 * All action creators in one object
 */
export const actions = {
  ...sceneActions,
  ...layerActions,
  ...primActions,
  ...stagingActions,
  ...historyActions,
  ...viewActions,
  ...fileActions,
  ...hashRegistryActions,
  ...packageActions,
  ...userManagementActions,
  ...companyActions,
  ...taskTeamActions,
  ...uriActions,
  ...designOptionActions,
};

/**
 * Action types (for comparison/filtering)
 */
export const ActionTypes = {
  // User
  SET_CURRENT_USER: "SET_CURRENT_USER",

  // Layers
  ADD_LAYER: "ADD_LAYER",
  REMOVE_LAYER: "REMOVE_LAYER",
  UPDATE_LAYER: "UPDATE_LAYER",
  TOGGLE_LAYER_VISIBILITY: "TOGGLE_LAYER_VISIBILITY",
  TOGGLE_LAYER_ACTIVE: "TOGGLE_LAYER_ACTIVE",
  REORDER_LAYERS: "REORDER_LAYERS",
  UPDATE_LAYER_STACK: "UPDATE_LAYER_STACK",
  SET_LAYER_FILTER: "SET_LAYER_FILTER",
  TOGGLE_STATUS_COLOR: "TOGGLE_STATUS_COLOR",
  SET_SAVE_STATUS_FILTER: "SET_SAVE_STATUS_FILTER",

  // Prims
  SET_COMPOSED_HIERARCHY: "SET_COMPOSED_HIERARCHY",
  UPDATE_PRIM: "UPDATE_PRIM",
  ADD_PRIM: "ADD_PRIM",
  REMOVE_PRIM: "REMOVE_PRIM",
  SET_ALL_PRIMS_BY_PATH: "SET_ALL_PRIMS_BY_PATH",

  // Staging
  STAGE_CHANGE: "STAGE_CHANGE",
  UNSTAGE_CHANGE: "UNSTAGE_CHANGE",
  CLEAR_STAGED_CHANGES: "CLEAR_STAGED_CHANGES",
  COMMIT_CHANGES: "COMMIT_CHANGES",

  // History
  ADD_COMMIT: "ADD_COMMIT",
  SET_HEAD_COMMIT: "SET_HEAD_COMMIT",
  TOGGLE_HISTORY_MODE: "TOGGLE_HISTORY_MODE",
  SET_HISTORY: "SET_HISTORY",
  ADD_ROOT_COMMIT: "ADD_ROOT_COMMIT",
  INCREMENT_LOG_ENTRY_COUNTER: "INCREMENT_LOG_ENTRY_COUNTER",
  SET_LOG_ENTRY_COUNTER: "SET_LOG_ENTRY_COUNTER",

  // View
  SET_CURRENT_VIEW: "SET_CURRENT_VIEW",

  // Files
  LOAD_FILE: "LOAD_FILE",
  UNLOAD_FILE: "UNLOAD_FILE",
  UPDATE_FILE: "UPDATE_FILE",
  SET_CURRENT_FILE: "SET_CURRENT_FILE",
  SET_SELECTED_FILES: "SET_SELECTED_FILES",

  // Hash Registry
  UPDATE_PRIM_HASH_REGISTRY: "UPDATE_PRIM_HASH_REGISTRY",
  CLEAR_FILE_FROM_HASH_REGISTRY: "CLEAR_FILE_FROM_HASH_REGISTRY",

  // Packages
  ADD_PACKAGE: "ADD_PACKAGE",
  REMOVE_PACKAGE: "REMOVE_PACKAGE",
  UPDATE_PACKAGE: "UPDATE_PACKAGE",
  SET_ACTIVE_PACKAGE: "SET_ACTIVE_PACKAGE",
  SET_PACKAGE_FILTER: "SET_PACKAGE_FILTER",

  // User Management
  ADD_USER: "ADD_USER",
  UPDATE_USER: "UPDATE_USER",
  REMOVE_USER: "REMOVE_USER",
  ADD_COMPANY: "ADD_COMPANY",
  UPDATE_COMPANY: "UPDATE_COMPANY",
  REMOVE_COMPANY: "REMOVE_COMPANY",
  ADD_TASK_TEAM: "ADD_TASK_TEAM",
  UPDATE_TASK_TEAM: "UPDATE_TASK_TEAM",
  REMOVE_TASK_TEAM: "REMOVE_TASK_TEAM",

  // URI
  REGISTER_URIS_BATCH: "REGISTER_URIS_BATCH",
  CLEAR_URIS_FOR_FILE: "CLEAR_URIS_FOR_FILE",
  SET_ACTIVE_URI_FILTERS: "SET_ACTIVE_URI_FILTERS",
  TOGGLE_URI_FILTER: "TOGGLE_URI_FILTER",

  // Design Options
  ADD_DESIGN_OPTION: "ADD_DESIGN_OPTION",
  REMOVE_DESIGN_OPTION: "REMOVE_DESIGN_OPTION",
  UPDATE_DESIGN_OPTION: "UPDATE_DESIGN_OPTION",
  SET_ACTIVE_DESIGN_OPTION: "SET_ACTIVE_DESIGN_OPTION",
  APPROVE_DESIGN_OPTION: "APPROVE_DESIGN_OPTION",
  ARCHIVE_DESIGN_OPTION: "ARCHIVE_DESIGN_OPTION",
  SET_STAGE_BRANCHES_STATE: "SET_STAGE_BRANCHES_STATE",
};
