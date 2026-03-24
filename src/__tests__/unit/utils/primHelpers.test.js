// src/__tests__/unit/utils/primHelpers.test.js
// Note: describe, it, expect are available globally via globals: true in vite.config.js
import {
  validatePrimName,
  getAllPrimPaths,
} from "../../../utils/primHelpers.js";

describe("primHelpers", () => {
  describe("validatePrimName", () => {
    it("should validate correct prim names", () => {
      expect(validatePrimName("ValidName")).toBe(true);
      expect(validatePrimName("_underscore")).toBe(true);
      expect(validatePrimName("Name123")).toBe(true);
      expect(validatePrimName("_Name_123")).toBe(true);
    });

    it("should reject invalid prim names", () => {
      expect(validatePrimName("")).toBe(false);
      expect(validatePrimName("123Start")).toBe(false);
      expect(validatePrimName("Invalid Name")).toBe(false);
      expect(validatePrimName("Invalid-Name")).toBe(false);
      expect(validatePrimName(null)).toBe(false);
    });
  });

  describe("getAllPrimPaths", () => {
    it("should collect all paths from hierarchy", () => {
      const hierarchy = [
        {
          path: "/Root",
          children: [
            { path: "/Root/Child1", children: [] },
            { path: "/Root/Child2", children: [] },
          ],
        },
      ];

      const paths = getAllPrimPaths(hierarchy);
      expect(paths).toHaveLength(3);
      expect(paths).toContain("/Root");
      expect(paths).toContain("/Root/Child1");
      expect(paths).toContain("/Root/Child2");
    });
  });
});
