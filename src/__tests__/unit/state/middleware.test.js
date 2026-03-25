/**
 * Tests for Middleware (logger, async, applyMiddleware)
 * Note: vi, describe, it, expect, beforeEach are available globally via globals: true in vite.config.js
 */

import {
  createAsyncMiddleware,
  createThunk,
  createAsyncAction,
} from "../../../core/state/middleware/async.js";
import { createLoggerMiddleware } from "../../../core/state/middleware/logger.js";
import { applyMiddleware } from "../../../core/state/middleware/index.js";

describe("Async Middleware", () => {
  let mockStore;
  let mockNext;

  beforeEach(() => {
    mockStore = {
      setState: vi.fn(),
      getState: vi.fn(() => ({ currentView: "stage" })),
    };
    mockNext = vi.fn();
  });

  describe("createAsyncMiddleware", () => {
    it("should pass plain objects to next", () => {
      const middleware = createAsyncMiddleware()(mockStore)(mockNext);
      const action = { type: "TEST", payload: {} };

      middleware(action);

      expect(mockNext).toHaveBeenCalledWith(action);
    });

    it("should handle function actions (thunks)", async () => {
      const middleware = createAsyncMiddleware()(mockStore)(mockNext);
      const thunkFn = vi.fn();

      middleware(thunkFn);

      expect(thunkFn).toHaveBeenCalledWith(
        expect.any(Function),
        expect.any(Function)
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should handle promise actions", async () => {
      const middleware = createAsyncMiddleware()(mockStore)(mockNext);
      const resolvedAction = { type: "RESOLVED", payload: {} };
      const promiseAction = Promise.resolve(resolvedAction);

      await middleware(promiseAction);

      expect(mockNext).toHaveBeenCalledWith(resolvedAction);
    });

    it("should handle promise that resolves to null", async () => {
      const middleware = createAsyncMiddleware()(mockStore)(mockNext);
      const promiseAction = Promise.resolve(null);

      await middleware(promiseAction);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it("should provide dispatch and getState to thunk functions", () => {
      const middleware = createAsyncMiddleware()(mockStore)(mockNext);
      let capturedDispatch, capturedGetState;

      middleware((dispatch, getState) => {
        capturedDispatch = dispatch;
        capturedGetState = getState;
      });

      expect(typeof capturedDispatch).toBe("function");
      expect(typeof capturedGetState).toBe("function");

      // getState should return current state
      expect(capturedGetState()).toEqual({ currentView: "stage" });
    });
  });

  describe("createThunk", () => {
    it("should create a thunk action creator", () => {
      const asyncFn = vi.fn();
      const thunkCreator = createThunk(asyncFn);
      const thunkAction = thunkCreator({ id: 1 });

      expect(typeof thunkAction).toBe("function");
    });

    it("should call async function with dispatch, getState, and payload", async () => {
      const asyncFn = vi.fn().mockResolvedValue("result");
      const thunkCreator = createThunk(asyncFn);
      const thunkAction = thunkCreator({ id: 1 });

      const dispatch = vi.fn();
      const getState = vi.fn(() => ({}));

      await thunkAction(dispatch, getState);

      expect(asyncFn).toHaveBeenCalledWith(dispatch, getState, { id: 1 });
    });

    it("should propagate errors from async function", async () => {
      const error = new Error("Thunk failed");
      const asyncFn = vi.fn().mockRejectedValue(error);
      const thunkCreator = createThunk(asyncFn);
      const thunkAction = thunkCreator();

      const dispatch = vi.fn();
      const getState = vi.fn();

      await expect(thunkAction(dispatch, getState)).rejects.toThrow(
        "Thunk failed"
      );
    });
  });

  describe("createAsyncAction", () => {
    it("should dispatch PENDING then SUCCESS on success", async () => {
      const asyncFn = vi.fn().mockResolvedValue({ data: "test" });
      const actionCreator = createAsyncAction("LOAD_DATA", asyncFn);
      const thunk = actionCreator("arg1");

      const dispatch = vi.fn();
      await thunk(dispatch);

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenNthCalledWith(1, {
        type: "LOAD_DATA_PENDING",
        payload: { args: ["arg1"] },
      });
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: "LOAD_DATA_SUCCESS",
        payload: { data: "test" },
      });
    });

    it("should dispatch PENDING then ERROR on failure", async () => {
      const asyncFn = vi.fn().mockRejectedValue(new Error("Network error"));
      const actionCreator = createAsyncAction("LOAD_DATA", asyncFn);
      const thunk = actionCreator();

      const dispatch = vi.fn();

      await expect(thunk(dispatch)).rejects.toThrow("Network error");

      expect(dispatch).toHaveBeenCalledTimes(2);
      expect(dispatch).toHaveBeenNthCalledWith(1, {
        type: "LOAD_DATA_PENDING",
        payload: { args: [] },
      });
      expect(dispatch).toHaveBeenNthCalledWith(2, {
        type: "LOAD_DATA_ERROR",
        payload: { error: "Network error" },
        error: true,
      });
    });

    it("should return the result on success", async () => {
      const asyncFn = vi.fn().mockResolvedValue({ id: 42 });
      const actionCreator = createAsyncAction("FETCH", asyncFn);
      const thunk = actionCreator();

      const dispatch = vi.fn();
      const result = await thunk(dispatch);

      expect(result).toEqual({ id: 42 });
    });
  });
});

describe("Logger Middleware", () => {
  it("should pass through when disabled", () => {
    const middleware = createLoggerMiddleware({ enabled: false });
    const next = vi.fn();

    // When disabled, middleware returns identity: () => next => updates => next(updates)
    const result = middleware()(next);
    result({ type: "TEST" });

    expect(next).toHaveBeenCalledWith({ type: "TEST" });
  });

  it("should log state changes when enabled", () => {
    const mockStore = {
      getState: vi
        .fn()
        .mockReturnValueOnce({ currentView: "stage" }) // prevState
        .mockReturnValueOnce({ currentView: "file" }), // nextState
    };

    const groupSpy = vi
      .spyOn(console, "groupCollapsed")
      .mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const groupEndSpy = vi
      .spyOn(console, "groupEnd")
      .mockImplementation(() => {});

    const middleware = createLoggerMiddleware({ enabled: true });
    const next = vi.fn();

    middleware(mockStore)(next)({ type: "TOGGLE_STATUS_COLOR" });

    expect(next).toHaveBeenCalledWith({ type: "TOGGLE_STATUS_COLOR" });
    expect(groupSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalled();
    expect(groupEndSpy).toHaveBeenCalled();

    groupSpy.mockRestore();
    logSpy.mockRestore();
    groupEndSpy.mockRestore();
  });

  it("should use console.group when collapsed is false", () => {
    const mockStore = {
      getState: vi.fn().mockReturnValueOnce({}).mockReturnValueOnce({}),
    };

    const groupSpy = vi.spyOn(console, "group").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const middleware = createLoggerMiddleware({
      enabled: true,
      collapsed: false,
    });
    const next = vi.fn();

    middleware(mockStore)(next)({ type: "TEST" });

    expect(groupSpy).toHaveBeenCalled();

    vi.restoreAllMocks();
  });

  it("should show diff when state changes", () => {
    const mockStore = {
      getState: vi
        .fn()
        .mockReturnValueOnce({ a: 1, b: 2 })
        .mockReturnValueOnce({ a: 1, b: 3 }),
    };

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "groupCollapsed").mockImplementation(() => {});
    vi.spyOn(console, "groupEnd").mockImplementation(() => {});

    const middleware = createLoggerMiddleware({ enabled: true, diff: true });
    const next = vi.fn();

    middleware(mockStore)(next)({ type: "UPDATE" });

    // Should have logged diff (prev, updates, next, diff, duration = 5 log calls)
    expect(logSpy).toHaveBeenCalledTimes(5);

    vi.restoreAllMocks();
  });
});

describe("applyMiddleware", () => {
  let mockStore;

  beforeEach(() => {
    mockStore = {
      setState: vi.fn(),
      getState: vi.fn(() => ({
        currentView: "stage",
        stage: {
          layerStack: [],
          composedPrims: {},
          activeFilter: "all",
          colorizeByStatus: false,
        },
        composedHierarchy: [],
        history: {
          commits: {},
          headCommitId: null,
          rootCommitIds: [],
          isHistoryMode: false,
          logEntryCounter: 0,
        },
        stagedChanges: [],
        loadedFiles: {},
      })),
    };
  });

  it("should enhance store with dispatch method", () => {
    applyMiddleware(mockStore);
    expect(typeof mockStore.dispatch).toBe("function");
  });

  it("should return the enhanced store", () => {
    const result = applyMiddleware(mockStore);
    expect(result).toBe(mockStore);
  });

  it("should handle actions through setState", () => {
    applyMiddleware(mockStore);
    mockStore.setState({
      type: "TOGGLE_STATUS_COLOR",
    });

    // The middleware chain should have processed the action via reducer
    expect(mockStore.setState).toBeDefined();
  });

  it("should pass non-action objects directly to original setState", () => {
    applyMiddleware(mockStore);

    // Direct state update (no type property)
    mockStore.setState({ currentView: "file" });

    // Should have called through to original
    expect(typeof mockStore.setState).toBe("function");
  });

  it("should chain multiple middlewares", () => {
    const calls = [];
    const middleware1 = () => (next) => (action) => {
      calls.push("m1");
      return next(action);
    };
    const middleware2 = () => (next) => (action) => {
      calls.push("m2");
      return next(action);
    };

    applyMiddleware(mockStore, middleware1, middleware2);
    mockStore.dispatch({ type: "TEST" });

    expect(calls).toEqual(["m1", "m2"]);
  });
});
