// src/state.js
export const state = {
  sceneName: "Untitled Project",
  logEntryCounter: 0,

  // User authentication
  currentUser: "Architect",
  users: [
    "Architect",
    "Structural Engineer",
    "Project Manager",
    "Field Person",
  ],
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

  stage: {
    layerStack: [
      {
        id: "layer-3",
        status: "Archived",
        filePath: "statement.usda",
        active: false,
        visible: false,
        branch: "Archived/PM",
      },
    ],
    composedPrims: null,
    activeFilter: "All",
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
