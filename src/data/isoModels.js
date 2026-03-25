// src/data/isoModels.js
// ISO 19650-aligned data models, roles, and suitability codes.

// ─── ISO 19650 Roles ───────────────────────────────────────────────────────

export const ISO_ROLES = {
  task_team_member: {
    label: "Task Team Member",
    description: "Discipline team member. Can promote own WIP work to Shared.",
    color: "#4a90e2",
    canPromote: ["WIP"],
    canDemote: [],
  },
  lead_task_team: {
    label: "Lead Task Team",
    description:
      "Leads a task team. Can promote WIP to Shared and review Shared.",
    color: "#5ba84d",
    canPromote: ["WIP", "Shared"],
    canDemote: ["Shared"],
  },
  lead_appointing_party: {
    label: "Lead Appointed Party",
    description:
      "Delivery lead / Project Manager. Can approve Shared to Published.",
    color: "#28a745",
    canPromote: ["WIP", "Shared"],
    canDemote: ["Shared"],
  },
  appointed_party: {
    label: "Appointed Party",
    description: "Appointed consultant. Read-only access.",
    color: "#f5a623",
    canPromote: [],
    canDemote: [],
  },
  appointing_party: {
    label: "Appointing Party",
    description:
      "Client representative. Can demote Published for corrective action.",
    color: "#808080",
    canPromote: [],
    canDemote: ["Published"],
  },
};

// ─── Suitability Codes ─────────────────────────────────────────────────────

export const SUITABILITY_CODES = {
  S1: { label: "Coordination", allowedStatus: "Shared" },
  S2: { label: "Information", allowedStatus: "Shared" },
  S3: { label: "For Review / Comment", allowedStatus: "Shared" },
  S4: { label: "For Approval", allowedStatus: "Shared" },
  S5: { label: "Approved", allowedStatus: "Shared" },
  S6: { label: "Authorized for Use", allowedStatus: "Published" },
};

// ─── Seed Data: Default Company ────────────────────────────────────────────

export const DEFAULT_COMPANY = {
  id: "co-aec-01",
  name: "AEC Company",
  code: "AEC",
};

// ─── Seed Data: Default Task Teams ─────────────────────────────────────────

export const DEFAULT_TASK_TEAMS = [
  {
    id: "tt-arch-t1",
    name: "Architecture Team",
    code: "ARCH-T1",
    discipline: "Architecture",
    company: DEFAULT_COMPANY,
  },
  {
    id: "tt-str-t1",
    name: "Structure Team",
    code: "STR-T1",
    discipline: "Structure",
    company: DEFAULT_COMPANY,
  },
  {
    id: "tt-mep-t1",
    name: "MEP Team",
    code: "MEP-T1",
    discipline: "MEP",
    company: DEFAULT_COMPANY,
  },
  {
    id: "tt-pm-t1",
    name: "Management Team",
    code: "PM-T1",
    discipline: "Management",
    company: DEFAULT_COMPANY,
  },
  {
    id: "tt-fld-t1",
    name: "Field Team",
    code: "FLD-T1",
    discipline: "Field",
    company: DEFAULT_COMPANY,
  },
];

// ─── Seed Data: Default Users ──────────────────────────────────────────────

export const DEFAULT_USERS_ARRAY = [
  {
    id: "user-arch-01",
    name: "Architect",
    role: "task_team_member",
    company: DEFAULT_COMPANY,
    discipline: "Architecture",
    taskTeams: [DEFAULT_TASK_TEAMS[0]],
  },
  {
    id: "user-str-01",
    name: "Structural Engineer",
    role: "task_team_member",
    company: DEFAULT_COMPANY,
    discipline: "Structure",
    taskTeams: [DEFAULT_TASK_TEAMS[1]],
  },
  {
    id: "user-pm-01",
    name: "Project Manager",
    role: "lead_appointing_party",
    company: DEFAULT_COMPANY,
    discipline: "Management",
    taskTeams: [DEFAULT_TASK_TEAMS[3]],
  },
  {
    id: "user-fld-01",
    name: "Field Person",
    role: "appointed_party",
    company: DEFAULT_COMPANY,
    discipline: "Field",
    taskTeams: [DEFAULT_TASK_TEAMS[4]],
  },
];

/** Build the default users Map from the seed array. */
export function buildDefaultUsersMap() {
  const map = new Map();
  for (const u of DEFAULT_USERS_ARRAY) {
    map.set(u.id, u);
  }
  return map;
}

/** Resolve a legacy user name string to its seed user ID. */
const LEGACY_NAME_TO_ID = {
  Architect: "user-arch-01",
  "Structural Engineer": "user-str-01",
  "Project Manager": "user-pm-01",
  "Field Person": "user-fld-01",
};

export function resolveUserIdFromName(name) {
  return LEGACY_NAME_TO_ID[name] || "user-arch-01";
}
