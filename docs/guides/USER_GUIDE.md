# USDA Composer - User Guide

**Last Updated:** February 15, 2026

---

## Table of Contents

1. [What is USDA Composer?](#what-is-usda-composer)
2. [Who is This For?](#who-is-this-for)
3. [Getting Started](#getting-started)
4. [Understanding the Interface](#understanding-the-interface)
5. [Working with Layers](#working-with-layers)
6. [The Staging Area](#the-staging-area)
7. [Making and Committing Changes](#making-and-committing-changes)
8. [Timeline and Project History](#timeline-and-project-history)
9. [Layer Status and Promotion](#layer-status-and-promotion)
10. [Working with Properties](#working-with-properties)
11. [Prim Renaming and Display Names](#prim-renaming-and-display-names)
12. [Entity Staging (Placeholders)](#entity-staging-placeholders)
13. [Conflict Detection and Resolution](#conflict-detection-and-resolution)
14. [Multi-User Collaboration](#multi-user-collaboration)
15. [Exporting Your Work](#exporting-your-work)
16. [Keyboard Shortcuts](#keyboard-shortcuts)
17. [Tips and Best Practices](#tips-and-best-practices)

---

## What is USDA Composer?

**USDA Composer** is a professional, web-based tool for viewing, editing, and composing **Universal Scene Description (USD/USDA)** files. It provides an interactive 3D viewport alongside a code editor, enabling both visual inspection and direct manipulation of scene layers through a non-destructive workflow inspired by VFX pipelines and the ISO 19650 standard.

### Key Features

- **Layer-Based Composition**: Load multiple `.usda` files as composable layers that stack and merge together
- **Non-Destructive Editing**: Changes are staged and committed rather than applied destructively, preserving base layers (similar to Git)
- **Complete Audit Trail**: Every change is recorded in an immutable history log with timeline visualization
- **Professional Workflow**: Layers progress through maturity states (WIP → Shared → Published → Archived)
- **Conflict Detection**: Automatic detection and resolution of property conflicts between layers
- **Multi-User Support**: Role-based collaboration with permission management
- **Dual Viewing Modes**: Interactive 3D view (Three.js) + live code editor

---

## Who is This For?

USDA Composer is designed for professionals working with USD files in collaborative environments:

- **VFX Artists**: Composing and layering 3D scenes for visual effects pipelines
- **Architects**: Managing BIM models following ISO 19650 standards
- **3D Designers**: Creating and editing USD scene descriptions
- **Technical Directors**: Setting up USD pipelines and workflows
- **Project Managers**: Overseeing collaborative 3D design projects
- **Structural Engineers**: Contributing specialized layers to building models
- **Anyone Working with USD**: Viewing, editing, and understanding USD file structures

---

## Getting Started

### Opening USDA Composer

1. Open USDA Composer in your web browser
2. The application is fully client-side and requires no server
3. You'll see the main interface with:
   - **3D Viewport** (center): Interactive scene visualization
   - **Layer Stack Panel** (left): List of loaded layers
   - **Hierarchy Panel** (left): Tree view of scene objects (prims)
   - **Properties Panel** (right): Selected prim properties
   - **Timeline** (bottom): Project history visualization

### Loading Your First File

1. Click the **"Load File"** button in the Layer Stack panel
2. Select a `.usda` file from your computer
3. The file will appear in the layer stack and render in the 3D viewport
4. You can load multiple files - they will stack as layers

### Understanding Layers

In USDA Composer, **layers** are individual `.usda` files that compose together:

- **Base Layers** provide the foundation (bottom of the stack)
- **Override Layers** modify or add to base layers (top of the stack)
- **Composition** happens automatically - upper layers override lower layers
- Each layer can have a status: WIP, Shared, Published, or Archived

---

## Understanding the Interface

### Main Areas

#### 1. Layer Stack Panel (Left Sidebar)

Displays all loaded layers with:

- **Layer name** and status indicator (color-coded)
- **Visibility toggle** (eye icon): Show/hide layer in viewport
- **Active toggle**: Include layer in composition
- **Status filter**: Filter layers by status (All, WIP, Shared, Published, Archived)
- **Promote/Demote buttons**: Change layer status

#### 2. Hierarchy Panel (Left Sidebar)

Tree view of all prims (scene objects) in your composed scene:

- **Expandable tree**: Click arrows to expand/collapse
- **Selection**: Click prims to select them in 3D viewport
- **Icons**: Visual indicators for prim types (Xform, Mesh, Scope, etc.)
- **Path display**: Shows full USD path (e.g., `/World/Building/Wall`)

#### 3. 3D Viewport (Center)

Interactive Three.js scene visualization:

- **Orbit**: Left-click and drag to rotate camera
- **Pan**: Right-click and drag to pan camera
- **Zoom**: Scroll wheel to zoom in/out
- **Select**: Click objects to select them
- **Color Coding** (when enabled):
  - Orange: WIP status objects
  - Blue: Shared status objects
  - Green: Published status objects
  - Gray: Archived status objects

#### 4. Properties Panel (Right Sidebar)

Shows properties of the selected prim:

- **Type**: Prim type (Mesh, Xform, Scope, etc.)
- **Path**: Full USD path
- **Display Name**: User-friendly name
- **Status**: Current status
- **Custom Attributes**: Pset properties (comments, metadata)
- **Edit button**: Modify properties

#### 5. Timeline (Bottom)

Visual history of all commits and changes:

- **Commit nodes**: Each node represents a commit
- **Timeline slider**: Scrub through history
- **Commit messages**: Hover to see details
- **Historical reconstruction**: Click any commit to see project state at that point in time

---

## Working with Layers

### Adding Layers

1. Click **"Add Layer"** in the Layer Stack panel
2. Choose a `.usda` file
3. The layer appears at the top of the stack
4. New layers default to "WIP" status

### Layer Visibility

- **Eye icon**: Toggle layer visibility in the 3D viewport
- Hidden layers still participate in composition
- Use visibility to inspect individual layers or combinations

### Layer Ordering

- Layers compose **bottom-to-top**
- Upper layers override properties in lower layers
- Drag layers to reorder (if reordering is enabled)

### Layer Status

Each layer has a status indicating its maturity:

- **WIP** (Work in Progress): Active development, orange color
- **Shared**: Shared with team for review, blue color
- **Published**: Approved and finalized, green color
- **Archived**: Historical or deprecated, gray color

Status affects:

- Visibility in filters
- Rendering color (when color-coding is enabled)
- Permissions (who can edit)

### Removing Layers

1. Select the layer in the Layer Stack panel
2. Click **"Remove Layer"** button
3. Confirm the removal
4. Layer is unloaded but not deleted from disk

---

## The Staging Area

The **staging area** is a non-destructive workspace where changes accumulate before being committed. This is similar to Git's staging area.

### Why Use Staging?

- **Review before committing**: See all changes before making them permanent
- **Group related changes**: Batch multiple edits into a single logical commit
- **Non-destructive**: Original files remain untouched until you commit
- **Undo-friendly**: Discard staged changes without affecting committed work

### Viewing the Staging Area

1. Click **"Staging"** button to open the staging modal
2. You'll see two lists:
   - **Staged Prims**: Changes ready to commit
   - **Available Prims**: Prims you can stage

### How Staging Works

When you make changes (rename, add properties, select prims), they're staged automatically or manually:

1. **Select prims** in the 3D viewport or hierarchy
2. Click **"Stage Selected"** to add them to staging area
3. Review staged changes in the Staging modal
4. **Commit** when ready or **Discard** to undo

---

## Making and Committing Changes

### Workflow Overview

```
Make Edits → Stage Changes → Review → Commit with Message → History Log
```

### Types of Changes

1. **Prim Selection**: Staging individual prims for inclusion in a layer
2. **Property Edits**: Modifying attributes (status, display name, custom properties)
3. **Renaming**: Assigning display names to prims
4. **Entity Placeholders**: Creating lightweight volume placeholders

### Committing Changes

1. **Open Staging Area**: Click "Staging" button
2. **Review staged prims**: Verify all changes are correct
3. **Write commit message**: Describe what you changed and why
   - Be descriptive: "Add structural columns to building foundation"
   - Not: "Updated stuff"
4. **Click "Commit"**: Changes are written to the active WIP layer
5. **Timeline updates**: Your commit appears in the history timeline

### Commit Best Practices

- **Commit frequently**: Small, focused commits are easier to track
- **Descriptive messages**: Future you will thank present you
- **Logical grouping**: Combine related changes in one commit
- **Review before committing**: Check staged prims carefully

### Understanding `over` and `def`

USD uses two keywords for prims:

- **`def` (definition)**: Defines a new prim (creates it)
- **`over` (override)**: Overrides an existing prim (modifies it)

When you commit changes, USDA Composer automatically:

- Uses `over` for prims that exist in lower layers (non-destructive override)
- Uses `def` for completely new prims
- Preserves the base layer unchanged

---

## Timeline and Project History

### The Statement Log

Every action is recorded in **`statement.usda`**, an immutable audit log containing:

- **Commit ID**: Unique identifier
- **Timestamp**: When the change was made
- **User**: Who made the change
- **Message**: Commit description
- **Staged Prims**: List of affected prims
- **Content Hash**: SHA256 hash for verification

### Using the Timeline

The timeline provides a visual history of your project:

1. **Timeline Nodes**: Each circle represents a commit
2. **Hover for Details**: See commit message, user, and timestamp
3. **Click to View**: Reconstruct the project state at that commit
4. **Scrub Through History**: Slide through time to see evolution

### Historical Reconstruction

When you click a historical commit:

1. The 3D viewport shows the scene **at that point in time**
2. The hierarchy reflects the historical state
3. **Path translation** handles renamed prims correctly
4. **Isolated view**: Shows only that commit's changes (not full accumulation)

### Exiting History Mode

- Click **"Back to Present"** button
- Or click the latest commit in the timeline
- The scene returns to the current state

---

## Layer Status and Promotion

### ISO 19650 Workflow

USDA Composer follows ISO 19650 principles for collaborative design:

**WIP → Shared → Published → Archived**

### Status Meanings

- **WIP (Work in Progress)**:
  - Active development
  - Not yet ready for team review
  - Can be modified freely

- **Shared**:
  - Ready for team review
  - Shared with collaborators
  - Should be relatively stable

- **Published**:
  - Approved and finalized
  - Used as reference by others
  - Should not be modified (immutable)

- **Archived**:
  - Historical or deprecated
  - No longer active in the project
  - Kept for record-keeping

### Promoting Layers

1. **Select layer(s)** in the Layer Stack panel
2. Click **"Promote"** button
3. Review the promotion summary:
   - Current status → New status
   - Affected prims count
   - Conflicts (if any)
4. **Confirm promotion**
5. Layer status updates and color changes (if color-coding enabled)

### Batch Promotion

You can promote multiple layers at once:

1. **Select multiple layers** (Ctrl+Click or Shift+Click)
2. Click **"Promote Selected"**
3. Layers merge and promote together
4. Creates a new flattened layer at the target status

### Demotion

You can also demote layers (move backward in status):

1. Select the layer
2. Click **"Demote"** button
3. Confirm demotion
4. Status moves backward (e.g., Shared → WIP)

### Permissions

Promotion permissions depend on your user role:

- **Architects**: Can promote their own layers to Shared
- **Project Managers**: Can promote any layer to any status
- **Structural Engineers**: Can promote to Shared
- **Field Person**: Limited promotion rights

---

## Working with Properties

### Viewing Properties

1. **Select a prim** in the 3D viewport or hierarchy
2. **Properties panel** shows all attributes:
   - Type, path, display name
   - USD properties (color, opacity, status)
   - Custom Pset properties (metadata)

### Editing Properties

1. **Click "Edit Properties"** in the Properties panel
2. **Modify values**:
   - **Status**: Change prim status (WIP, Shared, Published, Archived)
   - **Display Name**: Assign a user-friendly name
   - **Custom Attributes**: Add Pset properties (e.g., comments, tags)
3. **Save changes**: Properties update immediately
4. **Stage and commit**: Changes are staged for the next commit

### Custom Pset Properties

Pset (Property Set) attributes add metadata to prims:

- **Pset_ActionRequest:Comments**: Add notes or instructions
- **Pset_ActionRequest:AssignedTo**: Assign tasks to team members
- **Pset_ActionRequest:DueDate**: Set deadlines
- **Custom Psets**: Define your own property namespaces

**Adding a Pset Property:**

1. Select a prim
2. Click "Edit Properties"
3. Click "Add Custom Property"
4. Enter property name (e.g., `Pset_ActionRequest:Comments`)
5. Enter value (e.g., "This wall needs structural review")
6. Save

---

## Prim Renaming and Display Names

### Why Rename?

USD prims have paths like `/World/Building_1/Floor_2/Wall_35`, which are:

- Hard to read
- Not user-friendly
- Difficult to remember

**Display names** provide:

- Human-readable labels: "Main Entrance Wall"
- Non-destructive renaming (original path preserved)
- Better organization and communication

### Renaming a Prim

1. **Select the prim** you want to rename
2. Click **"Rename"** button in the Properties panel
3. **Enter display name**: "Building Foundation" (user-friendly)
4. **Original path preserved**: `/World/Xform_1` (for USD references)
5. **Display name shows** in hierarchy and UI

### Display Name vs. Path

- **Display Name** (`primvars:displayName`): What you see in the UI
- **Path**: Original USD path used for references and composition
- **Path Translation Registry**: Tracks all renames for historical accuracy

### Renaming Best Practices

- Use descriptive names: "North Wing Column A3"
- Be consistent: Follow a naming convention
- Don't rename too frequently: Breaks historical references if overdone
- Include context: "Level 2 - Entrance Lobby"

---

## Entity Staging (Placeholders)

### What are Entity Placeholders?

**Entity placeholders** are lightweight, transparent volume representations that act as:

- **Visual markers**: Show where real geometry will be
- **Deferred loading**: Reference heavy geometry without loading it immediately
- **Spatial planning**: Arrange layouts before final geometry is ready
- **Performance optimization**: Reduce viewport complexity

### Creating a Placeholder

1. **Enter Entity Mode**: Toggle "Entity Mode" checkbox
2. **Select prims** you want to stage as placeholders
3. **Click "Stage Selected"**
4. **Placeholders appear**: Light green (0.56, 0.93, 0.56), 90% transparent
5. **Reference created**: Points to source file for future loading

### Placeholder Properties

- **Color**: Light green `[(0.56, 0.93, 0.56)]`
- **Opacity**: 0.1 (90% transparent)
- **Entity Type**: `"placeholder"` (custom attribute)
- **Reference**: `@sourceFile.usda@</path>` (points to real geometry)

### Upgrading Placeholders to Real Elements

1. **Disable Entity Mode**
2. **Re-stage the same prim** as a real element
3. **Placeholder is replaced** with full geometry
4. **Color and opacity** update to real values
5. **Commit** the upgrade

### Collision Handling

When staging:

- **Real Elements > Placeholders**: Real elements always win
- **Placeholder + Placeholder**: Second placeholder renames with suffix (`_1`, `_2`)
- **Real Element + Placeholder**: Real element overwrites placeholder
- **Cannot downgrade**: Placeholders cannot replace real elements (blocked)

---

## Conflict Detection and Resolution

### What are Conflicts?

**Conflicts** occur when multiple layers modify the same property on the same prim:

Example:

- **Base layer**: Wall color = white
- **Layer A** (Architect): Wall color = beige
- **Layer B** (Engineer): Wall color = red

Which color should win? USDA Composer detects this conflict and asks you to resolve it.

### Conflict Detection

Conflicts are automatically detected when:

- **Promoting layers**: Multiple layers modify the same property
- **Committing changes**: New changes conflict with existing layers
- **Loading layers**: Incompatible property values

### Conflict Resolution Modal

When a conflict is detected:

1. **Modal appears** showing:
   - Conflicting property name
   - Current value (what's in the base layer)
   - New value (what you're trying to apply)
   - Prim path
2. **Choose resolution**:
   - **Keep Current**: Preserve the existing value
   - **Use New**: Apply the new value (override)
3. **Permissions checked**: Only property owners and Project Managers can override

### Permission-Based Resolution

- **Property Owner**: Can always keep or override their own properties
- **Project Manager**: Can override any property (with warning)
- **Other Roles**: May be blocked from overriding others' properties

### Avoiding Conflicts

- **Coordinate with team**: Agree who modifies what
- **Use separate layers**: Different team members work in different layers
- **Communicate**: Use Pset comments to indicate ownership
- **Promote carefully**: Review conflicts before promoting

---

## Multi-User Collaboration

### User Roles

USDA Composer supports role-based collaboration:

- **Architect**: Primary design role, creates and promotes architectural layers
- **Structural Engineer**: Contributes structural layers (columns, beams, foundations)
- **Project Manager**: Oversees project, can override all permissions
- **Field Person**: Limited role for field observations and annotations

### Switching Users

1. Click **"Switch User"** button in the top toolbar
2. Select a user role from the dropdown
3. Interface updates with role-specific permissions
4. Your commits will be tagged with this user role

### Role-Based Permissions

Different roles have different capabilities:

| Action               | Architect | Engineer | Project Manager | Field Person |
| -------------------- | --------- | -------- | --------------- | ------------ |
| Load Files           | ✅        | ✅       | ✅              | ✅           |
| Edit Properties      | ✅        | ✅       | ✅              | ❌           |
| Promote to Shared    | ✅        | ✅       | ✅              | ❌           |
| Promote to Published | ❌        | ❌       | ✅              | ❌           |
| Override Conflicts   | Own Only  | Own Only | ✅ All          | ❌           |
| Archive Layers       | ❌        | ❌       | ✅              | ❌           |

### Collaboration Best Practices

1. **Define ownership**: Agree who owns which layers/prims
2. **Use status workflow**: Follow WIP → Shared → Published progression
3. **Add comments**: Use Pset properties to communicate
4. **Commit often**: Keep history clear and granular
5. **Review conflicts carefully**: Don't override without discussion

---

## Exporting Your Work

### Export Options

USDA Composer supports multiple export formats:

#### 1. Export Composed Scene (USDA)

Exports the fully composed scene as a single `.usda` file:

1. Click **"Export"** → **"Export Composed Scene"**
2. Choose **status filter** (All, WIP, Shared, Published)
3. **Flattened composition**: All layers merged into one file
4. **Save** the `.usda` file

#### 2. Export as USDZ (ZIP Archive)

Exports a `.usdz` package containing all assets:

1. Click **"Export"** → **"Export USDZ"**
2. Select **included statuses** (e.g., only Published layers)
3. **Packaged file** includes all dependencies
4. **Portable**: Shareable as a single file

#### 3. Export Individual Layers

Export specific layers without composition:

1. Select a layer in the Layer Stack panel
2. Click **"Export Layer"**
3. Save the individual `.usda` file
4. Useful for sharing work-in-progress layers

### Status Filtering on Export

When exporting, you can filter by status:

- **All**: Include all layers (WIP, Shared, Published, Archived)
- **Published Only**: Only finalized layers (recommended for production)
- **Shared + Published**: Ready-for-review and finalized layers
- **WIP**: Active development layers (for backup)

---

## Keyboard Shortcuts

### General

- **Ctrl+S** / **Cmd+S**: Save current state (if autosave enabled)
- **Ctrl+Z** / **Cmd+Z**: Undo last action (if available)
- **Ctrl+Shift+Z** / **Cmd+Shift+Z**: Redo

### Selection

- **Click**: Select single prim
- **Ctrl+Click** / **Cmd+Click**: Multi-select (add to selection)
- **Shift+Click**: Select range (if in hierarchy)
- **Esc**: Deselect all

### Navigation (3D Viewport)

- **Left Mouse Drag**: Orbit camera
- **Right Mouse Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out
- **F**: Focus on selected object (if implemented)

### Panels

- **Ctrl+1**: Toggle Layer Stack panel visibility
- **Ctrl+2**: Toggle Properties panel visibility
- **Ctrl+3**: Toggle Timeline visibility

---

## Tips and Best Practices

### Organization

- **Name your layers descriptively**: "Structural_Foundation_v3" is better than "Layer1"
- **Use status progression**: Don't skip steps (WIP → Shared → Published)
- **Keep WIP layers active**: Work in WIP, promote when ready
- **Archive old layers**: Keep your layer stack clean

### Performance

- **Use placeholders for heavy geometry**: Keep viewport responsive
- **Limit visible layers**: Hide layers you're not actively working on
- **Split large scenes**: Break into multiple layer files
- **Monitor prim count**: Large hierarchies can slow rendering

### Collaboration

- **Communicate in Pset comments**: Leave notes for teammates
- **Coordinate layer ownership**: Agree who works in which layers
- **Review before promoting**: Check for conflicts and issues
- **Use descriptive commit messages**: Help your team understand changes

### Workflow

- **Commit frequently**: Small, focused commits
- **Stage before committing**: Review your changes
- **Use history timeline**: Learn from past project states
- **Test before promoting to Published**: Ensure stability

### Troubleshooting

- **Refresh the page**: If rendering breaks, reload
- **Check browser console**: Look for error messages (F12)
- **Clear staged prims**: If staging is stuck, discard and restart
- **Export regularly**: Keep backups of your work
- **Check file paths**: Ensure USDA files reference correct paths

---

## Next Steps

- **Read [Developer Onboarding](DEVELOPER_ONBOARDING.md)** if you want to extend USDA Composer
- **Try the [Creating Your First Scene Tutorial](../tutorials/CREATING_FIRST_SCENE.md)** for hands-on practice
- **Explore [Troubleshooting Guide](TROUBLESHOOTING.md)** if you encounter issues
- **Check [Layer Workflow Deep Dive](../architecture/LAYER_WORKFLOW.md)** for ISO 19650 details

---

## Getting Help

If you need assistance:

1. **Check this User Guide** first
2. **Consult the [Troubleshooting Guide](TROUBLESHOOTING.md)**
3. **Review the [ARCHITECTURE.md](../../ARCHITECTURE.md)** for technical details
4. **Open an issue** on the project repository
5. **Contact your project administrator**

---

**Happy Composing!** 🎬
