// src/viewer/selectionController.js
import * as THREE from "three";
import { store } from "../core/index.js";

export class SelectionController {
  constructor(
    camera,
    renderer,
    meshesGroup,
    scene,
    canvas,
    viewType,
    controls
  ) {
    this.camera = camera;
    this.renderer = renderer;
    this.meshesGroup = meshesGroup;
    this.scene = scene;
    this.canvas = canvas;
    this.viewType = viewType;
    this._controls = controls || null;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedMeshes = new Set();
    this.selectedOutlinerElements = new Set();
    this.renameButton = document.getElementById("rename-object-button");
    this.sendToStageButton = document.getElementById("send-to-stage-button");
    this.entitySceneButton = document.getElementById("entity-scene-button");
    this.activeMesh = null;

    // Drag-box selection state
    this._dragStart = null;
    this._isDragging = false;
    this._selBoxEl = null;
    this._initSelectionBoxEl();

    this.renderer.domElement.addEventListener(
      "mousedown",
      this.onMouseDown.bind(this),
      false
    );
    // Use document so drag continues and ends even when mouse leaves the canvas
    document.addEventListener("mousemove", this.onMouseMove.bind(this), false);
    document.addEventListener("mouseup", this.onMouseUp.bind(this), false);

    // Capture-phase listener fires before OrbitControls' bubble-phase listener,
    // so we can flip mouseButtons.MIDDLE before OrbitControls reads it.
    // Shift + middle-drag = rotate; plain middle-drag = dolly (zoom).
    this.renderer.domElement.addEventListener(
      "pointerdown",
      (e) => {
        if (!this._controls || e.button !== 1) return;
        this._controls.mouseButtons.MIDDLE = e.shiftKey
          ? THREE.MOUSE.ROTATE
          : THREE.MOUSE.DOLLY;
      },
      true
    );

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && this._isDragging) {
        this._cancelDrag();
      }
    });

    this.renameButton.addEventListener("click", () => {
      if (this.canvas.style.display === "none") return;
      if (this.renameButton.dataset.primPath) {
        document.dispatchEvent(
          new CustomEvent("openReferenceModal", {
            detail: { primPath: this.renameButton.dataset.primPath },
          })
        );
      }
    });

    const openModalHandler = (mode) => {
      if (this.canvas.style.display === "none") return;

      // We prioritize the file that the ACTUALLY SELECTED active mesh belongs to.
      let fileToOpen = store.getState().currentFile;

      if (this.activeMesh && this.activeMesh.userData.originFile) {
        fileToOpen = this.activeMesh.userData.originFile;
      }

      // NEW: Collect selected items (Meshes AND their Parents)
      const rawItems = [];

      this.selectedMeshes.forEach((mesh) => {
        // 1. Add the Mesh itself
        if (mesh.userData.primPath) {
          rawItems.push({
            primPath: mesh.userData.primPath,
            originFile:
              mesh.userData.originFile || store.getState().currentFile,
            name: mesh.name,
            type: "Mesh",
          });
        }

        // 2. Add the Parent (Try Object-based first, then Path-based fallback)
        let parentAdded = false;

        // A) Try explicit Three.js parent object
        if (
          mesh.parent &&
          mesh.parent.userData &&
          mesh.parent.userData.primPath
        ) {
          rawItems.push({
            primPath: mesh.parent.userData.primPath,
            originFile:
              mesh.parent.userData.originFile ||
              mesh.userData.originFile ||
              store.getState().currentFile,
            name: mesh.parent.name || "Parent",
            type: mesh.parent.type || "Group",
          });
          parentAdded = true;
        }

        // B) Path-based fallback (if metadata missing on parent object)
        if (!parentAdded && mesh.userData.primPath) {
          const pathParts = mesh.userData.primPath.split("/");
          // Expected format: /Parent/Child -> parts ["", "Parent", "Child"]
          // We want "Parent" -> /Parent

          if (pathParts.length > 2) {
            pathParts.pop(); // Remove Child
            const parentPath = pathParts.join("/");
            const parentName = pathParts[pathParts.length - 1]; // Last part is name

            // Avoid adding root as parent if path is just /Name
            if (parentPath && parentPath !== "") {
              rawItems.push({
                primPath: parentPath,
                originFile:
                  mesh.userData.originFile || store.getState().currentFile,
                name: parentName,
                type: "Group", // Fallback type
              });
              console.log(
                `[SELECTION] Derived parent from path: ${parentPath}`
              );
            }
          }
        }
      });

      // Deduplicate items by primPath
      const uniqueItemsMap = new Map();
      rawItems.forEach((item) => {
        if (!uniqueItemsMap.has(item.primPath)) {
          uniqueItemsMap.set(item.primPath, item);
        }
      });

      const selectedItems = Array.from(uniqueItemsMap.values());

      if (fileToOpen) {
        document.dispatchEvent(
          new CustomEvent("openPrimModal", {
            detail: {
              fileName: fileToOpen,
              mode: mode,
              preSelectedItems: selectedItems, // NEW: Pass detailed items
              isConfirmationOnly: true, // User requested strict confirmation
            },
          })
        );
      } else {
        console.warn("No active file to open prim modal for.");
      }
    };

    this.sendToStageButton.addEventListener("click", () =>
      openModalHandler("normal")
    );

    if (this.entitySceneButton) {
      this.entitySceneButton.addEventListener("click", () =>
        openModalHandler("entity")
      );
    }
  }

  update() {
    if (this.canvas.style.display === "none") {
      if (this.viewType === "stage") this.renameButton.style.display = "none";
      if (this.viewType === "file") {
        this.sendToStageButton.style.display = "none";
        if (this.entitySceneButton)
          this.entitySceneButton.style.display = "none";
      }
      return;
    }

    if (this.selectedMeshes.size > 0) {
      const box = new THREE.Box3();
      let hasVisibleMesh = false;

      this.selectedMeshes.forEach((mesh) => {
        if (mesh.visible) {
          box.expandByObject(mesh);
          hasVisibleMesh = true;
        }
      });

      if (hasVisibleMesh) {
        const center = new THREE.Vector3();
        box.getCenter(center);
        const topPoint = new THREE.Vector3(center.x, box.max.y, center.z);
        topPoint.project(this.camera);
        const rect = this.renderer.domElement.getBoundingClientRect();
        const x = (topPoint.x * 0.5 + 0.5) * rect.width;
        let y = (topPoint.y * -0.5 + 0.5) * rect.height;
        y -= 25;

        if (this.viewType === "stage") {
          this.renameButton.style.left = `${x}px`;
          this.renameButton.style.top = `${y}px`;
          this.renameButton.style.display = "flex";
          this.sendToStageButton.style.display = "none";
          if (this.entitySceneButton)
            this.entitySceneButton.style.display = "none";
        } else if (this.viewType === "file") {
          // Align S and E buttons
          this.sendToStageButton.style.left = `${x - 20}px`; // Offset to left
          this.sendToStageButton.style.top = `${y}px`;
          this.sendToStageButton.style.display = "flex";

          if (this.entitySceneButton) {
            this.entitySceneButton.style.left = `${x + 20}px`; // Offset to right
            this.entitySceneButton.style.top = `${y}px`;
            this.entitySceneButton.style.display = "flex";
          }

          this.renameButton.style.display = "none";
        }
      } else {
        this.renameButton.style.display = "none";
        this.sendToStageButton.style.display = "none";
        if (this.entitySceneButton)
          this.entitySceneButton.style.display = "none";
      }
    } else {
      this.renameButton.style.display = "none";
      this.sendToStageButton.style.display = "none";
      if (this.entitySceneButton) this.entitySceneButton.style.display = "none";
    }
  }

  setVisibility(mesh, isVisible) {
    mesh.visible = isVisible;
    const outlinerEl = document.querySelector(
      `li[data-prim-path="${mesh.userData.primPath}"]`
    );
    if (outlinerEl) {
      const eyeIcon = outlinerEl.querySelector(".visibility-toggle");
      if (eyeIcon) {
        eyeIcon.textContent = isVisible ? "👁️" : "➖";
        eyeIcon.classList.toggle("hidden-item", !isVisible);
      }
    }
    this.renderer.render(this.scene, this.camera);
  }

  clearSelection() {
    this.selectedMeshes.forEach((m) => {
      m.material = m.userData.originalMaterial;
    });
    this.selectedOutlinerElements.forEach((el) => {
      el.classList.remove("selected");
    });
    this.selectedMeshes.clear();
    this.selectedOutlinerElements.clear();
    this.activeMesh = null;
    this.renderer.render(this.scene, this.camera);
    document.dispatchEvent(
      new CustomEvent("primSelected", { detail: { primPath: null } })
    );
  }

  highlightElement(element, shouldHighlight) {
    if (!element) {
      console.warn(
        "[SELECTION] highlightElement called with null/undefined element"
      );
      return;
    }

    if (shouldHighlight) {
      element.classList.add("selected");
      this.selectedOutlinerElements.add(element);

      let parent = element.parentElement;
      while (parent && parent.id !== "usdaOutliner") {
        if (parent.tagName === "UL") {
          parent.style.display = "block";
          const parentLi = parent.parentElement;
          if (parentLi && parentLi.classList.contains("collapsible")) {
            parentLi.classList.remove("collapsed");
          }
        }
        parent = parent.parentElement;

        // Safety: prevent infinite loop if DOM structure is malformed
        if (!parent) {
          console.warn("[SELECTION] Parent element is null during traversal");
          break;
        }
      }
    } else {
      element.classList.remove("selected");
      this.selectedOutlinerElements.delete(element);
    }
  }

  togglePrimSelection(primPath, isCtrlKey) {
    if (!primPath) {
      console.warn(
        "[SELECTION] togglePrimSelection called with null/undefined primPath"
      );
      return;
    }

    console.log("[SELECTION] togglePrimSelection called for:", primPath);

    const outlinerElement = document.querySelector(
      `#usdaOutliner li[data-prim-path="${primPath}"]`
    );

    if (!outlinerElement) {
      console.warn("[SELECTION] Outliner element not found for:", primPath);
      console.log(
        "[SELECTION] This is normal in file view. Will still select mesh in 3D viewer."
      );
    }

    // Don't return early - we can still select the mesh even if outliner element doesn't exist

    if (!isCtrlKey) {
      // Clear selection if not holding Ctrl
      if (
        !outlinerElement ||
        !this.selectedOutlinerElements.has(outlinerElement) ||
        this.selectedOutlinerElements.size > 1
      ) {
        this.clearSelection();
      }
    }

    const isSelected = outlinerElement
      ? this.selectedOutlinerElements.has(outlinerElement)
      : false;

    // Find mesh(es) that belong to this prim
    // The mesh might have the exact path, or it might be a child (e.g., /Parent/Mesh_Parent_123)
    const mesh = this.meshesGroup.children.find(
      (m) =>
        m.userData.primPath === primPath ||
        m.userData.primPath.startsWith(primPath + "/")
    );

    if (!mesh) {
      console.warn("[SELECTION] Mesh not found for primPath:", primPath);
      console.log(
        "[SELECTION] Available meshes:",
        this.meshesGroup.children.map((m) => m.userData.primPath)
      );
      return;
    }

    console.log(
      "[SELECTION] Found mesh:",
      mesh.name,
      "with primPath:",
      mesh.userData.primPath
    );

    if (isSelected) {
      if (isCtrlKey) {
        if (outlinerElement) {
          this.highlightElement(outlinerElement, false);

          // Also unhighlight the parent element if it exists
          // In stage view: parent is a prim-item
          // In layer stack: parent is a xform-item
          let parentElement = outlinerElement.parentElement;
          while (parentElement && parentElement.id !== "usdaOutliner") {
            if (
              parentElement.classList.contains("xform-item") ||
              parentElement.classList.contains("prim-item")
            ) {
              this.highlightElement(parentElement, false);
              console.log("[SELECTION] Also unhighlighted parent element");
              break;
            }
            parentElement = parentElement.parentElement;
          }
        }
        if (mesh) {
          this.selectedMeshes.delete(mesh);
          mesh.material = mesh.userData.originalMaterial; // Restores original material
          if (this.activeMesh === mesh) {
            this.activeMesh =
              this.selectedMeshes.size > 0
                ? Array.from(this.selectedMeshes).pop()
                : null;
          }
        }
        console.log("[SELECTION] Deselected mesh:", primPath);
      }
    } else {
      // Select the mesh
      if (outlinerElement) {
        this.highlightElement(outlinerElement, true);
        console.log("[SELECTION] Highlighted outliner element for:", primPath);

        // Also highlight the parent element if it exists
        // In stage view: parent is a prim-item (e.g., IfcSlab parent of Mesh_IfcSlab)
        // In layer stack: parent is a xform-item container
        let parentElement = outlinerElement.parentElement;
        while (parentElement && parentElement.id !== "usdaOutliner") {
          if (
            parentElement.classList.contains("xform-item") ||
            parentElement.classList.contains("prim-item")
          ) {
            this.highlightElement(parentElement, true);
            console.log(
              "[SELECTION] Also highlighted parent element:",
              parentElement.classList.contains("xform-item")
                ? "xform-item"
                : "prim-item"
            );
            break;
          }
          parentElement = parentElement.parentElement;
        }
      }
      if (mesh) {
        this.selectedMeshes.add(mesh);
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x007aff,
          side: THREE.DoubleSide,
        }); // Applies blue highlight
        this.activeMesh = mesh;
        console.log("[SELECTION] Selected mesh in 3D viewer:", primPath);
      }
    }

    if (this.activeMesh) {
      this.renameButton.dataset.primPath = this.activeMesh.userData.primPath;
    }

    document.dispatchEvent(
      new CustomEvent("primSelected", { detail: { primPath } })
    );
    this.renderer.render(this.scene, this.camera);
  }

  toggleHierarchySelection(parent_li, child_meshes, parentPrimPath) {
    this.clearSelection();
    this.highlightElement(parent_li, true);
    child_meshes.forEach((mesh) => {
      this.selectedMeshes.add(mesh);
      mesh.material = new THREE.MeshStandardMaterial({
        color: 0x007aff,
        side: THREE.DoubleSide,
      });
      this.highlightElement(mesh.userData.outlinerElement, true);
    });

    this.activeMesh =
      child_meshes.length > 0 ? child_meshes[child_meshes.length - 1] : null;
    if (this.activeMesh) {
      this.renameButton.dataset.primPath = this.activeMesh.userData.primPath;
    }
    // Dispatch the parent prim path so properties panel can display parent prim properties
    document.dispatchEvent(
      new CustomEvent("primSelected", {
        detail: { primPath: parentPrimPath || null },
      })
    );
    this.renderer.render(this.scene, this.camera);
  }

  selectPrims(primPaths) {
    this.clearSelection();
    if (!primPaths || primPaths.length === 0) return;

    primPaths.forEach((path) => {
      const outlinerElement = document.querySelector(
        `#usdaOutliner li[data-prim-path="${path}"]`
      );
      if (outlinerElement) this.highlightElement(outlinerElement, true);

      const mesh = this.meshesGroup.children.find(
        (m) => m.userData.primPath === path
      );
      if (mesh) {
        this.selectedMeshes.add(mesh);
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x007aff,
          side: THREE.DoubleSide,
        });
        this.activeMesh = mesh; // Set last as active
      }
    });

    if (this.activeMesh) {
      this.renameButton.dataset.primPath = this.activeMesh.userData.primPath;
    }

    // Dispatch one event for the bulk selection? Or just rely on visual update?
    // The properties panel listens to 'primSelected'. It usually expects a single path.
    // If multiple are selected, what should it show?
    // Currently Properties Panel handles single prim.
    // If I select multiple, maybe I send the LAST one as "active" detail?
    if (this.activeMesh) {
      document.dispatchEvent(
        new CustomEvent("primSelected", {
          detail: { primPath: this.activeMesh.userData.primPath },
        })
      );
    }

    this.renderer.render(this.scene, this.camera);
  }

  onMouseDown(event) {
    if (event.target !== this.renderer.domElement) return;
    if (event.button !== 0) return; // only left button triggers box selection
    if (event.shiftKey) return; // Shift+left → orbit via OrbitControls, ignore here

    // Disable orbit immediately so OrbitControls doesn't start rotating
    if (this._controls) this._controls.enabled = false;
    this._dragStart = {
      x: event.clientX,
      y: event.clientY,
      ctrlKey: event.ctrlKey || event.metaKey,
    };
    this._isDragging = false;
  }

  onMouseMove(event) {
    if (!this._dragStart) return;

    const dx = event.clientX - this._dragStart.x;
    const dy = event.clientY - this._dragStart.y;

    if (!this._isDragging && Math.sqrt(dx * dx + dy * dy) < 5) return;

    if (!this._isDragging) {
      this._isDragging = true;
      if (this._selBoxEl) this._selBoxEl.style.display = "block";
    }

    const rect = this.renderer.domElement.getBoundingClientRect();
    this._updateSelectionBox(
      this._dragStart.x,
      this._dragStart.y,
      event.clientX,
      event.clientY,
      rect
    );
  }

  onMouseUp(event) {
    if (!this._dragStart) return;

    if (this._isDragging) {
      this._performBoxSelect(
        this._dragStart.x,
        this._dragStart.y,
        event.clientX,
        event.clientY,
        this._dragStart.ctrlKey
      );
      this._cancelDrag();
      return;
    }

    // Regular click — run raycasting (original onMouseDown logic)
    this._cancelDrag();
    if (event.target !== this.renderer.domElement) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(
      this.meshesGroup.children,
      true
    );

    if (intersects.length > 0) {
      let intersectedObject = intersects[0].object;
      while (intersectedObject && !intersectedObject.userData.primPath) {
        intersectedObject = intersectedObject.parent;
        if (
          intersectedObject === this.scene ||
          intersectedObject === this.meshesGroup
        ) {
          intersectedObject = null;
          break;
        }
      }
      if (intersectedObject && intersectedObject.userData.primPath) {
        this.togglePrimSelection(
          intersectedObject.userData.primPath,
          event.ctrlKey || event.metaKey
        );
      }
    } else {
      if (!event.ctrlKey && !event.metaKey) {
        this.clearSelection();
      }
    }
  }

  _cancelDrag() {
    this._dragStart = null;
    this._isDragging = false;
    if (this._controls) this._controls.enabled = true;
    if (this._selBoxEl) {
      this._selBoxEl.style.display = "none";
      this._selBoxEl.className = "sel-box";
    }
  }

  _initSelectionBoxEl() {
    const container = this.renderer.domElement.parentElement;
    if (!container) return;
    const el = document.createElement("div");
    el.className = "sel-box";
    el.style.display = "none";
    container.appendChild(el);
    this._selBoxEl = el;
  }

  _updateSelectionBox(startX, startY, currentX, currentY, rect) {
    if (!this._selBoxEl) return;

    const left = Math.min(startX, currentX) - rect.left;
    const top = Math.min(startY, currentY) - rect.top;
    const width = Math.abs(currentX - startX);
    const height = Math.abs(currentY - startY);

    this._selBoxEl.style.left = left + "px";
    this._selBoxEl.style.top = top + "px";
    this._selBoxEl.style.width = width + "px";
    this._selBoxEl.style.height = height + "px";

    const mode = currentX > startX ? "sel-box--window" : "sel-box--crossing";
    this._selBoxEl.className = "sel-box " + mode;
  }

  _performBoxSelect(startX, startY, endX, endY, addToSelection) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const selLeft = Math.min(startX, endX) - rect.left;
    const selRight = Math.max(startX, endX) - rect.left;
    const selTop = Math.min(startY, endY) - rect.top;
    const selBottom = Math.max(startY, endY) - rect.top;

    const isWindow = endX > startX; // left→right = window (fully contained only)

    const w = rect.width;
    const h = rect.height;

    const matchedPaths = [];

    const getAllMeshes = (obj, out) => {
      if (obj.isMesh && obj.userData.primPath) out.push(obj);
      if (obj.children) obj.children.forEach((c) => getAllMeshes(c, out));
    };
    const allMeshes = [];
    getAllMeshes(this.meshesGroup, allMeshes);

    const _tmp = new THREE.Vector3();

    for (const mesh of allMeshes) {
      const box3 = new THREE.Box3().setFromObject(mesh);
      if (box3.isEmpty()) continue;

      const corners = [
        new THREE.Vector3(box3.min.x, box3.min.y, box3.min.z),
        new THREE.Vector3(box3.max.x, box3.min.y, box3.min.z),
        new THREE.Vector3(box3.min.x, box3.max.y, box3.min.z),
        new THREE.Vector3(box3.max.x, box3.max.y, box3.min.z),
        new THREE.Vector3(box3.min.x, box3.min.y, box3.max.z),
        new THREE.Vector3(box3.max.x, box3.min.y, box3.max.z),
        new THREE.Vector3(box3.min.x, box3.max.y, box3.max.z),
        new THREE.Vector3(box3.max.x, box3.max.y, box3.max.z),
      ];

      let screenMinX = Infinity,
        screenMaxX = -Infinity;
      let screenMinY = Infinity,
        screenMaxY = -Infinity;
      let visibleCorners = 0;
      let allCornersInside = true;

      for (const corner of corners) {
        _tmp.copy(corner).project(this.camera);
        if (_tmp.z > 1) {
          allCornersInside = false;
          continue;
        } // behind camera
        visibleCorners++;

        const sx = (_tmp.x + 1) * 0.5 * w;
        const sy = (-_tmp.y + 1) * 0.5 * h;

        screenMinX = Math.min(screenMinX, sx);
        screenMaxX = Math.max(screenMaxX, sx);
        screenMinY = Math.min(screenMinY, sy);
        screenMaxY = Math.max(screenMaxY, sy);

        if (sx < selLeft || sx > selRight || sy < selTop || sy > selBottom) {
          allCornersInside = false;
        }
      }

      if (visibleCorners === 0) continue;

      let selected = false;
      if (isWindow) {
        selected = allCornersInside;
      } else {
        // crossing: screen bbox overlaps selection rect
        selected = !(
          screenMaxX < selLeft ||
          screenMinX > selRight ||
          screenMaxY < selTop ||
          screenMinY > selBottom
        );
      }

      if (selected) matchedPaths.push(mesh.userData.primPath);
    }

    if (matchedPaths.length === 0) {
      if (!addToSelection) this.clearSelection();
      return;
    }

    if (!addToSelection) {
      this.selectPrims(matchedPaths);
    } else {
      // Add to existing selection
      matchedPaths.forEach((path) => {
        const outlinerElement = document.querySelector(
          `#usdaOutliner li[data-prim-path="${path}"]`
        );
        if (outlinerElement) this.highlightElement(outlinerElement, true);
        const mesh = this.meshesGroup.children.find(
          (m) => m.userData.primPath === path
        );
        if (mesh) {
          this.selectedMeshes.add(mesh);
          mesh.material = new THREE.MeshStandardMaterial({
            color: 0x007aff,
            side: THREE.DoubleSide,
          });
          this.activeMesh = mesh;
        }
      });
      if (this.activeMesh) {
        document.dispatchEvent(
          new CustomEvent("primSelected", {
            detail: { primPath: this.activeMesh.userData.primPath },
          })
        );
      }
      this.renderer.render(this.scene, this.camera);
    }
  }
}
