// Mock dependencies
vi.mock("../../../../core/index.js", () => ({
  store: {
    dispatch: vi.fn((action) => action),
    getState: vi.fn(),
  },
  errorHandler: {
    handleError: vi.fn(),
  },
}));

vi.mock("../../../../state/actions.js", () => ({
  actions: {
    setComposedPrims: vi.fn(),
    setComposedHierarchy: vi.fn(),
    incrementLogEntryCounter: vi.fn(() => 1),
    updateLoadedFile: vi.fn(),
    addStagedChange: vi.fn(),
  },
}));

vi.mock("../../../../viewer/usda/usdaParser.js", () => ({
  USDA_PARSER: {
    parseUSDA: vi.fn(),
    appendToUsdaFile: vi.fn(),
    getPrimHierarchy: vi.fn(),
  },
}));

// Mock composer to return predictable strings
vi.mock("../../../../viewer/usda/usdaComposer.js", () => ({
  composeLogPrim: vi.fn(),
  composePrimsFromHierarchy: vi.fn(),
}));

// Mock js-sha256
vi.mock("js-sha256", () => ({
  sha256: vi.fn(() => "mockedHash"),
}));

vi.mock("../../../../components/sidebar/layerStackController.js", () => ({
  renderLayerStack: vi.fn(),
  recomposeStage: vi.fn(),
}));

import { stagePrims } from "../../../../components/staging/primStaging.js";
import { store } from "../../../../core/index.js";
import { actions } from "../../../../state/actions.js";
import { USDA_PARSER } from "../../../../viewer/usda/usdaParser.js";
import * as usdaComposer from "../../../../viewer/usda/usdaComposer.js";

describe("Prim Staging (History Integration)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.getState.mockReturnValue({
      stage: {
        layerStack: [{ filePath: "test.usda", status: "WIP" }],
        composedPrims: [],
      },
      headCommitId: "HEAD",
      logEntryCounter: 0,
      currentFile: "test.usda",
      loadedFiles: {
        "test.usda": 'def Scope "TestPrim" {}',
        "statement.usda": 'def "ChangeLog" {}',
      },
    });

    // Default mocks
    USDA_PARSER.parseUSDA.mockReturnValue([]);
    // Return hierarchy that matches the paths used in tests
    USDA_PARSER.getPrimHierarchy.mockReturnValue([
      {
        path: "/TestPrim",
        type: "Scope",
        properties: {},
        name: "TestPrim",
        children: [],
      },
      {
        path: "/Placeholder",
        type: "Cube",
        properties: {},
        name: "Placeholder",
        children: [],
      },
    ]);

    usdaComposer.composePrimsFromHierarchy.mockReturnValue(
      'def Scope "Serialized" {}'
    );
    usdaComposer.composeLogPrim.mockReturnValue('def "Log_1" {}');
  });

  it("should generate serialized prims for history log", async () => {
    const inputPrims = [
      {
        path: "/TestPrim",
        sourceFile: "test.usda",
        type: "Scope",
        properties: {},
      },
    ];

    await stagePrims(inputPrims);

    expect(actions.addStagedChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "primStaging",
        targetPath: "/TestPrim",
        entityType: "Real Element",
        sourceFile: "test.usda",
      })
    );
  });

  it("should correctly identify Entity Placeholders in log", async () => {
    const inputEntity = [
      {
        path: "/Placeholder",
        sourceFile: "test.usda",
        type: "Cube",
        customData: { isWireframe: true },
        properties: {},
      },
    ];

    await stagePrims(inputEntity, { isEntity: true });

    expect(actions.addStagedChange).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "entityStaging",
        targetPath: "/Placeholder",
        entityType: "placeholder",
        sourceFile: "test.usda",
      })
    );
  });
});
