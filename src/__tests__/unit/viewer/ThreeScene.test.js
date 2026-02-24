/**
 * Tests for ThreeScene
 * Since jsdom doesn't provide WebGL, we mock Three.js dependencies
 * and test the class logic, structure, and method behavior.
 */

// Mock Three.js module before importing ThreeScene
// Use regular functions (not arrows) so they can be called with `new`
vi.mock("three", () => {
  return {
    Scene: vi.fn(function () {
      this.add = vi.fn();
      this.children = [];
      this.background = null;
    }),
    PerspectiveCamera: vi.fn(function (fov, aspect, near, far) {
      this.fov = fov;
      this.aspect = aspect;
      this.near = near;
      this.far = far;
      this.position = { set: vi.fn() };
      this.lookAt = vi.fn();
      this.updateProjectionMatrix = vi.fn();
    }),
    WebGLRenderer: vi.fn(function ({ canvas }) {
      this.setSize = vi.fn();
      this.render = vi.fn();
      this.dispose = vi.fn();
      this.domElement = canvas;
    }),
    Group: vi.fn(function () {
      this.children = [];
    }),
    Color: vi.fn(function () {}),
    AmbientLight: vi.fn(function () {}),
    DirectionalLight: vi.fn(function () {
      this.position = { set: vi.fn() };
    }),
    GridHelper: vi.fn(function () {
      this.material = { opacity: 0, transparent: false };
    }),
    Raycaster: vi.fn(function () {
      this.setFromCamera = vi.fn();
      this.intersectObjects = vi.fn(() => []);
    }),
    Vector2: vi.fn(function () {}),
    Vector3: vi.fn(function () {
      this.set = vi.fn();
    }),
    Box3: vi.fn(function () {
      this.setFromObject = vi.fn();
      this.getCenter = vi.fn(() => ({ x: 0, y: 0, z: 0 }));
      this.getSize = vi.fn(() => ({ x: 1, y: 1, z: 1 }));
    }),
    MeshBasicMaterial: vi.fn(function () {}),
    LineBasicMaterial: vi.fn(function () {}),
    EdgesGeometry: vi.fn(function () {}),
    LineSegments: vi.fn(function () {}),
    BoxGeometry: vi.fn(function () {}),
    Mesh: vi.fn(function () {}),
    SRGBColorSpace: "srgb",
  };
});

// Mock OrbitControls
vi.mock("three/addons/controls/OrbitControls.js", () => ({
  OrbitControls: vi.fn(function () {
    this.enableDamping = false;
    this.dampingFactor = 0;
    this.screenSpacePanning = false;
    this.minDistance = 0;
    this.maxDistance = 0;
    this.maxPolarAngle = 0;
    this.update = vi.fn();
    this.dispose = vi.fn();
  }),
}));

// Mock sceneSetup - returns controls object
vi.mock("../../../viewer/sceneSetup.js", () => ({
  initializeScene: vi.fn(() => ({
    update: vi.fn(),
    dispose: vi.fn(),
  })),
}));

// Mock selectionController
vi.mock("../../../viewer/selectionController.js", () => ({
  SelectionController: vi.fn(function () {
    this.update = vi.fn();
    this.dispose = vi.fn();
  }),
}));

// Now import ThreeScene after mocks are set up
const { ThreeScene } = await import("../../../viewer/ThreeScene.js");

describe("ThreeScene", () => {
  let canvas;
  let mockParser;
  let scene;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create a mock canvas with dimensions
    canvas = document.createElement("canvas");
    canvas.style.width = "800px";
    canvas.style.height = "600px";
    Object.defineProperty(canvas, "clientWidth", {
      value: 800,
      configurable: true,
    });
    Object.defineProperty(canvas, "clientHeight", {
      value: 600,
      configurable: true,
    });
    document.body.appendChild(canvas);

    // Create mock outliner element
    const outliner = document.createElement("div");
    outliner.id = "usdaOutliner";
    document.body.appendChild(outliner);

    // Mock parser
    mockParser = {
      parse: vi.fn(),
      getHierarchy: vi.fn(() => []),
    };
  });

  afterEach(() => {
    const outliner = document.getElementById("usdaOutliner");
    if (outliner) document.body.removeChild(outliner);
    if (canvas && canvas.parentElement) document.body.removeChild(canvas);
    scene = null;
  });

  describe("initialization", () => {
    it("should create scene, camera, and renderer", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.scene).toBeDefined();
      expect(scene.camera).toBeDefined();
      expect(scene.renderer).toBeDefined();
      expect(scene.canvas).toBe(canvas);
    });

    it("should set correct camera aspect ratio", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.camera.aspect).toBeCloseTo(800 / 600, 2);
    });

    it("should create meshes group", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.meshesGroup).toBeDefined();
      expect(scene.scene.add).toHaveBeenCalledWith(scene.meshesGroup);
    });

    it("should create selection controller", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.selectionController).toBeDefined();
    });

    it("should store view type", () => {
      scene = new ThreeScene(canvas, mockParser, "file");

      expect(scene._viewType).toBe("file");
    });

    it("should accept different view types", () => {
      ["stage", "file", "history"].forEach((viewType) => {
        scene = new ThreeScene(canvas, mockParser, viewType);
        expect(scene._viewType).toBe(viewType);
      });
    });

    it("should store parser reference", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.parser).toBe(mockParser);
    });
  });

  describe("resize", () => {
    it("should update camera aspect ratio on resize", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      Object.defineProperty(canvas, "clientWidth", {
        value: 1024,
        configurable: true,
      });
      Object.defineProperty(canvas, "clientHeight", {
        value: 768,
        configurable: true,
      });

      scene.resize();

      expect(scene.camera.aspect).toBeCloseTo(1024 / 768, 2);
    });

    it("should call updateProjectionMatrix on resize", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      Object.defineProperty(canvas, "clientWidth", {
        value: 1024,
        configurable: true,
      });
      Object.defineProperty(canvas, "clientHeight", {
        value: 768,
        configurable: true,
      });

      scene.resize();

      expect(scene.camera.updateProjectionMatrix).toHaveBeenCalled();
    });

    it("should call renderer setSize on resize", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      Object.defineProperty(canvas, "clientWidth", {
        value: 1024,
        configurable: true,
      });
      Object.defineProperty(canvas, "clientHeight", {
        value: 768,
        configurable: true,
      });

      scene.resize();

      expect(scene.renderer.setSize).toHaveBeenCalledWith(1024, 768, false);
    });

    it("should not update if dimensions match canvas width/height", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      // Reset mock counts after construction
      scene.renderer.setSize.mockClear();

      // Set canvas.width and canvas.height to match clientWidth/clientHeight
      canvas.width = 800;
      canvas.height = 600;

      scene.resize();

      expect(scene.renderer.setSize).not.toHaveBeenCalled();
    });
  });

  describe("animate", () => {
    it("should be a callable function", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(typeof scene.animate).toBe("function");
    });

    it("should call controls.update during animation", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);

      scene.animate();

      expect(scene.controls.update).toHaveBeenCalled();

      vi.restoreAllMocks();
    });

    it("should call renderer.render with scene and camera", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);

      scene.animate();

      expect(scene.renderer.render).toHaveBeenCalledWith(
        scene.scene,
        scene.camera
      );

      vi.restoreAllMocks();
    });

    it("should request next animation frame", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      const rafSpy = vi
        .spyOn(window, "requestAnimationFrame")
        .mockImplementation(() => 1);

      scene.animate();

      expect(rafSpy).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  describe("scene setup", () => {
    it("should add meshesGroup to scene on init", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.scene.add).toHaveBeenCalledWith(scene.meshesGroup);
    });

    it("should initialize with meshesGroup", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.meshesGroup).toBeDefined();
    });
  });

  describe("event listeners", () => {
    it("should add resize listener on init", () => {
      const addEventListenerSpy = vi.spyOn(window, "addEventListener");

      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(addEventListenerSpy).toHaveBeenCalledWith(
        "resize",
        expect.any(Function)
      );

      addEventListenerSpy.mockRestore();
    });
  });

  describe("renderer configuration", () => {
    it("should create renderer with canvas", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.renderer).toBeDefined();
      expect(scene.renderer.domElement).toBe(canvas);
    });
  });

  describe("camera configuration", () => {
    it("should create perspective camera with correct FOV", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.camera.fov).toBe(75);
    });

    it("should set near and far planes", () => {
      scene = new ThreeScene(canvas, mockParser, "stage");

      expect(scene.camera.near).toBe(0.1);
      expect(scene.camera.far).toBe(1000);
    });
  });
});
