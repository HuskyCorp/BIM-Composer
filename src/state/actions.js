// src/state/actions.js
// Wrapper functions for backward compatibility
// These now use dispatch() instead of the deprecated setState()

import { store } from "../core/index.js";
import { actions as coreActions } from "../core/state/actions/index.js";

/**
 * All state mutations should use these action functions
 * This provides a single place to track and debug state changes
 */
export const actions = {
  /**
   * Sets the current user
   * @param {string} user - The user name
   */
  setCurrentUser(user) {
    console.log("[ACTION] setCurrentUser:", user);
    store.dispatch(coreActions.setCurrentUser(user));
  },

  /**
   * Adds a new loaded file
   * @param {string} fileName - The file name
   * @param {string} content - The file content
   */
  addLoadedFile(fileName, content) {
    console.log("[ACTION] addLoadedFile:", fileName);
    store.dispatch(coreActions.loadFile(fileName, content));
  },

  /**
   * Updates an existing loaded file
   * @param {string} fileName - The file name
   * @param {string} content - The new file content
   */
  updateLoadedFile(fileName, content) {
    console.log("[ACTION] updateLoadedFile:", fileName);
    store.dispatch(coreActions.updateFile(fileName, content));
  },

  /**
   * Removes a loaded file
   * @param {string} fileName - The file name to remove
   */
  removeLoadedFile(fileName) {
    console.log("[ACTION] removeLoadedFile:", fileName);
    store.dispatch(coreActions.unloadFile(fileName));
  },

  /**
   * Sets the composed hierarchy
   * @param {Array} hierarchy - The hierarchy array
   */
  setComposedHierarchy(hierarchy) {
    console.log("[ACTION] setComposedHierarchy");
    store.dispatch(coreActions.setComposedHierarchy(hierarchy));
  },

  /**
   * Adds a layer to the layer stack
   * @param {Object} layer - The layer object to add
   */
  addLayer(layer) {
    console.log("[ACTION] addLayer:", layer.filePath);
    store.dispatch(coreActions.addLayer(layer));
  },

  /**
   * Updates the entire layer stack
   * @param {Array} layerStack - The new layer stack array
   */
  updateLayerStack(layerStack) {
    console.log("[ACTION] updateLayerStack");
    store.dispatch(coreActions.updateLayerStack(layerStack));
  },

  /**
   * Removes a layer from the layer stack
   * @param {string} layerId - The layer ID to remove
   */
  removeLayer(layerId) {
    console.log("[ACTION] removeLayer:", layerId);
    store.dispatch(coreActions.removeLayer(layerId));
  },

  /**
   * Updates a specific layer's properties
   * @param {string} layerId - The layer ID
   * @param {Object} updates - Properties to update
   */
  updateLayer(layerId, updates) {
    console.log("[ACTION] updateLayer:", layerId, updates);
    store.dispatch(coreActions.updateLayer(layerId, updates));
  },

  /**
   * Sets the composed prims
   * @param {Array} prims - The composed prims array
   */
  setComposedPrims(prims) {
    console.log("[ACTION] setComposedPrims");
    store.dispatch(coreActions.setComposedHierarchy(prims));
  },

  /**
   * Sets the active filter
   * @param {string} filter - The filter value (e.g., "All", "WIP", "Shared")
   */
  setActiveFilter(filter) {
    console.log("[ACTION] setActiveFilter:", filter);
    store.dispatch(coreActions.setLayerFilter(filter));
  },

  /**
   * Toggles colorize by status
   * @param {boolean} enabled - Whether to colorize by status
   */
  setColorizeByStatus(enabled) {
    console.log("[ACTION] setColorizeByStatus:", enabled);
    store.dispatch(coreActions.toggleStatusColor());
  },

  /**
   * Sets the save status filter
   * @param {Array<string>} filters - Array of status values to include in save
   */
  setSaveStatusFilter(filters) {
    console.log("[ACTION] setSaveStatusFilter:", filters);
    store.dispatch(coreActions.setSaveStatusFilter(filters));
  },

  /**
   * Adds a staged change
   * @param {Object} change - The change object
   */
  addStagedChange(change) {
    console.log("[ACTION] addStagedChange:", change.type);
    store.dispatch(coreActions.stageChange(change));
  },

  /**
   * Clears all staged changes
   */
  clearStagedChanges() {
    console.log("[ACTION] clearStagedChanges");
    store.dispatch(coreActions.clearStagedChanges());
  },

  /**
   * Sets history mode
   * @param {boolean} isHistoryMode - Whether in history mode
   */
  setHistoryMode(isHistoryMode) {
    console.log("[ACTION] setHistoryMode:", isHistoryMode);
    store.dispatch(coreActions.toggleHistoryMode(isHistoryMode));
  },

  /**
   * Sets the head commit ID
   * @param {string} commitId - The commit ID
   */
  setHeadCommitId(commitId) {
    console.log("[ACTION] setHeadCommitId:", commitId);
    store.dispatch(coreActions.setHeadCommit(commitId));
  },

  /**
   * Increments the log entry counter
   * @returns {number} The new counter value
   */
  incrementLogEntryCounter() {
    console.log("[ACTION] incrementLogEntryCounter");
    const result = store.dispatch(coreActions.incrementLogEntryCounter());
    return result._returnValue;
  },

  /**
   * Sets the log entry counter to a specific value
   * @param {number} counter - The counter value
   */
  setLogEntryCounter(counter) {
    console.log("[ACTION] setLogEntryCounter:", counter);
    store.dispatch(coreActions.setLogEntryCounter(counter));
  },

  /**
   * Adds a commit to history
   * @param {string} commitId - The commit ID
   * @param {Object} commitData - The commit data
   */
  addCommit(commitId, commitData) {
    console.log("[ACTION] addCommit:", commitId);
    store.dispatch(coreActions.addCommit({ id: commitId, ...commitData }));
  },

  /**
   * Adds a root commit ID
   * @param {string} commitId - The root commit ID
   */
  addRootCommit(commitId) {
    console.log("[ACTION] addRootCommit:", commitId);
    store.dispatch(coreActions.addRootCommit(commitId));
  },

  /**
   * Sets the history object
   * @param {Object} history - The history object
   */
  setHistory(history) {
    console.log("[ACTION] setHistory");
    store.dispatch(coreActions.setHistory(history));
  },

  /**
   * Sets the allPrimsByPath map
   * @param {Map} primsMap - The map of prim paths to prim objects
   */
  setAllPrimsByPath(primsMap) {
    console.log("[ACTION] setAllPrimsByPath", primsMap.size);
    store.dispatch(coreActions.setAllPrimsByPath(primsMap));
  },

  /**
   * Sets the current view
   * @param {string} view - The view name (e.g., "stage", "history")
   */
  setCurrentView(view) {
    console.log("[ACTION] setCurrentView:", view);
    store.dispatch(coreActions.setCurrentView(view));
  },

  /**
   * Sets the current file
   * @param {string} fileName - The file name
   */
  setCurrentFile(fileName) {
    console.log("[ACTION] setCurrentFile:", fileName);
    store.dispatch(coreActions.setCurrentFile(fileName));
  },

  /**
   * Sets the selected files
   * @param {Array} files - The selected files array
   */
  setSelectedFiles(files) {
    console.log("[ACTION] setSelectedFiles:", files.length);
    store.dispatch(coreActions.setSelectedFiles(files));
  },

  /**
   * Sets the scene name
   * @param {string} name - The scene name
   */
  setSceneName(name) {
    console.log("[ACTION] setSceneName:", name);
    store.dispatch(coreActions.setSceneName(name));
  },

  /**
   * Merges new prim hash entries into the registry
   * @param {Object} entries - Map of primPath → { hash, sourceFile }
   */
  updatePrimHashRegistry(entries) {
    store.dispatch(coreActions.updatePrimHashRegistry(entries));
  },

  /**
   * Removes all entries from a given source file from the hash registry
   * @param {string} fileName - The source file name
   */
  clearFileFromHashRegistry(fileName) {
    store.dispatch(coreActions.clearFileFromHashRegistry(fileName));
  },

  // ==================== Package Actions ====================

  /**
   * Add a new design package
   * @param {Object} pkg - Package object { id, name, color, createdAt, createdBy }
   */
  addPackage(pkg) {
    store.dispatch(coreActions.addPackage(pkg));
  },

  /**
   * Remove a design package by ID
   * @param {string} packageId - Package ID to remove
   */
  removePackage(packageId) {
    store.dispatch(coreActions.removePackage(packageId));
  },

  /**
   * Update properties of an existing design package
   * @param {string} packageId - Package ID to update
   * @param {Object} updates - Partial package fields to merge
   */
  updatePackage(packageId, updates) {
    store.dispatch(coreActions.updatePackage(packageId, updates));
  },

  /**
   * Set the active design package
   * @param {string} packageId - Package ID to activate
   */
  setActivePackage(packageId) {
    store.dispatch(coreActions.setActivePackage(packageId));
  },

  /**
   * Set the layer stack package filter
   * @param {string} packageId - Package ID to filter by, or "All"
   */
  setPackageFilter(packageId) {
    store.dispatch(coreActions.setPackageFilter(packageId));
  },
};
