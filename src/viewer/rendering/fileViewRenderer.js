// src/viewer/rendering/fileViewRenderer.js
import * as THREE from "three";
import { buildFileOutliner } from "../../components/outlinerController.js";

function clearScene(threeScene) {
  while (threeScene.meshesGroup.children.length > 0) {
    const mesh = threeScene.meshesGroup.children[0];
    threeScene.meshesGroup.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) mesh.material.dispose();
  }
  threeScene.selectionController.clearSelection();
}

export function renderFileView(threeScene, filesData) {
  clearScene(threeScene);

  if (!filesData || filesData.length === 0) {
    threeScene.outlinerEl.innerHTML = "";
    return;
  }

  const combinedHierarchy = {};

  filesData.forEach((fileData) => {
    const { name: fileName, content: usdaContent } = fileData;
    console.log(
      `[renderFileView] Calling parseUSDA on "${fileName}" (${Math.round(usdaContent.length / 1024)} KB)`
    );
    console.time("[renderFileView] parseUSDA");
    const parsedMeshesData = threeScene.parser.parseUSDA(usdaContent);
    console.timeEnd("[renderFileView] parseUSDA");
    console.log(
      `[renderFileView] parseUSDA returned ${parsedMeshesData.length} meshes for "${fileName}"`
    );

    if (parsedMeshesData.length === 0) {
      console.warn(
        `[renderFileView] ⚠️ No meshes — scene empty. Check parser output above.`
      );
      return;
    }

    // Ensure file entry in hierarchy
    if (!combinedHierarchy[fileName]) {
      combinedHierarchy[fileName] = {};
    }

    console.time("[renderFileView] build Three.js scene");
    parsedMeshesData.forEach((data) => {
      const nameParts = data.name.split("/");
      const primName = nameParts.pop();
      const xformName =
        nameParts.length > 0 ? nameParts[nameParts.length - 1] : "Root";

      if (!combinedHierarchy[fileName][xformName]) {
        combinedHierarchy[fileName][xformName] = [];
      }

      const geometry = data.geometry;
      const isTransparent = data.opacity !== undefined && data.opacity < 1.0;
      const material = new THREE.MeshStandardMaterial({
        color: data.color ? data.color.getHex() : 0xcccccc,
        side: THREE.DoubleSide,
        transparent: isTransparent,
        opacity: isTransparent ? data.opacity : 1.0,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = data.name;

      const childItem = document.createElement("li");
      childItem.classList.add("prim-item");
      childItem.dataset.meshName = data.name;
      childItem.dataset.primPath = `/${data.name}`;
      childItem.innerHTML = `<div class="outliner-row"><span class="outliner-toggler" style="visibility: hidden;"></span><span class="outliner-icon">🧊</span><span class="outliner-text">${primName}</span><span class="visibility-toggle">👁️</span></div>`;
      mesh.userData.outlinerElement = childItem;
      mesh.userData.originalMaterial = material;
      mesh.userData.primPath = `/${data.name}`;
      mesh.userData.originFile = fileName;

      threeScene.meshesGroup.add(mesh);
      combinedHierarchy[fileName][xformName].push({
        name: primName,
        mesh: mesh,
      });
    });
    console.timeEnd("[renderFileView] build Three.js scene");
  });

  buildFileOutliner(threeScene.outlinerEl, combinedHierarchy);
}
