// src/utils/rolePermissions.js
// ISO 19650-based role definitions and promotion permission enforcement.
//
// Roles (ISO 19650 terminology):
//   task_team_member      — discipline teams (Architect, Structural Engineer)
//   lead_task_team        — team leads
//   lead_appointing_party — delivery lead / Project Manager
//   appointed_party       — appointed consultant
//   appointing_party      — client representative (Field Person)

import { ISO_ROLES } from "../data/isoModels.js";

export { ISO_ROLES };

// ─── Legacy role map (for backward compat with string-based callers) ────────

const LEGACY_NAME_TO_ROLE = {
  Architect: "task_team_member",
  "Structural Engineer": "task_team_member",
  "Project Manager": "lead_appointing_party",
  "Field Person": "appointing_party",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Get the ISO role key for a user.
 * Accepts either a full user object { role } or a legacy name string.
 */
export function getUserRole(userOrName) {
  if (!userOrName) return "task_team_member";
  if (typeof userOrName === "object")
    return userOrName.role || "task_team_member";
  return LEGACY_NAME_TO_ROLE[userOrName] || "task_team_member";
}

/** Return the human-readable role label. */
export function getRoleLabel(userOrName) {
  const role = getUserRole(userOrName);
  return ISO_ROLES[role]?.label || role;
}

/** Return the badge colour hex string. */
export function getRoleColor(userOrName) {
  const role = getUserRole(userOrName);
  return ISO_ROLES[role]?.color || "#4a90e2";
}

/**
 * Returns true if the given user is permitted to promote FROM fromStatus.
 * @param {Object|string} userOrName - User object or legacy name string
 * @param {string} fromStatus        - "WIP" | "Shared" | "Published"
 */
export function canUserPromote(userOrName, fromStatus) {
  const role = getUserRole(userOrName);
  return (ISO_ROLES[role]?.canPromote || []).includes(fromStatus);
}

/**
 * Returns true if the given user is permitted to demote FROM fromStatus.
 */
export function canUserDemote(userOrName, fromStatus) {
  const role = getUserRole(userOrName);
  return (ISO_ROLES[role]?.canDemote || []).includes(fromStatus);
}

/**
 * Returns true if the user has the lead_appointing_party role (Project Manager).
 * Used for PM-only approval gates.
 */
export function isProjectManager(userOrName) {
  const role = getUserRole(userOrName);
  return role === "lead_appointing_party" || role === "lead_task_team";
}

/**
 * Build a human-readable denial message.
 */
export function getPermissionError(userOrName, direction, fromStatus) {
  const role = getUserRole(userOrName);
  const roleLabel = ISO_ROLES[role]?.label || role;
  const desc = ISO_ROLES[role]?.description || "";
  const name = typeof userOrName === "object" ? userOrName.name : userOrName;
  return (
    `Permission denied: ${name} (${roleLabel}) cannot ${direction} from ${fromStatus}.\n` +
    `Role description: ${desc}`
  );
}

// ─── Legacy ROLE_PERMISSIONS export (for code that imports it directly) ─────
// Maps old keys to new structure for backward compat

export const ROLE_PERMISSIONS = {
  TaskTeam: {
    label: "Task Team",
    color: "#4a90e2",
    canPromote: ["WIP"],
    canDemote: [],
    description: "Can promote own WIP layers to Shared.",
  },
  LeadAppointedParty: {
    label: "Lead Appointed Party",
    color: "#28a745",
    canPromote: ["WIP", "Shared"],
    canDemote: ["Shared"],
    description: "Can approve Shared layers and promote to Published.",
  },
  AppointingParty: {
    label: "Appointing Party",
    color: "#808080",
    canPromote: [],
    canDemote: ["Published"],
    description: "Read-only access. Can demote Published layers.",
  },
};

export const USER_ROLE_MAP = {
  Architect: "TaskTeam",
  "Structural Engineer": "TaskTeam",
  "Project Manager": "LeadAppointedParty",
  "Field Person": "AppointingParty",
};
