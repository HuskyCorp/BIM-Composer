// src/core/state/store.js
// Redux-style store implementation

import { reducer } from "./reducer.js";
import { state as initialState } from "../../state.js";

/**
 * Store class - Redux-style state container
 * Manages application state with reducer pattern and subscriptions
 */
export class Store {
  constructor(initialState) {
    this.state = initialState;
    this.listeners = new Map();
    this.reducer = reducer;
  }

  /**
   * Get current state (read-only)
   * @returns {Object} Current state
   */
  getState() {
    return this.state;
  }

  /**
   * Dispatch an action to update state
   * @param {Object} action - Action object with type and payload
   * @returns {Object} The dispatched action
   */
  dispatch(action) {
    const prevState = this.state;

    // Use reducer to get new state
    const updates = this.reducer(this.state, action);

    // Deep merge updates into state (for compatibility with partial updates)
    this.state = this._deepMerge(this.state, updates);

    // Notify listeners
    this.notifyListeners(prevState, this.state);

    return action;
  }

  /**
   * Subscribe to state changes
   * @param {string} key - Subscription key (for organizing listeners)
   * @param {Function} callback - Callback function (prevState, nextState) => void
   * @returns {Function} Unsubscribe function
   */
  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, []);
    }
    this.listeners.get(key).push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.listeners.get(key);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Notify all subscribers of state change
   * @param {Object} prevState - Previous state
   * @param {Object} nextState - New state
   * @private
   */
  notifyListeners(prevState, nextState) {
    this.listeners.forEach((callbacks) => {
      callbacks.forEach((callback) => {
        callback(prevState, nextState);
      });
    });
  }

  /**
   * Deep merge objects (for backward compatibility with setState pattern)
   * @param {Object} target - Target object
   * @param {Object} source - Source object
   * @returns {Object} Merged object
   * @private
   */
  _deepMerge(target, source) {
    const result = { ...target };

    for (const key in source) {
      if (
        source[key] &&
        typeof source[key] === "object" &&
        !Array.isArray(source[key])
      ) {
        // Recursively merge nested objects
        if (
          result[key] &&
          typeof result[key] === "object" &&
          !Array.isArray(result[key])
        ) {
          result[key] = this._deepMerge(result[key], source[key]);
        } else {
          result[key] = source[key];
        }
      } else {
        // Direct assignment for primitives and arrays
        result[key] = source[key];
      }
    }

    return result;
  }

  /**
   * Internal state update method (no warning)
   * @param {Object} updates - State updates
   * @private
   */
  internalSetState(updates) {
    const prevState = this.state;
    this.state = this._deepMerge(this.state, updates);
    this.notifyListeners(prevState, this.state);
  }

  /**
   * Legacy setState method for backward compatibility
   * @deprecated Use dispatch() with actions instead
   * @param {Object} updates - State updates
   */
  setState(updates) {
    console.warn(
      "[Store] setState() is deprecated. Use dispatch() with actions instead."
    );
    this.internalSetState(updates);
  }
}

// Create and export singleton store instance
export const store = new Store(initialState);
