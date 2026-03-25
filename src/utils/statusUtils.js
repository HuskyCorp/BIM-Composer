// src/utils/statusUtils.js

export const STATUS_COLORS = {
  WIP: 0xffa500, // Vibrant Orange
  Shared: 0x007aff, // Vibrant Blue
  Published: 0x28a745, // Vibrant Green
  Archived: 0x808080, // Gray
};

export const STATUS_HEX_COLORS = {
  WIP: "#ffa500",
  Shared: "#007aff",
  Published: "#28a745",
  Archived: "#808080",
};

/**
 * Resolves the effective status of a prim.
 * Under the "Active State Management" strategy, the prim.properties.status
 * should ALWAYS be the source of truth if it exists.
 * If strictly missing, we fallback to "Published" or Layer Status as safety net,
 * but ideally the data model should have been updated to be explicit.
 *
 * @param {Object} prim - The prim object
 * @param {Array} layerStack - The current layer stack (optional context)
 * @returns {string} The effective status string
 */
export function resolvePrimStatus(prim, layerStack = []) {
  // 1. Local Property (Source of Truth)
  if (prim.properties && prim.properties.status) {
    return prim.properties.status;
  }

  // 2. Fallback: Source Layer (if prim status is missing for some reason)
  if (prim._sourceFile && layerStack.length > 0) {
    const layer = layerStack.find((l) => l.filePath === prim._sourceFile);
    if (layer && layer.status) {
      return layer.status;
    }
  }

  // 3. Last Resort Default
  return "Published";
}

/**
 * Gets the color for a given status
 * @param {string} status
 * @returns {number} Hex integer color
 */
export function getStatusColor(status) {
  return STATUS_COLORS[status] || STATUS_COLORS.Published;
}

/**
 * Gets the CSS hex string for a given status
 * @param {string} status
 * @returns {string} Hex string color
 */
export function getStatusCssColor(status) {
  return STATUS_HEX_COLORS[status] || STATUS_HEX_COLORS.Published;
}

// Amber shades for Shared suitability levels S1–S5
const URI_STATUS_COLORS = {
  wip: 0xffa500, // orange
  "shared-s1": 0xffb300, // amber 1
  "shared-s2": 0xff8f00, // amber 2
  "shared-s3": 0xff6f00, // amber 3
  "shared-s4": 0xe65100, // amber 4
  "shared-s5": 0xbf360c, // amber 5
  published: 0x28a745, // green
  archived: 0x424242, // dark gray
};

/**
 * Derive a THREE.js hex color from a prim's iso19650_uri string.
 * Falls back to null if URI is missing or unrecognised.
 * @param {string|undefined} uri
 * @returns {number|null}
 */
export function getUriColor(uri) {
  if (!uri) return null;
  const inner = uri.replace(/^@|@$/g, "").toLowerCase();
  if (inner.startsWith("archived")) return URI_STATUS_COLORS.archived;
  if (inner.startsWith("published")) return URI_STATUS_COLORS.published;
  for (let i = 5; i >= 1; i--) {
    if (inner.startsWith(`shared-s${i}`))
      return URI_STATUS_COLORS[`shared-s${i}`];
  }
  if (inner.startsWith("shared")) return URI_STATUS_COLORS["shared-s1"];
  if (inner.startsWith("wip")) return URI_STATUS_COLORS.wip;
  return null;
}

/**
 * Return the opacity for an archived URI prim (0.45) or 1.0 otherwise.
 * @param {string|undefined} uri
 * @returns {number}
 */
export function getUriOpacity(uri) {
  if (!uri) return 1.0;
  const inner = uri.replace(/^@|@$/g, "").toLowerCase();
  return inner.startsWith("archived") ? 0.45 : 1.0;
}

/**
 * Given a URI and a set of active hashtag filters, return true if the URI
 * matches ALL active filters (or no filters are active).
 * @param {string|undefined} uri
 * @param {string[]} activeFilters  e.g. ["#wip","#ABC"]
 * @returns {boolean}
 */
export function uriMatchesFilters(uri, activeFilters) {
  if (!activeFilters || activeFilters.length === 0) return true;
  if (!uri) return false;
  const inner = uri.replace(/^@|@$/g, "");
  const tags = inner.split("-").map((t) => `#${t}`);
  return activeFilters.every((f) => tags.includes(f));
}
