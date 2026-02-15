# USDA Composer - Testing Guide

**Last Updated:** February 15, 2026

This guide covers testing philosophy, standards, and practical instructions for writing and running tests in USDA Composer.

---

## Table of Contents

1. [Testing Philosophy](#testing-philosophy)
2. [Testing Stack](#testing-stack)
3. [Test Structure](#test-structure)
4. [Running Tests](#running-tests)
5. [Writing Unit Tests](#writing-unit-tests)
6. [Writing Integration Tests](#writing-integration-tests)
7. [Writing E2E Tests](#writing-e2e-tests)
8. [Test Coverage](#test-coverage)
9. [Mocking Patterns](#mocking-patterns)
10. [Test Utilities](#test-utilities)
11. [Testing State Management](#testing-state-management)
12. [Testing Three.js Rendering](#testing-threejs-rendering)
13. [Debugging Test Failures](#debugging-test-failures)
14. [CI/CD Pipeline](#cicd-pipeline)
15. [Best Practices](#best-practices)

---

## Testing Philosophy

USDA Composer follows these testing principles:

### 1. Test Behavior, Not Implementation

**Good:**

```javascript
it("should update prim status when promoted", () => {
  const action = actions.updatePrim({
    primPath: "/Wall",
    properties: { status: "Shared" },
  });
  const newState = reducer(initialState, action);
  expect(newState.prims[0].status).toBe("Shared");
});
```

**Bad:**

```javascript
it("should call private _updateInternal method", () => {
  // Don't test private implementation details
});
```

### 2. Write Tests That Document Intent

Tests serve as living documentation. Test names should clearly describe:

- **What** is being tested
- **Under what conditions**
- **What the expected outcome is**

```javascript
describe('Layer Promotion', () => {
  it('should promote WIP layer to Shared when user has permission', () => { ... });
  it('should reject promotion when user lacks permission', () => { ... });
  it('should detect conflicts when promoting overlapping layers', () => { ... });
});
```

### 3. Test at the Right Level

- **Unit Tests**: Individual functions, pure logic
- **Integration Tests**: Component interactions, state + services
- **E2E Tests**: Full user workflows, critical paths

### 4. Maintain Fast Test Suite

- Unit tests should run in milliseconds
- Integration tests in seconds
- E2E tests in minutes
- Total suite should complete <2 minutes

---

## Testing Stack

### Test Frameworks

| Tool                     | Purpose                                | Documentation                                      |
| ------------------------ | -------------------------------------- | -------------------------------------------------- |
| **Vitest**               | Unit/integration testing (Vite-native) | [vitest.dev](https://vitest.dev)                   |
| **Playwright**           | End-to-end browser testing             | [playwright.dev](https://playwright.dev)           |
| **@testing-library/dom** | DOM testing utilities                  | [testing-library.com](https://testing-library.com) |
| **jsdom**                | DOM simulation for unit tests          | [github.com/jsdom](https://github.com/jsdom/jsdom) |

### Test Configuration

- **Vitest Config**: [vite.config.js](../../vite.config.js) (test section)
- **Playwright Config**: [playwright.config.js](../../playwright.config.js)
- **Test Setup**: [src/**tests**/setup.js](../../src/__tests__/setup.js)
- **Coverage Config**: [vite.config.js](../../vite.config.js) (coverage section)

---

## Test Structure

### Directory Organization

```
src/__tests__/
├── setup.js                    # Global test setup (mocks, utilities)
│
├── unit/                       # Unit tests (test individual modules)
│   ├── components/
│   │   ├── outlinerController.test.js
│   │   ├── promotionController.test.js
│   │   ├── timelineController.test.js
│   │   ├── properties/
│   │   │   ├── AttributeUpdater.test.js
│   │   │   └── PropertyEditor.test.js
│   │   └── staging/
│   │       └── primStaging.test.js
│   │
│   ├── core/
│   │   ├── state/
│   │   │   ├── store.test.js
│   │   │   ├── reducer.test.js
│   │   │   ├── actions.test.js
│   │   │   └── middleware.test.js
│   │   ├── services/
│   │   │   ├── LayerService.test.js
│   │   │   └── PrimService.test.js
│   │   └── errors/
│   │       ├── ErrorHandler.test.js
│   │       └── errors.test.js
│   │
│   ├── viewer/
│   │   ├── ThreeScene.test.js
│   │   ├── selectionController.test.js
│   │   ├── rendering/
│   │   │   └── stageViewRenderer.test.js
│   │   └── usda/
│   │       ├── usdaEditor.test.js
│   │       └── parser/
│   │           └── hierarchyParser.test.js
│   │
│   └── utils/
│       ├── conflictDetector.test.js
│       ├── statusUtils.test.js
│       ├── primHelpers.test.js
│       ├── validators.test.js
│       └── domHelpers.test.js
│
├── integration/                # Integration tests (test component interaction)
│   ├── store-reducer.test.js
│   ├── state-component.test.js
│   ├── prim-operations.test.js
│   └── error-handling.test.js
│
└── e2e/                        # End-to-end tests (Playwright)
    ├── file-loading.spec.js
    ├── layer-promotion.spec.js
    ├── staging-workflow.spec.js
    └── timeline-navigation.spec.js
```

### Naming Conventions

- **Test files**: `{module}.test.js` (unit/integration) or `{feature}.spec.js` (E2E)
- **Test suites**: `describe('Module or Feature Name', () => { ... })`
- **Test cases**: `it('should do something under conditions', () => { ... })`

---

## Running Tests

### NPM Scripts

```bash
# Run all tests (watch mode)
npm test

# Run tests once (CI mode)
npm test -- --run

# Run tests with UI
npm run test:ui

# Run only unit tests
npm test -- src/__tests__/unit

# Run only integration tests
npm test -- src/__tests__/integration

# Run E2E tests (Playwright)
npm run test:e2e

# Run E2E tests in headed mode (see browser)
npm run test:e2e -- --headed

# Run E2E tests in debug mode
npm run test:e2e -- --debug

# Generate coverage report
npm run test:coverage

# Run specific test file
npm test -- hierarchyParser.test.js

# Run tests matching pattern
npm test -- --grep="promotion"

# Run tests in watch mode
npm test -- --watch
```

### Watch Mode

Vitest runs in **watch mode** by default during development:

- Tests re-run automatically when files change
- Only affected tests re-run (smart test selection)
- Press `a` to run all tests
- Press `f` to run only failed tests
- Press `q` to quit

### Coverage Report

```bash
npm run test:coverage
```

- Opens HTML report: `coverage/index.html`
- Shows line, branch, function, and statement coverage
- Minimum threshold: **40% coverage** (enforced)

---

## Writing Unit Tests

### Basic Structure

```javascript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { functionToTest } from '../../src/module.js';

describe('Module Name', () => {
  beforeEach(() => {
    // Setup before each test
  });

  afterEach(() => {
    // Cleanup after each test
    vi.clearAllMocks();
  });

  describe('functionToTest', () => {
    it('should do expected behavior', () => {
      // Arrange
      const input = { ... };

      // Act
      const result = functionToTest(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });

    it('should throw error for invalid input', () => {
      expect(() => functionToTest(null)).toThrow(ValidationError);
    });
  });
});
```

### Example: Testing a Utility Function

**File**: [src/**tests**/unit/utils/validators.test.js](../../src/__tests__/unit/utils/validators.test.js)

```javascript
import { describe, it, expect } from "vitest";
import {
  validatePrimName,
  validateLayerStatus,
} from "../../utils/validators.js";
import { LAYER_STATUS } from "../../constants.js";

describe("validators", () => {
  describe("validatePrimName", () => {
    it("should accept valid prim names", () => {
      expect(validatePrimName("Wall")).toBe(true);
      expect(validatePrimName("Building_1")).toBe(true);
      expect(validatePrimName("floor2")).toBe(true);
    });

    it("should reject names with spaces", () => {
      expect(validatePrimName("My Wall")).toBe(false);
    });

    it("should reject names with special characters", () => {
      expect(validatePrimName("Wall@123")).toBe(false);
      expect(validatePrimName("Wall-1")).toBe(false);
    });

    it("should reject empty names", () => {
      expect(validatePrimName("")).toBe(false);
      expect(validatePrimName(null)).toBe(false);
    });
  });

  describe("validateLayerStatus", () => {
    it("should accept valid statuses", () => {
      expect(validateLayerStatus(LAYER_STATUS.WIP)).toBe(true);
      expect(validateLayerStatus(LAYER_STATUS.PUBLISHED)).toBe(true);
    });

    it("should reject invalid statuses", () => {
      expect(validateLayerStatus("Invalid")).toBe(false);
      expect(validateLayerStatus(null)).toBe(false);
    });
  });
});
```

### Example: Testing a Service

**File**: [src/**tests**/unit/services/PrimService.test.js](../../src/__tests__/unit/services/PrimService.test.js)

```javascript
import { describe, it, expect, beforeEach } from "vitest";
import { primService } from "../../src/core/services/PrimService.js";

describe("PrimService", () => {
  let testHierarchy;

  beforeEach(() => {
    testHierarchy = [
      {
        name: "Building",
        path: "/Building",
        type: "Xform",
        children: [
          { name: "Wall", path: "/Building/Wall", type: "Mesh", children: [] },
        ],
      },
    ];
  });

  describe("findPrimByPath", () => {
    it("should find prim at root level", () => {
      const prim = primService.findPrimByPath(testHierarchy, "/Building");
      expect(prim).toBeDefined();
      expect(prim.name).toBe("Building");
    });

    it("should find nested prim", () => {
      const prim = primService.findPrimByPath(testHierarchy, "/Building/Wall");
      expect(prim).toBeDefined();
      expect(prim.name).toBe("Wall");
      expect(prim.type).toBe("Mesh");
    });

    it("should return null for non-existent path", () => {
      const prim = primService.findPrimByPath(testHierarchy, "/NotFound");
      expect(prim).toBeNull();
    });
  });

  describe("updatePrimProperties", () => {
    it("should update prim properties", () => {
      const updated = primService.updatePrimProperties(
        testHierarchy,
        "/Building/Wall",
        { status: "Shared", displayColor: "#0000ff" }
      );

      const prim = primService.findPrimByPath(updated, "/Building/Wall");
      expect(prim.properties.status).toBe("Shared");
      expect(prim.properties.displayColor).toBe("#0000ff");
    });

    it("should not mutate original hierarchy", () => {
      const original = JSON.parse(JSON.stringify(testHierarchy));
      primService.updatePrimProperties(testHierarchy, "/Building/Wall", {
        status: "Shared",
      });

      expect(testHierarchy).toEqual(original);
    });
  });
});
```

---

## Writing Integration Tests

Integration tests verify interactions between modules.

### Example: Testing Store + Reducer

**File**: [src/**tests**/integration/store-reducer.test.js](../../src/__tests__/integration/store-reducer.test.js)

```javascript
import { describe, it, expect, beforeEach, vi } from "vitest";
import { store } from "../../src/core/state/store.js";
import { actions } from "../../src/core/state/actions/index.js";

describe("Store + Reducer Integration", () => {
  beforeEach(() => {
    // Reset store to initial state
    store.dispatch({ type: "RESET" });
  });

  it("should update state when action is dispatched", () => {
    const layer = {
      name: "test.usda",
      content: "#usda 1.0",
      status: "WIP",
      visible: true,
      active: true,
    };

    store.dispatch(actions.addLayer(layer));

    const state = store.getState();
    expect(state.stage.layerStack).toHaveLength(1);
    expect(state.stage.layerStack[0].name).toBe("test.usda");
  });

  it("should notify subscribers when state changes", () => {
    const callback = vi.fn();
    store.subscribe(["stage.layerStack"], callback);

    store.dispatch(
      actions.addLayer({ name: "test.usda", content: "", status: "WIP" })
    );

    expect(callback).toHaveBeenCalled();
    expect(callback.mock.calls[0][0].stage.layerStack).toHaveLength(1);
  });

  it("should handle multiple actions in sequence", () => {
    store.dispatch(
      actions.addLayer({ name: "layer1.usda", content: "", status: "WIP" })
    );
    store.dispatch(
      actions.addLayer({ name: "layer2.usda", content: "", status: "Shared" })
    );
    store.dispatch(actions.removeLayer("layer1.usda"));

    const state = store.getState();
    expect(state.stage.layerStack).toHaveLength(1);
    expect(state.stage.layerStack[0].name).toBe("layer2.usda");
  });
});
```

---

## Writing E2E Tests

E2E tests use Playwright to test full user workflows in a real browser.

### Example: File Loading Workflow

**File**: [src/**tests**/e2e/file-loading.spec.js](../../src/__tests__/e2e/file-loading.spec.js)

```javascript
import { test, expect } from "@playwright/test";

test.describe("File Loading", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("http://localhost:5173");
  });

  test("should load USDA file and display in layer stack", async ({ page }) => {
    // Upload file
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles("./test-data/sample.usda");

    // Verify layer appears in stack
    const layerItem = page.locator(".layer-item").first();
    await expect(layerItem).toBeVisible();
    await expect(layerItem).toContainText("sample.usda");

    // Verify status indicator
    const statusBadge = layerItem.locator(".status-badge");
    await expect(statusBadge).toHaveText("WIP");
  });

  test("should render geometry in 3D viewport", async ({ page }) => {
    await page
      .locator('input[type="file"]')
      .setInputFiles("./test-data/cube.usda");

    // Wait for rendering
    await page.waitForTimeout(1000);

    // Check canvas is present and rendered
    const canvas = page.locator("#stageCanvas");
    await expect(canvas).toBeVisible();

    // Verify outliner shows prim
    const outlinerItem = page.locator(".outliner-item").first();
    await expect(outlinerItem).toContainText("Cube");
  });

  test("should handle multiple file uploads", async ({ page }) => {
    const fileInput = page.locator('input[type="file"]');

    await fileInput.setInputFiles("./test-data/base.usda");
    await fileInput.setInputFiles("./test-data/override.usda");

    const layerItems = page.locator(".layer-item");
    await expect(layerItems).toHaveCount(2);
  });
});
```

### Example: Layer Promotion Workflow

```javascript
test("should promote layer from WIP to Shared", async ({ page }) => {
  await page.goto("http://localhost:5173");

  // Load file
  await page
    .locator('input[type="file"]')
    .setInputFiles("./test-data/sample.usda");

  // Select layer
  const layerItem = page.locator(".layer-item").first();
  await layerItem.click();

  // Click promote button
  const promoteBtn = page.locator("#promoteLayerBtn");
  await promoteBtn.click();

  // Confirm in modal
  const confirmBtn = page.locator("#confirmPromoteBtn");
  await confirmBtn.click();

  // Verify status updated
  const statusBadge = layerItem.locator(".status-badge");
  await expect(statusBadge).toHaveText("Shared");
  await expect(statusBadge).toHaveClass(/status-shared/);
});
```

---

## Test Coverage

### Current Coverage

- **Minimum Threshold**: 40% (enforced in CI)
- **Target**: 70%+ for new features
- **Critical Modules**: 80%+ (state, services, parser)

### Viewing Coverage

```bash
npm run test:coverage
open coverage/index.html
```

### Coverage Reports Include

- **Line Coverage**: Percentage of lines executed
- **Branch Coverage**: Percentage of conditional branches tested
- **Function Coverage**: Percentage of functions called
- **Statement Coverage**: Percentage of statements executed

### Improving Coverage

**Identify uncovered code:**

```bash
# Run with coverage
npm run test:coverage

# Look for red/yellow lines in coverage/index.html
# Write tests for uncovered branches
```

**Focus on:**

- Error handling paths (`catch` blocks)
- Edge cases (empty arrays, null values)
- Conditional branches (`if`/`else`)
- Validation logic

---

## Mocking Patterns

### Global Mocks (setup.js)

**File**: [src/**tests**/setup.js](../../src/__tests__/setup.js)

Pre-configured mocks for:

- `ResizeObserver` and `IntersectionObserver` (browser APIs)
- `HTMLCanvasElement.getContext` (WebGL context for Three.js)
- Canvas 2D context

### Mocking Functions with `vi.fn()`

```javascript
import { vi } from "vitest";

const mockCallback = vi.fn();

// Call the mock
mockCallback("arg1", "arg2");

// Assertions
expect(mockCallback).toHaveBeenCalled();
expect(mockCallback).toHaveBeenCalledWith("arg1", "arg2");
expect(mockCallback).toHaveBeenCalledTimes(1);
```

### Mocking Modules with `vi.mock()`

```javascript
import { vi, describe, it, expect } from "vitest";

vi.mock("../../src/viewer/usda/usdaParser.js", () => ({
  USDA_PARSER: {
    parseUsda: vi.fn(() => [
      { name: "MockPrim", path: "/MockPrim", type: "Mesh" },
    ]),
  },
}));

import { ThreeScene } from "../../src/viewer/ThreeScene.js";

it("should use mocked parser", () => {
  const scene = new ThreeScene(container, USDA_PARSER, "stage");
  // Parser will return mocked data
});
```

### Mocking Timers

```javascript
import { vi } from "vitest";

vi.useFakeTimers();

function delayedFunction() {
  setTimeout(() => {
    console.log("Executed after 1000ms");
  }, 1000);
}

it("should execute after timeout", () => {
  delayedFunction();

  vi.advanceTimersByTime(1000);

  // Assertions here
});

vi.useRealTimers();
```

---

## Test Utilities

### Custom Matchers

```javascript
// Extend expect with custom matchers
expect.extend({
  toBeValidPrimPath(received) {
    const pass = /^\/[A-Za-z0-9_/]+$/.test(received);
    return {
      pass,
      message: () => `Expected ${received} to be a valid prim path`,
    };
  },
});

// Usage
expect("/Building/Wall").toBeValidPrimPath();
```

### Test Helpers

Create reusable test utilities:

**File**: `src/__tests__/helpers/testData.js`

```javascript
export function createMockLayer(overrides = {}) {
  return {
    name: "test.usda",
    content: "#usda 1.0",
    status: "WIP",
    visible: true,
    active: true,
    ...overrides,
  };
}

export function createMockPrim(overrides = {}) {
  return {
    name: "Prim",
    path: "/Prim",
    type: "Mesh",
    properties: {},
    children: [],
    ...overrides,
  };
}
```

**Usage in tests:**

```javascript
import { createMockLayer, createMockPrim } from "../helpers/testData.js";

it("should add layer", () => {
  const layer = createMockLayer({ name: "custom.usda", status: "Shared" });
  store.dispatch(actions.addLayer(layer));
  // ...
});
```

---

## Testing State Management

### Testing Actions

```javascript
import { actions, ActionTypes } from "../../src/core/state/actions/index.js";

describe("Action Creators", () => {
  it("should create ADD_LAYER action", () => {
    const layer = { name: "test.usda", content: "", status: "WIP" };
    const action = actions.addLayer(layer);

    expect(action).toEqual({
      type: ActionTypes.ADD_LAYER,
      payload: layer,
    });
  });
});
```

### Testing Reducer

```javascript
import { reducer } from "../../src/core/state/reducer.js";
import { actions } from "../../src/core/state/actions/index.js";

describe("Reducer", () => {
  it("should handle ADD_LAYER", () => {
    const initialState = { stage: { layerStack: [] } };
    const layer = { name: "test.usda", content: "", status: "WIP" };

    const newState = reducer(initialState, actions.addLayer(layer));

    expect(newState.stage.layerStack).toHaveLength(1);
    expect(newState.stage.layerStack[0]).toEqual(layer);
  });

  it("should not mutate original state", () => {
    const initialState = { stage: { layerStack: [] } };
    const frozenState = Object.freeze(initialState);

    expect(() => {
      reducer(
        frozenState,
        actions.addLayer({ name: "test.usda", content: "", status: "WIP" })
      );
    }).not.toThrow();
  });
});
```

### Testing Subscriptions

```javascript
import { store } from "../../src/core/state/store.js";
import { actions } from "../../src/core/state/actions/index.js";

it("should notify subscribers of state changes", () => {
  const callback = vi.fn();
  store.subscribe(["sceneName"], callback);

  store.dispatch(actions.setSceneName("New Scene"));

  expect(callback).toHaveBeenCalled();
  expect(callback.mock.calls[0][0].sceneName).toBe("New Scene");
});
```

---

## Testing Three.js Rendering

### Challenges

- Three.js requires WebGL context
- Tests run in Node.js (no real GPU)
- Need to mock WebGL API

### Solution: Mock WebGL Context

Our [setup.js](../../src/__tests__/setup.js) provides comprehensive WebGL mocks.

### Example: Testing ThreeScene

```javascript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { ThreeScene } from "../../src/viewer/ThreeScene.js";

describe("ThreeScene", () => {
  let container;
  let threeScene;

  beforeEach(() => {
    container = document.createElement("div");
    container.style.width = "800px";
    container.style.height = "600px";
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (threeScene) threeScene.dispose();
    document.body.removeChild(container);
  });

  it("should initialize with container", () => {
    threeScene = new ThreeScene(container, {}, "stage");

    expect(threeScene.container).toBe(container);
    expect(threeScene.viewType).toBe("stage");
  });

  it("should create scene, camera, and renderer", () => {
    threeScene = new ThreeScene(container, {}, "stage");

    expect(threeScene.scene).toBeDefined();
    expect(threeScene.camera).toBeDefined();
    expect(threeScene.renderer).toBeDefined();
  });

  it("should handle resize", () => {
    threeScene = new ThreeScene(container, {}, "stage");

    container.style.width = "1024px";
    container.style.height = "768px";

    threeScene.onResize();

    expect(threeScene.camera.aspect).toBeCloseTo(1024 / 768);
  });
});
```

---

## Debugging Test Failures

### 1. Read the Error Message

```
FAIL  src/__tests__/unit/utils/validators.test.js
  ● validators › validatePrimName › should accept valid prim names

    expect(received).toBe(expected)

    Expected: true
    Received: false

      12 |     it('should accept valid prim names', () => {
      13 |       expect(validatePrimName('Wall')).toBe(true);
    > 14 |       expect(validatePrimName('Building_1')).toBe(true);
         |                                               ^
      15 |     });
```

**Diagnosis**: `validatePrimName('Building_1')` returned `false` instead of `true`.

### 2. Use `console.log` for Debugging

```javascript
it("should validate prim names", () => {
  const result = validatePrimName("Building_1");
  console.log("Result:", result); // Debug output
  expect(result).toBe(true);
});
```

Run with `npm test -- --reporter=verbose` to see console output.

### 3. Use Vitest UI

```bash
npm run test:ui
```

- Interactive test explorer
- See failing tests highlighted
- View error details
- Re-run individual tests

### 4. Use `it.only` to Isolate

```javascript
it.only("should validate this specific case", () => {
  // Only this test runs
});
```

### 5. Check Test Setup

- Ensure mocks are configured correctly in [setup.js](../../src/__tests__/setup.js)
- Verify global state is reset between tests (`beforeEach`, `afterEach`)

---

## CI/CD Pipeline

### GitHub Actions Configuration

Tests run automatically on:

- **Pull Requests**: All tests must pass before merging
- **Push to main**: Ensures main branch stability
- **Scheduled**: Nightly test runs

### Pre-commit Hooks

Husky runs pre-commit checks:

1. **Lint**: `npm run lint`
2. **Type Check**: `npm run type-check`
3. **Tests**: `npm test -- --run`

**Skip hooks** (not recommended):

```bash
git commit --no-verify
```

### Coverage Requirements

- **Minimum**: 40% overall coverage
- **CI Failure**: If coverage drops below threshold
- **View in CI**: Coverage report uploaded as artifact

---

## Best Practices

### 1. Test One Thing Per Test

```javascript
// ✅ Good
it('should add layer to stack', () => { ... });
it('should set layer status to WIP', () => { ... });

// ❌ Bad
it('should add layer and set status and update view', () => {
  // Too many concerns
});
```

### 2. Use Descriptive Test Names

```javascript
// ✅ Good
it('should reject promotion when user lacks permission', () => { ... });

// ❌ Bad
it('should not promote', () => { ... });
it('test promotion', () => { ... });
```

### 3. Arrange-Act-Assert Pattern

```javascript
it("should update prim status", () => {
  // Arrange
  const prim = { path: "/Wall", properties: { status: "WIP" } };

  // Act
  const updated = updatePrimStatus(prim, "Shared");

  // Assert
  expect(updated.properties.status).toBe("Shared");
});
```

### 4. Don't Test Implementation Details

```javascript
// ❌ Bad - Testing private internals
it("should call _internalHelper", () => {
  const spy = vi.spyOn(service, "_internalHelper");
  service.publicMethod();
  expect(spy).toHaveBeenCalled();
});

// ✅ Good - Testing observable behavior
it("should return processed result", () => {
  const result = service.publicMethod(input);
  expect(result).toEqual(expectedOutput);
});
```

### 5. Keep Tests Independent

```javascript
// ❌ Bad - Tests depend on execution order
let sharedState;
it('test 1', () => { sharedState = ...; });
it('test 2', () => { expect(sharedState)...; }); // Depends on test 1

// ✅ Good - Each test is independent
beforeEach(() => {
  sharedState = createFreshState();
});
```

### 6. Mock External Dependencies

```javascript
// ✅ Good - Mock external service
vi.mock("../../src/external/api.js", () => ({
  fetchData: vi.fn(() => Promise.resolve(mockData)),
}));

it("should handle API response", async () => {
  const result = await processData();
  expect(result).toEqual(expected);
});
```

### 7. Test Error Conditions

```javascript
it("should throw ValidationError for invalid input", () => {
  expect(() => validatePrimName("")).toThrow(ValidationError);
  expect(() => validatePrimName(null)).toThrow(ValidationError);
});

it("should handle file not found", async () => {
  await expect(loadFile("nonexistent.usda")).rejects.toThrow(FileError);
});
```

---

## Next Steps

- **Read the codebase**: Explore existing tests to understand patterns
- **Write tests for new features**: Add tests as you develop
- **Improve coverage**: Pick an uncovered module and add tests
- **Review [DEVELOPER_ONBOARDING.md](./DEVELOPER_ONBOARDING.md)**: Understand the codebase architecture
- **Explore [Vitest docs](https://vitest.dev)**: Learn advanced testing techniques

---

**Happy Testing!** ✅
