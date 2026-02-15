// src/__tests__/unit/viewer/usda/usdaComposer.test.js

import { composePrimsFromHierarchy } from "../../../../viewer/usda/usdaComposer.js";

describe("USD Composer - Namespace Compliance", () => {
  describe("Custom Property Namespace Handling", () => {
    test("should add ifc: namespace to properties without namespace", () => {
      const prims = [
        {
          name: "TestPrim",
          type: "Xform",
          specifier: "def",
          properties: {
            status: "WIP",
            customNumber: 42,
            customBool: true,
            customString: "value",
          },
          children: [],
        },
      ];

      const result = composePrimsFromHierarchy(prims, 0, "Published");

      // Check that custom properties have ifc: namespace
      expect(result).toContain("custom float ifc:customNumber = 42");
      expect(result).toContain("custom bool ifc:customBool = true");
      expect(result).toContain('custom string ifc:customString = "value"');

      // Check that system properties use primvars namespace
      expect(result).toContain('custom token primvars:status = "WIP"');
    });

    test("should preserve existing namespaces in properties", () => {
      const prims = [
        {
          name: "TestPrim",
          type: "Xform",
          specifier: "def",
          properties: {
            status: "Published",
            "Pset_WallCommon:FireRating": "2HR",
            "ifc:pset:Pset_ActionRequest:Comments": "Test comment",
          },
          children: [],
        },
      ];

      const result = composePrimsFromHierarchy(prims, 0, "Published");

      // Properties with existing namespace should keep their namespace
      expect(result).toContain(
        'custom string Pset_WallCommon:FireRating = "2HR"'
      );
      expect(result).toContain(
        'custom string ifc:pset:Pset_ActionRequest:Comments = "Test comment"'
      );
    });

    test("should handle color properties without adding namespace", () => {
      const prims = [
        {
          name: "ColoredPrim",
          type: "Xform",
          specifier: "def",
          properties: {
            displayColor: { r: 1.0, g: 0.0, b: 0.0 },
          },
          children: [],
        },
      ];

      const result = composePrimsFromHierarchy(prims, 0, "Published");

      // Color properties should not have custom keyword or namespace
      expect(result).toContain("color3f[] primvars:displayColor = [(1, 0, 0)]");
      expect(result).not.toContain("custom color3f");
    });

    test("should handle mixed properties correctly", () => {
      const prims = [
        {
          name: "MixedPrim",
          type: "Mesh",
          specifier: "def",
          properties: {
            status: "Shared",
            displayName: "My Mesh",
            displayColor: { r: 0.5, g: 0.5, b: 0.5 },
            customFloat: 3.14,
            "Pset_Custom:Property": "value",
            entityType: "IFCWALL",
          },
          children: [],
        },
      ];

      const result = composePrimsFromHierarchy(prims, 0, "Published");

      // System properties
      expect(result).toContain('custom token primvars:status = "Shared"');
      expect(result).toContain(
        'custom string primvars:displayName = "My Mesh"'
      );
      expect(result).toContain('custom string primvars:entityType = "IFCWALL"');

      // Color (no custom, no namespace)
      expect(result).toContain(
        "color3f[] primvars:displayColor = [(0.5, 0.5, 0.5)]"
      );

      // Custom property without namespace (should get ifc:)
      expect(result).toContain("custom float ifc:customFloat = 3.14");

      // Property with existing namespace (preserved)
      expect(result).toContain('custom string Pset_Custom:Property = "value"');
    });
  });

  describe("Nested Hierarchy with Namespaces", () => {
    test("should handle nested prims with custom properties", () => {
      const prims = [
        {
          name: "Parent",
          type: "Xform",
          specifier: "def",
          properties: {
            status: "Published",
            parentProp: "parentValue",
          },
          children: [
            {
              name: "Child",
              type: "Mesh",
              specifier: "def",
              properties: {
                status: "WIP",
                childProp: 100,
                "Pset_Child:Property": "childValue",
              },
              children: [],
            },
          ],
        },
      ];

      const result = composePrimsFromHierarchy(prims, 0, "Published");

      // Parent properties
      expect(result).toContain('custom token primvars:status = "Published"');
      expect(result).toContain('custom string ifc:parentProp = "parentValue"');

      // Child properties
      expect(result).toContain('custom token primvars:status = "WIP"');
      expect(result).toContain("custom float ifc:childProp = 100");
      expect(result).toContain(
        'custom string Pset_Child:Property = "childValue"'
      );
    });
  });

  describe("Reference Handling", () => {
    test("should handle prims with references correctly", () => {
      const prims = [
        {
          name: "ReferencedPrim",
          type: "Xform",
          specifier: "def",
          properties: {
            status: "Published",
            localOverride: "value",
          },
          references: "@source.usda@</World/ReferencedPrim>",
          children: [],
        },
      ];

      const result = composePrimsFromHierarchy(prims, 0, "Published");

      // Should contain reference metadata
      expect(result).toContain("prepend references =");
      expect(result).toContain("@source.usda@</World/ReferencedPrim>");

      // Local properties should still have namespace
      expect(result).toContain('custom string ifc:localOverride = "value"');
    });
  });

  describe("Integration Test - Complete USD File", () => {
    test("should generate valid USD with all namespaced properties", () => {
      const hierarchy = [
        {
          name: "IFCModel",
          type: "Xform",
          specifier: "def",
          properties: {
            status: "Published",
          },
          children: [
            {
              name: "Building",
              type: "Xform",
              specifier: "def",
              properties: {
                status: "Published",
                "ifc:type": "IFCBUILDING",
                "ifc:id": 30795,
              },
              children: [
                {
                  name: "Wall",
                  type: "Mesh",
                  specifier: "def",
                  properties: {
                    status: "WIP",
                    "ifc:type": "IFCWALL",
                    "ifc:id": 123456,
                    "ifc:pset:Pset_WallCommon:FireRating": "2HR",
                    customThickness: 0.2,
                  },
                  children: [],
                },
              ],
            },
          ],
        },
      ];

      const result = composePrimsFromHierarchy(hierarchy, 0, "Published");

      // Verify structure
      expect(result).toContain('def Xform "IFCModel"');
      expect(result).toContain('def Xform "Building"');
      expect(result).toContain('def Mesh "Wall"');

      // Verify all properties are properly namespaced
      expect(result).toContain("custom token primvars:status");
      expect(result).toContain("custom string ifc:type");
      expect(result).toContain("custom float ifc:customThickness = 0.2");
      expect(result).toContain(
        'custom string ifc:pset:Pset_WallCommon:FireRating = "2HR"'
      );

      // Verify no non-namespaced custom properties (except system ones)
      const customNonNamespaced =
        /custom (float|string|int|bool) ([a-zA-Z_][a-zA-Z0-9_]*) =/g;
      const matches = result.match(customNonNamespaced);
      if (matches) {
        // All should have colons (namespace separators)
        matches.forEach((match) => {
          // Exception: allow primvars which is handled separately
          if (!match.includes(":") && !match.includes("primvars")) {
            throw new Error(`Found non-namespaced custom property: ${match}`);
          }
        });
      }
    });
  });
});
