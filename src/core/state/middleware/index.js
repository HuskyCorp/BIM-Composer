/**
 * Middleware exports
 */

export { createLoggerMiddleware } from "./logger.js";
export {
  createAsyncMiddleware,
  createThunk,
  createAsyncAction,
} from "./async.js";
import { reducer } from "../reducer.js";

/**
 * Apply middleware to store
 *
 * @param {StateManager} store - State manager instance
 * @param {Array<Function>} middlewares - Array of middleware functions
 * @returns {StateManager} Enhanced store
 */
export function applyMiddleware(store, ...middlewares) {
  // Save original setState FIRST - before creating dispatch chain
  // Use internalSetState if available to avoid deprecation warnings
  const originalSetState = (store.internalSetState || store.setState).bind(
    store
  );

  // Chain middleware - use reducer to transform actions into state updates
  let dispatch = (updates) => {
    // If it's an action (has a type), use reducer to transform it
    if (updates && typeof updates === "object" && "type" in updates) {
      const stateUpdates = reducer(store.getState(), updates);
      originalSetState(stateUpdates);
      // Return value from action if it has one (e.g., INCREMENT_LOG_ENTRY_COUNTER)
      return updates._returnValue;
    }
    // Otherwise, pass through directly
    return originalSetState(updates);
  };

  middlewares.reverse().forEach((middleware) => {
    const middlewareFn = middleware(store);
    dispatch = middlewareFn(dispatch);
  });

  // Create enhanced setState
  store.setState = function (updates) {
    // If updates has a type, it's an action - run through middleware
    if (updates && typeof updates === "object" && "type" in updates) {
      return dispatch(updates);
    }

    // Otherwise, use original setState
    return originalSetState(updates);
  };

  // Add dispatch method for actions
  store.dispatch = dispatch;

  return store;
}
