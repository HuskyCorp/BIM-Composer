// src/viewer/sceneSetup.js
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

export function initializeScene(scene, camera, renderer) {
  scene.background = new THREE.Color(0xffffff);
  renderer.setSize(
    renderer.domElement.clientWidth,
    renderer.domElement.clientHeight,
    false
  );
  camera.position.set(30, 30, 30);
  camera.lookAt(0, 0, 0);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1.5);
  scene.add(ambientLight);

  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.0);
  hemiLight.position.set(0, 50, 0);
  scene.add(hemiLight);

  const directionalLight = new THREE.DirectionalLight(0xffffff, Math.PI);
  directionalLight.position.set(50, 100, 50);
  scene.add(directionalLight);

  const gridHelper = new THREE.GridHelper(100, 100, 0xcccccc, 0xcccccc);
  gridHelper.material.opacity = 0.5;
  gridHelper.material.transparent = true;
  scene.add(gridHelper);

  const axesHelper = new THREE.AxesHelper(100);
  scene.add(axesHelper);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  controls.screenSpacePanning = true;
  controls.minDistance = 2;
  controls.maxDistance = 1000;
  controls.update();

  return controls;
}
