// src/components/userManagementController.js
// ISO 19650 User Management UI — Companies, Task Teams, Users
import { store } from "../core/index.js";
import {
  userManagementActions,
  companyActions,
  taskTeamActions,
  sceneActions,
} from "../core/state/actions/index.js";
import { ISO_ROLES, SUITABILITY_CODES } from "../data/isoModels.js";
import { DISCIPLINE_CONFIG } from "../utils/precedenceMatrix.js";

const DISCIPLINES = Object.keys(DISCIPLINE_CONFIG);

function generateId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
}

/**
 * Initialize the user management modal controller.
 * @param {Function} updateView
 */
export function initUserManagementController(updateView) {
  const modal = document.getElementById("user-management-modal");
  const openBtn = document.getElementById("manageUsersButton");
  const closeBtn = document.getElementById("close-user-management-modal");

  if (!modal || !openBtn) {
    console.warn("[UserMgmt] Modal or open button not found in DOM");
    return;
  }

  // ── Tab Switching ─────────────────────────────────────────────────────────
  modal.addEventListener("click", (e) => {
    const tab = e.target.closest(".um-tab");
    if (!tab) return;
    modal
      .querySelectorAll(".um-tab")
      .forEach((t) => t.classList.remove("active"));
    modal
      .querySelectorAll(".um-tab-content")
      .forEach((c) => (c.style.display = "none"));
    tab.classList.add("active");
    const content = modal.querySelector(`#um-tab-${tab.dataset.tab}`);
    if (content) content.style.display = "";
  });

  // ── Open / Close ──────────────────────────────────────────────────────────
  openBtn.addEventListener("click", () => {
    renderModal();
    modal.style.display = "flex";
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
      updateView();
      window.dispatchEvent(new CustomEvent("userChanged", { detail: {} }));
    });
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      modal.style.display = "none";
      updateView();
      window.dispatchEvent(new CustomEvent("userChanged", { detail: {} }));
    }
  });

  console.log("✅ User management controller initialized");
}

// ─── Render ────────────────────────────────────────────────────────────────

function renderModal() {
  renderCompaniesTab();
  renderTaskTeamsTab();
  renderUsersTab();
}

// ─── Users Tab ────────────────────────────────────────────────────────────

function renderUsersTab() {
  const container = document.getElementById("um-tab-users");
  if (!container) return;

  const state = store.getState();
  const users =
    state.users instanceof Map ? Array.from(state.users.values()) : [];
  const companies = state.companies || [];
  const taskTeams = state.taskTeams || [];

  container.innerHTML = `
    <div class="um-two-col">
      <div class="um-list-col">
        <ul class="um-list" id="um-users-list"></ul>
        <button class="um-add-btn" id="um-add-user-btn">+ Add User</button>
      </div>
      <div class="um-form-col" id="um-user-form" style="display:none">
        <label>Name<input type="text" id="um-user-name" /></label>
        <label>Role
          <select id="um-user-role">
            ${Object.entries(ISO_ROLES)
              .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
              .join("")}
          </select>
        </label>
        <label>Company
          <select id="um-user-company">
            ${companies.map((c) => `<option value="${c.id}">${c.name} (${c.code})</option>`).join("")}
          </select>
        </label>
        <label>Discipline
          <select id="um-user-discipline">
            ${DISCIPLINES.map((d) => `<option value="${d}">${d}</option>`).join("")}
          </select>
        </label>
        <label>Task Teams</label>
        <div id="um-user-teams" class="um-checkbox-group"></div>
        <div class="um-form-actions">
          <button id="um-save-user-btn">Save</button>
          <button id="um-delete-user-btn" class="um-danger-btn">Delete</button>
        </div>
      </div>
    </div>
  `;

  const listEl = container.querySelector("#um-users-list");
  let editingUserId = null;

  function renderUserList() {
    const s = store.getState();
    const allUsers = s.users instanceof Map ? Array.from(s.users.values()) : [];
    listEl.innerHTML = "";
    allUsers.forEach((u) => {
      const li = document.createElement("li");
      li.className =
        "um-list-item" + (u.id === editingUserId ? " selected" : "");
      li.innerHTML = `
        <span class="um-item-name">${u.name}</span>
        <span class="um-role-badge" style="background:${ISO_ROLES[u.role]?.color || "#888"}44">${ISO_ROLES[u.role]?.label || u.role}</span>
        <span class="um-item-sub">${u.company?.code || ""} · ${u.discipline || ""}</span>
      `;
      li.addEventListener("click", () => openUserForm(u.id));
      listEl.appendChild(li);
    });
  }

  function openUserForm(userId) {
    editingUserId = userId;
    const s = store.getState();
    const user = userId ? s.users.get(userId) : null;
    const form = container.querySelector("#um-user-form");
    form.style.display = "";

    container.querySelector("#um-user-name").value = user?.name || "";
    container.querySelector("#um-user-role").value =
      user?.role || "task_team_member";
    container.querySelector("#um-user-company").value =
      user?.company?.id || s.companies?.[0]?.id || "";
    container.querySelector("#um-user-discipline").value =
      user?.discipline || DISCIPLINES[0];

    // Task teams checkboxes
    const teamsDiv = container.querySelector("#um-user-teams");
    const allTeams = s.taskTeams || [];
    teamsDiv.innerHTML = allTeams
      .map(
        (t) => `
      <label class="um-checkbox-label">
        <input type="checkbox" value="${t.id}" ${user?.taskTeams?.some((tt) => tt.id === t.id) ? "checked" : ""}/>
        ${t.name} (${t.code})
      </label>
    `
      )
      .join("");

    renderUserList();
  }

  // Add user button
  container.querySelector("#um-add-user-btn").addEventListener("click", () => {
    openUserForm(null);
    editingUserId = null;
    container.querySelector("#um-user-name").value = "";
  });

  // Save
  container.querySelector("#um-save-user-btn").addEventListener("click", () => {
    const s = store.getState();
    const name = container.querySelector("#um-user-name").value.trim();
    if (!name) {
      alert("Name is required");
      return;
    }

    const role = container.querySelector("#um-user-role").value;
    const companyId = container.querySelector("#um-user-company").value;
    const discipline = container.querySelector("#um-user-discipline").value;
    const company =
      s.companies.find((c) => c.id === companyId) || s.companies[0];
    const selectedTeamIds = Array.from(
      container.querySelectorAll("#um-user-teams input:checked")
    ).map((cb) => cb.value);
    const taskTeams = s.taskTeams.filter((t) => selectedTeamIds.includes(t.id));

    const userObj = { name, role, company, discipline, taskTeams };

    if (editingUserId) {
      store.dispatch(userManagementActions.updateUser(editingUserId, userObj));
    } else {
      store.dispatch(
        userManagementActions.addUser({ ...userObj, id: generateId("user") })
      );
    }
    renderUserList();
  });

  // Delete
  container
    .querySelector("#um-delete-user-btn")
    .addEventListener("click", () => {
      if (!editingUserId) return;
      if (!confirm("Delete this user?")) return;
      store.dispatch(userManagementActions.removeUser(editingUserId));
      editingUserId = null;
      container.querySelector("#um-user-form").style.display = "none";
      renderUserList();
    });

  renderUserList();
}

// ─── Companies Tab ────────────────────────────────────────────────────────

function renderCompaniesTab() {
  const container = document.getElementById("um-tab-companies");
  if (!container) return;

  const state = store.getState();
  const companies = state.companies || [];

  container.innerHTML = `
    <div class="um-simple-list">
      <table class="um-table">
        <thead><tr><th>Name</th><th>Code</th><th></th></tr></thead>
        <tbody id="um-companies-tbody"></tbody>
      </table>
      <button class="um-add-btn" id="um-add-company-btn">+ Add Company</button>
    </div>
  `;

  const tbody = container.querySelector("#um-companies-tbody");

  function renderCompanyList() {
    const s = store.getState();
    tbody.innerHTML = "";
    (s.companies || []).forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="um-inline-input co-name" value="${c.name}" /></td>
        <td><input class="um-inline-input co-code" value="${c.code}" maxlength="6" style="width:60px;text-transform:uppercase" /></td>
        <td><button class="um-danger-btn co-delete" data-id="${c.id}">✕</button></td>
      `;
      tr.querySelector(".co-name").addEventListener("change", (e) => {
        store.dispatch(
          companyActions.updateCompany(c.id, { name: e.target.value.trim() })
        );
      });
      tr.querySelector(".co-code").addEventListener("change", (e) => {
        store.dispatch(
          companyActions.updateCompany(c.id, {
            code: e.target.value.trim().toUpperCase(),
          })
        );
      });
      tr.querySelector(".co-delete").addEventListener("click", () => {
        if (confirm("Delete this company?")) {
          store.dispatch(companyActions.removeCompany(c.id));
          renderCompanyList();
        }
      });
      tbody.appendChild(tr);
    });
  }

  container
    .querySelector("#um-add-company-btn")
    .addEventListener("click", () => {
      const newCompany = {
        id: generateId("co"),
        name: "New Company",
        code: "NEW",
      };
      store.dispatch(companyActions.addCompany(newCompany));
      renderCompanyList();
    });

  renderCompanyList();
}

// ─── Task Teams Tab ───────────────────────────────────────────────────────

function renderTaskTeamsTab() {
  const container = document.getElementById("um-tab-teams");
  if (!container) return;

  container.innerHTML = `
    <div class="um-simple-list">
      <table class="um-table">
        <thead><tr><th>Name</th><th>Code</th><th>Discipline</th><th>Company</th><th></th></tr></thead>
        <tbody id="um-teams-tbody"></tbody>
      </table>
      <button class="um-add-btn" id="um-add-team-btn">+ Add Task Team</button>
    </div>
  `;

  const tbody = container.querySelector("#um-teams-tbody");

  function renderTeamList() {
    const s = store.getState();
    tbody.innerHTML = "";
    (s.taskTeams || []).forEach((t) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><input class="um-inline-input tt-name" value="${t.name}" /></td>
        <td><input class="um-inline-input tt-code" value="${t.code}" maxlength="10" style="width:70px;text-transform:uppercase" /></td>
        <td>
          <select class="tt-discipline">
            ${DISCIPLINES.map((d) => `<option value="${d}" ${t.discipline === d ? "selected" : ""}>${d}</option>`).join("")}
          </select>
        </td>
        <td>
          <select class="tt-company">
            ${(s.companies || []).map((c) => `<option value="${c.id}" ${t.company?.id === c.id ? "selected" : ""}>${c.code}</option>`).join("")}
          </select>
        </td>
        <td><button class="um-danger-btn tt-delete" data-id="${t.id}">✕</button></td>
      `;
      tr.querySelector(".tt-name").addEventListener("change", (e) =>
        store.dispatch(
          taskTeamActions.updateTaskTeam(t.id, { name: e.target.value.trim() })
        )
      );
      tr.querySelector(".tt-code").addEventListener("change", (e) =>
        store.dispatch(
          taskTeamActions.updateTaskTeam(t.id, {
            code: e.target.value.trim().toUpperCase(),
          })
        )
      );
      tr.querySelector(".tt-discipline").addEventListener("change", (e) =>
        store.dispatch(
          taskTeamActions.updateTaskTeam(t.id, { discipline: e.target.value })
        )
      );
      tr.querySelector(".tt-company").addEventListener("change", (e) => {
        const company = s.companies.find((c) => c.id === e.target.value);
        if (company)
          store.dispatch(taskTeamActions.updateTaskTeam(t.id, { company }));
      });
      tr.querySelector(".tt-delete").addEventListener("click", () => {
        if (confirm("Delete this task team?")) {
          store.dispatch(taskTeamActions.removeTaskTeam(t.id));
          renderTeamList();
        }
      });
      tbody.appendChild(tr);
    });
  }

  container.querySelector("#um-add-team-btn").addEventListener("click", () => {
    const s = store.getState();
    const newTeam = {
      id: generateId("tt"),
      name: "New Team",
      code: "TEAM",
      discipline: DISCIPLINES[0],
      company: s.companies?.[0] || {
        id: "co-aec-01",
        name: "AEC Company",
        code: "AEC",
      },
    };
    store.dispatch(taskTeamActions.addTaskTeam(newTeam));
    renderTeamList();
  });

  renderTeamList();
}
