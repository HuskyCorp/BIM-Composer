// src/viewer/rendering/stageViewRenderer.js
import * as THREE from "three";
import { buildStageOutliner } from "../../components/outlinerController.js";
import { SpatialHash } from "../spatialHash.js";
import { resolvePrimStatus, getStatusColor } from "../../utils/statusUtils.js";

function clearScene(threeScene) {
  while (threeScene.meshesGroup.children.length > 0) {
    const mesh = threeScene.meshesGroup.children[0];
    threeScene.meshesGroup.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }

  // Clear any existing Spatial Hash debug visuals
  const existingDebug = threeScene.scene.getObjectByName("SpatialHashDebug");
  if (existingDebug) {
    threeScene.scene.remove(existingDebug);
  }

  threeScene.selectionController.clearSelection();
}

export function renderStageView(threeScene, state) {
  console.log("[RENDERER] renderStageView called");
  console.log("[RENDERER] View type:", threeScene._viewType);
  console.log(
    "[RENDERER] Hierarchy length:",
    state.composedHierarchy?.length || 0
  );

  clearScene(threeScene);

  const finalHierarchy = state.composedHierarchy;

  // Initialize Spatial Hash
  const spatialHash = new SpatialHash(5.0);
  threeScene.spatialHash = spatialHash;

  const geometryCache = new Map();
  for (const fileName in state.loadedFiles) {
    const fileContent = state.loadedFiles[fileName];
    const parsedGeom = threeScene.parser.parseUSDA(fileContent);
    parsedGeom.forEach((geomData) => {
      geometryCache.set(`/${geomData.name}`, geomData);
    });
  }

  const allMeshesByFile = {};
  const createMeshesRecursive = (prims) => {
    prims.forEach((prim) => {
      // FIX: Use source path if available, otherwise fallback (though strict staging implies source path is key)
      const lookupPath = prim._sourcePath || prim.path;
      let geomData = geometryCache.get(lookupPath);

      // Fallback: Check references
      if (!geomData && prim.references && prim.references.includes("@")) {
          // Parse reference: @file.usda@</PrimName>
          const parts = prim.references.split("@<");
          if (parts.length > 1) {
              const primName = parts[1].replace(">", "").replace("/", ""); // Extract "PrimName"
              geomData = geometryCache.get(`/${primName}`);
              if (!geomData) {
                  // Try with the slash?
                  geomData = geometryCache.get(`/${parts[1].replace(">", "")}`);
              }
              if (!geomData) {
                 console.warn(`[RENDER] Failed to resolve geometry for ${prim.path} via ref ${primName}. Ref: ${prim.references}`);
                 // Debug: print cache keys
                 // console.log("Cache keys:", Array.from(geometryCache.keys())); 
              } else {
                 console.log(`[RENDER] Resolved geometry for ${prim.path} from ref!`);
              }
          }
      }

      // Handle Procedural Placeholders (Entity Mode)
      if (!geomData && prim.type === "Cube" && prim.customData?.isWireframe) {
        geomData = {
          geometry: new THREE.BoxGeometry(1, 1, 1),
          name: prim.name,
          type: "Cube",
          isWireframe: true,
          opacity: prim.properties.opacity
            ? parseFloat(prim.properties.opacity)
            : 0.1,
        };
      }

      if (geomData) {
        // Determine Color and Opacity
        let finalColor;
        let opacity =
          prim.properties.opacity !== undefined
            ? parseFloat(prim.properties.opacity)
            : geomData.opacity !== undefined
              ? geomData.opacity
              : 1.0;
        let isWireframe = !!(
          geomData.isWireframe || prim.customData?.isWireframe
        );

        // FORCE Override for Entity Placeholders
        // FORCE Override for Entity Placeholders
        // Check property based on user request ("custom string")
        const entityType = prim.properties?.entityType;

        if (entityType === "placeholder") {
          finalColor = new THREE.Color(0x8fff8f); // Light Green
          opacity = 0.1;
          isWireframe = false;
          // Explicitly handle "Real Element" if we want to enforce standard behavior?
          // Or just let it fall through to default.
          // User asked: "if it comes from S should receive the value as Real Element... then depending on this string you make the element transparent or not."
          // So strict logic:
        } else if (entityType === "Real Element") {
          // Fallback to standard logic below (Status Coloring etc)
          if (state.stage.colorizeByStatus) {
            // PHASE 4: ACTIVE STATE MANAGEMENT - Use centralized resolver
            // Use 'state' argument instead of 'store' global
            const status = resolvePrimStatus(prim, state.stage.layerStack);
            finalColor = new THREE.Color(getStatusColor(status));
          } else {
            // ... Standard color logic
            finalColor =
              prim.properties.displayColor ||
              geomData.color ||
              new THREE.Color(0xcccccc);
            if (typeof finalColor === "string" && finalColor.startsWith("[")) {
              const match = finalColor.match(/[\d.]+/g);
              if (match && match.length >= 3) {
                finalColor = new THREE.Color(
                  parseFloat(match[0]),
                  parseFloat(match[1]),
                  parseFloat(match[2])
                );
              }
            }
          }
        } else if (state.stage.colorizeByStatus) {
          const status = resolvePrimStatus(prim, state.stage.layerStack);
          finalColor = new THREE.Color(getStatusColor(status));
        } else {
          finalColor =
            prim.properties.displayColor ||
            geomData.color ||
            new THREE.Color(0xcccccc);

          if (typeof finalColor === "string" && finalColor.startsWith("[")) {
            // Parse "[(r, g, b)]" or "[r, g, b]"
            const match = finalColor.match(/[\d.]+/g);
            if (match && match.length >= 3) {
              finalColor = new THREE.Color(
                parseFloat(match[0]),
                parseFloat(match[1]),
                parseFloat(match[2])
              );
            }
          }
        }

        const material = new THREE.MeshStandardMaterial({
          color: finalColor,
          side: THREE.DoubleSide,
          wireframe: isWireframe,
          transparent: opacity < 1.0,
          opacity: opacity,
        });
        const mesh = new THREE.Mesh(geomData.geometry, material);
        mesh.name = geomData.name;
        mesh.userData.primPath = prim.path;
        mesh.userData.originalMaterial = material;
        threeScene.meshesGroup.add(mesh);

        // Update Spatial Hash
        mesh.updateMatrixWorld();
        spatialHash.insert(mesh);

        if (!allMeshesByFile["stage"]) allMeshesByFile["stage"] = [];
        allMeshesByFile["stage"].push(mesh);
      }
      if (prim.children) {
        createMeshesRecursive(prim.children);
      }
    });
  };

  createMeshesRecursive(finalHierarchy || []);

  // Render Debug Grid (Spatial Hash)
  const debugVis = spatialHash.getDebugVisuals();
  threeScene.scene.add(debugVis);

  if (threeScene._viewType !== "history") {
    buildStageOutliner(
      threeScene.outlinerEl,
      finalHierarchy,
      allMeshesByFile,
      state
    );
  } else {
    threeScene.outlinerEl.innerHTML =
      '<p class="placeholder-text" style="padding: 20px;">Viewing History</p>';
  }
}
