// src/utils/rolePermissions.js
// ISO 19650-based role definitions and promotion permission enforcement.
//
// Roles:
//   TaskTeam             — discipline teams (Architect, Structural Engineer)
//   LeadAppointedParty   — delivery lead / Project Manager
//   AppointingParty      — client representative (Field Person)

/** Maps each application user name to an ISO 19650 role key. */
export const USER_ROLE_MAP = {
  Architect: "TaskTeam",
  "Structural Engineer": "TaskTeam",
  "Project Manager": "LeadAppointedParty",
  "Field Person": "AppointingParty",
};

/**
 * Permission matrix for each role.
 *   canPromote  — source statuses the role is allowed to promote from
 *   canDemote   — source statuses the role is allowed to demote from
 */
export const ROLE_PERMISSIONS = {
  TaskTeam: {
    label: "Task Team",
    color: "#4a90e2",
    canPromote: ["WIP"], // WIP → Shared
    canDemote: [],
    description: "Can promote own WIP layers to Shared.",
  },
  LeadAppointedParty: {
    label: "Lead Appointed Party",
    color: "#28a745",
    canPromote: ["WIP", "Shared"], // WIP → Shared  or  Shared → Published
    canDemote: ["Shared"], // Shared → WIP
    description:
      "Can approve Shared layers and promote to Published. Can demote Shared layers.",
  },
  AppointingParty: {
    label: "Appointing Party",
    color: "#808080",
    canPromote: [], // Read-only — no promotion
    canDemote: ["Published"], // Can demote Published → Shared (corrective action)
    description:
      "Read-only access. Can demote Published layers for corrective action.",
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────

/** Return the role key for a given user name. */
export function getUserRole(user) {
  return USER_ROLE_MAP[user] || "TaskTeam";
}

/** Return the human-readable role label for a given user name. */
export function getRoleLabel(user) {
  const role = getUserRole(user);
  return ROLE_PERMISSIONS[role]?.label || role;
}

/** Return the badge colour hex string for a given user name. */
export function getRoleColor(user) {
  const role = getUserRole(user);
  return ROLE_PERMISSIONS[role]?.color || "#4a90e2";
}

/**
 * Returns true if the given user is permitted to promote FROM fromStatus.
 * @param {string} user
 * @param {string} fromStatus  e.g. "WIP", "Shared"
 */
export function canUserPromote(user, fromStatus) {
  const role = getUserRole(user);
  return (ROLE_PERMISSIONS[role]?.canPromote || []).includes(fromStatus);
}

/**
 * Returns true if the given user is permitted to demote FROM fromStatus.
 */
export function canUserDemote(user, fromStatus) {
  const role = getUserRole(user);
  return (ROLE_PERMISSIONS[role]?.canDemote || []).includes(fromStatus);
}

/**
 * Build a human-readable denial message.
 * @param {string} user
 * @param {"promote"|"demote"} direction
 * @param {string} fromStatus
 */
export function getPermissionError(user, direction, fromStatus) {
  const role = getUserRole(user);
  const roleLabel = ROLE_PERMISSIONS[role]?.label || role;
  const desc = ROLE_PERMISSIONS[role]?.description || "";
  return (
    `Permission denied: ${user} (${roleLabel}) cannot ${direction} from ${fromStatus}.\n` +
    `Role description: ${desc}`
  );
}
