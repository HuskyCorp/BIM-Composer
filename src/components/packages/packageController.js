// src/components/packages/packageController.js

import { store } from "../../core/index.js";
import { actions as coreActions } from "../../core/state/actions/index.js";
import { writePackageRegistryToStatement } from "../../viewer/usda/usdaComposer.js";
import { readPackageRegistryFromStatement } from "../../viewer/usda/parser/logParser.js";
import { DISCIPLINE_CONFIG } from "../../utils/precedenceMatrix.js";

const PACKAGE_COLORS = [
  "#607d8b",
  "#4a90d9",
  "#7ed321",
  "#f5a623",
  "#d0021b",
  "#9013fe",
];

// Re-entrancy guard: prevents bootstrapPackages from being triggered
// by the store changes it makes itself.
let _bootstrapping = false;

function getNextColor(packages) {
  return PACKAGE_COLORS[packages.length % PACKAGE_COLORS.length];
}

function generatePackageId() {
  return `pkg-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;
}

/**
 * Generate an ISO 19650-compliant package number.
 * Format: {companyCode}-{teamCode}-{disciplineCode}-{001}
 */
function generateIsoPackageNumber(state) {
  const user =
    state.users instanceof Map ? state.users.get(state.currentUserId) : null;
  if (!user) return null;

  const company = user.company?.code || "AEC";
  const team = user.taskTeams?.[0]?.code || "TEAM";
  const discipline = DISCIPLINE_CONFIG[user.discipline]?.code || "GEN";
  const prefix = `${company}-${team}-${discipline}`;
  const existing = (state.packages || []).filter((p) =>
    p.isoNumber?.startsWith(prefix)
  );
  const seq = String(existing.length + 1).padStart(3, "0");
  return `${prefix}-${seq}`;
}

function persistPackages(packages) {
  const statementContent = store.getState().loadedFiles?.["statement.usda"];
  if (!statementContent) return;
  const newContent = writePackageRegistryToStatement(
    statementContent,
    packages
  );
  store.dispatch(coreActions.updateFile("statement.usda", newContent));
}

/**
 * Reads the package registry from the loaded statement.usda and reconciles it
 * with the current state.
 *
 * Safe to call multiple times — re-entrancy is guarded by _bootstrapping.
 * Scenario A (fresh project): no registry in file → writes default packages.
 * Scenario B (loaded project): registry found → replaces in-memory packages.
 */
export function bootstrapPackages() {
  if (_bootstrapping) return;
  _bootstrapping = true;

  try {
    const state = store.getState();
    const statementContent = state.loadedFiles?.["statement.usda"];
    if (!statementContent) return;

    const loadedPackages = readPackageRegistryFromStatement(statementContent);

    if (loadedPackages.length > 0) {
      // File has a registry — reconcile with current in-memory packages.
      const currentPackages = state.packages || [];

      // Check whether the registry in the file already matches what we have.
      const alreadySynced =
        loadedPackages.length === currentPackages.length &&
        loadedPackages.every((lp, i) => lp.id === currentPackages[i]?.id);

      if (!alreadySynced) {
        // Remove all current packages and load from file.
        [...currentPackages].forEach((p) =>
          store.dispatch(coreActions.removePackage(p.id))
        );
        loadedPackages.forEach((pkg) =>
          store.dispatch(coreActions.addPackage(pkg))
        );
        if (loadedPackages[0]) {
          store.dispatch(coreActions.setActivePackage(loadedPackages[0].id));
        }
      }
    } else {
      // No registry in the file yet — persist the current in-memory packages.
      persistPackages(store.getState().packages || []);
    }
  } finally {
    _bootstrapping = false;
  }
}

/**
 * Initialises the Design Packages panel.
 *
 * @param {Function} updateView - App-level view refresh callback
 */
export function initPackageController(updateView) {
  const packagesList = document.getElementById("packages-list");
  const addBtn = document.getElementById("add-package-button");
  const removeBtn = document.getElementById("remove-package-button");

  if (!packagesList || !addBtn || !removeBtn) return;

  // store.subscribe requires (key: string, callback: fn).
  // The callback receives (prevState, nextState).
  store.subscribe("packages-ui", (prevState, nextState) => {
    renderPackageList();
    renderPackageFilterBar();

    // Re-bootstrap when an externally loaded statement.usda arrives with a
    // package registry that we haven't seen before.
    if (!_bootstrapping) {
      const prevContent = prevState?.loadedFiles?.["statement.usda"];
      const nextContent = nextState?.loadedFiles?.["statement.usda"];
      if (
        nextContent &&
        nextContent !== prevContent &&
        nextContent.includes("customLayerData") &&
        !prevContent?.includes("customLayerData")
      ) {
        bootstrapPackages();
      }
    }
  });

  addBtn.addEventListener("click", () => createPackageInline());
  removeBtn.addEventListener("click", () => removeActivePackage());

  // Initial render (subscriber is not called on registration, only on change).
  renderPackageList();
  renderPackageFilterBar();

  // ── Render ─────────────────────────────────────────────────────────────────

  function renderPackageList() {
    const state = store.getState();
    const packages = state.packages || [];
    const activePackageId = state.activePackageId;

    packagesList.innerHTML = "";

    if (packages.length === 0) {
      const empty = document.createElement("li");
      empty.className = "package-empty";
      empty.textContent = "No packages. Create a package to begin.";
      packagesList.appendChild(empty);
      return;
    }

    packages.forEach((pkg) => {
      const li = document.createElement("li");
      li.className =
        "package-item" + (pkg.id === activePackageId ? " active" : "");
      li.dataset.packageId = pkg.id;

      li.innerHTML = `
        <span class="package-swatch" style="background:${pkg.color};"></span>
        <span class="package-name-col">
          <span class="package-name">${pkg.name}</span>
          ${pkg.isoNumber ? `<span class="package-iso-number">${pkg.isoNumber}</span>` : ""}
        </span>
        ${pkg.id === activePackageId ? '<span class="package-active-dot" title="Active Package">●</span>' : ""}
      `;

      li.addEventListener("click", () => {
        store.dispatch(coreActions.setActivePackage(pkg.id));
        if (updateView) updateView();
      });

      packagesList.appendChild(li);
    });
  }

  // ── Package Filter Bar ─────────────────────────────────────────────────────

  function renderPackageFilterBar() {
    const filterBar = document.getElementById("package-filter-controls");
    if (!filterBar) return;

    const state = store.getState();
    const packages = state.packages || [];
    const active = state.stage?.activePackageFilter || "All";

    filterBar.innerHTML = "";

    const allBtn = document.createElement("button");
    allBtn.className =
      "filter-btn pkg-filter-btn" + (active === "All" ? " active" : "");
    allBtn.dataset.pkgFilter = "All";
    allBtn.textContent = "All";
    filterBar.appendChild(allBtn);

    packages.forEach((pkg) => {
      const btn = document.createElement("button");
      const isActive = active === pkg.id;
      btn.className = "filter-btn pkg-filter-btn" + (isActive ? " active" : "");
      btn.dataset.pkgFilter = pkg.id;
      btn.textContent = pkg.name;
      if (isActive) {
        btn.style.background = pkg.color;
        btn.style.borderColor = pkg.color;
        btn.style.color = "#fff";
      }
      filterBar.appendChild(btn);
    });
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  function createPackageInline() {
    const packages = store.getState().packages || [];
    const color = getNextColor(packages);

    const li = document.createElement("li");
    li.className = "package-item package-item-new";
    li.innerHTML = `
      <span class="package-swatch" style="background:${color};"></span>
      <input class="package-name-input" type="text" placeholder="Package name" maxlength="40" />
    `;
    packagesList.appendChild(li);

    const input = li.querySelector(".package-name-input");
    input.focus();

    let committed = false;

    const commit = () => {
      if (committed) return;
      committed = true;

      const name = input.value.trim();
      if (!name) {
        li.remove();
        return;
      }

      const state = store.getState();
      const newPkg = {
        id: generatePackageId(),
        name,
        color,
        createdAt: new Date().toISOString(),
        createdBy: state.currentUser || "System",
        isoNumber: generateIsoPackageNumber(state),
        designOptionId: null,
        stageBranch: "WIP",
        approvalStatus: "pending",
      };
      store.dispatch(coreActions.addPackage(newPkg));
      store.dispatch(coreActions.setActivePackage(newPkg.id));
      persistPackages(store.getState().packages);
      if (updateView) updateView();
    };

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") commit();
      if (e.key === "Escape") {
        committed = true;
        li.remove();
      }
    });
    input.addEventListener("blur", commit);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  function removeActivePackage() {
    const state = store.getState();
    const packages = state.packages || [];

    if (packages.length <= 1) {
      alert("Cannot remove the last Design Package.");
      return;
    }

    const pkg = packages.find((p) => p.id === state.activePackageId);
    if (!pkg) return;

    if (
      !confirm(
        `Remove package "${pkg.name}"?\n\nRecords already assigned to this package will still appear in the Record Log.`
      )
    )
      return;

    store.dispatch(coreActions.removePackage(pkg.id));
    persistPackages(store.getState().packages);
    if (updateView) updateView();
  }
}
