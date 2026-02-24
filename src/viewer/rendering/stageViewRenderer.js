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

      // Debug logging for geometry lookup
      if (!geomData) {
        console.log(`[RENDER] Geometry lookup failed for prim: ${prim.path}`);
        console.log(`[RENDER] Lookup path used: ${lookupPath}`);
        console.log(
          `[RENDER] _sourcePath: ${prim._sourcePath}, path: ${prim.path}`
        );
        console.log(
          `[RENDER] Available cache keys:`,
          Array.from(geometryCache.keys())
        );
      }

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
            console.warn(
              `[RENDER] Failed to resolve geometry for ${prim.path} via ref ${primName}. Ref: ${prim.references}`
            );
            // Debug: print cache keys
            // console.log("Cache keys:", Array.from(geometryCache.keys()));
          } else {
            console.log(
              `[RENDER] Resolved geometry for ${prim.path} from ref!`
            );
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
        // Check property based on user request ("custom string")
        const entityType = prim.properties?.entityType;

        // Helper: coerce colour value to something MeshStandardMaterial accepts.
        // prim.properties.displayColor is a THREE.Color (from hierarchyParser).
        // geomData.color is a plain sRGB hex integer (from extractGeometriesDirect).
        // displayColor strings like "[(0.5,0.5,0.5)]" are also handled.
        const resolveColor = (raw) => {
          if (raw === null || raw === undefined) return null;
          if (typeof raw === "number") return raw; // hex integer — use as-is
          if (raw && typeof raw === "object" && typeof raw.r === "number")
            return raw; // THREE.Color — MeshStandardMaterial accepts it
          if (typeof raw === "string" && raw.startsWith("[")) {
            const m = raw.match(/[\d.]+/g);
            if (m && m.length >= 3) {
              const ri = Math.round(parseFloat(m[0]) * 255) & 0xff;
              const gi = Math.round(parseFloat(m[1]) * 255) & 0xff;
              const bi = Math.round(parseFloat(m[2]) * 255) & 0xff;
              return (ri << 16) | (gi << 8) | bi;
            }
          }
          return null;
        };

        if (entityType === "placeholder") {
          finalColor = new THREE.Color(0x8fff8f); // Light Green
          opacity = 0.1;
          isWireframe = false;
        } else if (entityType === "Real Element") {
          if (state.stage.colorizeByStatus) {
            const status = resolvePrimStatus(prim, state.stage.layerStack);
            finalColor = new THREE.Color(getStatusColor(status));
          } else {
            finalColor =
              resolveColor(prim.properties.displayColor) ??
              resolveColor(geomData.color) ??
              0xcccccc;
          }
        } else if (state.stage.colorizeByStatus) {
          const status = resolvePrimStatus(prim, state.stage.layerStack);
          finalColor = new THREE.Color(getStatusColor(status));
        } else {
          finalColor =
            resolveColor(prim.properties.displayColor) ??
            resolveColor(geomData.color) ??
            0xcccccc;
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
