// src/components/userController.js
// REFACTORED: Uses new core architecture with middleware and error handling
import {
  store,
  actions as coreActions,
  errorHandler,
  FileError,
  ValidationError,
} from "../core/index.js";
import { renderLayerStack } from "./sidebar/layerStackController.js";
import { getRoleLabel, getRoleColor } from "../utils/rolePermissions.js";

const USER_STORAGE_KEY = "usda_composer_current_user";

/**
 * Initialize the user switch controller
 * @param {Function} updateView - Callback to update the view when user changes
 */
export function initUserController(updateView) {
  const userSwitchButton = document.getElementById("userSwitchButton");
  const userDropdown = document.getElementById("userDropdown");
  const currentUserName = document.getElementById("currentUserName");
  const userOptions = document.querySelectorAll(".user-option");

  // Load persisted user from localStorage
  loadPersistedUser();

  // ==================== Toggle Dropdown ====================
  const handleToggleDropdown = errorHandler.wrap((e) => {
    e.stopPropagation();
    userDropdown.classList.toggle("active");
  });

  userSwitchButton.addEventListener("click", handleToggleDropdown);

  // ==================== Close Dropdown on Outside Click ====================
  const handleOutsideClick = errorHandler.wrap((e) => {
    if (!e.target.closest(".user-switch")) {
      userDropdown.classList.remove("active");
    }
  });

  document.addEventListener("click", handleOutsideClick);

  // ==================== Handle User Selection ====================
  userOptions.forEach((option) => {
    const handleUserSelect = errorHandler.wrap(() => {
      const selectedUser = option.dataset.user;
      if (selectedUser !== store.getState().currentUser) {
        switchUser(selectedUser);
        updateUserUI();
        updateView();
        renderLayerStack(); // Force refresh of layer stack with new user permissions

        // Dispatch custom event for other components to react
        window.dispatchEvent(
          new CustomEvent("userChanged", {
            detail: { user: selectedUser },
          })
        );
      }
      userDropdown.classList.remove("active");
    });

    option.addEventListener("click", handleUserSelect);
  });

  /**
   * Switch to a different user
   * @param {string} user - The user to switch to
   * @throws {ValidationError} If user is invalid
   */
  function switchUser(user) {
    const state = store.getState();

    if (!state.users.includes(user)) {
      console.warn(`[USER] Invalid user: ${user}`);
      throw new ValidationError(
        `User "${user}" is not valid. Available users: ${state.users.join(", ")}`,
        "user",
        user
      );
    }

    console.log(`[USER] Switching from ${state.currentUser} to ${user}`);

    // Using new action creator with middleware
    store.dispatch(coreActions.setCurrentUser(user));

    // Persist to localStorage with error handling
    persistUser(user);
  }

  /**
   * Update the UI to reflect the current user
   */
  function updateUserUI() {
    const currentUser = store.getState().currentUser;
    currentUserName.textContent = currentUser;

    // Update role badge
    const roleBadge = document.getElementById("userRoleBadge");
    if (roleBadge) {
      roleBadge.textContent = getRoleLabel(currentUser);
      roleBadge.style.background = getRoleColor(currentUser) + "55"; // translucent tint
      roleBadge.style.color = "#fff";
    }

    // Update selected state in dropdown
    userOptions.forEach((option) => {
      if (option.dataset.user === currentUser) {
        option.classList.add("selected");
      } else {
        option.classList.remove("selected");
      }
    });
  }

  /**
   * Persist current user to localStorage
   * @param {string} user - The user to persist
   * @throws {FileError} If localStorage is unavailable or quota exceeded
   */
  function persistUser(user) {
    try {
      localStorage.setItem(USER_STORAGE_KEY, user);
      console.log(`[USER] Persisted user: ${user}`);
    } catch (error) {
      // Handle QuotaExceededError or SecurityError
      const storageError = new FileError(
        `Failed to persist user to localStorage: ${error.message}`,
        USER_STORAGE_KEY,
        error
      );
      errorHandler.handleError(storageError);
      throw storageError;
    }
  }

  /**
   * Load persisted user from localStorage
   */
  function loadPersistedUser() {
    const wrappedLoad = errorHandler.wrap(
      () => {
        const persistedUser = localStorage.getItem(USER_STORAGE_KEY);
        const state = store.getState();

        if (persistedUser && state.users.includes(persistedUser)) {
          // Using new action creator with middleware
          store.dispatch(coreActions.setCurrentUser(persistedUser));
          console.log(`[USER] Loaded persisted user: ${persistedUser}`);
        } else if (persistedUser) {
          console.log(
            `[USER] Invalid/Stale persisted user '${persistedUser}', resetting to default: ${state.currentUser}`
          );
          localStorage.removeItem(USER_STORAGE_KEY);
        }

        updateUserUI();
      },
      () => {
        // Fallback: just update UI with current state if load fails
        console.warn(
          "[USER] Failed to load persisted user, using current state"
        );
        updateUserUI();
      }
    );

    wrappedLoad();
  }

  // Initial UI update
  updateUserUI();

  console.log("✅ User controller initialized with new architecture");
}
