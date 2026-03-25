// src/utils/uriGenerator.js
// ISO 19650-compliant URI generation for atomic USDA entities.
//
// URI format: @status-companyCode-teamCode-disciplineCode-sourceSlug-version-hierarchy-entityId@
// Example:    @wip-AEC-ARCH-T1-ARCH-building-model-v1-ifcproject-ifcsite-ifcbuilding-Window23@

import { computePrimHashes } from "./atomicFileHandler.js";
import { DISCIPLINE_CONFIG } from "./precedenceMatrix.js";

// ─── Segment Helpers ───────────────────────────────────────────────────────

/**
 * Convert a layer status + optional suitability code into the URI status segment.
 * e.g. ("Shared", "S2") → "shared-S2"
 *      ("WIP", null)    → "wip"
 *      ("Published", "S6") → "published-S6"
 *      ("Archived", null)  → "archived"
 */
export function getUriStatusSegment(status, suitabilityCode = null) {
  const base = (status || "WIP").toLowerCase();
  if (suitabilityCode) return `${base}-${suitabilityCode}`;
  return base;
}

/**
 * Slugify a file name for use in the URI source segment.
 * "Building Model_v2.usda" → "building-model"
 */
export function slugifyFileName(fileName) {
  return (fileName || "unknown")
    .replace(/\.[^/.]+$/, "") // strip extension
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-") // replace non-alphanumeric runs with hyphen
    .replace(/^-+|-+$/g, ""); // trim leading/trailing hyphens
}

/**
 * Convert a prim path into a hierarchy segment for the URI.
 * "/World/IfcProject/IfcSite/IfcBuilding/Window23" →
 * "ifcproject-ifcsite-ifcbuilding"  (ancestors only, not the leaf)
 * Returns empty string if path has no meaningful ancestors.
 */
export function pathToHierarchy(primPath) {
  if (!primPath) return "";
  const parts = primPath
    .split("/")
    .filter(Boolean)
    .map((p) => p.toLowerCase().replace(/[^a-z0-9]+/g, ""));
  // Drop "world" or top-level scope prim, keep intermediate ancestors, drop leaf
  const filtered = parts.filter(
    (p) => p && p !== "world" && p !== "root" && p !== "scene"
  );
  if (filtered.length <= 1) return filtered[0] || "";
  // Remove the last element (it's the entity itself)
  return filtered.slice(0, -1).join("-");
}

/**
 * Get the leaf entity ID from a prim path.
 * "/World/IfcBuilding/Window23" → "Window23"
 */
export function pathToEntityId(primPath) {
  if (!primPath) return "entity";
  const parts = primPath.split("/").filter(Boolean);
  return parts[parts.length - 1] || "entity";
}

// ─── Core URI Builder ──────────────────────────────────────────────────────

/**
 * Build an ISO 19650-compliant URI string for a single atomic entity.
 *
 * @param {object} params
 * @param {string} params.status          - Layer status: "WIP"|"Shared"|"Published"|"Archived"
 * @param {string} [params.suitabilityCode] - e.g. "S1" .. "S6"
 * @param {string} params.companyCode     - e.g. "AEC"
 * @param {string} params.teamCode        - e.g. "ARCH-T1"
 * @param {string} params.disciplineCode  - e.g. "ARCH"
 * @param {string} params.sourceSlug      - file name slug, e.g. "building-model"
 * @param {number} params.version         - integer version, e.g. 1 → "v1"
 * @param {string} params.hierarchy       - ancestor chain, e.g. "ifcproject-ifcsite-ifcbuilding"
 * @param {string} params.entityId        - leaf prim name/guid, e.g. "Window23"
 * @returns {string}  e.g. "@wip-AEC-ARCH-T1-ARCH-building-model-v1-ifcsite-ifcbuilding-Window23@"
 */
export function buildUri({
  status = "WIP",
  suitabilityCode = null,
  companyCode = "AEC",
  teamCode = "TEAM",
  disciplineCode = "GEN",
  sourceSlug = "unknown",
  version = 1,
  hierarchy = "",
  entityId = "entity",
}) {
  const statusSeg = getUriStatusSegment(status, suitabilityCode);
  const parts = [
    statusSeg,
    companyCode.toLowerCase(),
    teamCode.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    disciplineCode.toLowerCase(),
    sourceSlug,
    `v${version}`,
  ];
  if (hierarchy) parts.push(hierarchy);
  parts.push(entityId);
  return `@${parts.join("-")}@`;
}

// ─── URI Parser ────────────────────────────────────────────────────────────

/**
 * Parse a URI string back into its component parts.
 * Returns null if the string is not a valid URI.
 */
export function parseUri(uri) {
  if (!uri || !uri.startsWith("@") || !uri.endsWith("@")) return null;
  const inner = uri.slice(1, -1);
  const parts = inner.split("-");
  if (parts.length < 6) return null;

  // Status may include suitability: "shared-S2" counts as 2 parts
  let idx = 0;
  let status = parts[idx++];
  let suitabilityCode = null;
  if (parts[idx] && parts[idx].match(/^S[0-6]$/)) {
    suitabilityCode = parts[idx++];
    status = status.charAt(0).toUpperCase() + status.slice(1);
  }

  const companyCode = parts[idx++]?.toUpperCase() || "";
  const teamCode = parts[idx++]?.toUpperCase() || "";
  const disciplineCode = parts[idx++]?.toUpperCase() || "";
  const sourceSlug = parts[idx++] || "";
  const versionStr = parts[idx++] || "v1";
  const version = parseInt(versionStr.replace(/^v/, ""), 10) || 1;

  // Everything after version except the last part is hierarchy
  const remaining = parts.slice(idx);
  const entityId = remaining.pop() || "entity";
  const hierarchy = remaining.join("-");

  return {
    status: status.charAt(0).toUpperCase() + status.slice(1),
    suitabilityCode,
    companyCode,
    teamCode,
    disciplineCode,
    sourceSlug,
    version,
    hierarchy,
    entityId,
  };
}

// ─── Hashtag Extraction ────────────────────────────────────────────────────

/**
 * Extract all unique filterable hashtag values from a URI string.
 * Returns an array of strings like ["#wip", "#AEC", "#ARCH-T1", ...].
 */
export function extractHashtags(uri) {
  const parsed = parseUri(uri);
  if (!parsed) return [];
  const tags = [
    `#${parsed.status.toLowerCase()}`,
    `#${parsed.companyCode}`,
    `#${parsed.teamCode}`,
    `#${parsed.disciplineCode}`,
    `#${parsed.sourceSlug}`,
    `#v${parsed.version}`,
  ];
  if (parsed.suitabilityCode) tags.push(`#${parsed.suitabilityCode}`);
  if (parsed.hierarchy) {
    parsed.hierarchy.split("-").forEach((h) => {
      if (h) tags.push(`#${h}`);
    });
  }
  return [...new Set(tags)];
}

/**
 * Collect all unique hashtags from an entire URI registry Map.
 * @param {Map<string, {uri:string}>} uriRegistry
 * @returns {string[]} sorted array of unique tags
 */
export function collectAllTags(uriRegistry) {
  const tagSet = new Set();
  for (const entry of uriRegistry.values()) {
    extractHashtags(entry.uri).forEach((t) => tagSet.add(t));
  }
  return Array.from(tagSet).sort();
}

// ─── Version Resolution ────────────────────────────────────────────────────

/**
 * Determine the version number for a prim based on existing registry.
 * If the prim already has a URI entry with the same hash, keep version.
 * If the hash changed or prim is new, increment or set to 1.
 */
export function resolveVersion(primPath, existingRegistry) {
  const existing = existingRegistry?.get(primPath);
  if (!existing) return 1;
  return (existing.version || 1) + 1;
}

// ─── Batch URI Generation for Uploaded Files ──────────────────────────────

/**
 * Generate URIs for all prims in a set of atomic USDA files at upload time.
 *
 * @param {Object} atomicFiles   - { [fileName]: usdaContent }
 * @param {Object} layer         - The layer being created { status, suitabilityCode, companyCode, teamCode }
 * @param {Object} user          - Current user object { company, taskTeams, discipline }
 * @param {Object} state         - Current app state (for uriRegistry and primHashRegistry)
 * @returns {Object}             - { [primPath]: { uri, version, sourceFile } }
 */
export function generateUrisForFile(atomicFiles, layer, user, state) {
  const existingRegistry = state.uriRegistry || new Map();
  const existingHashRegistry = state.primHashRegistry || {};

  const disciplineCode = DISCIPLINE_CONFIG[user?.discipline]?.code || "GEN";
  const companyCode = user?.company?.code || "AEC";
  const teamCode = user?.taskTeams?.[0]?.code || "TEAM";
  const status = layer?.status || "WIP";
  const suitabilityCode = layer?.suitabilityCode || null;

  const result = {};

  for (const [fileName, content] of Object.entries(atomicFiles)) {
    const sourceSlug = slugifyFileName(fileName);
    // Get prim hashes for this file
    const hashes = computePrimHashes(content, fileName);

    for (const [primPath, hashEntry] of Object.entries(hashes)) {
      // Check if hash changed vs existing registry
      const existingHashEntry = existingHashRegistry[primPath];
      let version;
      if (
        existingHashEntry &&
        existingHashEntry.hash === hashEntry.hash &&
        existingRegistry.has(primPath)
      ) {
        // Unchanged: keep existing version
        version = existingRegistry.get(primPath).version || 1;
      } else {
        // New or changed: increment version
        version = resolveVersion(primPath, existingRegistry);
      }

      const hierarchy = pathToHierarchy(primPath);
      const entityId = pathToEntityId(primPath);

      const uri = buildUri({
        status,
        suitabilityCode,
        companyCode,
        teamCode,
        disciplineCode,
        sourceSlug,
        version,
        hierarchy,
        entityId,
      });

      result[primPath] = { uri, version, sourceFile: fileName };
    }
  }

  return result;
}
