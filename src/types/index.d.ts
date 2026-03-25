/**
 * Global Type Definitions for USDA Composer
 */

// ==================== State Types ====================

export interface Layer {
  id: string;
  status: LayerStatus;
  filePath: string;
  active: boolean;
  visible: boolean;
}

export type LayerStatus = "WIP" | "Shared" | "Published" | "Archived";

export interface Stage {
  layerStack: Layer[];
  composedPrims: Prim[] | null;
  activeFilter: "All" | LayerStatus;
  colorizeByStatus: boolean;
}

export interface Prim {
  path: string;
  type: string;
  properties: Record<string, any>;
  children?: Prim[];
  metadata?: PrimMetadata;
}

export interface PrimMetadata {
  displayName?: string;
  owner?: string;
  status?: LayerStatus;
  layer?: string;
}

export interface StagedChange {
  type: "add" | "remove" | "update" | "rename";
  primPath: string;
  property?: string;
  oldValue?: any;
  newValue?: any;
  timestamp: number;
  user: string;
}

export interface Commit {
  id: string;
  message: string;
  timestamp: number;
  user: string;
  changes: StagedChange[];
  parentId?: string;
}

export interface History {
  commits: Map<string, Commit>;
  roots: string[];
}

export interface AppState {
  logEntryCounter: number;
  currentUser: string;
  users: string[];
  loadedFiles: Record<string, string>;
  stage: Stage;
  composedHierarchy: Prim[];
  isHistoryMode: boolean;
  history: History;
  headCommitId: string | null;
  allPrimsByPath: Map<string, Prim>;
  stagedChanges: StagedChange[];
  currentView: "file" | "stage" | "history";
}

// ==================== Component Types ====================

export interface ThreeSceneConfig {
  canvas: HTMLCanvasElement;
  parser: any;
  viewType: "file" | "stage" | "history";
}

export interface ViewControls {
  updateView: () => void;
  switchTo3D: () => void;
  switchToCode: () => void;
}

export interface ModalController {
  open: (content: HTMLElement) => void;
  close: () => void;
  isOpen: () => boolean;
}

// ==================== USDA Parser Types ====================

export interface USDAParseResult {
  prims: Prim[];
  metadata: Record<string, any>;
  errors: ParseError[];
}

export interface ParseError {
  line: number;
  column: number;
  message: string;
  severity: "error" | "warning";
}

// ==================== Event Types ====================

export interface StateChangeEvent {
  newState: AppState;
  oldState: AppState;
  changes: Partial<AppState>;
}

export type StateChangeListener = (
  newState: AppState,
  oldState: AppState
) => void;

// ==================== Utility Types ====================

export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends object ? DeepPartial<T[P]> : T[P];
};

export type Nullable<T> = T | null;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];
