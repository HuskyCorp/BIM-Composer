// src/utils/qualityGates.js
// Quality gate checks executed before a prim or layer is promoted.
//
// Three gates:
//   completeness  — required metadata fields are present
//   semantic      — status values are valid; Published prims have a display name
//   spatial       — prim type is known to the USD schema

// ─── Gate Definitions ───────────────────────────────────────────────────────

export const QUALITY_GATES = [
  {
    id: "completeness",
    label: "Completeness",
    description: "Prim has required name, path, and source file",
    /**
     * @param {object} prim
     * @returns {{ passed: boolean, issues: string[] }}
     */
    check(prim) {
      const issues = [];
      if (!prim.name) issues.push("Missing name");
      if (!prim.path) issues.push("Missing path");
      if (!prim._sourceFile) issues.push("Missing source file reference");
      return { passed: issues.length === 0, issues };
    },
  },
  {
    id: "semantic",
    label: "Semantic Integrity",
    description:
      "Status values are valid; Published prims carry a display name",
    /**
     * @param {object} prim
     * @param {string} targetStatus
     * @returns {{ passed: boolean, issues: string[] }}
     */
    check(prim, targetStatus) {
      const VALID = ["WIP", "Shared", "Published", "Archived"];
      const issues = [];
      const current = prim.properties?.status;
      if (current && !VALID.includes(current)) {
        issues.push(`Invalid status value: "${current}"`);
      }
      if (
        targetStatus === "Published" &&
        !prim.properties?.displayName &&
        !prim.name
      ) {
        issues.push("Published prims require a display name");
      }
      return { passed: issues.length === 0, issues };
    },
  },
  {
    id: "spatial",
    label: "Spatial Validity",
    description: "Prim type is recognised by the USD schema",
    /**
     * @param {object} prim
     * @returns {{ passed: boolean, issues: string[] }}
     */
    check(prim) {
      const KNOWN_TYPES = [
        "Mesh",
        "Xform",
        "Cube",
        "Sphere",
        "Cylinder",
        "Cone",
        "Capsule",
        "Plane",
        "BasisCurves",
        "Points",
        "Volume",
        "Camera",
        "SphereLight",
        "DiskLight",
        "RectLight",
        "DistantLight",
        "DomeLight",
        "", // empty type = typeless prim — allowed
      ];
      const issues = [];
      if (prim.type && !KNOWN_TYPES.includes(prim.type)) {
        issues.push(`Unknown prim type: "${prim.type}"`);
      }
      return { passed: issues.length === 0, issues };
    },
  },
];

// ─── Runner Helpers ─────────────────────────────────────────────────────────

/**
 * Run all quality gates on a single prim.
 * @param {object} prim
 * @param {string} targetStatus
 * @returns {{ allPassed: boolean, results: Array<{id, label, passed, issues}> }}
 */
export function runQualityGates(prim, targetStatus) {
  const results = QUALITY_GATES.map((gate) => {
    const { passed, issues } = gate.check(prim, targetStatus);
    return { id: gate.id, label: gate.label, passed, issues };
  });
  return { allPassed: results.every((r) => r.passed), results };
}

/**
 * Run quality gates on an array of prims and collect all failures.
 * @param {object[]} prims
 * @param {string} targetStatus
 * @returns {{ passed: boolean, failures: Array<{ prim, results }> }}
 */
export function runQualityGatesForPrims(prims, targetStatus) {
  const failures = [];
  for (const prim of prims || []) {
    const { allPassed, results } = runQualityGates(prim, targetStatus);
    if (!allPassed) failures.push({ prim, results });
  }
  return { passed: failures.length === 0, failures };
}

/**
 * Collect all prims from composedHierarchy that belong to a specific layer file.
 * @param {object[]} hierarchy   composedHierarchy array
 * @param {string}   filePath    layer filePath to match against prim._sourceFile
 * @returns {object[]}
 */
export function collectPrimsForLayer(hierarchy, filePath) {
  const out = [];
  function walk(prims) {
    for (const p of prims || []) {
      if (p._sourceFile === filePath) out.push(p);
      if (p.children?.length) walk(p.children);
    }
  }
  walk(hierarchy);
  return out;
}
