# Layer Workflow Deep Dive

**Last Updated:** February 15, 2026

This document provides an in-depth explanation of USDA Composer's layer workflow system, inspired by the ISO 19650 standard for collaborative design and construction.

---

## Table of Contents

1. [Overview](#overview)
2. [ISO 19650 Background](#iso-19650-background)
3. [Layer Status Lifecycle](#layer-status-lifecycle)
4. [Status Definitions](#status-definitions)
5. [Promotion Workflow](#promotion-workflow)
6. [Demotion Workflow](#demotion-workflow)
7. [Batch Promotion](#batch-promotion)
8. [Role-Based Permissions](#role-based-permissions)
9. [Status-Based Rendering](#status-based-rendering)
10. [Conflict Detection During Promotion](#conflict-detection-during-promotion)
11. [Implementation Details](#implementation-details)
12. [Best Practices](#best-practices)
13. [Examples](#examples)

---

## Overview

USDA Composer implements a **layer maturity workflow** that mirrors professional design and construction workflows. Each layer progresses through defined stages, ensuring proper review, approval, and archival.

### Key Principles

- **Structured Progression**: Layers move through predictable stages
- **Non-Destructive**: Base layers remain unchanged
- **Audit Trail**: Every status change is logged
- **Role-Based Control**: Different users have different permissions
- **Visual Indicators**: Status affects rendering colors

---

## ISO 19650 Background

### What is ISO 19650?

**ISO 19650** is an international standard for managing information throughout the lifecycle of a built asset using Building Information Modeling (BIM). It defines:

- **Information states** (WIP, Shared, Published, Archived)
- **Collaboration workflows** between project stakeholders
- **Information delivery processes** with clear handoffs
- **Quality gates** at each stage transition

### Why ISO 19650 for USD?

USD (Universal Scene Description) is increasingly used in architecture, construction, and infrastructure projects. Applying ISO 19650 principles to USD layers provides:

- **Industry alignment**: Familiar workflow for AEC professionals
- **Quality control**: Clear approval gates before information sharing
- **Traceability**: Complete audit trail of layer maturity
- **Collaboration**: Structured multi-user workflows

---

## Layer Status Lifecycle

### Status Flow Diagram

```
┌─────┐  Promote  ┌────────┐  Promote  ┌───────────┐  Promote  ┌──────────┐
│ WIP │ ────────> │ Shared │ ────────> │ Published │ ────────> │ Archived │
└─────┘           └────────┘           └───────────┘           └──────────┘
   ▲                 │                      │                        │
   │                 │                      │                        │
   └─────────────────┴──────────────────────┴────────────────────────┘
              Demote              Demote              Demote
```

### Status Progression

| Current Status | Promote To           | Demote To       |
| -------------- | -------------------- | --------------- |
| WIP            | Shared               | WIP (no change) |
| Shared         | Published            | WIP             |
| Published      | Archived             | Shared          |
| Archived       | Archived (no change) | Published       |

---

## Status Definitions

### WIP (Work in Progress)

**Purpose**: Active development layer

**Characteristics:**

- **Color**: Orange (0xffa500)
- **Visibility**: Shown in 3D viewport
- **Editable**: Fully editable by owner
- **Composition**: Included in layer stack composition
- **Use Cases**:
  - Initial design exploration
  - Ongoing development
  - Private work not yet ready for team review

**Permissions:**

- **Owner**: Full edit rights
- **Others**: Read-only (cannot edit)

**Typical Duration**: Hours to days

---

### Shared

**Purpose**: Ready for team review and collaboration

**Characteristics:**

- **Color**: Blue (0x007aff)
- **Visibility**: Shown with blue tint when colorization enabled
- **Editable**: Limited (owner + approved collaborators)
- **Composition**: Included in composition
- **Use Cases**:
  - Peer review
  - Coordination with other disciplines
  - Feedback collection
  - Quality checking

**Permissions:**

- **Owner**: Can edit
- **Project Manager**: Can override properties
- **Others**: Read-only

**Typical Duration**: Days to weeks

---

### Published

**Purpose**: Approved, finalized, and authorized for use

**Characteristics:**

- **Color**: Green (0x28a745)
- **Visibility**: Shown with green tint when colorization enabled
- **Editable**: Immutable (should not be edited)
- **Composition**: Primary reference layer
- **Use Cases**:
  - Approved designs
  - Deliverables to client
  - Basis for dependent work
  - Reference for downstream processes

**Permissions:**

- **All Users**: Read-only
- **Project Manager**: Can demote if needed (reverses approval)

**Typical Duration**: Weeks to months (or permanent)

---

### Archived

**Purpose**: Historical record, no longer active

**Characteristics:**

- **Color**: Gray (0x808080)
- **Visibility**: Hidden by default, shown if toggled
- **Editable**: Immutable (read-only)
- **Composition**: Excluded from composition (unless explicitly included)
- **Use Cases**:
  - Superseded designs
  - Historical record
  - Audit trail
  - Deprecated layers

**Permissions:**

- **All Users**: Read-only
- **Project Manager**: Can demote to Published if restoration needed

**Typical Duration**: Indefinite (permanent archive)

---

## Promotion Workflow

### Manual Promotion

Users can manually promote layers through the UI.

**Steps:**

1. **Select Layer(s)** in Layer Stack panel
2. **Click "Promote"** button
3. **Review Promotion Summary**:
   - Current status → New status
   - Affected prims count
   - Potential conflicts (if any)
4. **Confirm or Cancel**
5. **Layer Status Updates** with timestamp

**Example:**

```javascript
import { layerService } from "./core/services/index.js";

const layer = { id: "layer-1", status: "WIP", filePath: "scene.usda" };
const promoted = layerService.promoteLayer(layer);
console.log(promoted.status); // "Shared"
```

### Automatic Promotion (Future Enhancement)

Potential triggers for automatic promotion:

- **Time-based**: Auto-promote after N days in WIP
- **Review-based**: Auto-promote after peer approval
- **Test-based**: Auto-promote if validation tests pass
- **CI/CD**: Integration with build pipelines

---

## Demotion Workflow

Demotion reverses a layer's status progression, used when:

- **Rework Needed**: Published layer requires changes
- **Error Discovered**: Need to revert to editable state
- **Premature Promotion**: Layer was promoted too early
- **Re-Review**: Shared layer needs more work

**Steps:**

1. **Select Layer** in Layer Stack panel
2. **Click "Demote"** button
3. **Confirm Demotion** (warns about consequences)
4. **Layer Status Reverts** to previous stage

**Example:**

```javascript
const sharedLayer = { id: "layer-1", status: "Shared", filePath: "scene.usda" };
const demoted = layerService.demoteLayer(sharedLayer);
console.log(demoted.status); // "WIP"
```

**Caution**: Demoting Published layers may break dependent work if others are referencing it.

---

## Batch Promotion

Promote multiple layers simultaneously, often with merging.

### Single-Status Batch

Promote multiple layers with the same current status.

**Example:**

```javascript
// Promote all WIP layers to Shared
const wipLayers = layerStack.filter((l) => l.status === "WIP");
const promoted = wipLayers.map((l) => layerService.promoteLayer(l));
```

### Merge-and-Promote

Merge multiple layers and promote the result.

**Use Case**: Combine multiple WIP layers into a single Shared layer.

**Steps:**

1. **Select Multiple Layers** (same status)
2. **Click "Batch Promote"**
3. **System Merges Layers** using USD composition rules
4. **Creates New Layer** at target status
5. **Optionally Removes** source layers

**Example:**

```javascript
// Merge WIP layers into a single Shared layer
import { usdaMerger } from "./viewer/usda/usdaMerger.js";

const wipLayers = layerStack.filter((l) => l.status === "WIP");
const mergedContent = usdaMerger.mergeLayers(wipLayers);

const mergedLayer = layerService.createLayer("merged-shared.usda", "Shared");
mergedLayer.content = mergedContent;
```

---

## Role-Based Permissions

Different user roles have different promotion permissions.

### Permission Matrix

| Role                    | Promote to Shared | Promote to Published | Promote to Archived | Demote Any | Override Conflicts |
| ----------------------- | ----------------- | -------------------- | ------------------- | ---------- | ------------------ |
| **Architect**           | ✅ Own Layers     | ❌                   | ❌                  | ❌         | Own Properties     |
| **Structural Engineer** | ✅ Own Layers     | ❌                   | ❌                  | ❌         | Own Properties     |
| **Project Manager**     | ✅ All Layers     | ✅ All Layers        | ✅ All Layers       | ✅ All     | ✅ All Properties  |
| **Field Person**        | ❌                | ❌                   | ❌                  | ❌         | ❌                 |

### Permission Checks

**Example Implementation:**

```javascript
import { USER_ROLES } from "./constants.js";

function canPromote(user, layer, targetStatus) {
  const currentUser = store.getState().currentUser;

  // Project Manager can promote anything
  if (currentUser === USER_ROLES.PROJECT_MANAGER) {
    return true;
  }

  // To Published requires Project Manager
  if (targetStatus === "Published") {
    return false;
  }

  // To Shared: owner or Project Manager
  if (targetStatus === "Shared") {
    return (
      layer.owner === currentUser || currentUser === USER_ROLES.PROJECT_MANAGER
    );
  }

  return false;
}
```

---

## Status-Based Rendering

### Color Coding

When **"Colorize by Status"** is enabled:

```javascript
// src/utils/statusUtils.js
export const STATUS_COLORS = {
  WIP: 0xffa500, // Orange
  Shared: 0x007aff, // Blue
  Published: 0x28a745, // Green
  Archived: 0x808080, // Gray
};
```

**Rendering Logic:**

```javascript
import { resolvePrimStatus } from "./utils/statusUtils.js";

function renderPrim(prim, colorizeByStatus) {
  if (colorizeByStatus) {
    const status = resolvePrimStatus(prim);
    const color = STATUS_COLORS[status];
    material.color.set(color);
  } else {
    // Use prim's actual displayColor
    material.color.set(prim.properties.displayColor);
  }
}
```

### Status Resolution

Prims inherit status from their layer unless explicitly overridden.

**Priority:**

1. **Prim-level status** (`prim.properties.status`) - Highest priority
2. **Layer status** (`prim._sourceLayerStatus`) - Fallback
3. **Default** ("Published") - Final fallback

**Example:**

```javascript
// Prim from WIP layer with explicit status
const prim = {
  path: "/Wall",
  _sourceLayerStatus: "WIP",
  properties: {
    status: "Shared", // Explicit override
  },
};

const status = resolvePrimStatus(prim); // Returns: "Shared"
```

---

## Conflict Detection During Promotion

### What are Conflicts?

When promoting layers, conflicts occur if multiple layers modify the same property on the same prim.

**Example Conflict:**

- **Base Layer** (Published): Wall color = white
- **Layer A** (WIP): Wall color = beige
- **Layer B** (WIP): Wall color = red

Promoting both A and B to Shared creates a conflict: Which color wins?

### Conflict Resolution

**Resolution Strategies:**

1. **Manual Resolution**: User chooses which value to keep
2. **Permission-Based**: Property owner's value wins
3. **Timestamp-Based**: Most recent edit wins
4. **Layer Order**: Higher layer in stack wins

**Implementation:**

```javascript
import { detectConflicts } from "./utils/conflictDetector.js";

function promoteLayers(layers, targetStatus) {
  // Detect conflicts
  const conflicts = detectConflicts(layers);

  if (conflicts.length > 0) {
    // Show conflict resolution modal
    showConflictModal(conflicts, (resolved) => {
      // Apply resolution and promote
      applyResolutions(resolved);
      layers.forEach((l) => promoteLayer(l, targetStatus));
    });
  } else {
    // No conflicts, promote directly
    layers.forEach((l) => promoteLayer(l, targetStatus));
  }
}
```

### Avoiding Conflicts

**Best Practices:**

- **Coordinate**: Agree on ownership before editing
- **Separate Concerns**: Work in different layers/prims
- **Communicate**: Use Pset comments to indicate intent
- **Review Early**: Promote to Shared early for feedback

---

## Implementation Details

### File Location

**Layer Workflow Code:**

- Layer status management: [src/core/services/LayerService.js](../../src/core/services/LayerService.js)
- Promotion controller: [src/components/promotionController.js](../../src/components/promotionController.js)
- Status utilities: [src/utils/statusUtils.js](../../src/utils/statusUtils.js)
- Conflict detection: [src/utils/conflictDetector.js](../../src/utils/conflictDetector.js)

### State Management

Layer status is stored in the Redux-style state:

```javascript
{
  stage: {
    layerStack: [
      {
        id: "layer-1",
        name: "base.usda",
        status: "Published", // Layer status
        visible: true,
        active: true,
      },
    ];
  }
}
```

**Updating Status:**

```javascript
import { store, actions } from "./core/index.js";

store.dispatch(actions.updateLayer("layer-1", { status: "Shared" }));
```

### Filtering by Status

Users can filter visible layers by status:

```javascript
import { layerService } from "./core/services/index.js";

const wipLayers = layerService.filterLayersByStatus(layerStack, "WIP");
const sharedLayers = layerService.filterLayersByStatus(layerStack, "Shared");
const allLayers = layerService.filterLayersByStatus(layerStack, "All");
```

---

## Best Practices

### 1. Use Status Appropriately

- **WIP**: Private work, frequent changes
- **Shared**: Ready for feedback, relatively stable
- **Published**: Finalized, immutable
- **Archived**: No longer needed

### 2. Promote Incrementally

Don't skip stages. Progress through: WIP → Shared → Published

**Why?** Each stage serves a purpose:

- Shared = Review gate
- Published = Approval gate

### 3. Document Changes

Add commit messages when promoting:

```
"Promoted structural columns to Shared for team review"
```

### 4. Coordinate Promotions

Before promoting to Published, ensure:

- ✅ Peer review completed
- ✅ No conflicts with other layers
- ✅ Dependent work is aware

### 5. Use Demotion Sparingly

Demoting Published layers can break downstream work. Prefer:

- Creating a new WIP layer with changes
- Keeping Published layer as reference

### 6. Leverage Color Coding

Enable "Colorize by Status" to visually identify layer maturity in 3D viewport.

---

## Examples

### Example 1: Promote Layer from WIP to Shared

```javascript
import { store, actions } from "./core/index.js";
import { layerService } from "./core/services/index.js";

// Get layer
const layer = layerService.getLayerById(layerStack, "layer-1");

// Check current status
console.log("Current status:", layer.status); // "WIP"

// Promote
const promoted = layerService.promoteLayer(layer);

// Update state
store.dispatch(actions.updateLayer(layer.id, { status: promoted.status }));

console.log("New status:", promoted.status); // "Shared"
```

### Example 2: Batch Promote Multiple Layers

```javascript
// Get all WIP layers
const wipLayers = layerService.filterLayersByStatus(layerStack, "WIP");

console.log(`Promoting ${wipLayers.length} layers`);

// Promote each
wipLayers.forEach((layer) => {
  const promoted = layerService.promoteLayer(layer);
  store.dispatch(actions.updateLayer(layer.id, { status: promoted.status }));
});

console.log("All layers promoted to Shared");
```

### Example 3: Check Promotion Eligibility

```javascript
// Get layers eligible for promotion to Published
const publishable = layerService.getPromotableLayersFor(
  layerStack,
  "Published"
);

if (publishable.length === 0) {
  console.log("No layers ready for publication");
} else {
  console.log(`${publishable.length} layers can be promoted to Published`);
  publishable.forEach((l) => console.log("-", l.filePath));
}
```

### Example 4: Role-Based Promotion

```javascript
function attemptPromotion(layer, targetStatus) {
  const currentUser = store.getState().currentUser;

  // Check permissions
  if (
    targetStatus === "Published" &&
    currentUser !== USER_ROLES.PROJECT_MANAGER
  ) {
    alert("Only Project Managers can promote to Published");
    return;
  }

  // Promote
  const promoted = layerService.promoteLayer(layer);
  store.dispatch(actions.updateLayer(layer.id, { status: promoted.status }));
}
```

---

## Related Documentation

- [USER_GUIDE.md](../guides/USER_GUIDE.md) - User-facing layer workflow guide
- [SERVICES_API.md](../api/SERVICES_API.md) - LayerService API reference
- [STATE_API.md](../api/STATE_API.md) - Layer state management
- [ARCHITECTURE.md](../../ARCHITECTURE.md) - Overall system architecture

---

**Last Updated:** February 15, 2026
