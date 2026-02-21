// src/viewer/usda/parser/geometryParser.js
import * as THREE from "three";

export function extractGeometries(primHierarchy) {
  const meshes = [];
  if (!primHierarchy) return meshes;

  function findGeometry(prims) {
    prims.forEach((prim) => {
      let geometry;
      const materialColor = prim.properties.displayColor || null;

      const content = prim._rawContent || "";

      if (prim.type === "Mesh") {
        const pointsMatch = content.match(/point3f\[\] points = \[([^]*?)\]/);
        const indicesMatch = content.match(
          /int\[\] faceVertexIndices = \[([^]*?)\]/
        );
        if (pointsMatch && indicesMatch) {
          const points = pointsMatch[1]
            .replace(/[\n\s]/g, "")
            .split("),(")
            .map((tuple) => {
              const values = tuple.replace(/[()]/g, "").split(",").map(Number);
              return new THREE.Vector3(values[0], values[2], -values[1]);
            });
          const indices = indicesMatch[1]
            .replace(/[\n\s]/g, "")
            .split(",")
            .map(Number);
          geometry = new THREE.BufferGeometry();
          const positions = new Float32Array(points.length * 3);
          for (let i = 0; i < points.length; i++) {
            positions[i * 3] = points[i].x;
            positions[i * 3 + 1] = points[i].y;
            positions[i * 3 + 2] = points[i].z;
          }
          geometry.setAttribute(
            "position",
            new THREE.BufferAttribute(positions, 3)
          );
          geometry.setIndex(indices);
          geometry.computeVertexNormals();
          meshes.push({
            name: prim.path.substring(1),
            geometry,
            color: materialColor,
            type: "Mesh",
            opacity: prim.properties.opacity
              ? parseFloat(prim.properties.opacity)
              : undefined,
          });
        }
      } else if (prim.type === "Sphere") {
        const radiusMatch = content.match(/double radius = ([\d.]+)/);
        const radius = radiusMatch ? parseFloat(radiusMatch[1]) : 1.0;
        geometry = new THREE.SphereGeometry(radius, 32, 32);
        meshes.push({
          name: prim.path.substring(1),
          geometry,
          color: materialColor,
          type: "Sphere",
        });
      } else if (prim.type === "Cube") {
        const sizeMatch = content.match(/double size = ([\d.]+)/);
        const size = sizeMatch ? parseFloat(sizeMatch[1]) : 1.0;
        geometry = new THREE.BoxGeometry(size, size, size);
        meshes.push({
          name: prim.path.substring(1),
          geometry,
          color: materialColor,
          type: "Cube",
          isWireframe: prim.customData?.isWireframe,
          opacity: prim.properties.opacity
            ? parseFloat(prim.properties.opacity)
            : 1.0,
        });
      }

      if (prim.children && prim.children.length > 0) {
        findGeometry(prim.children);
      }
    });
  }

  findGeometry(primHierarchy);
  return meshes;
}

// ---------------------------------------------------------------------------
// Fast O(n) extractor for large IFC-converted USDA files.
//
// parsePrimTree is O(n²): for every prim it calls findMatchingBrace, which
// scans the remaining file text → tens of GB of work on a 24 MB USDA.
// The browser freezes or returns empty results with no visible error.
//
// This function makes ONE linear pass:
//  1. Pre-scan _Materials for diffuseColor + opacity per material name.
//  2. Stream lines tracking brace depth, parent Xform name, and Mesh blocks.
//     Inside each Mesh: collect faceVertexIndices, points, and the first
//     material:binding from any GeomSubset child.
// ---------------------------------------------------------------------------
export function extractGeometriesDirect(usdaText) {
  const meshes = [];
  console.log(
    `[extractGeometriesDirect] Starting. File: ${Math.round(usdaText.length / 1024)} KB`
  );

  // ── Step 1: material color / opacity ────────────────────────────────────
  const matColors = {};
  const matOpacities = {};

  console.time("[extractGeometriesDirect] Step1: material scan");
  const matNameRe = /def\s+Material\s+"([^"]+)"/g;
  let mm;
  while ((mm = matNameRe.exec(usdaText)) !== null) {
    const matName = mm[1];
    const snippet = usdaText.slice(mm.index, mm.index + 600);
    const cMatch = snippet.match(
      /color3f\s+inputs:diffuseColor\s*=\s*\(([\d.,\s]+)\)/
    );
    const oMatch = snippet.match(/float\s+inputs:opacity\s*=\s*([\d.]+)/);
    if (cMatch) {
      const [r, g, b] = cMatch[1].split(",").map(Number);
      matColors[matName] = new THREE.Color(r, g, b);
    }
    if (oMatch) {
      matOpacities[matName] = parseFloat(oMatch[1]);
    }
  }
  console.timeEnd("[extractGeometriesDirect] Step1: material scan");
  console.log(
    `[extractGeometriesDirect] Materials found: ${Object.keys(matColors).length}`
  );

  // ── Step 2: line-by-line state machine ──────────────────────────────────
  console.time("[extractGeometriesDirect] Step2: split lines");
  const lines = usdaText.split("\n");
  console.timeEnd("[extractGeometriesDirect] Step2: split lines");
  console.log(`[extractGeometriesDirect] Lines: ${lines.length}`);

  let insideMesh = false; // are we inside a `def Mesh "..."` body?
  let meshDepth = 0; // brace depth relative to the Mesh opening {
  let meshIndex = 0; // auto-increment for deduplication

  // Buffers for the current mesh
  let faceVertexIndices = null;
  let points = null;
  let boundMatName = null; // resolved from GeomSubset `material:binding`

  // Parent Xform tracking (IFC elements are always Xform parents of Mesh)
  const xformStack = []; // { name: string, depth: number }[]
  let globalDepth = 0; // brace depth for the file as a whole

  console.time("[extractGeometriesDirect] Step3: main line scan");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!insideMesh) {
      // Maintain global depth and pop closed Xform entries
      for (const ch of trimmed) {
        if (ch === "{") {
          globalDepth++;
        } else if (ch === "}") {
          globalDepth--;
          while (
            xformStack.length > 0 &&
            xformStack[xformStack.length - 1].depth >= globalDepth
          ) {
            xformStack.pop();
          }
        }
      }

      // Push Xform names onto the stack so we know the nearest parent later
      const xformM = trimmed.match(/^def\s+Xform\s+"([^"]+)"/);
      if (xformM) {
        xformStack.push({ name: xformM[1], depth: globalDepth });
      }

      // Detect the start of a Mesh prim (opening { may be on the same or next line)
      if (/^def\s+Mesh\s+"/.test(trimmed)) {
        let openLine = trimmed;
        let j = i;
        while (!openLine.includes("{") && j < lines.length - 1) {
          j++;
          openLine = lines[j].trim();
        }
        if (openLine.includes("{")) {
          insideMesh = true;
          meshDepth = 1;
          faceVertexIndices = null;
          points = null;
          boundMatName = null;
          i = j; // fast-forward
        }
      }
    } else {
      // Inside a Mesh body — track depth to know when we leave
      for (const ch of trimmed) {
        if (ch === "{") meshDepth++;
        else if (ch === "}") meshDepth--;
      }

      if (meshDepth === 0) {
        // Closed the Mesh — emit if we have both geometry arrays
        if (faceVertexIndices && points) {
          try {
            const parsedPoints = points
              .replace(/[\n\s]/g, "")
              .split("),(")
              .map((tuple) => {
                const [x, y, z] = tuple
                  .replace(/[()]/g, "")
                  .split(",")
                  .map(Number);
                // USD is Z-up; swap so Three.js sees Y-up
                return new THREE.Vector3(x, z, -y);
              });

            const parsedIndices = faceVertexIndices
              .replace(/[\n\s]/g, "")
              .split(",")
              .map(Number);

            const geometry = new THREE.BufferGeometry();
            const positions = new Float32Array(parsedPoints.length * 3);
            for (let k = 0; k < parsedPoints.length; k++) {
              positions[k * 3] = parsedPoints[k].x;
              positions[k * 3 + 1] = parsedPoints[k].y;
              positions[k * 3 + 2] = parsedPoints[k].z;
            }
            geometry.setAttribute(
              "position",
              new THREE.BufferAttribute(positions, 3)
            );
            geometry.setIndex(parsedIndices);
            geometry.computeVertexNormals();

            let color = null;
            let opacity = 1.0;
            if (boundMatName) {
              color = matColors[boundMatName] || null;
              opacity = matOpacities[boundMatName] ?? 1.0;
            }

            const xformName =
              xformStack.length > 0
                ? xformStack[xformStack.length - 1].name
                : `Mesh${meshIndex}`;
            meshIndex++;

            meshes.push({
              name: `${xformName}/Geometry`,
              geometry,
              color,
              opacity: opacity < 1.0 ? opacity : undefined,
              type: "Mesh",
            });
          } catch (_) {
            // Malformed geometry — skip silently, don't abort the whole file
          }
        }

        insideMesh = false;
        faceVertexIndices = null;
        points = null;
        boundMatName = null;
        continue;
      }

      // Collect geometry attributes (always single-line in OpenUSD output)
      if (
        faceVertexIndices === null &&
        trimmed.startsWith("int[] faceVertexIndices")
      ) {
        const m = trimmed.match(
          /int\[\]\s+faceVertexIndices\s*=\s*\[([^\]]+)\]/
        );
        if (m) faceVertexIndices = m[1];
      }

      if (points === null && trimmed.startsWith("point3f[] points")) {
        const idx = trimmed.indexOf("[");
        const end = trimmed.lastIndexOf("]");
        if (idx !== -1 && end !== -1) points = trimmed.slice(idx + 1, end);
      }

      // First GeomSubset `material:binding` wins
      if (boundMatName === null && trimmed.includes("material:binding")) {
        const bm = trimmed.match(
          /material:binding\s*=\s*<\/_Materials\/([^>]+)>/
        );
        if (bm) boundMatName = bm[1];
      }
    }
  }

  console.timeEnd("[extractGeometriesDirect] Step3: main line scan");
  console.log(
    `[extractGeometriesDirect] ✅ Done. Meshes extracted: ${meshes.length}`
  );

  return meshes;
}
