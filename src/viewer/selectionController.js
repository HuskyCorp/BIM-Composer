// src/viewer/selectionController.js
import * as THREE from "three";
import { store } from "../core/index.js";

export class SelectionController {
  constructor(camera, renderer, meshesGroup, scene, canvas, viewType) {
    this.camera = camera;
    this.renderer = renderer;
    this.meshesGroup = meshesGroup;
    this.scene = scene;
    this.canvas = canvas;
    this.viewType = viewType;
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.selectedMeshes = new Set();
    this.selectedOutlinerElements = new Set();
    this.renameButton = document.getElementById("rename-object-button");
    this.sendToStageButton = document.getElementById("send-to-stage-button");
    this.entitySceneButton = document.getElementById("entity-scene-button");
    this.activeMesh = null;

    this.renderer.domElement.addEventListener(
      "mousedown",
      this.onMouseDown.bind(this),
      false
    );

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
            originFile: mesh.userData.originFile || store.getState().currentFile,
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
             const pathParts = mesh.userData.primPath.split('/');
             // Expected format: /Parent/Child -> parts ["", "Parent", "Child"]
             // We want "Parent" -> /Parent
             
             if (pathParts.length > 2) {
                 pathParts.pop(); // Remove Child
                 const parentPath = pathParts.join('/');
                 const parentName = pathParts[pathParts.length - 1]; // Last part is name
                 
                 // Avoid adding root as parent if path is just /Name
                 if (parentPath && parentPath !== "") {
                     rawItems.push({
                        primPath: parentPath,
                        originFile: mesh.userData.originFile || store.getState().currentFile,
                        name: parentName,
                        type: "Group" // Fallback type
                     });
                     console.log(`[SELECTION] Derived parent from path: ${parentPath}`);
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
    event.preventDefault();

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

      // Traverse up to find the parent object with primPath
      // Start from the intersected mesh and go up the hierarchy
      while (intersectedObject && !intersectedObject.userData.primPath) {
        intersectedObject = intersectedObject.parent;
        // Stop if we've reached the scene or meshesGroup
        if (
          intersectedObject === this.scene ||
          intersectedObject === this.meshesGroup
        ) {
          intersectedObject = null;
          break;
        }
      }

      if (intersectedObject && intersectedObject.userData.primPath) {
        // Use the full mesh path for selection (matches outliner structure)
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
}
