// src/__tests__/unit/utils/usdSyntaxValidator.test.js

import { validateUsdaSyntax } from "../../../utils/atomicFileHandler.js";

describe("USD Syntax Validator", () => {
  describe("Brace Balance Validation", () => {
    test("should pass for balanced braces", () => {
      const validUsda = `#usda 1.0
(
    defaultPrim = "World"
)

def Xform "World"
{
    custom string ifc:property = "value"
}
`;
      const result = validateUsdaSyntax(validUsda);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    test("should fail for unbalanced braces (missing closing)", () => {
      const invalidUsda = `#usda 1.0
def Xform "World"
{
    custom string ifc:property = "value"
`;
      const result = validateUsdaSyntax(invalidUsda);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain("Brace mismatch");
    });

    test("should fail for extra closing braces", () => {
      const invalidUsda = `#usda 1.0
def Xform "World"
{
    custom string ifc:property = "value"
}
}
`;
      const result = validateUsdaSyntax(invalidUsda);
      expect(result.valid).toBe(false);
      expect(result.errors[0]).toContain("Brace mismatch");
    });
  });

  describe("Header Validation", () => {
    test("should pass for single header", () => {
      const validUsda = `#usda 1.0
def Xform "World" {}
`;
      const result = validateUsdaSyntax(validUsda);
      expect(result.valid).toBe(true);
    });

    test("should fail for missing header", () => {
      const invalidUsda = `def Xform "World" {}`;
      const result = validateUsdaSyntax(invalidUsda);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("Missing USD header"))).toBe(
        true
      );
    });

    test("should fail for duplicate headers", () => {
      const invalidUsda = `#usda 1.0
def Xform "World"
{
    #usda 1.0
}
`;
      const result = validateUsdaSyntax(invalidUsda);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("Multiple USD headers"))
      ).toBe(true);
    });

    test("should accept comment before header", () => {
      const validUsda = `# File: myfile.usda
#usda 1.0
def Xform "World" {}
`;
      const result = validateUsdaSyntax(validUsda);
      expect(result.valid).toBe(true);
    });
  });

  describe("Namespace Validation", () => {
    test("should warn for non-namespaced custom attributes", () => {
      const usdaWithWarnings = `#usda 1.0
def Xform "World"
{
    custom string myProperty = "value"
    custom float anotherProp = 1.5
}
`;
      const result = validateUsdaSyntax(usdaWithWarnings);
      // Should be valid but have warnings
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("without namespace"))).toBe(
        true
      );
    });

    test("should not warn for properly namespaced attributes", () => {
      const validUsda = `#usda 1.0
def Xform "World"
{
    custom string ifc:myProperty = "value"
    custom float ifc:anotherProp = 1.5
    custom string primvars:displayName = "MyWorld"
}
`;
      const result = validateUsdaSyntax(validUsda);
      expect(result.valid).toBe(true);
      expect(result.warnings).toHaveLength(0);
    });

    test("should not warn for attributes in metadata dictionaries", () => {
      const validUsda = `#usda 1.0
(
    customLayerData = {
        dictionary ifc:context = {
            int id_123 = 123
            string name_123 = "MyName"
        }
    }
)
def Xform "World" {}
`;
      const result = validateUsdaSyntax(validUsda);
      expect(result.valid).toBe(true);
      // Metadata properties don't need custom keyword or namespace
    });
  });

  describe("Metadata Block Validation", () => {
    test("should pass for valid metadata block", () => {
      const validUsda = `#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Z"
    metersPerUnit = 1.0
)
def Xform "World" {}
`;
      const result = validateUsdaSyntax(validUsda);
      expect(result.valid).toBe(true);
    });

    test("should fail for unbalanced parentheses in metadata", () => {
      const invalidUsda = `#usda 1.0
(
    defaultPrim = "World"
    upAxis = "Z"

def Xform "World" {}
`;
      const result = validateUsdaSyntax(invalidUsda);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) => e.includes("unbalanced parentheses"))
      ).toBe(true);
    });
  });

  describe("Empty File Validation", () => {
    test("should fail for empty file", () => {
      const result = validateUsdaSyntax("");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });

    test("should fail for whitespace-only file", () => {
      const result = validateUsdaSyntax("   \n  \n  ");
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("empty"))).toBe(true);
    });
  });

  describe("Complex Real-World Scenarios", () => {
    test("should validate complex IFC-converted USD file", () => {
      const complexUsda = `#usda 1.0
(
    defaultPrim = "IFCModel"
    upAxis = "Z"
    metersPerUnit = 1.0
    customLayerData = {
        dictionary ifc:context = {
            dictionary IFCCLASSIFICATIONREFERENCE = {
                int id_207980 = 207980
                string expressID_207980 = 207980
            }
        }
    }
)

def Scope "Materials"
{
    def Material "Concrete"
    {
        custom string ifc:material_type = "IFCMATERIAL"
        custom int ifc:id = 4021
        custom string ifc:material:expressID = 4021
        custom string ifc:material:Name = "Concrete"
    }
}

def Xform "IFCModel"
{
    def Xform "Building"
    {
        custom string ifc:type = "IFCBUILDING"
        custom int ifc:id = 30795

        def Mesh "Wall"
        {
            custom string ifc:type = "IFCWALL"
            custom int ifc:id = 123456
            custom string ifc:pset:Pset_WallCommon:FireRating = "2HR"
            point3f[] points = [(0, 0, 0), (1, 0, 0), (1, 1, 0)]
            int[] faceVertexCounts = [3]
            int[] faceVertexIndices = [0, 1, 2]
        }
    }
}
`;
      const result = validateUsdaSyntax(complexUsda);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
