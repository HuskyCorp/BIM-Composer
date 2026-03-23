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

    // Verify composePrimsFromHierarchy was called to serialize the new state
    expect(usdaComposer.composePrimsFromHierarchy).toHaveBeenCalled();

    // Verify that the serialized content is passed to composeLogPrim/logToStatement
    // We can inspect the calls to composeLogPrim or appendToUsdaFile

    // Specifically, logToStatement constructs an object with { serializedPrims: ... }
    // and passes it to composeLogPrim.
    expect(usdaComposer.composeLogPrim).toHaveBeenCalledWith(
      expect.objectContaining({
        serializedPrims: 'def Scope "Serialized" {}',
        entityType: "Real Element", // Default
      })
    );
  });

  it("should correctly identify Entity Placeholders in log", async () => {
    const inputEntity = [
      {
        path: "/Placeholder",
        sourceFile: "test.usda",
        type: "Cube", // Entity usually has type
        customData: { isWireframe: true }, // Markers of placeholder
        properties: {},
      },
    ];

    // stagePrims logic for 'isEntity' depends on valid input detection.
    // Let's force proper detection by mocking input structure if needed.
    // In stagePrims, isEntity is determined by checking if input list > 0 && isEntity flag/property?
    // Actually, stagePrims defines `isEntity` variable?
    // No, it's passed or inferred?
    // Looking at source: `const isEntity = options?.isEntity || ...`
    // (Assuming stagePrims has options arg or checks properties)

    // Let's pass options as 3rd arg if supported, or rely on properties.
    // Based on code: function stagePrims(sourcePrims, actionType, clearSelection = true, options = {})

    await stagePrims(inputEntity, { isEntity: true });

    expect(usdaComposer.composeLogPrim).toHaveBeenCalledWith(
      expect.objectContaining({
        Type: "Entity Placeholder",
        entityType: "placeholder",
        serializedPrims: expect.any(String),
      })
    );
  });
});
