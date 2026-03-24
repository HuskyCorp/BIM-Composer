// src/utils/precedenceMatrix.js
// Disciplinary authority model aligned with ISO 19650 multi-discipline workflows.

export const USER_TO_DISCIPLINE = {
  Architect: "Architecture",
  "Structural Engineer": "Structure",
  "MEP Engineer": "MEP",
  "Project Manager": "Management",
  "Field Person": "Field",
};

export const DISCIPLINE_CONFIG = {
  Architecture: {
    code: "ARCH",
    label: "Architecture",
    precedence: 2,
    color: "#4a90d9",
    authoritative_props: new Set([
      "displayName",
      "material",
      "program",
      "use",
      "finish",
      "function",
      "appearance",
    ]),
  },
  Structure: {
    code: "STRUCT",
    label: "Structure",
    precedence: 3,
    color: "#e67e22",
    authoritative_props: new Set([
      "location",
      "coordinates",
      "rotation",
      "scale",
      "loadBearing",
      "structuralRole",
      "dimensions",
      "load",
      "position",
    ]),
  },
  MEP: {
    code: "MEP",
    label: "MEP",
    precedence: 2,
    color: "#27ae60",
    authoritative_props: new Set([
      "system",
      "flowRate",
      "capacity",
      "duct",
      "pipe",
      "circuit",
      "service",
      "utility",
    ]),
  },
  Management: {
    code: "PM",
    label: "Management",
    precedence: 4,
    color: "#9b59b6",
    authoritative_props: null, // null = authority over all properties
  },
  Field: {
    code: "FIELD",
    label: "Field",
    precedence: 1,
    color: "#95a5a6",
    authoritative_props: new Set([
      "siteCondition",
      "asBuilt",
      "observation",
      "note",
      "issue",
    ]),
  },
};

export function getDisciplineForUser(userName) {
  return USER_TO_DISCIPLINE[userName] || "Unknown";
}

export function getDisciplineConfig(discipline) {
  return (
    DISCIPLINE_CONFIG[discipline] || {
      code: "?",
      label: discipline || "Unknown",
      precedence: 0,
      color: "#888",
      authoritative_props: new Set(),
    }
  );
}

/**
 * Derives the discipline branch name for a given user and optional layer/commit status.
 * WIP work lives on "WIP/{CODE}", promoted work on "Shared/{CODE}", "Published/{CODE}", etc.
 * @param {string} userName - The current user's display name
 * @param {string} [status="WIP"] - The layer/commit status (WIP, Shared, Published, Archived)
 * @returns {string} e.g. "WIP/ARCH", "Shared/STRUCT", "Published/MEP"
 */
export function getDisciplineBranch(userName, status = "WIP") {
  const discipline = USER_TO_DISCIPLINE[userName] || "Unknown";
  const cfg = DISCIPLINE_CONFIG[discipline] || { code: "?" };
  const effectiveStatus = status === "WIP" || !status ? "WIP" : status;
  return `${effectiveStatus}/${cfg.code}`;
}

/**
 * Returns true if callerDiscipline has authority to override ownerDiscipline for a given property.
 * Management always wins; same discipline wins; specific property authority wins; higher precedence wins.
 */
export function hasAuthority(callerDiscipline, ownerDiscipline, propertyName) {
  if (callerDiscipline === "Management") return true;
  if (callerDiscipline === ownerDiscipline && callerDiscipline !== "Unknown")
    return true;
  const callerCfg = getDisciplineConfig(callerDiscipline);
  const ownerCfg = getDisciplineConfig(ownerDiscipline);
  if (
    callerCfg.authoritative_props &&
    callerCfg.authoritative_props.has(propertyName)
  )
    return true;
  return callerCfg.precedence > ownerCfg.precedence;
}
