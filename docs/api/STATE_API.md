# State Management API Reference

**Last Updated:** February 15, 2026

This document provides comprehensive API documentation for USDA Composer's state management system, which follows a Redux-style architecture.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Store API](#store-api)
4. [Action Creators](#action-creators)
5. [State Shape](#state-shape)
6. [Reducer](#reducer)
7. [Middleware](#middleware)
8. [Subscription Patterns](#subscription-patterns)
9. [Common Operations](#common-operations)
10. [Best Practices](#best-practices)
11. [Examples](#examples)
12. [Debugging](#debugging)

---

## Overview

### What is State Management?

USDA Composer uses a **custom Redux-style state management system** for centralized application state. This provides:

- **Single source of truth**: All state in one place
- **Predictable updates**: State changes only through actions
- **Time-travel debugging**: Action history tracking
- **Easy testing**: Pure reducer functions
- **Observable pattern**: Subscribe to state changes

### Key Concepts

```
Action → Store.dispatch() → Reducer → New State → Notify Listeners → UI Updates
```

**Action**: Plain object describing what happened (`{ type: 'ADD_LAYER', payload: { ... } }`)
**Reducer**: Pure function that computes new state from action
**Store**: Holds state and orchestrates updates
**Subscribers**: Functions notified when state changes

---

## Architecture

### File Structure

```
src/core/state/
├── store.js           # Store class and singleton instance
├── reducer.js         # Main reducer function
├── actions/
│   └── index.js       # Action creators
├── middleware/
│   └── index.js       # Middleware (logger, async)
└── helpers.js         # Helper functions (updatePrimInHierarchy, etc.)
```

### Data Flow Diagram

```
┌─────────────┐
│  Component  │
└──────┬──────┘
       │ dispatch(action)
       ▼
┌─────────────┐
│    Store    │
└──────┬──────┘
       │ reducer(state, action)
       ▼
┌─────────────┐
│   Reducer   │───► New State
└──────┬──────┘
       │ notifyListeners(newState)
       ▼
┌─────────────┐
│ Subscribers │───► UI Updates
└─────────────┘
```

---

## Store API

**Import:**

```javascript
import { store } from "./core/index.js";
// or
import { store } from "./core/state/store.js";
```

### `store.getState()`

Returns the current state (read-only).

**Signature:**

```javascript
getState(): Object
```

**Example:**

```javascript
const currentState = store.getState();
console.log(currentState.sceneName); // "My Project"
console.log(currentState.stage.layerStack); // [...]
```

**Note**: Do NOT mutate the returned state object directly. Always use `dispatch()`.

---

### `store.dispatch(action)`

Dispatches an action to update state.

**Signature:**

```javascript
dispatch(action: Object): Object
```

**Parameters:**

- `action` (Object): Action object with `type` and `payload`

**Returns:**

- The dispatched action

**Example:**

```javascript
import { actions } from "./core/index.js";

// Dispatch an action
store.dispatch(actions.setSceneName("New Project"));

// Dispatch custom action
store.dispatch({
  type: "CUSTOM_ACTION",
  payload: { data: "value" },
});
```

**Flow:**

1. Calls reducer with current state and action
2. Merges reducer output with current state
3. Notifies all subscribers with new state
4. Returns the action

---

### `store.subscribe(key, callback)`

Subscribes to state changes.

**Signature:**

```javascript
subscribe(key: string, callback: Function): Function
```

**Parameters:**

- `key` (string): Subscription identifier (for organizing listeners)
- `callback` (Function): `(prevState, nextState) => void`

**Returns:**

- Unsubscribe function

**Example:**

```javascript
// Subscribe to all state changes
const unsubscribe = store.subscribe("myComponent", (prevState, nextState) => {
  console.log("State changed:", prevState, nextState);
  updateUI(nextState);
});

// Unsubscribe later
unsubscribe();
```

**Note**: Subscribers are called for **every** state change. Filter changes in your callback if needed.

---

### `store.setState(updates)` (Deprecated)

**⚠️ Deprecated**: Use `dispatch()` with actions instead.

Legacy method for direct state updates. Still functional for backward compatibility but logs a warning.

```javascript
// ❌ Deprecated
store.setState({ sceneName: "New Scene" });

// ✅ Use this instead
store.dispatch(actions.setSceneName("New Scene"));
```

---

## Action Creators

Action creators are functions that return action objects. They provide type safety, centralized logic, and self-documentation.

**Import:**

```javascript
import { actions, ActionTypes } from "./core/index.js";
// or
import { actions, ActionTypes } from "./core/state/actions/index.js";
```

### Scene Actions

#### `actions.setSceneName(name)`

Sets the scene name.

**Parameters:**

- `name` (string): Scene name

**Example:**

```javascript
store.dispatch(actions.setSceneName("Building Project"));
```

**State Update:**

```javascript
{
  sceneName: "Building Project";
}
```

---

#### `actions.setCurrentUser(user)`

Sets the current user role.

**Parameters:**

- `user` (string): User role (Architect, Structural Engineer, Project Manager, Field Person)

**Example:**

```javascript
import { USER_ROLES } from "./constants.js";

store.dispatch(actions.setCurrentUser(USER_ROLES.ARCHITECT));
```

**State Update:**

```javascript
{
  currentUser: "Architect";
}
```

---

### Layer Actions

#### `actions.addLayer(layer)`

Adds a new layer to the layer stack.

**Parameters:**

- `layer` (Object):
  - `id` (string): Unique layer ID (generated if not provided)
  - `name` (string): Layer filename
  - `content` (string): USDA file content
  - `status` (string): Layer status (WIP, Shared, Published, Archived)
  - `visible` (boolean): Visibility in viewport
  - `active` (boolean): Included in composition

**Example:**

```javascript
const layer = {
  id: "layer-1",
  name: "structural.usda",
  content: "#usda 1.0\n...",
  status: "WIP",
  visible: true,
  active: true,
};

store.dispatch(actions.addLayer(layer));
```

**State Update:**

```javascript
{
  stage: {
    layerStack: [...existingLayers, layer];
  }
}
```

---

#### `actions.removeLayer(layerId)`

Removes a layer from the stack.

**Parameters:**

- `layerId` (string): Layer ID to remove

**Example:**

```javascript
store.dispatch(actions.removeLayer("layer-1"));
```

---

#### `actions.updateLayer(layerId, updates)`

Updates layer properties.

**Parameters:**

- `layerId` (string): Layer ID
- `updates` (Object): Properties to update

**Example:**

```javascript
store.dispatch(
  actions.updateLayer("layer-1", {
    status: "Shared",
    visible: false,
  })
);
```

---

#### `actions.toggleLayerVisibility(layerId)`

Toggles layer visibility in viewport.

**Example:**

```javascript
store.dispatch(actions.toggleLayerVisibility("layer-1"));
```

---

#### `actions.toggleLayerActive(layerId)`

Toggles layer active state (included in composition).

**Example:**

```javascript
store.dispatch(actions.toggleLayerActive("layer-1"));
```

---

#### `actions.reorderLayers(layerStack)`

Reorders the entire layer stack.

**Parameters:**

- `layerStack` (Array): New layer order

**Example:**

```javascript
const reordered = [layers[2], layers[0], layers[1]];
store.dispatch(actions.reorderLayers(reordered));
```

---

#### `actions.setLayerFilter(filter)`

Sets the active layer filter.

**Parameters:**

- `filter` (string): Filter value ('All', 'WIP', 'Shared', 'Published', 'Archived')

**Example:**

```javascript
import { LAYER_STATUS } from "./constants.js";

store.dispatch(actions.setLayerFilter(LAYER_STATUS.PUBLISHED));
```

---

#### `actions.toggleStatusColor()`

Toggles status-based colorization in 3D viewport.

**Example:**

```javascript
store.dispatch(actions.toggleStatusColor());
```

**Effect:**

- Orange for WIP
- Blue for Shared
- Green for Published
- Gray for Archived

---

### Prim Actions

#### `actions.setComposedHierarchy(hierarchy)`

Sets the composed prim hierarchy.

**Parameters:**

- `hierarchy` (Array): Array of root prim objects

**Example:**

```javascript
const hierarchy = [
  {
    name: 'Building',
    path: '/Building',
    type: 'Xform',
    properties: {},
    children: [...]
  }
];

store.dispatch(actions.setComposedHierarchy(hierarchy));
```

**State Update:**

```javascript
{
  composedHierarchy: hierarchy,
  stage: {
    composedPrims: hierarchy
  }
}
```

---

#### `actions.updatePrim(primPath, updates)`

Updates prim properties in the hierarchy.

**Parameters:**

- `primPath` (string): Prim path (e.g., '/Building/Wall')
- `updates` (Object): Property updates

**Example:**

```javascript
store.dispatch(
  actions.updatePrim("/Building/Wall", {
    properties: {
      status: "Shared",
      displayColor: new THREE.Color(0x0000ff),
    },
  })
);
```

---

#### `actions.addPrim(parentPath, prim)`

Adds a prim to the hierarchy.

**Parameters:**

- `parentPath` (string): Parent prim path (or null for root)
- `prim` (Object): Prim object to add

**Example:**

```javascript
const newPrim = {
  name: "NewWall",
  path: "/Building/NewWall",
  type: "Mesh",
  properties: {},
  children: [],
};

store.dispatch(actions.addPrim("/Building", newPrim));
```

---

#### `actions.removePrim(primPath)`

Removes a prim from the hierarchy.

**Example:**

```javascript
store.dispatch(actions.removePrim("/Building/OldWall"));
```

---

### File Actions

#### `actions.loadFile(filePath, content)`

Loads file content into state.

**Parameters:**

- `filePath` (string): File path/name
- `content` (string): File content

**Example:**

```javascript
store.dispatch(actions.loadFile("scene.usda", "#usda 1.0\n..."));
```

---

#### `actions.unloadFile(filePath)`

Unloads file from state.

**Example:**

```javascript
store.dispatch(actions.unloadFile("scene.usda"));
```

---

#### `actions.updateFile(filePath, content)`

Updates file content.

**Example:**

```javascript
store.dispatch(actions.updateFile("scene.usda", newContent));
```

---

#### `actions.setCurrentFile(fileName)`

Sets the currently selected file.

**Example:**

```javascript
store.dispatch(actions.setCurrentFile("scene.usda"));
```

---

### History Actions

#### `actions.addCommit(commit)`

Adds a commit to history.

**Parameters:**

- `commit` (Object):
  - `id` (string): Commit ID
  - `timestamp` (string): ISO timestamp
  - `user` (string): User who made the commit
  - `message` (string): Commit message
  - `type` (string): Commit type
  - `stagedPrims` (Array): List of affected prims

**Example:**

```javascript
const commit = {
  id: "commit-1",
  timestamp: new Date().toISOString(),
  user: "Architect",
  message: "Add structural columns",
  type: "Prim Selection",
  stagedPrims: ["/Building/Column1", "/Building/Column2"],
};

store.dispatch(actions.addCommit(commit));
```

---

#### `actions.setHeadCommit(commitId)`

Sets the current HEAD commit (for timeline navigation).

**Example:**

```javascript
store.dispatch(actions.setHeadCommit("commit-5"));
```

---

#### `actions.toggleHistoryMode(enabled)`

Toggles history viewing mode.

**Parameters:**

- `enabled` (boolean): Enable/disable history mode

**Example:**

```javascript
store.dispatch(actions.toggleHistoryMode(true)); // Enter history mode
store.dispatch(actions.toggleHistoryMode(false)); // Exit history mode
```

---

### View Actions

#### `actions.setCurrentView(view)`

Sets the current view mode.

**Parameters:**

- `view` (string): View mode ('file', 'stage', 'history')

**Example:**

```javascript
import { VIEW_MODES } from "./constants.js";

store.dispatch(actions.setCurrentView(VIEW_MODES.STAGE));
```

---

## State Shape

The complete state object structure:

```javascript
{
  // Scene metadata
  sceneName: "My Project",
  currentUser: "Architect",
  currentView: "stage",

  // Files
  loadedFiles: Map<string, string>, // filename → content
  currentFile: "scene.usda",
  selectedFiles: ["scene.usda", "structural.usda"],

  // Stage (composition)
  stage: {
    layerStack: [
      {
        id: "layer-1",
        name: "base.usda",
        content: "#usda 1.0\n...",
        status: "Published",
        visible: true,
        active: true
      }
    ],
    composedPrims: [...], // Same as composedHierarchy
    activeFilter: "All",
    colorizeByStatus: true,
    saveStatusFilter: ["Published", "Shared"]
  },

  // Prim hierarchy
  composedHierarchy: [
    {
      name: "Building",
      path: "/Building",
      type: "Xform",
      specifier: "def",
      properties: {
        status: "Published",
        displayColor: THREE.Color,
        displayName: "Main Building"
      },
      children: [...]
    }
  ],

  // Prim lookup map
  allPrimsByPath: Map<string, Object>, // path → prim

  // Staging area
  stagedChanges: [
    {
      type: "update",
      primPath: "/Building/Wall",
      changes: { status: "Shared" }
    }
  ],

  // History
  history: {
    commits: Map<string, Object>, // commitId → commit
    roots: ["commit-1"] // Root commit IDs
  },
  headCommitId: "commit-5",
  isHistoryMode: false,
  logEntryCounter: 10
}
```

---

## Reducer

The reducer is a pure function that computes new state from actions.

**File**: [src/core/state/reducer.js](../../src/core/state/reducer.js)

**Signature:**

```javascript
reducer(state: Object, action: Object): Object
```

**Rules:**

1. **Pure function**: No side effects
2. **Immutable**: Never mutate state directly
3. **Returns updates**: Returns only changed properties (deep merged by store)

**Example Reducer Case:**

```javascript
case "ADD_LAYER": {
  const currentStack = state.stage?.layerStack || [];
  return {
    stage: {
      ...state.stage,
      layerStack: [...currentStack, payload.layer]
    }
  };
}
```

---

## Middleware

Middleware intercepts actions before they reach the reducer.

**Import:**

```javascript
import {
  applyMiddleware,
  createLoggerMiddleware,
  createAsyncMiddleware,
} from "./core/index.js";
```

### Applying Middleware

**File**: [src/main.js](../../src/main.js)

```javascript
import {
  store,
  applyMiddleware,
  createLoggerMiddleware,
  createAsyncMiddleware,
} from "./core/index.js";

applyMiddleware(
  store,
  createAsyncMiddleware(),
  createLoggerMiddleware({
    collapsed: true,
    enabled: import.meta.env.DEV, // Only in development
  })
);
```

### Logger Middleware

Logs actions and state changes to console (development only).

**Output:**

```
action SET_SCENE_NAME @ 14:32:15.234
  prev state: { sceneName: "Old" }
  action: { type: "SET_SCENE_NAME", payload: { sceneName: "New" } }
  next state: { sceneName: "New" }
```

### Async Middleware

Handles async actions created with `createAsyncAction`.

**Example:**

```javascript
import { createAsyncAction } from "./core/index.js";

const loadFileAsync = createAsyncAction(async (dispatch, getState) => {
  const content = await fetch("/file.usda").then((r) => r.text());
  dispatch(actions.loadFile("file.usda", content));
});

store.dispatch(loadFileAsync);
```

---

## Subscription Patterns

### Basic Subscription

```javascript
store.subscribe("layerUpdates", (prevState, nextState) => {
  console.log("State updated");
  updateUI(nextState);
});
```

### Selective Updates (Manual Filtering)

```javascript
store.subscribe("layerStack", (prevState, nextState) => {
  // Only update if layer stack changed
  if (prevState.stage?.layerStack !== nextState.stage?.layerStack) {
    renderLayerStack(nextState.stage.layerStack);
  }
});
```

### Multiple Subscriptions

```javascript
// Separate concerns with different subscription keys
store.subscribe("layerPanel", updateLayerPanel);
store.subscribe("viewport", updateViewport);
store.subscribe("properties", updatePropertiesPanel);
```

### Unsubscribing

```javascript
const unsubscribe = store.subscribe("temp", callback);

// Later...
unsubscribe();
```

---

## Common Operations

### Get Current Layer Stack

```javascript
const layers = store.getState().stage.layerStack;
```

### Find Layer by ID

```javascript
const layer = store.getState().stage.layerStack.find((l) => l.id === "layer-1");
```

### Add and Activate Layer

```javascript
const layer = {
  id: generateId(),
  name: "new.usda",
  content: "#usda 1.0",
  status: "WIP",
  visible: true,
  active: true,
};

store.dispatch(actions.addLayer(layer));
```

### Toggle Layer Visibility

```javascript
store.dispatch(actions.toggleLayerVisibility("layer-1"));
```

### Update Prim Status

```javascript
store.dispatch(
  actions.updatePrim("/Building/Wall", {
    properties: { status: "Shared" },
  })
);
```

### Navigate to Historical Commit

```javascript
// Enter history mode
store.dispatch(actions.toggleHistoryMode(true));

// Set commit to view
store.dispatch(actions.setHeadCommit("commit-3"));

// Exit history mode (return to present)
store.dispatch(actions.toggleHistoryMode(false));
```

---

## Best Practices

### 1. Always Use Actions

```javascript
// ❌ Bad - Direct mutation
store.getState().sceneName = "New Scene";

// ✅ Good - Use action
store.dispatch(actions.setSceneName("New Scene"));
```

### 2. Don't Mutate State

```javascript
// ❌ Bad
const state = store.getState();
state.stage.layerStack.push(newLayer);

// ✅ Good
store.dispatch(actions.addLayer(newLayer));
```

### 3. Use Constants for Action Types

```javascript
import { ActionTypes } from "./core/index.js";

if (action.type === ActionTypes.ADD_LAYER) {
  // ...
}
```

### 4. Subscribe Selectively

```javascript
// ❌ Bad - Updates for every state change
store.subscribe("myComponent", (prev, next) => {
  renderEverything(next); // Expensive!
});

// ✅ Good - Check what changed
store.subscribe("myComponent", (prev, next) => {
  if (prev.stage?.layerStack !== next.stage?.layerStack) {
    renderLayerStack(next.stage.layerStack);
  }
});
```

### 5. Batch Related Updates

```javascript
// ❌ Bad - Multiple dispatches
store.dispatch(actions.addLayer(layer1));
store.dispatch(actions.addLayer(layer2));
store.dispatch(actions.addLayer(layer3));

// ✅ Better - Single dispatch with batch action
// (if you create a custom batch action)
```

### 6. Use Middleware for Side Effects

```javascript
// ❌ Bad - Side effects in component
button.onclick = () => {
  store.dispatch(actions.addLayer(layer));
  saveToLocalStorage(layer); // Side effect
  sendAnalytics("layer_added"); // Side effect
};

// ✅ Good - Side effects in middleware
// Middleware can intercept actions and perform side effects
```

---

## Examples

### Example 1: Load and Display Layers

```javascript
import { store, actions } from "./core/index.js";

// Subscribe to layer changes
store.subscribe("layerPanel", (prevState, nextState) => {
  if (prevState.stage?.layerStack !== nextState.stage?.layerStack) {
    const layers = nextState.stage.layerStack;
    renderLayerStack(layers);
  }
});

// Load files as layers
async function loadFiles(files) {
  for (const file of files) {
    const content = await file.text();
    const layer = {
      id: generateId(),
      name: file.name,
      content,
      status: "WIP",
      visible: true,
      active: true,
    };
    store.dispatch(actions.addLayer(layer));
  }
}
```

### Example 2: Promote Layer

```javascript
function promoteLayer(layerId) {
  const state = store.getState();
  const layer = state.stage.layerStack.find((l) => l.id === layerId);

  if (!layer) {
    console.error("Layer not found");
    return;
  }

  // Determine next status
  const statusProgression = {
    WIP: "Shared",
    Shared: "Published",
    Published: "Archived",
  };

  const nextStatus = statusProgression[layer.status];

  if (nextStatus) {
    store.dispatch(actions.updateLayer(layerId, { status: nextStatus }));
  }
}
```

### Example 3: Filter Layers by Status

```javascript
function filterLayersByStatus(status) {
  // Update filter in state
  store.dispatch(actions.setLayerFilter(status));

  // Get filtered layers
  const state = store.getState();
  const filtered = state.stage.layerStack.filter(
    (layer) => status === "All" || layer.status === status
  );

  renderLayerStack(filtered);
}
```

### Example 4: Timeline Navigation

```javascript
function navigateToCommit(commitId) {
  // Enter history mode
  store.dispatch(actions.toggleHistoryMode(true));

  // Set commit
  store.dispatch(actions.setHeadCommit(commitId));

  // Reconstruct scene at that commit
  const state = store.getState();
  const commit = state.history.commits.get(commitId);

  if (commit) {
    reconstructSceneFromCommit(commit);
  }
}

function returnToPresent() {
  store.dispatch(actions.toggleHistoryMode(false));

  // Clear head commit
  const latestCommitId = getLatestCommitId();
  store.dispatch(actions.setHeadCommit(latestCommitId));
}
```

---

## Debugging

### View Current State

```javascript
// In browser console
console.log(store.getState());
```

### Enable Logger Middleware

Logger middleware is enabled in development mode by default. Check console for action logs.

### Track Action Flow

```javascript
const unsubscribe = store.subscribe("debug", (prevState, nextState) => {
  console.log("State changed:", { prevState, nextState });
  console.trace(); // Show stack trace
});
```

### Test Actions

```javascript
import { actions } from "./core/index.js";

// Dispatch test action
store.dispatch(actions.setSceneName("Test"));

// Verify state
console.assert(store.getState().sceneName === "Test", "State not updated");
```

### Inspect Subscribers

```javascript
// In browser console
console.log(store.listeners); // Map of all subscribers
```

---

## Related Documentation

- [DEVELOPER_ONBOARDING.md](../guides/DEVELOPER_ONBOARDING.md) - Understanding state in context
- [TESTING_GUIDE.md](../guides/TESTING_GUIDE.md) - Testing state management
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Overall architecture

---

**Last Updated:** February 15, 2026
