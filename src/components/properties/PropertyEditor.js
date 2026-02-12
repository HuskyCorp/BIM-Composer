// src/components/properties/PropertyEditor.js
// REFACTORED: Enhanced with error handling and core architecture
// Handles event listeners for property editing

import { store, errorHandler, ValidationError } from "../../core/index.js";
import { validatePrimName, findPrimByPath } from "../../utils/primHelpers.js";
import { showPsetPropertyModal } from "../psetPropertyModal.js";

/**
 * Attaches all event listeners to the properties panel
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The current prim
 * @param {Object} handlers - Object containing handler functions
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
export function attachPropertyEventListeners(
  container,
  prim,
  handlers,
  updateView,
  commitButton
) {
  const { applyPrimRename, applyAttributeChange } = handlers;

  // Pset toggle functionality
  attachPsetToggleListeners(container);

  // Pset property change listeners
  attachPsetPropertyListeners(
    container,
    prim,
    applyAttributeChange,
    updateView,
    commitButton
  );

  // Ungrouped property change listeners
  attachUngroupedPropertyListeners(
    container,
    prim,
    applyAttributeChange,
    updateView,
    commitButton
  );

  // Data link buttons
  attachDataLinkListeners(container);

  // Prim name change
  attachPrimNameListener(
    container,
    prim,
    applyPrimRename,
    updateView,
    commitButton
  );

  // Status change
  attachStatusChangeListener(
    container,
    prim,
    applyAttributeChange,
    updateView,
    commitButton
  );

  // Add property button
  attachAddPropertyListener(
    container,
    prim,
    applyAttributeChange,
    updateView,
    commitButton
  );
}

/**
 * Attaches Pset toggle (collapse/expand) listeners
 * @param {HTMLElement} container - The properties content container
 */
function attachPsetToggleListeners(container) {
  const psetHeaders = container.querySelectorAll(".pset-header");
  console.log("[PSET TOGGLE] Found", psetHeaders.length, "Pset headers");

  psetHeaders.forEach((header) => {
    header.addEventListener("click", () => {
      try {
        const psetId = header.dataset.psetId;
        const propertiesDiv = document.getElementById(psetId);
        const toggleIcon = header.querySelector(".toggle-icon");

        if (!propertiesDiv) {
          throw new ValidationError(
            `Properties div not found for pset: ${psetId}`,
            "psetId",
            psetId
          );
        }

        if (propertiesDiv.classList.contains("hidden")) {
          propertiesDiv.classList.remove("hidden");
          header.classList.remove("collapsed");
          if (toggleIcon) toggleIcon.textContent = "▼";
        } else {
          propertiesDiv.classList.add("hidden");
          header.classList.add("collapsed");
          if (toggleIcon) toggleIcon.textContent = "▶";
        }
      } catch (error) {
        if (error instanceof ValidationError) {
          errorHandler.handleError(error);
          return;
        }
        throw error;
      }
    });
  });
}

/**
 * Attaches Pset property input change listeners
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The current prim
 * @param {Function} applyAttributeChange - Handler for attribute changes
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
function attachPsetPropertyListeners(
  container,
  prim,
  applyAttributeChange,
  updateView,
  commitButton
) {
  const psetInputs = container.querySelectorAll(".pset-property-input");
  console.log("[PSET INPUT] Found", psetInputs.length, "Pset property inputs");

  psetInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      try {
        const propertyKey = e.target.dataset.propertyKey;
        const newValue = e.target.value;

        if (!propertyKey) {
          throw new ValidationError(
            "Property key is missing",
            "propertyKey",
            e.target.dataset
          );
        }

        console.log(
          "[PSET INPUT] Property changed:",
          propertyKey,
          "=",
          newValue
        );

        // Construct the full attribute name
        const fullAttributeName = `custom string ${propertyKey}`;

        // Apply the change
        applyAttributeChange(
          prim,
          fullAttributeName,
          newValue,
          updateView,
          commitButton
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          errorHandler.handleError(error);
          return;
        }
        throw error;
      }
    });
  });
}

/**
 * Attaches ungrouped property input change listeners
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The current prim
 * @param {Function} applyAttributeChange - Handler for attribute changes
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
function attachUngroupedPropertyListeners(
  container,
  prim,
  applyAttributeChange,
  updateView,
  commitButton
) {
  const ungroupedInputs = container.querySelectorAll(
    ".ungrouped-property-input"
  );
  console.log(
    "[UNGROUPED INPUT] Found",
    ungroupedInputs.length,
    "ungrouped property inputs"
  );

  ungroupedInputs.forEach((input) => {
    input.addEventListener("change", (e) => {
      try {
        const propertyKey = e.target.dataset.propertyKey;
        const newValue = e.target.value;

        if (!propertyKey) {
          throw new ValidationError(
            "Property key is missing",
            "propertyKey",
            e.target.dataset
          );
        }

        console.log(
          "[UNGROUPED INPUT] Property changed:",
          propertyKey,
          "=",
          newValue
        );

        // Construct the full attribute name
        const fullAttributeName = `custom string ${propertyKey}`;

        // Apply the change
        applyAttributeChange(
          prim,
          fullAttributeName,
          newValue,
          updateView,
          commitButton
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          errorHandler.handleError(error);
          return;
        }
        throw error;
      }
    });
  });
}

/**
 * Attaches data link button listeners
 * @param {HTMLElement} container - The properties content container
 */
function attachDataLinkListeners(container) {
  container.querySelectorAll(".data-link-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      try {
        const uri = e.target.dataset.uri;

        if (!uri) {
          throw new ValidationError(
            "URI is missing from data link button",
            "uri",
            e.target.dataset
          );
        }

        document.dispatchEvent(
          new CustomEvent("inspectData", { detail: { uri } })
        );
      } catch (error) {
        if (error instanceof ValidationError) {
          errorHandler.handleError(error);
          return;
        }
        throw error;
      }
    });
  });
}

/**
 * Attaches prim name input change listener
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The current prim
 * @param {Function} applyPrimRename - Handler for prim rename
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
function attachPrimNameListener(
  container,
  prim,
  applyPrimRename,
  updateView,
  commitButton
) {
  const primNameInput = document.getElementById("prim-name-input");
  if (!primNameInput) return;

  const originalName = prim.name;

  primNameInput.addEventListener("change", (e) => {
    try {
      const newName = e.target.value.trim();

      // Validate not empty
      if (newName === "") {
        e.target.value = originalName;
        throw new ValidationError(
          "Prim Name cannot be empty",
          "primName",
          newName
        );
      }

      // Validate prim name format
      if (!validatePrimName(newName)) {
        e.target.value = originalName;
        throw new ValidationError(
          "Invalid prim name. Must start with letter or underscore and contain only alphanumeric characters and underscores",
          "primName",
          newName
        );
      }

      // Apply rename
      applyPrimRename(prim, newName, updateView, commitButton);
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });
}

/**
 * Attaches status select change listener
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The current prim
 * @param {Function} applyAttributeChange - Handler for attribute changes
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
function attachStatusChangeListener(
  container,
  prim,
  applyAttributeChange,
  updateView,
  commitButton
) {
  const statusSelect = document.getElementById("prim-status-select");
  if (!statusSelect) return;

  statusSelect.addEventListener("change", (e) => {
    try {
      const newStatus = e.target.value;

      if (!newStatus) {
        throw new ValidationError(
          "Status value is missing",
          "status",
          newStatus
        );
      }

      applyAttributeChange(
        prim,
        "custom token primvars:status",
        newStatus,
        updateView,
        commitButton
      );

      console.log(`✅ Status changed to: ${newStatus}`);
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });
}

/**
 * Attaches add property button listener
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The current prim
 * @param {Function} applyAttributeChange - Handler for attribute changes
 * @param {Function} updateView - Callback to update the view
 * @param {HTMLElement} commitButton - The commit button element
 */
function attachAddPropertyListener(
  container,
  prim,
  applyAttributeChange,
  updateView,
  commitButton
) {
  const addPropertyBtn = document.getElementById("add-property-btn");
  if (!addPropertyBtn) return;

  addPropertyBtn.addEventListener("click", () => {
    try {
      showPsetPropertyModal((properties, psetName) => {
        try {
          if (!properties || !Array.isArray(properties)) {
            throw new ValidationError(
              "Properties must be an array",
              "properties",
              properties
            );
          }

          if (!psetName) {
            throw new ValidationError(
              "Pset name is required",
              "psetName",
              psetName
            );
          }

          console.log(
            "[PSET] Adding",
            properties.length,
            "properties from",
            psetName,
            "to prim"
          );

          // Store Pset name in prim metadata
          if (!prim._psets) {
            prim._psets = {};
          }

          const originalPath = prim.path;

          // Add all properties
          properties.forEach((prop, index) => {
            const fullPropertyName = `custom string ${psetName}:${prop.name}`;
            const isLastProperty = index === properties.length - 1;

            // Skip refresh for all but the last property
            applyAttributeChange(
              prim,
              fullPropertyName,
              prop.value,
              updateView,
              commitButton,
              !isLastProperty
            );

            // Track which Pset this property belongs to
            prim._psets[`${psetName}:${prop.name}`] = psetName;
          });

          // Manually refresh properties panel after all properties are added
          console.log("✅ All properties added, refreshing panel");
          setTimeout(() => {
            const updatedPrim = findPrimByPath(
              store.getState().composedHierarchy,
              originalPath
            );
            if (updatedPrim) {
              // Trigger prim selection to refresh the panel
              document.dispatchEvent(
                new CustomEvent("primSelected", {
                  detail: { primPath: originalPath },
                })
              );
            }
          }, 100);
        } catch (error) {
          if (error instanceof ValidationError) {
            errorHandler.handleError(error);
            return;
          }
          throw error;
        }
      });
    } catch (error) {
      if (error instanceof ValidationError) {
        errorHandler.handleError(error);
        return;
      }
      throw error;
    }
  });
}
