// src/__tests__/unit/core/state/store.test.js
/**
 * Tests for Redux-style store
 * Note: describe, it, expect are available globally via globals: true in vite.config.js
 */
import { Store } from "../../../../core/state/store.js";

describe("Store", () => {
  let store;
  let testInitialState;

  beforeEach(() => {
    testInitialState = {
      sceneName: "Test Scene",
      currentUser: "TestUser",
      stage: {
        layerStack: [],
        composedPrims: null,
        activeFilter: "All",
        colorizeByStatus: true,
      },
      composedHierarchy: [],
      stagedChanges: [],
      history: {
        commits: new Map(),
        roots: [],
      },
    };
    store = new Store(testInitialState);
  });

  describe("constructor", () => {
    it("should initialize with provided state", () => {
      expect(store.state).toEqual(testInitialState);
    });

    it("should initialize with empty listeners map", () => {
      expect(store.listeners).toBeInstanceOf(Map);
      expect(store.listeners.size).toBe(0);
    });

    it("should have a reducer function", () => {
      expect(typeof store.reducer).toBe("function");
    });
  });

  describe("getState", () => {
    it("should return current state", () => {
      const state = store.getState();
      expect(state).toEqual(testInitialState);
    });

    it("should return same reference as internal state", () => {
      const state = store.getState();
      expect(state).toBe(store.state);
    });

    it("should reflect changes after dispatch", () => {
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "Updated Scene" },
      });

      const state = store.getState();
      expect(state.sceneName).toBe("Updated Scene");
    });
  });

  describe("dispatch", () => {
    it("should dispatch action and update state", () => {
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "New Scene" },
      });

      expect(store.state.sceneName).toBe("New Scene");
    });

    it("should return the dispatched action", () => {
      const action = {
        type: "SET_CURRENT_USER",
        payload: { currentUser: "Alice" },
      };

      const result = store.dispatch(action);
      expect(result).toBe(action);
    });

    it("should call reducer with current state and action", () => {
      const reducerSpy = vi.spyOn(store, "reducer");

      const action = {
        type: "SET_SCENE_NAME",
        payload: { sceneName: "Test" },
      };
      store.dispatch(action);

      expect(reducerSpy).toHaveBeenCalledWith(expect.any(Object), action);
    });

    it("should notify listeners after state change", () => {
      const listener = vi.fn();
      store.subscribe("test", listener);

      const prevState = { ...store.state };
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "Changed" },
      });

      expect(listener).toHaveBeenCalledWith(prevState, store.state);
    });

    it("should handle multiple consecutive dispatches", () => {
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "First" },
      });
      store.dispatch({
        type: "SET_CURRENT_USER",
        payload: { currentUser: "Second" },
      });

      expect(store.state.sceneName).toBe("First");
      expect(store.state.currentUser).toBe("Second");
    });

    it("should deep merge updates into existing state", () => {
      store.dispatch({
        type: "ADD_LAYER",
        payload: { layer: { id: "layer1", name: "Layer 1" } },
      });

      expect(store.state.stage.layerStack).toHaveLength(1);
      expect(store.state.stage.activeFilter).toBe("All"); // Should preserve existing properties
    });
  });

  describe("subscribe", () => {
    it("should add listener for the given key", () => {
      const callback = vi.fn();
      store.subscribe("test", callback);

      expect(store.listeners.has("test")).toBe(true);
      expect(store.listeners.get("test")).toContain(callback);
    });

    it("should support multiple listeners for same key", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      store.subscribe("test", callback1);
      store.subscribe("test", callback2);

      const listeners = store.listeners.get("test");
      expect(listeners).toHaveLength(2);
      expect(listeners).toContain(callback1);
      expect(listeners).toContain(callback2);
    });

    it("should support listeners for different keys", () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      store.subscribe("key1", callback1);
      store.subscribe("key2", callback2);

      expect(store.listeners.has("key1")).toBe(true);
      expect(store.listeners.has("key2")).toBe(true);
    });

    it("should return an unsubscribe function", () => {
      const callback = vi.fn();
      const unsubscribe = store.subscribe("test", callback);

      expect(typeof unsubscribe).toBe("function");
    });

    it("should call listener when state changes", () => {
      const listener = vi.fn();
      store.subscribe("test", listener);

      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "New" },
      });

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should pass previous and next state to listener", () => {
      const listener = vi.fn();
      const prevState = { ...store.state };

      store.subscribe("test", listener);
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "Updated" },
      });

      expect(listener).toHaveBeenCalledWith(prevState, store.state);
      expect(listener.mock.calls[0][0].sceneName).toBe("Test Scene");
      expect(listener.mock.calls[0][1].sceneName).toBe("Updated");
    });
  });

  describe("unsubscribe", () => {
    it("should remove listener when unsubscribe is called", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe("test", listener);

      unsubscribe();

      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "New" },
      });

      expect(listener).not.toHaveBeenCalled();
    });

    it("should only remove the specific listener", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      const unsubscribe1 = store.subscribe("test", listener1);
      store.subscribe("test", listener2);

      unsubscribe1();

      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "New" },
      });

      expect(listener1).not.toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should handle unsubscribe when key has no listeners", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe("test", listener);

      // Remove all listeners
      store.listeners.delete("test");

      // Should not throw
      expect(() => unsubscribe()).not.toThrow();
    });

    it("should handle multiple unsubscribe calls", () => {
      const listener = vi.fn();
      const unsubscribe = store.subscribe("test", listener);

      unsubscribe();
      unsubscribe(); // Second call should not throw

      expect(() => unsubscribe()).not.toThrow();
    });
  });

  describe("notifyListeners", () => {
    it("should call all registered listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      const listener3 = vi.fn();

      store.subscribe("key1", listener1);
      store.subscribe("key1", listener2);
      store.subscribe("key2", listener3);

      const prevState = { ...store.state };
      const nextState = { ...store.state, sceneName: "Updated" };

      store.notifyListeners(prevState, nextState);

      expect(listener1).toHaveBeenCalledWith(prevState, nextState);
      expect(listener2).toHaveBeenCalledWith(prevState, nextState);
      expect(listener3).toHaveBeenCalledWith(prevState, nextState);
    });

    it("should handle empty listeners", () => {
      const prevState = store.state;
      const nextState = { ...store.state };

      expect(() => store.notifyListeners(prevState, nextState)).not.toThrow();
    });
  });

  describe("_deepMerge", () => {
    it("should merge simple objects", () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };

      const result = store._deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it("should merge nested objects", () => {
      const target = {
        user: { name: "Alice", age: 30 },
        settings: { theme: "dark" },
      };
      const source = {
        user: { age: 31, role: "admin" },
      };

      const result = store._deepMerge(target, source);

      expect(result).toEqual({
        user: { name: "Alice", age: 31, role: "admin" },
        settings: { theme: "dark" },
      });
    });

    it("should replace arrays instead of merging", () => {
      const target = { items: [1, 2, 3] };
      const source = { items: [4, 5] };

      const result = store._deepMerge(target, source);

      expect(result.items).toEqual([4, 5]);
    });

    it("should not modify target object", () => {
      const target = { a: 1, b: { c: 2 } };
      const source = { b: { d: 3 } };

      const result = store._deepMerge(target, source);

      expect(target).toEqual({ a: 1, b: { c: 2 } });
      expect(result).not.toBe(target);
    });

    it("should handle null and undefined values", () => {
      const target = { a: 1, b: 2, c: 3 };
      const source = { a: null, b: undefined, d: 4 };

      const result = store._deepMerge(target, source);

      expect(result.a).toBe(null);
      expect(result.b).toBe(undefined);
      expect(result.c).toBe(3);
      expect(result.d).toBe(4);
    });

    it("should replace object with array", () => {
      const target = { a: { nested: "value" } };
      const source = { a: [1, 2, 3] };

      const result = store._deepMerge(target, source);

      expect(result.a).toEqual([1, 2, 3]);
    });

    it("should replace array with object", () => {
      const target = { a: [1, 2, 3] };
      const source = { a: { nested: "value" } };

      const result = store._deepMerge(target, source);

      expect(result.a).toEqual({ nested: "value" });
    });

    it("should handle deeply nested structures", () => {
      const target = {
        level1: {
          level2: {
            level3: {
              value: "original",
            },
          },
        },
      };
      const source = {
        level1: {
          level2: {
            level3: {
              value: "updated",
              newValue: "added",
            },
          },
        },
      };

      const result = store._deepMerge(target, source);

      expect(result.level1.level2.level3).toEqual({
        value: "updated",
        newValue: "added",
      });
    });
  });

  describe("setState (deprecated)", () => {
    it("should update state using deep merge", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      store.setState({ sceneName: "Direct Update" });

      expect(store.state.sceneName).toBe("Direct Update");
      expect(store.state.currentUser).toBe("TestUser"); // Other properties preserved

      consoleSpy.mockRestore();
    });

    it("should show deprecation warning", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      store.setState({ sceneName: "Test" });

      expect(consoleSpy).toHaveBeenCalledWith(
        "[Store] setState() is deprecated. Use dispatch() with actions instead."
      );

      consoleSpy.mockRestore();
    });

    it("should notify listeners after setState", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const listener = vi.fn();

      store.subscribe("test", listener);
      store.setState({ sceneName: "Updated" });

      expect(listener).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it("should pass previous and next state to listeners", () => {
      const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const listener = vi.fn();
      const prevState = { ...store.state };

      store.subscribe("test", listener);
      store.setState({ sceneName: "Changed" });

      expect(listener).toHaveBeenCalledWith(prevState, store.state);

      consoleSpy.mockRestore();
    });
  });

  describe("integration tests", () => {
    it("should handle complete workflow: subscribe -> dispatch -> notify", () => {
      const listener = vi.fn();
      store.subscribe("workflow", listener);

      // Initial state
      expect(store.state.sceneName).toBe("Test Scene");

      // Dispatch action
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "Workflow Scene" },
      });

      // Verify state updated
      expect(store.state.sceneName).toBe("Workflow Scene");

      // Verify listener called
      expect(listener).toHaveBeenCalledTimes(1);
    });

    it("should support complex state updates with multiple listeners", () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      store.subscribe("view", listener1);
      store.subscribe("data", listener2);

      store.dispatch({
        type: "ADD_LAYER",
        payload: { layer: { id: "layer1", name: "Layer 1" } },
      });

      expect(store.state.stage.layerStack).toHaveLength(1);
      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });

    it("should maintain state integrity across multiple operations", () => {
      store.dispatch({
        type: "SET_SCENE_NAME",
        payload: { sceneName: "Scene 1" },
      });
      store.dispatch({
        type: "SET_CURRENT_USER",
        payload: { currentUser: "User 1" },
      });
      store.dispatch({
        type: "ADD_LAYER",
        payload: { layer: { id: "l1" } },
      });

      const state = store.getState();
      expect(state.sceneName).toBe("Scene 1");
      expect(state.currentUser).toBe("User 1");
      expect(state.stage.layerStack).toHaveLength(1);
    });
  });
});
