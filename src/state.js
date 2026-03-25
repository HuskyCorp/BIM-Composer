// src/state.js
import {
  buildDefaultUsersMap,
  DEFAULT_COMPANY,
  DEFAULT_TASK_TEAMS,
  resolveUserIdFromName,
} from "./data/isoModels.js";

// Attempt to restore persisted current user ID from localStorage
function getInitialUserId() {
  try {
    const stored = localStorage.getItem("usda_composer_current_user");
    if (stored) {
      // Support both legacy name strings and new UUID strings
      if (stored.startsWith("user-")) return stored;
      return resolveUserIdFromName(stored);
    }
  } catch (_) {
    // localStorage not available (test env)
  }
  return "user-arch-01";
}

export const state = {
  logEntryCounter: 0,

  // ─── ISO 19650 User Management ──────────────────────────────────────────
  // currentUserId: UUID reference into the users Map
  currentUserId: getInitialUserId(),
  // currentUser: kept for backward compat with existing code that reads state.currentUser
  // Updated together with currentUserId by SET_CURRENT_USER
  currentUser: "Architect",
  users: buildDefaultUsersMap(), // Map<id, UserObject>
  companies: [DEFAULT_COMPANY],
  taskTeams: [...DEFAULT_TASK_TEAMS],

  // ─── URI Registry ───────────────────────────────────────────────────────
  // Map<primPath, { uri, version, sourceFile }>
  uriRegistry: new Map(),
  // Array of active hashtag filter strings (e.g. ["#ARCH", "#building-model"])
  activeUriFilters: [],

  // ─── Design Options ─────────────────────────────────────────────────────
  designOptions: [],
  activeDesignOptionId: null,
  stageBranches: {
    shared: { expanded: true, activeOptionId: null },
    published: { activePackageId: null },
    archive: { visible: false },
  },

  loadedFiles: {
    "statement.usda": `#usda 1.0
(
    doc = "Records all changes to the project for timeline and audit purposes."
)

def "ChangeLog"
{
}
`,
  },

  packages: [
    {
      id: "pkg-default",
      name: "General",
      color: "#607d8b",
      createdAt: new Date().toISOString(),
      createdBy: "System",
      isoNumber: null,
      designOptionId: null,
      stageBranch: "WIP",
      approvalStatus: "pending",
    },
  ],
  activePackageId: "pkg-default",

  stage: {
    layerStack: [
      {
        id: "layer-3",
        status: "Archived",
        filePath: "statement.usda",
        active: false,
        visible: false,
        owner: "Project Manager",
        ownerId: "user-pm-01",
        branch: "Archived/PM",
        immutable: true,
        suitabilityCode: null,
        companyCode: "AEC",
        teamCode: "PM-T1",
      },
    ],
    composedPrims: null,
    activeFilter: "All",
    activePackageFilter: "All",
    colorizeByStatus: true,
    saveStatusFilter: ["WIP", "Shared", "Published"], // Default: exclude Archived
  },

  composedHierarchy: [],
  recordedHierarchy: [], // only updated on Record Changes; scene renders from this

  // --- Branching History Support ---
  isHistoryMode: false,
  history: {
    commits: new Map(), // Map<ID, CommitObject>
    roots: [], // Array<ID> of initial commits
  },
  headCommitId: null, // The current "Tip" of the history
  allPrimsByPath: new Map(),

  // --- Staging Area for Commits ---
  stagedChanges: [],

  currentView: "file",
};
