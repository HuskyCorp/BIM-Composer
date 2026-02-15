# Services API Reference

**Last Updated:** February 15, 2026

This document provides comprehensive API documentation for USDA Composer's service layer, which contains business logic for layer and prim operations.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [LayerService API](#layerservice-api)
4. [PrimService API](#primservice-api)
5. [Service Registry](#service-registry)
6. [Integration with State](#integration-with-state)
7. [Error Handling](#error-handling)
8. [Examples](#examples)
9. [Testing Services](#testing-services)
10. [Best Practices](#best-practices)

---

## Overview

### What are Services?

**Services** are classes that encapsulate business logic separately from UI concerns. They provide:

- **Pure functions**: Predictable, testable logic
- **Reusability**: Use across multiple components
- **Maintainability**: Single source of truth for business rules
- **Testability**: Easy to unit test in isolation

### Available Services

- **LayerService**: Layer management (create, validate, promote, reorder)
- **PrimService**: Prim operations (create, find, validate, merge)

---

## Architecture

### File Structure

```
src/core/services/
├── index.js           # Service exports and registry
├── LayerService.js    # Layer business logic
└── PrimService.js     # Prim business logic
```

### Import Pattern

```javascript
// Import singleton instances (recommended)
import { layerService, primService } from "./core/index.js";

// Or import classes for custom instances
import { LayerService, PrimService } from "./core/services/index.js";
```

### Service Pattern

Services are implemented as classes with singleton instances:

```javascript
export class MyService {
  myMethod() {
    // Business logic here
  }
}

export const myService = new MyService();
```

---

## LayerService API

**Import:**

```javascript
import { layerService } from "./core/index.js";
```

**File**: [src/core/services/LayerService.js](../../src/core/services/LayerService.js)

---

### `layerService.generateLayerId()`

Generates a unique layer ID.

**Signature:**

```javascript
generateLayerId(): string
```

**Returns:**

- `string`: Unique ID in format `"layer-{timestamp}-{random}"`

**Example:**

```javascript
const id = layerService.generateLayerId();
// Returns: "layer-1234567890-abc123xyz"
```

---

### `layerService.createLayer(filePath, status)`

Creates a new layer object with default properties.

**Signature:**

```javascript
createLayer(filePath: string, status?: string): Object
```

**Parameters:**

- `filePath` (string): Layer filename (e.g., "assets/char.usda")
- `status` (string, optional): Initial status. Default: "WIP"
  - Valid values: "WIP", "Shared", "Published", "Archived"

**Returns:**

- `Object`: Layer object with:
  - `id` (string): Unique layer ID
  - `filePath` (string): File path
  - `status` (string): Layer status
  - `active` (boolean): Whether layer is included in composition
  - `visible` (boolean): Whether layer is visible in viewport
  - `createdAt` (number): Creation timestamp
  - `modifiedAt` (number): Last modification timestamp

**Throws:**

- `ValidationError`: If filePath is missing or status is invalid

**Example:**

```javascript
const layer = layerService.createLayer("assets/char.usda", "WIP");
/*
Returns:
{
  id: "layer-1234567890-abc",
  filePath: "assets/char.usda",
  status: "WIP",
  active: true,
  visible: true,
  createdAt: 1234567890000,
  modifiedAt: 1234567890000
}
*/
```

---

### `layerService.updateLayer(layer, updates)`

Updates layer properties with new values.

**Signature:**

```javascript
updateLayer(layer: Object, updates: Object): Object
```

**Parameters:**

- `layer` (Object): The layer to update
- `updates` (Object): Properties to update

**Returns:**

- `Object`: New layer object with merged properties and updated `modifiedAt`

**Throws:**

- `ValidationError`: If layer is missing

**Example:**

```javascript
const updated = layerService.updateLayer(layer, {
  status: "Shared",
  visible: false,
});
```

**Note**: This does NOT mutate the original layer. Returns a new object.

---

### `layerService.validateLayerStack(layerStack)`

Validates layer stack for correctness and consistency.

**Signature:**

```javascript
validateLayerStack(layerStack: Array<Object>): boolean
```

**Parameters:**

- `layerStack` (Array): Array of layer objects

**Returns:**

- `boolean`: `true` if validation passes

**Throws:**

- `ValidationError`: If layerStack is not an array or contains duplicate file paths

**Validation Rules:**

- Must be an array
- No duplicate file paths

**Example:**

```javascript
try {
  layerService.validateLayerStack([layer1, layer2]);
  console.log("Valid layer stack");
} catch (error) {
  console.error("Invalid layer stack:", error.message);
}
```

---

### `layerService.filterLayersByStatus(layerStack, status)`

Filters layers by status.

**Signature:**

```javascript
filterLayersByStatus(layerStack: Array<Object>, status: string): Array<Object>
```

**Parameters:**

- `layerStack` (Array): The layer stack to filter
- `status` (string): Status to filter by ("All", "WIP", "Shared", "Published", "Archived")

**Returns:**

- `Array<Object>`: Filtered layer stack

**Example:**

```javascript
const wipLayers = layerService.filterLayersByStatus(layerStack, "WIP");
const allLayers = layerService.filterLayersByStatus(layerStack, "All");
```

---

### `layerService.getVisibleLayers(layerStack)`

Gets all visible layers.

**Signature:**

```javascript
getVisibleLayers(layerStack: Array<Object>): Array<Object>
```

**Returns:**

- `Array<Object>`: Layers where `visible === true`

**Example:**

```javascript
const visible = layerService.getVisibleLayers(layerStack);
```

---

### `layerService.getActiveLayer(layerStack)`

Gets the active layer (first layer where `active === true`).

**Signature:**

```javascript
getActiveLayer(layerStack: Array<Object>): Object|undefined
```

**Returns:**

- `Object|undefined`: The active layer or undefined if none

**Example:**

```javascript
const activeLayer = layerService.getActiveLayer(layerStack);
if (activeLayer) {
  console.log("Active layer:", activeLayer.filePath);
}
```

---

### `layerService.promoteLayer(layer)`

Promotes layer to the next status in the workflow.

**Workflow:** WIP → Shared → Published → Archived

**Signature:**

```javascript
promoteLayer(layer: Object): Object
```

**Parameters:**

- `layer` (Object): The layer to promote

**Returns:**

- `Object`: Updated layer with new status

**Example:**

```javascript
const wipLayer = { id: "123", status: "WIP", filePath: "scene.usda" };
const promoted = layerService.promoteLayer(wipLayer);
console.log(promoted.status); // "Shared"

const sharedLayer = promoted;
const promotedAgain = layerService.promoteLayer(sharedLayer);
console.log(promotedAgain.status); // "Published"
```

**Note**: Archived layers cannot be promoted further (stays Archived).

---

### `layerService.demoteLayer(layer)`

Demotes layer to the previous status in the workflow.

**Workflow:** Archived → Published → Shared → WIP

**Signature:**

```javascript
demoteLayer(layer: Object): Object
```

**Parameters:**

- `layer` (Object): The layer to demote

**Returns:**

- `Object`: Updated layer with previous status

**Example:**

```javascript
const sharedLayer = { id: "123", status: "Shared", filePath: "scene.usda" };
const demoted = layerService.demoteLayer(sharedLayer);
console.log(demoted.status); // "WIP"
```

**Note**: WIP layers cannot be demoted further (stays WIP).

---

### `layerService.reorderLayers(layerStack, fromIndex, toIndex)`

Reorders layers by moving a layer from one index to another.

**Signature:**

```javascript
reorderLayers(layerStack: Array<Object>, fromIndex: number, toIndex: number): Array<Object>
```

**Parameters:**

- `layerStack` (Array): Current layer stack
- `fromIndex` (number): Index to move from (0-based)
- `toIndex` (number): Index to move to (0-based)

**Returns:**

- `Array<Object>`: New layer stack with reordered layers

**Throws:**

- `ValidationError`: If fromIndex or toIndex is out of bounds

**Example:**

```javascript
// Move layer at index 0 to index 2
const reordered = layerService.reorderLayers(layerStack, 0, 2);

// Layer composition order changed
console.log(reordered.map((l) => l.filePath));
```

---

### `layerService.getLayerById(layerStack, layerId)`

Finds layer by ID.

**Signature:**

```javascript
getLayerById(layerStack: Array<Object>, layerId: string): Object|undefined
```

**Returns:**

- `Object|undefined`: The layer or undefined if not found

**Example:**

```javascript
const layer = layerService.getLayerById(layerStack, "layer-123");
```

---

### `layerService.getLayerByPath(layerStack, filePath)`

Finds layer by file path.

**Signature:**

```javascript
getLayerByPath(layerStack: Array<Object>, filePath: string): Object|undefined
```

**Returns:**

- `Object|undefined`: The layer or undefined if not found

**Example:**

```javascript
const layer = layerService.getLayerByPath(layerStack, "scene.usda");
```

---

### `layerService.removeLayer(layerStack, layerId)`

Removes layer from the stack.

**Signature:**

```javascript
removeLayer(layerStack: Array<Object>, layerId: string): Array<Object>
```

**Returns:**

- `Array<Object>`: New layer stack without the removed layer

**Example:**

```javascript
const newStack = layerService.removeLayer(layerStack, "layer-123");
```

---

### `layerService.toggleLayerVisibility(layerStack, layerId)`

Toggles layer visibility.

**Signature:**

```javascript
toggleLayerVisibility(layerStack: Array<Object>, layerId: string): Array<Object>
```

**Returns:**

- `Array<Object>`: New layer stack with toggled visibility

**Example:**

```javascript
const updated = layerService.toggleLayerVisibility(layerStack, "layer-123");
```

---

### `layerService.setActiveLayer(layerStack, layerId)`

Sets the active layer (deactivates all others).

**Signature:**

```javascript
setActiveLayer(layerStack: Array<Object>, layerId: string): Array<Object>
```

**Returns:**

- `Array<Object>`: New layer stack with updated active states

**Example:**

```javascript
const updated = layerService.setActiveLayer(layerStack, "layer-123");
// Only layer-123 has active: true, all others have active: false
```

---

### `layerService.getPromotableLayersFor(layerStack, targetStatus)`

Gets layers eligible for promotion to target status.

**Signature:**

```javascript
getPromotableLayersFor(layerStack: Array<Object>, targetStatus: string): Array<Object>
```

**Parameters:**

- `layerStack` (Array): The layer stack
- `targetStatus` (string): Target status ("Shared", "Published", "Archived")

**Returns:**

- `Array<Object>`: Layers eligible for promotion

**Example:**

```javascript
// Get layers that can be promoted to Shared (i.e., WIP layers)
const promotable = layerService.getPromotableLayersFor(layerStack, "Shared");

// Get layers that can be promoted to Published (i.e., Shared layers)
const publishable = layerService.getPromotableLayersFor(
  layerStack,
  "Published"
);
```

---

## PrimService API

**Import:**

```javascript
import { primService } from "./core/index.js";
```

**File**: [src/core/services/PrimService.js](../../src/core/services/PrimService.js)

---

### `primService.validatePrimPath(path)`

Validates prim path for correctness.

**Signature:**

```javascript
validatePrimPath(path: string): boolean
```

**Parameters:**

- `path` (string): The prim path to validate (e.g., "/World/Character")

**Returns:**

- `boolean`: `true` if validation passes

**Throws:**

- `ValidationError`: If path is invalid or contains forbidden characters

**Validation Rules:**

- Must start with "/"
- Cannot contain: `<`, `>`, `"`, `|`, `?`, `*`

**Example:**

```javascript
try {
  primService.validatePrimPath("/World/Character"); // Returns: true
  primService.validatePrimPath("World/Character"); // Throws: must start with /
  primService.validatePrimPath("/World<Character"); // Throws: invalid character
} catch (error) {
  console.error("Invalid path:", error.message);
}
```

---

### `primService.normalizePrimPath(path)`

Normalizes prim path by removing trailing/duplicate slashes.

**Signature:**

```javascript
normalizePrimPath(path: string): string
```

**Parameters:**

- `path` (string): The path to normalize

**Returns:**

- `string`: Normalized path

**Example:**

```javascript
primService.normalizePrimPath("World/Character/"); // "/World/Character"
primService.normalizePrimPath("//World///Character"); // "/World/Character"
primService.normalizePrimPath("/World"); // "/World"
```

---

### `primService.getParentPath(path)`

Gets the parent path from a prim path.

**Signature:**

```javascript
getParentPath(path: string): string|null
```

**Parameters:**

- `path` (string): The prim path (e.g., "/World/Character/Mesh")

**Returns:**

- `string|null`: Parent path or `null` if path is root "/"

**Throws:**

- `ValidationError`: If path is invalid

**Example:**

```javascript
primService.getParentPath("/World/Character/Mesh"); // "/World/Character"
primService.getParentPath("/World"); // "/"
primService.getParentPath("/"); // null
```

---

### `primService.getPrimName(path)`

Gets prim name (last segment) from a path.

**Signature:**

```javascript
getPrimName(path: string): string
```

**Parameters:**

- `path` (string): The prim path (e.g., "/World/Character")

**Returns:**

- `string`: The prim name (e.g., "Character") or "Root" for root path

**Throws:**

- `ValidationError`: If path is invalid

**Example:**

```javascript
primService.getPrimName("/World/Character"); // "Character"
primService.getPrimName("/World"); // "World"
primService.getPrimName("/"); // "Root"
```

---

### `primService.joinPaths(...paths)`

Joins multiple path segments into a single path.

**Signature:**

```javascript
joinPaths(...paths: string[]): string
```

**Parameters:**

- `...paths` (string[]): Path segments to join

**Returns:**

- `string`: Joined path starting with "/"

**Example:**

```javascript
primService.joinPaths("World", "Character", "Mesh"); // "/World/Character/Mesh"
primService.joinPaths("/World", "Character"); // "/World/Character"
primService.joinPaths("/", "World"); // "/World"
```

---

### `primService.createPrim(path, type, properties)`

Creates a new prim object.

**Signature:**

```javascript
createPrim(path: string, type?: string, properties?: Object): Object
```

**Parameters:**

- `path` (string): The prim path (e.g., "/World/Sphere")
- `type` (string, optional): Prim type. Default: "Xform"
  - Common types: "Xform", "Mesh", "Sphere", "Cube", "Scope"
- `properties` (Object, optional): Initial properties. Default: `{}`

**Returns:**

- `Object`: New prim object with:
  - `path` (string): Normalized prim path
  - `type` (string): Prim type
  - `properties` (Object): Prim properties
  - `children` (Array): Child prims (initially empty)
  - `metadata` (Object): Creation and modification timestamps

**Throws:**

- `ValidationError`: If path is invalid

**Example:**

```javascript
const prim = primService.createPrim("/World/Sphere", "Sphere", {
  radius: 1.0,
  displayColor: [1, 0, 0], // Red
});

/*
Returns:
{
  path: "/World/Sphere",
  type: "Sphere",
  properties: {
    radius: 1.0,
    displayColor: [1, 0, 0]
  },
  children: [],
  metadata: {
    createdAt: 1234567890000,
    modifiedAt: 1234567890000
  }
}
*/
```

---

### `primService.updatePrimProperties(prim, updates)`

Updates prim properties with new values.

**Signature:**

```javascript
updatePrimProperties(prim: Object, updates: Object): Object
```

**Parameters:**

- `prim` (Object): The prim to update
- `updates` (Object): Properties to add or update

**Returns:**

- `Object`: New prim object with merged properties and updated `modifiedAt`

**Example:**

```javascript
const updated = primService.updatePrimProperties(prim, {
  radius: 2.0,
  status: "Shared",
});
```

**Note**: Does NOT mutate original prim. Returns new object.

---

### `primService.findPrimByPath(hierarchy, path)`

Finds prim by path in a hierarchy tree (recursive depth-first search).

**Signature:**

```javascript
findPrimByPath(hierarchy: Array<Object>, path: string): Object|null
```

**Parameters:**

- `hierarchy` (Array): Array of root-level prims with nested children
- `path` (string): The prim path to find (e.g., "/World/Character")

**Returns:**

- `Object|null`: The prim object if found, `null` otherwise

**Example:**

```javascript
const hierarchy = [
  {
    path: "/World",
    type: "Xform",
    children: [{ path: "/World/Character", type: "Xform", children: [] }],
  },
];

const prim = primService.findPrimByPath(hierarchy, "/World/Character");
console.log(prim); // { path: "/World/Character", type: "Xform", ... }

const notFound = primService.findPrimByPath(hierarchy, "/NotFound");
console.log(notFound); // null
```

---

### `primService.getDescendants(prim)`

Gets all descendant prims (recursive).

**Signature:**

```javascript
getDescendants(prim: Object): Array<Object>
```

**Parameters:**

- `prim` (Object): The parent prim

**Returns:**

- `Array<Object>`: All descendant prims (children, grandchildren, etc.)

**Example:**

```javascript
const descendants = primService.getDescendants(parentPrim);
console.log(`Found ${descendants.length} descendants`);
```

---

### `primService.getPrimDepth(path)`

Gets the depth of a prim in the hierarchy.

**Signature:**

```javascript
getPrimDepth(path: string): number
```

**Parameters:**

- `path` (string): The prim path

**Returns:**

- `number`: Depth (0 for root "/", 1 for "/World", 2 for "/World/Character", etc.)

**Throws:**

- `ValidationError`: If path is invalid

**Example:**

```javascript
primService.getPrimDepth("/"); // 0
primService.getPrimDepth("/World"); // 1
primService.getPrimDepth("/World/Character"); // 2
primService.getPrimDepth("/World/Character/Mesh"); // 3
```

---

### `primService.isAncestor(ancestorPath, descendantPath)`

Checks if one path is an ancestor of another.

**Signature:**

```javascript
isAncestor(ancestorPath: string, descendantPath: string): boolean
```

**Parameters:**

- `ancestorPath` (string): Potential ancestor path
- `descendantPath` (string): Potential descendant path

**Returns:**

- `boolean`: `true` if ancestorPath is an ancestor of descendantPath

**Example:**

```javascript
primService.isAncestor("/World", "/World/Character"); // true
primService.isAncestor("/World", "/World"); // false (same path)
primService.isAncestor("/World/Character", "/World"); // false (reversed)
```

---

### `primService.buildPrimMap(hierarchy)`

Builds a map for fast O(1) prim lookup by path.

**Signature:**

```javascript
buildPrimMap(hierarchy: Array<Object>): Map<string, Object>
```

**Parameters:**

- `hierarchy` (Array): Array of root-level prims with nested children

**Returns:**

- `Map<string, Object>`: Map of prim paths to prim objects

**Example:**

```javascript
const primMap = primService.buildPrimMap(hierarchy);

// Fast O(1) lookup
const prim = primMap.get("/World/Character");
console.log(prim); // { path: "/World/Character", ... }

// Check if prim exists
if (primMap.has("/World/Building")) {
  console.log("Building exists");
}
```

---

### `primService.getDisplayName(prim)`

Gets display name for prim (falls back to path name if no display name set).

**Signature:**

```javascript
getDisplayName(prim: Object): string
```

**Parameters:**

- `prim` (Object): The prim

**Returns:**

- `string`: Display name or prim name from path

**Example:**

```javascript
const prim = {
  path: "/World/Character",
  properties: { displayName: "Hero Character" },
};

primService.getDisplayName(prim); // "Hero Character"

const primWithoutName = { path: "/World/Character", properties: {} };
primService.getDisplayName(primWithoutName); // "Character"
```

---

### `primService.setDisplayName(prim, displayName)`

Sets display name for prim.

**Signature:**

```javascript
setDisplayName(prim: Object, displayName: string): Object
```

**Parameters:**

- `prim` (Object): The prim
- `displayName` (string): The display name to set

**Returns:**

- `Object`: New prim with updated display name

**Example:**

```javascript
const updated = primService.setDisplayName(prim, "Main Building");
console.log(updated.properties.displayName); // "Main Building"
```

---

### `primService.clonePrim(prim, newPath)`

Deep clones a prim with a new path.

**Signature:**

```javascript
clonePrim(prim: Object, newPath: string): Object
```

**Parameters:**

- `prim` (Object): The prim to clone
- `newPath` (string): New path for the cloned prim

**Returns:**

- `Object`: Cloned prim with new path and updated timestamps

**Throws:**

- `ValidationError`: If newPath is invalid

**Example:**

```javascript
const cloned = primService.clonePrim(originalPrim, "/World/Character_Copy");
console.log(cloned.path); // "/World/Character_Copy"
console.log(cloned !== originalPrim); // true (deep copy)
```

---

### `primService.mergePrims(basePrim, overridePrim)`

Merges prim properties for layer composition.

**Signature:**

```javascript
mergePrims(basePrim: Object, overridePrim: Object): Object
```

**Parameters:**

- `basePrim` (Object): The base prim (lower layer)
- `overridePrim` (Object): The override prim (higher layer)

**Returns:**

- `Object`: Merged prim with combined properties (override takes precedence)

**Example:**

```javascript
const base = {
  path: "/World/Wall",
  properties: { status: "WIP", displayColor: [1, 1, 1] },
};

const override = {
  path: "/World/Wall",
  properties: { status: "Shared", displayName: "Main Wall" },
};

const merged = primService.mergePrims(base, override);
/*
Returns:
{
  path: "/World/Wall",
  properties: {
    status: "Shared",        // From override
    displayColor: [1, 1, 1], // From base
    displayName: "Main Wall" // From override
  }
}
*/
```

---

### `primService.filterPrimsByType(hierarchy, type)`

Filters prims by type (recursive).

**Signature:**

```javascript
filterPrimsByType(hierarchy: Array<Object>, type: string): Array<Object>
```

**Parameters:**

- `hierarchy` (Array): Array of root-level prims
- `type` (string): Type to filter by (e.g., "Mesh", "Xform")

**Returns:**

- `Array<Object>`: All prims matching the type

**Example:**

```javascript
const meshes = primService.filterPrimsByType(hierarchy, "Mesh");
console.log(`Found ${meshes.length} meshes`);
```

---

### `primService.countPrims(hierarchy)`

Counts total prims in hierarchy (recursive).

**Signature:**

```javascript
countPrims(hierarchy: Array<Object>): number
```

**Parameters:**

- `hierarchy` (Array): Array of root-level prims

**Returns:**

- `number`: Total prim count

**Example:**

```javascript
const count = primService.countPrims(hierarchy);
console.log(`Total prims: ${count}`);
```

---

## Service Registry

**Import:**

```javascript
import { services } from "./core/index.js";
```

The service registry provides dependency injection for services.

### `services.init()`

Initializes all services (async).

**Signature:**

```javascript
async init(): Promise<Object>
```

**Returns:**

- `Promise<Object>`: The services registry

**Example:**

```javascript
await services.init();
console.log("Services initialized");
```

### `services.get(name)`

Gets a service by name.

**Signature:**

```javascript
get(name: string): Object
```

**Parameters:**

- `name` (string): Service name ("layer", "prim")

**Returns:**

- `Object`: The service instance

**Throws:**

- `Error`: If service not found

**Example:**

```javascript
const layer = services.get("layer"); // layerService
const prim = services.get("prim"); // primService
```

---

## Integration with State

Services work with state management for complete workflows.

**Example: Add Layer Workflow**

```javascript
import { store, actions } from "./core/index.js";
import { layerService } from "./core/services/index.js";

// Create layer using service
const layer = layerService.createLayer("scene.usda", "WIP");

// Validate layer stack
const currentStack = store.getState().stage.layerStack;
layerService.validateLayerStack([...currentStack, layer]);

// Dispatch to state
store.dispatch(actions.addLayer(layer));
```

**Example: Update Prim Properties**

```javascript
import { store, actions } from "./core/index.js";
import { primService } from "./core/services/index.js";

// Get current hierarchy
const hierarchy = store.getState().composedHierarchy;

// Find prim
const prim = primService.findPrimByPath(hierarchy, "/World/Wall");

// Update prim using service
const updated = primService.updatePrimProperties(prim, {
  status: "Shared",
  displayColor: [0, 0, 1],
});

// Dispatch to state
store.dispatch(
  actions.updatePrim("/World/Wall", {
    properties: updated.properties,
  })
);
```

---

## Error Handling

Services throw `ValidationError` for invalid inputs.

**Import:**

```javascript
import { ValidationError } from "./core/errors/errors.js";
```

**Example:**

```javascript
import { layerService } from "./core/index.js";
import { ValidationError } from "./core/errors/errors.js";

try {
  const layer = layerService.createLayer("", "WIP"); // Invalid: empty path
} catch (error) {
  if (error instanceof ValidationError) {
    console.error("Validation failed:", error.message);
    console.error("Field:", error.field);
    console.error("Value:", error.value);
  }
}
```

---

## Examples

### Example 1: Layer Promotion Workflow

```javascript
import { layerService } from "./core/index.js";

function promoteSelectedLayers(selectedLayers) {
  // Check if layers can be promoted
  const promotable = layerService.getPromotableLayersFor(
    selectedLayers,
    "Shared"
  );

  if (promotable.length === 0) {
    console.error("No layers can be promoted to Shared");
    return;
  }

  // Promote each layer
  const promoted = promotable.map((layer) => layerService.promoteLayer(layer));

  // Update state (via store.dispatch)
  promoted.forEach((layer) => {
    store.dispatch(actions.updateLayer(layer.id, { status: layer.status }));
  });

  console.log(`Promoted ${promoted.length} layers to Shared`);
}
```

### Example 2: Find and Update Prim

```javascript
import { primService } from "./core/index.js";

function updatePrimStatus(hierarchy, primPath, newStatus) {
  // Find prim
  const prim = primService.findPrimByPath(hierarchy, primPath);

  if (!prim) {
    console.error("Prim not found:", primPath);
    return null;
  }

  // Update properties
  const updated = primService.updatePrimProperties(prim, {
    status: newStatus,
  });

  return updated;
}

// Usage
const updatedPrim = updatePrimStatus(hierarchy, "/World/Wall", "Shared");
```

### Example 3: Build Prim Map for Fast Lookup

```javascript
import { primService } from "./core/index.js";

// Build map once
const primMap = primService.buildPrimMap(hierarchy);

// Fast lookups
const wall = primMap.get("/World/Building/Wall");
const floor = primMap.get("/World/Building/Floor");
const ceiling = primMap.get("/World/Building/Ceiling");

// Check existence
if (primMap.has("/World/NewFeature")) {
  console.log("Feature already exists");
}
```

---

## Testing Services

Services are pure and easy to test.

**Example: Testing LayerService**

```javascript
import { describe, it, expect } from "vitest";
import { layerService } from "../../src/core/services/LayerService.js";

describe("LayerService", () => {
  it("should create layer with default status", () => {
    const layer = layerService.createLayer("test.usda");

    expect(layer.filePath).toBe("test.usda");
    expect(layer.status).toBe("WIP");
    expect(layer.visible).toBe(true);
  });

  it("should promote layer from WIP to Shared", () => {
    const layer = { id: "1", status: "WIP", filePath: "test.usda" };
    const promoted = layerService.promoteLayer(layer);

    expect(promoted.status).toBe("Shared");
  });
});
```

---

## Best Practices

### 1. Use Services for Business Logic

```javascript
// ❌ Bad - Business logic in component
function addLayer(filePath) {
  const layer = {
    id: `layer-${Date.now()}`,
    filePath,
    status: "WIP",
    // ... more logic
  };
  store.dispatch(actions.addLayer(layer));
}

// ✅ Good - Use service
function addLayer(filePath) {
  const layer = layerService.createLayer(filePath, "WIP");
  store.dispatch(actions.addLayer(layer));
}
```

### 2. Don't Mutate Service Results

```javascript
// ❌ Bad - Mutating service result
const layer = layerService.createLayer("test.usda");
layer.status = "Shared"; // Mutation!

// ✅ Good - Use service method
const updated = layerService.updateLayer(layer, { status: "Shared" });
```

### 3. Handle Validation Errors

```javascript
// ✅ Good - Handle errors
try {
  primService.validatePrimPath(userInput);
} catch (error) {
  showErrorToUser(error.message);
}
```

### 4. Use Type Constants

```javascript
import { LAYER_STATUS } from "./constants.js";

// ✅ Good - Use constants
const layer = layerService.createLayer("test.usda", LAYER_STATUS.WIP);

// ❌ Bad - Hardcoded strings
const layer = layerService.createLayer("test.usda", "WIP");
```

---

## Related Documentation

- [STATE_API.md](./STATE_API.md) - State management integration
- [DEVELOPER_ONBOARDING.md](../guides/DEVELOPER_ONBOARDING.md) - Understanding services in context
- [TESTING_GUIDE.md](../guides/TESTING_GUIDE.md) - Testing services

---

**Last Updated:** February 15, 2026
