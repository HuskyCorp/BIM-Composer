// src/viewer/ThreeScene.js
import * as THREE from "three";
import { initializeScene } from "./sceneSetup.js";
import { SelectionController } from "./selectionController.js";

export class ThreeScene {
  constructor(canvas, parser, viewType) {
    this.canvas = canvas;
    this.parser = parser;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      75,
      canvas.clientWidth / canvas.clientHeight,
      0.1,
      1000
    );
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.useLegacyLights = false; // Physically correct lighting
    this.meshesGroup = new THREE.Group();
    this.outlinerEl = document.getElementById("usdaOutliner");
    this._viewType = viewType; // Store the view type ('stage', 'file', or 'history')

    this.controls = initializeScene(this.scene, this.camera, this.renderer);
    this.selectionController = new SelectionController(
      this.camera,
      this.renderer,
      this.meshesGroup,
      this.scene,
      this.canvas,
      viewType
    );

    this.init();
  }

  init() {
    this.scene.add(this.meshesGroup);
    window.addEventListener("resize", this.resize.bind(this));
  }

  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.renderer.setSize(width, height, false);
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.controls.update();
    this.selectionController.update();
    this.renderer.render(this.scene, this.camera);
  }
}
