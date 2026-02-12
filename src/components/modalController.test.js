
// Note: vi, describe, it, expect, beforeEach, afterEach are available globally via globals: true in vite.config.js
import { initModal } from "./modalController";
import { store } from "../core/index.js";
import * as USDA_PARSER from "../viewer/usda/usdaParser.js";

// Mock dependencies
vi.mock("../core/index.js", () => ({
  store: {
    getState: vi.fn(),
    dispatch: vi.fn(),
    subscribe: vi.fn(),
  },
  errorHandler: {
    wrap: (fn) => fn,
    wrapAsync: (fn) => fn,
  },
  ValidationError: class extends Error {},
  FileError: class extends Error {},
  ParseError: class extends Error {},
}));

vi.mock("../viewer/usda/usdaParser.js", () => ({
  USDA_PARSER: {
    getPrimHierarchy: vi.fn(),
  },
}));

vi.mock("./staging/primStaging.js", () => ({
  stagePrims: vi.fn(),
}));

describe("modalController", () => {
  let availablePrimsList;
  let stagePrimsList;

  beforeEach(() => {
    // Stub requestAnimationFrame to avoid hang in buildTreeUI
    vi.stubGlobal('requestAnimationFrame', (fn) => fn(0));

    // Setup DOM elements
    document.body.innerHTML = `
      <div id="prim-selection-modal" style="display: none;">
        <div class="modal-header"><h2></h2></div>
        <ul id="available-prims-list"></ul>
        <ul id="stage-prims-list"></ul>
        <button id="add-prim-to-stage">></button>
        <button id="remove-prim-from-stage"><</button>
        <button id="add-all-prims-to-stage">>></button>
        <button id="remove-all-prims-from-stage"><<</button>
        <button id="save-hierarchy-button">Save</button>
        <button id="close-modal-button">Close</button>
      </div>
    `;

    availablePrimsList = document.getElementById("available-prims-list");
    stagePrimsList = document.getElementById("stage-prims-list");
  });

  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = "";
  });

  it("should move multiple items (local and external) to stage list when opening modal", async () => {
    console.error("DEBUG: TEST START");
    initModal(vi.fn());

    const fileName = "test.usda";
    const externalFile = "external.usda";
    
    const preSelectedItems = [
        { primPath: "/World/Cube", originFile: fileName, name: "Cube", type: "Mesh" }, // Local
        { primPath: "/External/Sphere", originFile: externalFile, name: "Sphere", type: "Mesh" } // External
    ];

    // Mock store state
    store.getState.mockReturnValue({
      loadedFiles: {
        [fileName]: "some content",
      },
      stage: {
        layerStack: [],
      },
    });

    // Mock parser result for LOCAL file only
    USDA_PARSER.USDA_PARSER.getPrimHierarchy.mockReturnValue([
        {
          path: "/World",
          name: "World",
          type: "Xform",
          children: [
            { path: "/World/Cube", name: "Cube", type: "Mesh", properties: {} },
            { path: "/World/Cone", name: "Cone", type: "Mesh", properties: {} },
          ],
          properties: {},
        },
      ]);

    // Dispatch event to open modal
    const event = new CustomEvent("openPrimModal", {
      detail: {
        fileName,
        mode: "normal",
        preSelectedItems,
      },
    });
    document.dispatchEvent(event);

    // Wait for async operations
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Helper to find li by data-prim-path
    const findInList = (list, path) => {
      const items = list.querySelectorAll("li");
      for (const item of items) {
        if (item.dataset.primPath === path) return item;
      }
      return null;
    };

    const cubeInStage = findInList(stagePrimsList, "/World/Cube");
    const sphereInStage = findInList(stagePrimsList, "/External/Sphere");
    
    if (!cubeInStage || !sphereInStage) {
        console.log("Stage Prims List HTML:", stagePrimsList.innerHTML);
    }

    expect(cubeInStage, `Stage Content: ${stagePrimsList.innerHTML}. Available Content: ${availablePrimsList.innerHTML}`).not.toBeNull();
    expect(sphereInStage, `Stage Content: ${stagePrimsList.innerHTML}`).not.toBeNull();
    
    // Check source files
    expect(cubeInStage.dataset.sourceFile).toBe(fileName); // Local items now have sourceFile set
    expect(sphereInStage.dataset.sourceFile).toBe(externalFile);

    // Also verify they are NOT in available anymore (local only)
    const cubeInAvailable = findInList(availablePrimsList, "/World/Cube");
    expect(cubeInAvailable).toBeNull();
  });

  it("should nest external items based on hierarchy", async () => {
    initModal(vi.fn());
    const fileName = "main.usda";
    
    const preSelectedItems = [
        { primPath: "/External/Wall/Mesh", originFile: "wall.usda", name: "Mesh", type: "Mesh" },
        { primPath: "/External/Wall", originFile: "wall.usda", name: "Wall", type: "Group" }
    ];

    store.getState.mockReturnValue({
        loadedFiles: { [fileName]: " " },
        stage: { layerStack: [] }
    });
    
    // Stub local hierarchy
    USDA_PARSER.USDA_PARSER.getPrimHierarchy.mockReturnValue([]);

    document.dispatchEvent(new CustomEvent("openPrimModal", {
        detail: { fileName, mode: "normal", preSelectedItems }
    }));
    await new Promise(r => setTimeout(r, 100));

    // Find parent LI
    const items = stagePrimsList.querySelectorAll("li");
    let parentLi = null;
    let childLi = null;
    
    items.forEach(li => {
        if (li.dataset.primPath === "/External/Wall") parentLi = li;
        if (li.dataset.primPath === "/External/Wall/Mesh") childLi = li;
    });

    expect(parentLi).not.toBeNull();
    expect(childLi).not.toBeNull();
    
    // Child should be inside Parent's UL
    expect(parentLi.contains(childLi)).toBe(true);
  });

  it("should apply correct status color to external items", async () => {
    initModal(vi.fn());
    const fileName = "main.usda";
    
    const preSelectedItems = [
        { primPath: "/WIP/Object", originFile: "wip.usda", name: "Object", type: "Mesh" },
        { primPath: "/Pub/Object", originFile: "pub.usda", name: "Object", type: "Mesh" }
    ];

    store.getState.mockReturnValue({
        loadedFiles: { [fileName]: " " },
        stage: { 
            layerStack: [
                { filePath: "wip.usda", status: "WIP" },
                { filePath: "pub.usda", status: "Published" }
            ] 
        }
    });
    
    USDA_PARSER.USDA_PARSER.getPrimHierarchy.mockReturnValue([]);

    document.dispatchEvent(new CustomEvent("openPrimModal", {
        detail: { fileName, mode: "normal", preSelectedItems }
    }));
    await new Promise(r => setTimeout(r, 100));

    const wipLi = Array.from(stagePrimsList.querySelectorAll("li")).find(li => li.dataset.sourceFile === "wip.usda");
    const pubLi = Array.from(stagePrimsList.querySelectorAll("li")).find(li => li.dataset.sourceFile === "pub.usda");

    expect(wipLi.innerHTML).toContain("wip"); // Check for class or status text
    expect(pubLi.innerHTML).toContain("published");
  });
});
