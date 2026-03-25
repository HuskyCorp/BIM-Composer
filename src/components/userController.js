// src/components/userController.js
import {
  store,
  actions as coreActions,
  errorHandler,
  ValidationError,
} from "../core/index.js";
import { renderLayerStack } from "./sidebar/layerStackController.js";
import { getRoleLabel, getRoleColor } from "../utils/rolePermissions.js";
import { resolveUserIdFromName } from "../data/isoModels.js";

const USER_STORAGE_KEY = "usda_composer_current_user";

/**
 * Initialize the user switch controller
 * @param {Function} updateView - Callback to update the view when user changes
 */
export function initUserController(updateView) {
  const userSwitchButton = document.getElementById("userSwitchButton");
  const userDropdown = document.getElementById("userDropdown");
  const currentUserName = document.getElementById("currentUserName");

  // Load persisted user from localStorage
  loadPersistedUser();

  // ==================== Toggle Dropdown ====================
  const handleToggleDropdown = errorHandler.wrap((e) => {
    e.stopPropagation();
    userDropdown.classList.toggle("active");
  });

  userSwitchButton.addEventListener("click", handleToggleDropdown);

  // ==================== Close Dropdown on Outside Click ====================
  document.addEventListener(
    "click",
    errorHandler.wrap((e) => {
      if (!e.target.closest(".user-switch")) {
        userDropdown.classList.remove("active");
      }
    })
  );

  // ==================== Handle User Selection (event delegation) ====================
  userDropdown.addEventListener(
    "click",
    errorHandler.wrap((e) => {
      const option = e.target.closest(".user-option");
      if (!option) return;

      const userId = option.dataset.userId || option.dataset.user;
      const state = store.getState();
      const resolvedId = userId?.startsWith("user-")
        ? userId
        : resolveUserIdFromName(userId || "");

      if (resolvedId !== state.currentUserId) {
        switchUser(resolvedId);
        updateUserUI();
        updateView();
        renderLayerStack();
        window.dispatchEvent(
          new CustomEvent("userChanged", { detail: { userId: resolvedId } })
        );
      }
      userDropdown.classList.remove("active");
    })
  );

  /**
   * Switch to a different user by UUID
   */
  function switchUser(userId) {
    const state = store.getState();
    const users = state.users;
    const userObj = users instanceof Map ? users.get(userId) : null;

    if (!userObj) {
      console.warn(`[USER] Invalid userId: ${userId}`);
      throw new ValidationError(`User "${userId}" not found.`, "user", userId);
    }

    console.log(`[USER] Switching to ${userObj.name} (${userId})`);
    store.dispatch(coreActions.setCurrentUser(userId));
    persistUser(userId);
  }

  /**
   * Update the UI to reflect the current user
   */
  function updateUserUI() {
    const state = store.getState();
    const users = state.users;
    const currentUserObj =
      users instanceof Map ? users.get(state.currentUserId) : null;
    const displayName = currentUserObj?.name || state.currentUser || "Unknown";

    if (currentUserName) currentUserName.textContent = displayName;

    const roleBadge = document.getElementById("userRoleBadge");
    if (roleBadge) {
      roleBadge.textContent = getRoleLabel(currentUserObj || displayName);
      roleBadge.style.background =
        getRoleColor(currentUserObj || displayName) + "55";
      roleBadge.style.color = "#fff";
    }

    // Rebuild dropdown options from the users Map
    rebuildDropdown(users, state.currentUserId);
  }

  /**
   * Rebuild the dropdown list from state.users Map
   */
  function rebuildDropdown(users, currentUserId) {
    if (!userDropdown) return;
    // Clear existing options
    const existingOptions = userDropdown.querySelectorAll(".user-option");
    existingOptions.forEach((o) => o.remove());

    if (!(users instanceof Map)) return;

    for (const [id, user] of users) {
      const li = document.createElement("li");
      li.className = "user-option" + (id === currentUserId ? " selected" : "");
      li.dataset.userId = id;
      li.textContent = user.name;
      const badge = document.createElement("span");
      badge.className = "role-badge";
      badge.textContent = getRoleLabel(user);
      badge.style.background = getRoleColor(user) + "44";
      li.appendChild(badge);
      userDropdown.appendChild(li);
    }
  }

  function persistUser(userId) {
    try {
      localStorage.setItem(USER_STORAGE_KEY, userId);
    } catch (error) {
      errorHandler.handleError(error);
    }
  }

  function loadPersistedUser() {
    errorHandler.wrap(() => {
      const stored = localStorage.getItem(USER_STORAGE_KEY);
      if (!stored) {
        updateUserUI();
        return;
      }

      const state = store.getState();
      const users = state.users;

      // Resolve stored value to a UUID
      const userId = stored.startsWith("user-")
        ? stored
        : resolveUserIdFromName(stored);

      const valid = users instanceof Map ? users.has(userId) : false;
      if (valid) {
        store.dispatch(coreActions.setCurrentUser(userId));
        console.log(`[USER] Loaded persisted user: ${userId}`);
      } else {
        console.log(`[USER] Stale persisted user '${stored}', using default`);
        localStorage.removeItem(USER_STORAGE_KEY);
      }
      updateUserUI();
    })();
  }

  // Initial UI update
  updateUserUI();

  console.log("✅ User controller initialized");
}
