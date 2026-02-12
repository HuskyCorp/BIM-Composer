// src/__tests__/unit/utils/statusUtils.test.js
/**
 * Tests for status utility functions
 * Note: describe, it, expect are available globally via globals: true in vite.config.js
 */
import {
  STATUS_COLORS,
  STATUS_HEX_COLORS,
  resolvePrimStatus,
  getStatusColor,
  getStatusCssColor,
} from "../../../utils/statusUtils.js";

describe("statusUtils", () => {
  describe("STATUS_COLORS", () => {
    it("should define colors for all statuses", () => {
      expect(STATUS_COLORS.WIP).toBe(0xffa500);
      expect(STATUS_COLORS.Shared).toBe(0x007aff);
      expect(STATUS_COLORS.Published).toBe(0x28a745);
      expect(STATUS_COLORS.Archived).toBe(0x808080);
    });

    it("should have numeric color values", () => {
      Object.values(STATUS_COLORS).forEach((color) => {
        expect(typeof color).toBe("number");
      });
    });
  });

  describe("STATUS_HEX_COLORS", () => {
    it("should define hex colors for all statuses", () => {
      expect(STATUS_HEX_COLORS.WIP).toBe("#ffa500");
      expect(STATUS_HEX_COLORS.Shared).toBe("#007aff");
      expect(STATUS_HEX_COLORS.Published).toBe("#28a745");
      expect(STATUS_HEX_COLORS.Archived).toBe("#808080");
    });

    it("should have string color values", () => {
      Object.values(STATUS_HEX_COLORS).forEach((color) => {
        expect(typeof color).toBe("string");
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      });
    });

    it("should match numeric colors in STATUS_COLORS", () => {
      expect(STATUS_HEX_COLORS.WIP).toBe("#" + STATUS_COLORS.WIP.toString(16));
      expect(STATUS_HEX_COLORS.Shared).toBe(
        "#" + STATUS_COLORS.Shared.toString(16).padStart(6, "0")
      );
      expect(STATUS_HEX_COLORS.Published).toBe(
        "#" + STATUS_COLORS.Published.toString(16)
      );
      expect(STATUS_HEX_COLORS.Archived).toBe(
        "#" + STATUS_COLORS.Archived.toString(16)
      );
    });
  });

  describe("resolvePrimStatus", () => {
    describe("when prim has status property", () => {
      it("should return the prim status property (source of truth)", () => {
        const prim = {
          properties: { status: "WIP" },
          _sourceFile: "layer1.usda",
        };
        const layerStack = [{ filePath: "layer1.usda", status: "Published" }];

        expect(resolvePrimStatus(prim, layerStack)).toBe("WIP");
      });

      it("should prioritize prim status over layer status", () => {
        const prim = {
          properties: { status: "Shared" },
          _sourceFile: "layer1.usda",
        };
        const layerStack = [{ filePath: "layer1.usda", status: "WIP" }];

        expect(resolvePrimStatus(prim, layerStack)).toBe("Shared");
      });

      it("should work for all valid statuses", () => {
        const statuses = ["WIP", "Shared", "Published", "Archived"];
        statuses.forEach((status) => {
          const prim = { properties: { status } };
          expect(resolvePrimStatus(prim, [])).toBe(status);
        });
      });
    });

    describe("when prim has no status property", () => {
      it("should fallback to source layer status", () => {
        const prim = {
          properties: {},
          _sourceFile: "layer1.usda",
        };
        const layerStack = [{ filePath: "layer1.usda", status: "Shared" }];

        expect(resolvePrimStatus(prim, layerStack)).toBe("Shared");
      });

      it("should match source file to layer by filePath", () => {
        const prim = {
          properties: {},
          _sourceFile: "layer2.usda",
        };
        const layerStack = [
          { filePath: "layer1.usda", status: "WIP" },
          { filePath: "layer2.usda", status: "Published" },
          { filePath: "layer3.usda", status: "Archived" },
        ];

        expect(resolvePrimStatus(prim, layerStack)).toBe("Published");
      });

      it("should return 'Published' when source layer is not found", () => {
        const prim = {
          properties: {},
          _sourceFile: "nonexistent.usda",
        };
        const layerStack = [{ filePath: "layer1.usda", status: "WIP" }];

        expect(resolvePrimStatus(prim, layerStack)).toBe("Published");
      });

      it("should return 'Published' when layer has no status", () => {
        const prim = {
          properties: {},
          _sourceFile: "layer1.usda",
        };
        const layerStack = [{ filePath: "layer1.usda" }];

        expect(resolvePrimStatus(prim, layerStack)).toBe("Published");
      });
    });

    describe("edge cases", () => {
      it("should return 'Published' for prim with no properties", () => {
        const prim = {};
        expect(resolvePrimStatus(prim, [])).toBe("Published");
      });

      it("should return 'Published' when layerStack is empty", () => {
        const prim = {
          properties: {},
          _sourceFile: "layer1.usda",
        };
        expect(resolvePrimStatus(prim, [])).toBe("Published");
      });

      it("should return 'Published' when layerStack is undefined", () => {
        const prim = {
          properties: {},
          _sourceFile: "layer1.usda",
        };
        expect(resolvePrimStatus(prim)).toBe("Published");
      });

      it("should handle prim with null properties", () => {
        const prim = {
          properties: null,
          _sourceFile: "layer1.usda",
        };
        const layerStack = [{ filePath: "layer1.usda", status: "WIP" }];

        expect(resolvePrimStatus(prim, layerStack)).toBe("WIP");
      });

      it("should handle empty source file", () => {
        const prim = {
          properties: {},
          _sourceFile: "",
        };
        const layerStack = [{ filePath: "", status: "WIP" }];

        // Empty string is falsy, so it returns default "Published"
        expect(resolvePrimStatus(prim, layerStack)).toBe("Published");
      });
    });
  });

  describe("getStatusColor", () => {
    it("should return correct color for WIP", () => {
      expect(getStatusColor("WIP")).toBe(0xffa500);
    });

    it("should return correct color for Shared", () => {
      expect(getStatusColor("Shared")).toBe(0x007aff);
    });

    it("should return correct color for Published", () => {
      expect(getStatusColor("Published")).toBe(0x28a745);
    });

    it("should return correct color for Archived", () => {
      expect(getStatusColor("Archived")).toBe(0x808080);
    });

    it("should return Published color for unknown status", () => {
      expect(getStatusColor("UnknownStatus")).toBe(STATUS_COLORS.Published);
    });

    it("should return Published color for null status", () => {
      expect(getStatusColor(null)).toBe(STATUS_COLORS.Published);
    });

    it("should return Published color for undefined status", () => {
      expect(getStatusColor(undefined)).toBe(STATUS_COLORS.Published);
    });

    it("should return Published color for empty string", () => {
      expect(getStatusColor("")).toBe(STATUS_COLORS.Published);
    });
  });

  describe("getStatusCssColor", () => {
    it("should return correct CSS color for WIP", () => {
      expect(getStatusCssColor("WIP")).toBe("#ffa500");
    });

    it("should return correct CSS color for Shared", () => {
      expect(getStatusCssColor("Shared")).toBe("#007aff");
    });

    it("should return correct CSS color for Published", () => {
      expect(getStatusCssColor("Published")).toBe("#28a745");
    });

    it("should return correct CSS color for Archived", () => {
      expect(getStatusCssColor("Archived")).toBe("#808080");
    });

    it("should return Published CSS color for unknown status", () => {
      expect(getStatusCssColor("UnknownStatus")).toBe(
        STATUS_HEX_COLORS.Published
      );
    });

    it("should return Published CSS color for null status", () => {
      expect(getStatusCssColor(null)).toBe(STATUS_HEX_COLORS.Published);
    });

    it("should return Published CSS color for undefined status", () => {
      expect(getStatusCssColor(undefined)).toBe(STATUS_HEX_COLORS.Published);
    });

    it("should return Published CSS color for empty string", () => {
      expect(getStatusCssColor("")).toBe(STATUS_HEX_COLORS.Published);
    });

    it("should return valid CSS color format", () => {
      const statuses = ["WIP", "Shared", "Published", "Archived"];
      statuses.forEach((status) => {
        const color = getStatusCssColor(status);
        expect(color).toMatch(/^#[0-9a-f]{6}$/);
      });
    });
  });
});
