
import fs from 'fs';
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

describe("modalController debug", () => {
  let stagePrimsList;

  beforeEach(() => {
    vi.stubGlobal('requestAnimationFrame', (fn) => fn(0));
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
    stagePrimsList = document.getElementById("stage-prims-list");
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("DEBUG: should nest external items based on hierarchy", async () => {
    try {
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
        
        USDA_PARSER.USDA_PARSER.getPrimHierarchy.mockReturnValue([]);

        document.dispatchEvent(new CustomEvent("openPrimModal", {
            detail: { fileName, mode: "normal", preSelectedItems }
        }));
        await new Promise(r => setTimeout(r, 100));

        fs.writeFileSync('debug_output.txt', "DEBUG HTML Nesting:\n" + stagePrimsList.innerHTML + "\n\n");

        const items = stagePrimsList.querySelectorAll("li");
        let parentLi = null;
        let childLi = null;
        
        items.forEach(li => {
            if (li.dataset.primPath === "/External/Wall") parentLi = li;
            if (li.dataset.primPath === "/External/Wall/Mesh") childLi = li;
        });

        if (!parentLi) fs.appendFileSync('debug_output.txt', "Parent LI not found\n");
        if (!childLi) fs.appendFileSync('debug_output.txt', "Child LI not found\n");

        expect(parentLi).not.toBeNull();
        expect(childLi).not.toBeNull();
        expect(parentLi.contains(childLi)).toBe(true);
    } catch (e) {
        fs.writeFileSync('debug_error.txt', "Nesting Test Error:\n" + e.toString() + "\nStack:\n" + e.stack + "\nHTML:\n" + (stagePrimsList ? stagePrimsList.innerHTML : "N/A"));
        throw e;
    }
  });

  it("DEBUG: should apply correct status color", async () => {
    try {
        initModal(vi.fn());
        const fileName = "main.usda";
        
        const preSelectedItems = [
            { primPath: "/WIP/Object", originFile: "wip.usda", name: "Object", type: "Mesh" }
        ];

        store.getState.mockReturnValue({
            loadedFiles: { [fileName]: " " },
            stage: { 
                layerStack: [
                    { filePath: "wip.usda", status: "WIP" }
                ] 
            }
        });
        
        USDA_PARSER.USDA_PARSER.getPrimHierarchy.mockReturnValue([]);

        document.dispatchEvent(new CustomEvent("openPrimModal", {
            detail: { fileName, mode: "normal", preSelectedItems }
        }));
        await new Promise(r => setTimeout(r, 100));

        fs.appendFileSync('debug_output.txt', "DEBUG HTML Status:\n" + stagePrimsList.innerHTML + "\n\n");

        const wipLi = Array.from(stagePrimsList.querySelectorAll("li")).find(li => li.dataset.sourceFile === "wip.usda");
        if (!wipLi) {
             fs.appendFileSync('debug_output.txt', "WIP LI not found\n");
        } else {
             fs.appendFileSync('debug_output.txt', "WIP LI HTML: " + wipLi.innerHTML + "\n");
        }
        expect(wipLi.innerHTML).toContain("wip");
    } catch (e) {
         fs.appendFileSync('debug_error.txt', "\nStatus Test Error:\n" + e.toString() + "\nStack:\n" + e.stack);
         throw e;
    }
  });
});
