import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { initViewControls } from "../../../components/viewControls.js";
import { store } from "../../../core/index.js";
import { actions } from "../../../state/actions.js";

// Mock dependencies
vi.mock("../../../core/index.js", () => ({
  store: {
    getState: vi.fn(),
  },
}));

vi.mock("../../../state/actions.js", () => ({
  actions: {
    updateLoadedFile: vi.fn(),
    setCurrentFile: vi.fn(),
    setSelectedFiles: vi.fn(),
    setCurrentView: vi.fn(),
    setSaveStatusFilter: vi.fn(),
  },
}));

vi.mock("../../../viewer/usda/usdaComposer.js", () => ({
  generateStageUsda: vi.fn().mockReturnValue("mocked usda content"),
}));

vi.mock("../../../viewer/rendering/fileViewRenderer.js", () => ({
  renderFileView: vi.fn(),
}));

vi.mock("../../../viewer/rendering/stageViewRenderer.js", () => ({
  renderStageView: vi.fn(),
}));

vi.mock("../../../utils/atomicFileHandler.js", () => ({
  validateUsdaSyntax: vi
    .fn()
    .mockReturnValue({ valid: true, errors: [], warnings: [] }),
}));

describe("viewControls", () => {
  let fileThreeScene, stageThreeScene, historyThreeScene;
  let domElements;

  beforeEach(() => {
    // Setup DOM
    document.body.innerHTML = "";

    domElements = {
      view3d: document.createElement("button"),
      viewCode: document.createElement("button"),
      usdaEditor: document.createElement("textarea"),
      webglCanvas: document.createElement("canvas"),
      stageCanvas: document.createElement("canvas"),
      historyCanvas: document.createElement("canvas"),
      saveButton: document.createElement("button"),
      themeToggle: document.createElement("button"),
      currentFileTab: document.createElement("div"),
      "save-options-modal": document.createElement("div"),
      "cancel-save-button": document.createElement("button"),
      "confirm-save-button": document.createElement("button"),
      "save-filter-wip": Object.assign(document.createElement("input"), {
        type: "checkbox",
      }),
      "save-filter-shared": Object.assign(document.createElement("input"), {
        type: "checkbox",
      }),
      "save-filter-published": Object.assign(document.createElement("input"), {
        type: "checkbox",
      }),
      "save-filter-archived": Object.assign(document.createElement("input"), {
        type: "checkbox",
      }),
    };

    Object.entries(domElements).forEach(([id, el]) => {
      el.id = id;
      document.body.appendChild(el);
    });

    // Mock Three.js scenes
    const mockGridHelper = {
      isGridHelper: true,
      material: { color: { setHex: vi.fn() }, opacity: 1 },
    };
    const mockAxesHelper = { isAxesHelper: true, visible: true };
    const createMockScene = () => ({
      scene: {
        background: { setHex: vi.fn() },
        children: [mockGridHelper, mockAxesHelper],
      },
      resize: vi.fn(),
    });

    fileThreeScene = createMockScene();
    stageThreeScene = createMockScene();
    historyThreeScene = createMockScene();

    // Mock localStorage
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue(null);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});

    // Mock store state
    store.getState.mockReturnValue({
      isHistoryMode: false,
      currentView: "stage",
      stage: {
        composedPrims: [],
      },
      loadedFiles: {},
      selectedFiles: [],
    });

    // reset timers
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it("should initialize with light theme by default", () => {
    initViewControls(fileThreeScene, stageThreeScene, historyThreeScene);

    // Fast forward setTimeout for updateThreeJSColors
    vi.runAllTimers();

    expect(document.body.classList.contains("dark-theme")).toBe(false);
    expect(fileThreeScene.scene.background.setHex).toHaveBeenCalledWith(
      0xffffff
    );

    const gridHelper = fileThreeScene.scene.children[0];
    expect(gridHelper.material.color.setHex).toHaveBeenCalledWith(0xcccccc);
    expect(gridHelper.material.opacity).toBe(0.5);

    const axesHelper = fileThreeScene.scene.children[1];
    expect(axesHelper.visible).toBe(true);
  });

  it("should initialize with dark theme if specified in localStorage", () => {
    Storage.prototype.getItem.mockReturnValue("dark");

    initViewControls(fileThreeScene, stageThreeScene, historyThreeScene);
    vi.runAllTimers();

    expect(document.body.classList.contains("dark-theme")).toBe(true);
    expect(domElements.themeToggle.textContent).toBe("☀️");

    expect(fileThreeScene.scene.background.setHex).toHaveBeenCalledWith(
      0x2e2e2e
    );
    const gridHelper = fileThreeScene.scene.children[0];
    const axesHelper = fileThreeScene.scene.children[1];

    expect(gridHelper.material.color.setHex).toHaveBeenCalledWith(0xffffff);
    expect(gridHelper.material.opacity).toBe(0.2);
    expect(axesHelper.visible).toBe(false);
  });

  it("should toggle theme when themeToggle button is clicked", () => {
    initViewControls(fileThreeScene, stageThreeScene, historyThreeScene);
    vi.runAllTimers();
    fileThreeScene.scene.background.setHex.mockClear();

    // Act: click toggle
    domElements.themeToggle.click();

    // Verify dark mode is applied
    expect(document.body.classList.contains("dark-theme")).toBe(true);
    expect(domElements.themeToggle.textContent).toBe("☀️");
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      "usda-composer-theme",
      "dark"
    );
    expect(fileThreeScene.scene.background.setHex).toHaveBeenCalledWith(
      0x2e2e2e
    );

    // Act: click toggle again
    domElements.themeToggle.click();

    // Verify light mode is restored
    expect(document.body.classList.contains("dark-theme")).toBe(false);
    expect(domElements.themeToggle.textContent).toBe("🌚");
    expect(Storage.prototype.setItem).toHaveBeenCalledWith(
      "usda-composer-theme",
      "light"
    );
    expect(fileThreeScene.scene.background.setHex).toHaveBeenCalledWith(
      0xffffff
    );
  });

  it("should switch to history canvas in history mode", () => {
    store.getState.mockReturnValue({ isHistoryMode: true });

    const { updateView } = initViewControls(
      fileThreeScene,
      stageThreeScene,
      historyThreeScene
    );
    updateView();

    expect(domElements.historyCanvas.style.display).toBe("block");
    expect(domElements.webglCanvas.style.display).toBe("none");
    expect(domElements.stageCanvas.style.display).toBe("none");
    expect(domElements.usdaEditor.style.display).toBe("none");
    expect(historyThreeScene.resize).toHaveBeenCalled();
  });

  it("should show fileCanvas in file view mode", () => {
    const state = {
      isHistoryMode: false,
      currentView: "file",
      currentFile: "test.usda",
      loadedFiles: { "test.usda": "content" },
      stage: { layerStack: [] },
      currentUser: "Project Manager",
    };
    store.getState.mockReturnValue(state);

    const { updateView } = initViewControls(
      fileThreeScene,
      stageThreeScene,
      historyThreeScene
    );
    updateView();

    expect(domElements.webglCanvas.style.display).toBe("block");
    expect(domElements.stageCanvas.style.display).toBe("none");
    expect(fileThreeScene.resize).toHaveBeenCalled();
  });
});
