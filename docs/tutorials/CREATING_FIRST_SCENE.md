# Creating Your First Scene - Tutorial

**Last Updated:** February 15, 2026

**Time Required:** 15-20 minutes

This hands-on tutorial walks you through creating your first scene in USDA Composer, from loading files to promoting layers.

---

## Table of Contents

1. [What You'll Learn](#what-youll-learn)
2. [Prerequisites](#prerequisites)
3. [Step 1: Launch USDA Composer](#step-1-launch-usda-composer)
4. [Step 2: Load Your First File](#step-2-load-your-first-file)
5. [Step 3: Explore the Interface](#step-3-explore-the-interface)
6. [Step 4: Add a Second Layer](#step-4-add-a-second-layer)
7. [Step 5: Select and Stage Prims](#step-5-select-and-stage-prims)
8. [Step 6: Commit Your Changes](#step-6-commit-your-changes)
9. [Step 7: View the Timeline](#step-7-view-the-timeline)
10. [Step 8: Promote Your Layer](#step-8-promote-your-layer)
11. [Step 9: Export Your Work](#step-9-export-your-work)
12. [Next Steps](#next-steps)

---

## What You'll Learn

By the end of this tutorial, you'll be able to:

- ✅ Load USDA files as layers
- ✅ Navigate the 3D viewport and hierarchy
- ✅ Stage and commit changes
- ✅ View project history in the timeline
- ✅ Promote layers through status workflow
- ✅ Export composed scenes

---

## Prerequisites

### Required

- **USDA Composer** installed and running (`npm run dev`)
- **Web Browser** (Chrome, Firefox, Safari, or Edge)
- **Sample USDA Files** (create or download examples)

### Optional

- Basic understanding of USD concepts
- Familiarity with 3D scene graphs

### Sample Files

If you don't have USDA files, create these simple examples:

**base.usda** (Base layer with a cube):

```usd
#usda 1.0

def Xform "World" {
    def Cube "MyCube" {
        double size = 1.0
        color3f[] primvars:displayColor = [(1, 1, 1)]
        custom token primvars:status = "Published"
    }
}
```

**colors.usda** (Override layer adding color):

```usd
#usda 1.0

over "World" {
    over "MyCube" {
        color3f[] primvars:displayColor = [(1, 0, 0)]
        custom token primvars:status = "WIP"
        custom string primvars:displayName = "Red Cube"
    }
}
```

Save these as `.usda` files on your computer.

---

## Step 1: Launch USDA Composer

### Start the Application

```bash
# Navigate to project directory
cd USDA-Composer

# Start development server
npm run dev
```

### Open in Browser

The app should automatically open at `http://localhost:5173`. If not, manually open this URL.

### Verify It's Working

You should see:

- **Left sidebar**: Layer Stack and Hierarchy panels
- **Center**: 3D viewport (currently empty)
- **Right sidebar**: Properties panel
- **Bottom**: Timeline (empty for now)

---

## Step 2: Load Your First File

### Upload the Base Layer

1. Look for the **"Load File"** or **file input button** in the Layer Stack panel (left sidebar)
2. **Click** the button
3. **Select** `base.usda` from your computer
4. **Wait** for the file to load (should be instant for small files)

### Verify the File Loaded

You should see:

- ✅ **Layer Stack**: `base.usda` appears with status badge "Published"
- ✅ **3D Viewport**: A white cube appears in the center
- ✅ **Hierarchy Panel**: `World` > `MyCube` shown in tree view

**Expected Output:**

```
Layer Stack Panel:
┌─────────────────────────┐
│ base.usda  [Published]  │ 👁️ ✓
└─────────────────────────┘

Hierarchy Panel:
├─ World (Xform)
│  └─ MyCube (Cube)
```

### Troubleshooting

**If cube doesn't appear:**

- Check browser console (F12) for errors
- Try adjusting camera: click and drag to orbit, scroll to zoom
- Verify file contains valid USD syntax

---

## Step 3: Explore the Interface

### Navigate the 3D Viewport

**Controls:**

- **Left-click + Drag**: Orbit camera around scene
- **Right-click + Drag**: Pan camera
- **Scroll Wheel**: Zoom in/out
- **Click on cube**: Select it (should highlight in blue)

### Inspect the Hierarchy

1. **Expand** the `World` node in the Hierarchy panel (click arrow)
2. **Click** on `MyCube` to select it
3. The cube should highlight in the 3D viewport

### View Properties

With `MyCube` selected:

1. Look at the **Properties Panel** (right sidebar)
2. You should see:
   - **Type**: Cube
   - **Path**: `/World/MyCube`
   - **Properties**: size, displayColor, status
   - **Status**: Published

---

## Step 4: Add a Second Layer

### Load the Override Layer

1. **Click** the "Load File" button again
2. **Select** `colors.usda`
3. The file loads as a new layer **on top** of the base layer

### See Layer Composition

**Layer Stack Panel** should now show:

```
┌─────────────────────────┐
│ colors.usda [WIP]       │ 👁️ ✓  (Top layer)
│ base.usda   [Published] │ 👁️ ✓  (Base layer)
└─────────────────────────┘
```

**3D Viewport**: The cube is now **red** instead of white!

**Why?** The `colors.usda` layer **overrides** the `displayColor` property. This is USD composition in action.

### Toggle Layer Visibility

Try toggling the **eye icon** next to `colors.usda`:

- **Eye open** (👁️): Layer visible, cube is red
- **Eye closed** (👁️ with slash): Layer hidden, cube returns to white (from base layer)

**Toggle it back on** so the cube is red again.

---

## Step 5: Select and Stage Prims

### Select a Prim

1. **Click** on the red cube in the 3D viewport
2. Or click `MyCube` in the Hierarchy panel
3. The prim is now selected

### Open the Staging Modal

1. Look for the **"Staging"** or **"Stage Selected"** button
2. **Click** it to open the staging area modal

### Stage the Prim

1. In the staging modal, you'll see:
   - **Available Prims**: List of prims you can stage
   - **Staged Prims**: Prims ready to commit (currently empty)

2. **Select** `MyCube` from the available prims
3. **Click** "Stage Selected" or drag it to the Staged area

### Verify Staging

The staging modal should now show:

```
Staged Prims (1):
- /World/MyCube
```

---

## Step 6: Commit Your Changes

### Write a Commit Message

1. In the staging modal, find the **"Commit Message"** text box
2. **Type** a descriptive message:
   ```
   Add red color to cube
   ```

### Commit

1. **Click** the **"Commit"** button
2. The modal should close
3. A success message may appear: "Changes committed successfully"

### What Just Happened?

Your commit:

- ✅ Created an entry in `statement.usda` (audit log)
- ✅ Recorded the staged prim (`/World/MyCube`)
- ✅ Saved your commit message
- ✅ Updated the timeline with a new commit node

---

## Step 7: View the Timeline

### Open the Timeline

1. Look at the **Timeline** at the bottom of the screen
2. You should see a visual graph with:
   - One or more **commit nodes** (circles or dots)
   - Lines connecting commits (if multiple)

### Inspect Your Commit

1. **Hover** over the latest commit node
2. A **tooltip** should appear showing:
   - Commit message: "Add red color to cube"
   - Timestamp
   - User: (your current user role)

### Navigate History

1. **Click** on the commit node
2. The 3D viewport shows the scene **at that point in history**
3. **Click** "Back to Present" or the latest commit to return to current state

---

## Step 8: Promote Your Layer

### Understanding Layer Status

Current status of `colors.usda`: **WIP** (Work in Progress)

**Goal**: Promote it to **Shared** status (ready for team review)

### Select the Layer

1. Go to the **Layer Stack Panel**
2. **Click** on `colors.usda` to select it

### Promote

1. Look for the **"Promote"** button (may be in layer panel or toolbar)
2. **Click** "Promote"

### Confirm Promotion

A modal may appear asking:

```
Promote colors.usda from WIP to Shared?

This will mark the layer as ready for team review.

[Cancel]  [Confirm]
```

**Click** "Confirm"

### Verify Promotion

The layer status should update:

```
┌─────────────────────────┐
│ colors.usda [Shared]    │ 👁️ ✓  <- Status changed!
│ base.usda   [Published] │ 👁️ ✓
└─────────────────────────┘
```

**If "Colorize by Status" is enabled**, the cube may now appear **blue** (Shared status color).

### Toggle Status Colorization

1. Find the **"Colorize by Status"** toggle (may be in view controls or settings)
2. **Toggle it on** to see status colors:
   - Orange = WIP
   - Blue = Shared
   - Green = Published
   - Gray = Archived
3. **Toggle it off** to see actual prim colors

---

## Step 9: Export Your Work

### Export Composed Scene

1. Look for the **"Export"** menu or button
2. **Select** "Export Composed Scene"

### Choose Export Options

A modal may appear with options:

- **Status Filter**: Which layers to include
  - Select "All" to include both layers
- **Format**: USDA (text) or USDZ (binary package)
  - Select "USDA"

### Save the File

1. **Click** "Export" or "Save"
2. Your browser downloads a file: `composed-scene.usda`
3. **Open the file** in a text editor to see the composed result

### Verify Export

The exported file should contain:

- Both `base.usda` and `colors.usda` merged together
- The cube with red color (from override layer)
- All properties combined

---

## Next Steps

### Congratulations! 🎉

You've successfully:

- ✅ Loaded multiple USDA layers
- ✅ Navigated the interface
- ✅ Staged and committed changes
- ✅ Viewed project history
- ✅ Promoted a layer
- ✅ Exported a composed scene

### Continue Learning

**Beginner:**

- Try loading more complex USDA files
- Experiment with different layer orders (drag to reorder)
- Add custom properties to prims

**Intermediate:**

- Learn about **Entity Staging** (placeholders)
- Practice **Conflict Resolution**
- Explore **Multi-User Collaboration** (switch user roles)

**Advanced:**

- Read the [USER_GUIDE.md](../guides/USER_GUIDE.md) for comprehensive features
- Study the [LAYER_WORKFLOW.md](../architecture/LAYER_WORKFLOW.md) for ISO 19650 details
- Build custom integrations with the [STATE_API.md](../api/STATE_API.md)

---

## Additional Tutorials

### Tutorial 2: Layer Promotion Workflow

Learn the complete ISO 19650 workflow: WIP → Shared → Published → Archived

**Coming soon**: [docs/tutorials/LAYER_PROMOTION.md](./LAYER_PROMOTION.md)

### Tutorial 3: Conflict Resolution

Handle property conflicts when promoting layers.

**Coming soon**: [docs/tutorials/CONFLICT_RESOLUTION.md](./CONFLICT_RESOLUTION.md)

### Tutorial 4: Custom Properties

Add metadata and Pset properties to prims.

**Coming soon**: [docs/tutorials/CUSTOM_PROPERTIES.md](./CUSTOM_PROPERTIES.md)

---

## Troubleshooting

### Issue: File won't load

**Solutions:**

- Verify file is valid USDA (starts with `#usda 1.0`)
- Check browser console (F12) for errors
- Try a simpler file first
- See [TROUBLESHOOTING.md](../guides/TROUBLESHOOTING.md)

### Issue: Cube doesn't appear

**Solutions:**

- Adjust camera position (drag and zoom)
- Check if layer is visible (eye icon)
- Verify layer is active (checkmark)
- Check Properties panel to confirm prim has geometry

### Issue: Can't stage prims

**Solutions:**

- Ensure a prim is selected
- Check if staging modal is open
- Verify you have permission to edit the layer

---

## Recap

### What You Learned

| Concept         | What It Is                            | Why It Matters                              |
| --------------- | ------------------------------------- | ------------------------------------------- |
| **Layers**      | Individual USDA files in a stack      | Enables non-destructive editing             |
| **Composition** | Merging layers bottom-to-top          | Upper layers override lower layers          |
| **Staging**     | Collecting changes before commit      | Allows review before permanent save         |
| **Commits**     | Snapshots in project history          | Creates audit trail and enables time travel |
| **Promotion**   | Moving layers through maturity stages | ISO 19650 workflow for collaboration        |
| **Export**      | Flattening layers into one file       | Creates deliverable or shareable asset      |

### Key Takeaways

1. **Layers compose**: Upper layers override properties in lower layers
2. **Non-destructive**: Base layers remain unchanged
3. **Staging workflow**: Changes are staged → committed → logged
4. **Status matters**: WIP → Shared → Published progression
5. **History tracked**: Every action is recorded

---

## Resources

- **Full Documentation**: [USER_GUIDE.md](../guides/USER_GUIDE.md)
- **Getting Help**: [TROUBLESHOOTING.md](../guides/TROUBLESHOOTING.md)
- **Architecture**: [ARCHITECTURE.md](../../ARCHITECTURE.md)

---

**Happy Composing!** 🎬

---

**Last Updated:** February 15, 2026
