# USDA Composer - Developer Onboarding Guide

**Last Updated:** February 15, 2026

Welcome to the USDA Composer development team! This guide will help you understand the codebase, architecture, and development workflows so you can start contributing quickly and confidently.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Getting Started](#getting-started)
3. [Codebase Overview](#codebase-overview)
4. [Key Concepts](#key-concepts)
5. [Architecture at a Glance](#architecture-at-a-glance)
6. [Important Files to Understand First](#important-files-to-understand-first)
7. [State Management](#state-management)
8. [How to Add a New Feature](#how-to-add-a-new-feature)
9. [Common Patterns and Conventions](#common-patterns-and-conventions)
10. [Where to Find Things](#where-to-find-things)
11. [Testing Your Changes](#testing-your-changes)
12. [Making Your First Contribution](#making-your-first-contribution)
13. [Reading List](#reading-list)
14. [Getting Help](#getting-help)

---

## Prerequisites

Before diving into development, ensure you have:

- **Node.js**: Version 20+ (check with `node --version`)
- **npm**: Version 9+ (check with `npm --version`)
- **Git**: For version control
- **Code Editor**: VS Code recommended (with ESLint and Prettier extensions)
- **Basic Knowledge**:
  - JavaScript (ES6+ modules, async/await, classes)
  - Three.js basics (scenes, cameras, meshes) - helpful but not required
  - USD/USDA concepts - helpful but will be explained

### Optional Knowledge

- TypeScript (gradual migration in progress)
- WebGL fundamentals
- ISO 19650 standard (for layer workflow understanding)

---

## Getting Started

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd USDA-Composer

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will open at `http://localhost:5173` (Vite default port).

### 2. Verify Setup

- Load a sample `.usda` file
- Click around the interface
- Open browser DevTools (F12) - check for errors
- Run tests: `npm test`

### 3. Familiarize with Development Tools

- **Vite Dev Server**: Hot module replacement (HMR) for instant updates
- **ESLint**: Code linting (runs on pre-commit hook via Husky)
- **Prettier**: Code formatting (auto-format on save in VS Code)
- **Vitest**: Unit testing framework
- **Playwright**: End-to-end testing

---

## Codebase Overview

### Project Structure

```
USDA-Composer/
├── index.html                 # Main HTML entry point
├── package.json               # npm dependencies and scripts
├── vite.config.js            # Vite bundler configuration
├── playwright.config.js      # E2E test configuration
├── eslint.config.js          # Linting rules
│
├── css/                       # Modular stylesheets (17 files)
│   ├── base.css, layout.css, sidebar.css
│   ├── modal.css, properties.css, timeline.css
│   └── ...
│
├── src/                       # Application source code
│   ├── main.js                # Application entry point ⭐
│   ├── state.js               # Initial state definition
│   ├── constants.js           # Application-wide constants ⭐
│   │
│   ├── core/                  # Core infrastructure ⭐
│   │   ├── index.js           # Central exports
│   │   ├── state/             # State management (Redux-style)
│   │   ├── services/          # Business logic layer
│   │   └── errors/            # Error handling
│   │
│   ├── components/            # UI controllers (40 files)
│   │   ├── outlinerController.js
│   │   ├── promotionController.js
│   │   ├── timelineController.js
│   │   ├── properties/        # Property editing components
│   │   ├── sidebar/           # Sidebar panel controllers
│   │   └── staging/           # Staging area logic
│   │
│   ├── viewer/                # 3D rendering and USD processing
│   │   ├── ThreeScene.js      # Three.js wrapper ⭐
│   │   ├── rendering/         # Renderers (file, stage, history)
│   │   └── usda/              # USDA parsing and composition ⭐
│   │
│   ├── utils/                 # Utility functions
│   │   ├── conflictDetector.js
│   │   ├── validators.js
│   │   └── primHelpers.js
│   │
│   └── __tests__/             # Test suite
│       ├── unit/              # Unit tests
│       ├── integration/       # Integration tests
│       └── e2e/               # End-to-end tests (Playwright)
│
├── docs/                      # Documentation (you're reading this!)
│   ├── guides/
│   ├── api/
│   ├── architecture/
│   └── tutorials/
│
├── README.md                  # Project overview
├── ARCHITECTURE.md            # Detailed architecture documentation
├── CONTRIBUTING.md            # Contribution guidelines
└── SETUP.md                   # Development environment setup
```

⭐ = Essential files to understand first

---

## Key Concepts

### 1. Prims (Primitives)

**Prims** are the fundamental building blocks in USD:

- **Definition**: Scene objects (meshes, transforms, groups)
- **Hierarchy**: Prims form a tree structure (parent/child relationships)
- **Path**: Each prim has a unique path, e.g., `/World/Building/Wall`
- **Type**: Xform (transform), Mesh (geometry), Scope (grouping), etc.
- **Properties**: Color, opacity, status, display name, custom attributes

**Example prim object in code:**

```javascript
{
  specifier: "def",           // "def" (definition) or "over" (override)
  name: "Wall",               // Local name
  path: "/Building/Wall",     // Full USD path
  type: "Mesh",               // Prim type
  properties: {
    displayColor: THREE.Color,
    status: "Published",
    displayName: "North Wall"
  },
  children: [],               // Child prims
  _sourceFile: "building.usda" // Metadata: origin layer
}
```

### 2. Layers

**Layers** are individual `.usda` files that compose together:

- **Composition**: Layers stack bottom-to-top
- **Override Semantics**: Upper layers override properties in lower layers
- **Status**: Each layer has a maturity status (WIP, Shared, Published, Archived)
- **Non-Destructive**: Base layers remain unchanged; overrides are in separate layers

### 3. Composition

**Composition** merges multiple layers into a single scene:

- Algorithm in [src/viewer/usda/usdaMerger.js](../../src/viewer/usda/usdaMerger.js)
- Implements USD composition rules
- Property precedence: stronger (upper) layers win

### 4. Staging

**Staging** is a non-destructive workspace (inspired by Git):

- Changes accumulate in staging area before committing
- Collision detection prevents path conflicts
- Placeholder vs. Real Element rules
- Implementation in [src/components/staging/primStaging.js](../../src/components/staging/primStaging.js)

### 5. History and Statement Log

**statement.usda** is an immutable audit trail:

- Records every commit with metadata (timestamp, user, message)
- Enables timeline reconstruction
- Path translation registry handles renamed prims
- Parser in [src/viewer/usda/parser/logParser.js](../../src/viewer/usda/parser/logParser.js)

---

## Architecture at a Glance

USDA Composer follows a **layered architecture**:

```
┌─────────────────────────────────────────┐
│         UI Layer (Controllers)          │  ← components/
│  outlinerController, promotionController│
└─────────────┬───────────────────────────┘
              │ Dispatches Actions
              ▼
┌─────────────────────────────────────────┐
│      State Management (Redux-style)     │  ← core/state/
│     Store → Reducer → Listeners         │
└─────────────┬───────────────────────────┘
              │ State Changes
              ▼
┌─────────────────────────────────────────┐
│        Service Layer (Business Logic)   │  ← core/services/
│     LayerService, PrimService           │
└─────────────┬───────────────────────────┘
              │ Data Processing
              ▼
┌─────────────────────────────────────────┐
│    Viewer Layer (3D Rendering + Parsing)│  ← viewer/
│  ThreeScene, Renderers, USDA Parser     │
└─────────────────────────────────────────┘
```

### Design Patterns Used

- **Observer Pattern**: State subscriptions with pub/sub
- **Controller Pattern**: Each UI section has a controller
- **Service Layer**: Business logic abstraction
- **Strategy Pattern**: Different renderers for different views
- **Parser/Composer Pattern**: Separate parsing and generation

---

## Important Files to Understand First

### 1. [src/main.js](../../src/main.js) - Application Entry Point

**Purpose**: Initializes the entire application

**What it does:**

- Applies middleware to the Redux store
- Creates three Three.js scenes (file view, stage view, history view)
- Initializes all UI controllers
- Sets up event listeners

**Key initialization order:**

```javascript
1. Apply middleware (logger, async)
2. Create ThreeScene instances
3. Initialize controllers (sidebar, modal, outliner, timeline, etc.)
4. Update initial view
```

**Start reading here** to understand the application boot sequence.

---

### 2. [src/constants.js](../../src/constants.js) - Application Constants

**Purpose**: Centralized constants used throughout the app

**Contents:**

- `USER_ROLES`: Architect, Structural Engineer, Project Manager, Field Person
- `LAYER_STATUS`: WIP, Shared, Published, Archived
- `PRIM_TYPES`: Xform, Cube, Sphere, Mesh
- `VIEW_MODES`: file, stage, history
- `PROPERTY_TYPES`: string, token, int, float, bool, double

**Always import constants** instead of hardcoding strings:

```javascript
// ✅ Good
import { LAYER_STATUS } from './constants.js';
if (layer.status === LAYER_STATUS.WIP) { ... }

// ❌ Bad
if (layer.status === "WIP") { ... }
```

---

### 3. [src/core/state/store.js](../../src/core/state/store.js) - State Management

**Purpose**: Redux-style centralized state store

**API:**

- `store.getState()`: Get current state
- `store.dispatch(action)`: Dispatch an action to update state
- `store.subscribe(keys, callback)`: Subscribe to specific state changes

**State shape (simplified):**

```javascript
{
  sceneName: "My Project",
  currentUser: "Architect",
  loadedFiles: Map<filename, content>,
  stage: {
    layerStack: [ ...layers ],
    composedPrims: [ ...prims ],
    colorizeByStatus: true
  },
  history: {
    commits: Map<id, commit>,
    roots: [ ...rootIds ]
  },
  headCommitId: "commit-123",
  historyMode: false
}
```

---

### 4. [src/core/state/actions/index.js](../../src/core/state/actions/index.js) - Action Creators

**Purpose**: Functions that create actions for state updates

**Usage pattern:**

```javascript
import { actions } from "../core/index.js";

// Dispatch an action
store.dispatch(actions.addLayer({ name, content, status }));
store.dispatch(actions.updatePrim({ primPath, properties }));
```

**Common actions:**

- Scene: `setSceneName`, `setCurrentUser`
- Layers: `addLayer`, `removeLayer`, `reorderLayers`, `toggleLayerVisibility`
- Prims: `addPrim`, `updatePrim`, `removePrim`, `setComposedHierarchy`
- History: `addCommit`, `setHeadCommit`, `toggleHistoryMode`

---

### 5. [src/viewer/ThreeScene.js](../../src/viewer/ThreeScene.js) - 3D Viewer Wrapper

**Purpose**: Manages Three.js scene, camera, renderer, and selection

**Key responsibilities:**

- Creates and configures Three.js scene
- Handles camera orbit controls
- Manages rendering loop
- Delegates to specific renderers (file, stage, history)
- Handles mesh selection via raycasting

**Constructor:**

```javascript
const threeScene = new ThreeScene(
  containerElement, // DOM element for canvas
  parser, // USDA parser instance
  viewType // "file", "stage", or "history"
);
threeScene.animate(); // Start rendering loop
```

---

### 6. [src/viewer/usda/usdaParser.js](../../src/viewer/usda/usdaParser.js) - USDA Parser

**Purpose**: Parses USDA text into JavaScript prim hierarchies

**Main function:**

```javascript
import { USDA_PARSER } from "./viewer/usda/usdaParser.js";

const prims = USDA_PARSER.parseUsda(usdaContent);
// Returns: array of prim objects with hierarchy
```

**How it works:**

- Regex-based parsing of `def` and `over` keywords
- Brace counting to identify prim boundaries
- Property extraction (colors, status, custom attributes)
- Recursive hierarchy building

---

### 7. [src/viewer/usda/usdaComposer.js](../../src/viewer/usda/usdaComposer.js) - USDA Generator

**Purpose**: Generates USDA text from prim hierarchies

**Main functions:**

```javascript
import {
  composePrimsFromHierarchy,
  composeHierarchyToUsda,
} from "./viewer/usda/usdaComposer.js";

// Generate USDA syntax for prims
const usdaText = composePrimsFromHierarchy(prims);

// Generate full USDA file with header
const fullFile = composeHierarchyToUsda(prims, filename);
```

---

### 8. [src/components/staging/primStaging.js](../../src/components/staging/primStaging.js) - Staging Logic

**Purpose**: Manages the staging area with collision detection

**Key functions:**

- `stagePrims()`: Add prims to staging area
- `commitChanges()`: Write staged prims to layer and log to statement.usda
- Collision handling: Real Elements > Placeholders
- Auto-renaming on path conflicts

---

## State Management

### Redux-Style Architecture

USDA Composer uses a custom Redux-style store (no external dependency):

```
Action → Reducer → New State → Notify Listeners → UI Updates
```

### How to Update State

**1. Import actions and store:**

```javascript
import { store, actions } from "./core/index.js";
```

**2. Dispatch an action:**

```javascript
// Update scene name
store.dispatch(actions.setSceneName("New Project"));

// Add a layer
store.dispatch(
  actions.addLayer({
    name: "structural.usda",
    content: usdaContent,
    status: "WIP",
    visible: true,
    active: true,
  })
);

// Update prim properties
store.dispatch(
  actions.updatePrim({
    primPath: "/World/Building",
    properties: { status: "Shared", displayColor: new THREE.Color(0x0000ff) },
  })
);
```

### How to Subscribe to State Changes

**Subscribe to specific keys:**

```javascript
store.subscribe(["stage.layerStack"], (state) => {
  const layers = state.stage.layerStack;
  console.log("Layer stack updated:", layers);
  // Update UI accordingly
});
```

**Subscription keys** use dot notation:

- `'sceneName'`: Top-level key
- `'stage.layerStack'`: Nested key
- `['stage.layerStack', 'currentUser']`: Multiple keys

### Middleware

Middleware intercepts actions before they reach the reducer:

- **Logger Middleware**: Logs actions and state changes (dev only)
- **Async Middleware**: Handles async actions with `createAsyncAction`

**Applied in main.js:**

```javascript
applyMiddleware(
  store,
  createAsyncMiddleware(),
  createLoggerMiddleware({ collapsed: true, enabled: import.meta.env.DEV })
);
```

---

## How to Add a New Feature

### Example: Adding a "Duplicate Prim" Feature

Let's walk through adding a feature step-by-step.

#### Step 1: Define the Action

**File**: [src/core/state/actions/index.js](../../src/core/state/actions/index.js)

```javascript
export const ActionTypes = {
  // ... existing actions
  DUPLICATE_PRIM: "DUPLICATE_PRIM",
};

export const actions = {
  // ... existing actions
  duplicatePrim: (primPath) => ({
    type: ActionTypes.DUPLICATE_PRIM,
    payload: { primPath },
  }),
};
```

#### Step 2: Handle the Action in the Reducer

**File**: [src/core/state/reducer.js](../../src/core/state/reducer.js)

```javascript
case ActionTypes.DUPLICATE_PRIM: {
  const { primPath } = action.payload;
  const originalPrim = findPrimByPath(state.stage.composedPrims, primPath);
  if (!originalPrim) return state;

  const duplicatedPrim = {
    ...originalPrim,
    name: `${originalPrim.name}_copy`,
    path: `${originalPrim.path}_copy`
  };

  return {
    ...state,
    stage: {
      ...state.stage,
      composedPrims: [...state.stage.composedPrims, duplicatedPrim]
    }
  };
}
```

#### Step 3: Add UI Button and Event Handler

**File**: [src/components/propertiesController.js](../../src/components/propertiesController.js) (or relevant controller)

```javascript
function initDuplicateButton() {
  const duplicateBtn = document.getElementById("duplicatePrimBtn");

  duplicateBtn.addEventListener("click", () => {
    const selectedPrimPath = store.getState().selectedPrimPath;
    if (!selectedPrimPath) {
      alert("Please select a prim first");
      return;
    }

    // Dispatch action
    store.dispatch(actions.duplicatePrim(selectedPrimPath));

    // Update view
    updateView();
  });
}
```

#### Step 4: Update the View

The view updates automatically via state subscriptions in rendering components.

#### Step 5: Write Tests

**File**: [src/**tests**/unit/core/state/reducer.test.js](../../src/__tests__/unit/core/state/reducer.test.js)

```javascript
describe("DUPLICATE_PRIM action", () => {
  it("should duplicate a prim", () => {
    const initialState = {
      stage: {
        composedPrims: [
          {
            name: "Wall",
            path: "/Building/Wall",
            type: "Mesh",
          },
        ],
      },
    };

    const action = actions.duplicatePrim("/Building/Wall");
    const newState = reducer(initialState, action);

    expect(newState.stage.composedPrims).toHaveLength(2);
    expect(newState.stage.composedPrims[1].name).toBe("Wall_copy");
  });
});
```

#### Step 6: Run Tests and Verify

```bash
npm test -- reducer.test.js
```

---

## Common Patterns and Conventions

### 1. Naming Conventions

- **Files**: camelCase for modules (`outlinerController.js`, `primHelpers.js`)
- **Constants**: UPPER_SNAKE_CASE (`LAYER_STATUS`, `USER_ROLES`)
- **Functions**: camelCase (`updateView`, `stagePrims`)
- **Classes**: PascalCase (`ThreeScene`, `LayerService`)
- **Private functions**: Prefix with `_` (`_parseProperties`, `_handleCollision`)

### 2. Import/Export Patterns

**Prefer named exports:**

```javascript
// ✅ Good
export function stagePrims(prims) { ... }
export function commitChanges() { ... }

// Import
import { stagePrims, commitChanges } from './primStaging.js';
```

**Use default exports for classes:**

```javascript
export default class ThreeScene { ... }

import ThreeScene from './ThreeScene.js';
```

### 3. Error Handling

**Use custom error classes** from [src/core/errors/errors.js](../../src/core/errors/errors.js):

```javascript
import { ParseError, ValidationError } from "./core/errors/errors.js";

function parseUsda(content) {
  if (!content) {
    throw new ValidationError("USDA content cannot be empty");
  }

  try {
    // parsing logic
  } catch (err) {
    throw new ParseError(`Failed to parse USDA: ${err.message}`, err);
  }
}
```

**Global error handler** catches unhandled errors and displays them to the user.

### 4. State Updates

**Always dispatch actions**, never mutate state directly:

```javascript
// ❌ Bad - Direct mutation
store.getState().stage.layerStack.push(newLayer);

// ✅ Good - Dispatch action
store.dispatch(actions.addLayer(newLayer));
```

### 5. Subscription Pattern

**Subscribe in controllers, dispatch in event handlers:**

```javascript
// Subscribe to state changes
store.subscribe(['stage.layerStack'], (state) => {
  renderLayerStack(state.stage.layerStack);
});

// Dispatch on user interaction
button.addEventListener('click', () => {
  store.dispatch(actions.addLayer(...));
});
```

---

## Where to Find Things

### I need to...

- **Add a new UI component**: `src/components/`
- **Modify state management**: `src/core/state/`
- **Add business logic**: `src/core/services/`
- **Parse or generate USDA**: `src/viewer/usda/`
- **Modify 3D rendering**: `src/viewer/ThreeScene.js` or `src/viewer/rendering/`
- **Add utility functions**: `src/utils/`
- **Define constants**: `src/constants.js`
- **Write tests**: `src/__tests__/unit/` (unit) or `src/__tests__/integration/` (integration)
- **Update styles**: `css/` (modular CSS files)
- **Update documentation**: `docs/`

### Key Service Files

- **LayerService** ([src/core/services/LayerService.js](../../src/core/services/LayerService.js)): Layer operations (add, remove, promote)
- **PrimService** ([src/core/services/PrimService.js](../../src/core/services/PrimService.js)): Prim operations (find, update, validate)

### Key Utility Files

- **conflictDetector.js**: Detects property conflicts between layers
- **statusUtils.js**: Status resolution and color mapping
- **primHelpers.js**: Prim manipulation helpers
- **validators.js**: Input validation functions
- **domHelpers.js**: DOM utility functions

---

## Testing Your Changes

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration

# Run E2E tests (Playwright)
npm run test:e2e

# Generate coverage report
npm run test:coverage
```

### Test Coverage

- **Minimum threshold**: 40% coverage
- **Goal**: Aim for >70% on new code
- Coverage report: `coverage/index.html`

### Writing Tests

See [docs/guides/TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive testing documentation.

**Quick example:**

```javascript
import { describe, it, expect } from "vitest";
import { actions } from "../../src/core/state/actions/index.js";

describe("Action Creators", () => {
  it("should create ADD_LAYER action", () => {
    const layer = { name: "test.usda", content: "...", status: "WIP" };
    const action = actions.addLayer(layer);

    expect(action.type).toBe("ADD_LAYER");
    expect(action.payload).toEqual(layer);
  });
});
```

---

## Making Your First Contribution

### Workflow Overview

1. **Pick an issue** from GitHub Issues (look for "good first issue" label)
2. **Create a branch**: `git checkout -b feature/your-feature-name`
3. **Make changes** following conventions
4. **Write tests** for your changes
5. **Run tests and linting**: `npm test && npm run lint`
6. **Commit with Conventional Commits**: `git commit -m "feat: add duplicate prim feature"`
7. **Push and create PR**: `git push origin feature/your-feature-name`
8. **Address review feedback**
9. **Merge when approved**

### Commit Message Format

We use **Conventional Commits**:

```
<type>(<scope>): <description>

[optional body]

[optional footer]
```

**Types**: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`

**Examples:**

- `feat(staging): add placeholder collision detection`
- `fix(parser): handle nested braces in property values`
- `docs(api): add JSDoc for ThreeScene class`
- `test(reducer): add tests for layer promotion`

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for full guidelines.

---

## Reading List

To deepen your understanding, read these docs in order:

### Essential (Read First)

1. ✅ **This document** (DEVELOPER_ONBOARDING.md)
2. [ARCHITECTURE.md](../../ARCHITECTURE.md) - Detailed system architecture
3. [TESTING_GUIDE.md](./TESTING_GUIDE.md) - Testing standards and patterns
4. [STATE_API.md](../api/STATE_API.md) - State management API reference

### Important (Read Soon)

5. [SERVICES_API.md](../api/SERVICES_API.md) - LayerService and PrimService API
6. [PARSER_API.md](../api/PARSER_API.md) - USDA parsing and composition
7. [LAYER_WORKFLOW.md](../architecture/LAYER_WORKFLOW.md) - ISO 19650 workflow details

### Advanced (Read When Needed)

8. [VIEWER_API.md](../api/VIEWER_API.md) - Three.js viewer internals
9. [DESIGN_DECISIONS.md](../architecture/DESIGN_DECISIONS.md) - Architectural rationale
10. [TYPESCRIPT_MIGRATION.md](../architecture/TYPESCRIPT_MIGRATION.md) - TS migration guide

### External Resources

- [USD Documentation](https://graphics.pixar.com/usd/docs/index.html) - Official USD docs
- [Three.js Documentation](https://threejs.org/docs/) - Three.js API reference
- [Vite Guide](https://vitejs.dev/guide/) - Vite build tool documentation

---

## Getting Help

### Stuck? Here's where to get help:

1. **Search existing docs**: Start with [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)
2. **Check the code**: Use browser DevTools and console.log liberally
3. **Ask in PR comments**: Describe what you've tried
4. **Open a GitHub Discussion**: For broader questions
5. **Reach out to maintainers**: Tag them in issues

### Common Resources

- **Console Errors**: Open DevTools (F12) → Console tab
- **State Inspector**: `store.getState()` in console to inspect current state
- **Action Logger**: Middleware logs all actions in development mode
- **Test Output**: `npm test -- --reporter=verbose` for detailed test output

---

## Next Steps

Now that you understand the basics:

1. **Explore the codebase** - Open files mentioned in this guide
2. **Run the app locally** - Load a USDA file and click around
3. **Read the ARCHITECTURE.md** - Understand the deeper design
4. **Pick a "good first issue"** - Start contributing!
5. **Join team discussions** - Ask questions and share ideas

**Welcome to the team! Happy coding!** 🎉

---

**Last Updated:** February 15, 2026
