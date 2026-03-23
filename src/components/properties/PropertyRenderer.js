// src/components/properties/PropertyRenderer.js
// REFACTORED: Enhanced with error handling and core architecture
// Handles rendering the properties panel UI

import { store, errorHandler, ValidationError } from "../../core/index.js";
import { getAllPrimPaths } from "../../utils/primHelpers.js";
import { resolvePrimStatus } from "../../utils/statusUtils.js";

/**
 * Renders a placeholder message in the properties panel
 * @param {HTMLElement} container - The properties content container
 * @param {string} message - The message to display
 */
export function renderPlaceholder(
  container,
  message = "Select a prim to view its properties."
) {
  container.innerHTML = `<p class="placeholder-text">${message}</p>`;
}

/**
 * Checks if the current user can edit a prim's properties
 * @param {Object} prim - The prim to check
 * @returns {boolean} True if user can edit
 */
export const canUserEditPrim = errorHandler.wrap((prim) => {
  if (!prim) {
    throw new ValidationError(
      "Prim is required to check permissions",
      "prim",
      prim
    );
  }
  const state = store.getState();

  // History Mode is Read-Only
  if (state.isHistoryMode) {
    return false;
  }

  // Project Manager can edit everything
  if (state.currentUser === "Project Manager") {
    return true;
  }
  // Field Engineer can edit everything
  if (state.currentUser === "Field Engineer") {
    return true;
  }
  // Field Person cannot edit existing properties (but can add new ones via the button)
  if (state.currentUser === "Field Person") {
    return false;
  }
  // No source file = no ownership restriction, allow editing
  if (!prim._sourceFile) {
    return true;
  }
  // Original owner of the source file can edit
  const sourceLayer = state.stage.layerStack.find(
    (l) => l.filePath === prim._sourceFile
  );
  // No matching layer in stack = no ownership restriction, allow editing
  if (!sourceLayer) {
    return true;
  }
  if (sourceLayer.owner === state.currentUser) {
    return true;
  }
  return false;
});

/**
 * Renders the properties panel for a prim
 * @param {HTMLElement} container - The properties content container
 * @param {Object} prim - The prim to render properties for
 * @returns {string} The generated HTML
 */
export const renderPropertiesPanel = errorHandler.wrap((container, prim) => {
  if (!container || !(container instanceof HTMLElement)) {
    throw new ValidationError(
      "Container must be a valid HTML element",
      "container",
      container
    );
  }

  if (!prim || !prim.path) {
    throw new ValidationError("Prim is missing or invalid", "prim", prim);
  }
  const primName = prim.name;
  // PHASE 4: ACTIVE STATE MANAGEMENT - Use centralized resolver
  const currentStatus = resolvePrimStatus(
    prim,
    store.getState().stage.layerStack
  );
  const currentEntityType = prim.properties.entityType || "Real Element";

  const statuses = ["WIP", "Shared", "Published", "Archived"];
  const entityTypes = ["Real Element", "placeholder"];
  const allPrimPaths = getAllPrimPaths(store.getState().composedHierarchy);

  const canEdit = canUserEditPrim(prim);

  let propertiesHTML = `
    <div class="property-group">
      <label>Prim Name</label>
      <input type="text" id="prim-name-input" value="${primName}" ${canEdit ? "" : "disabled"} />
    </div>
    <div class="property-group">
      <label>Prim Path</label>
      <select id="prim-path-select" disabled>
        ${allPrimPaths
          .map(
            (p) =>
              `<option value="${p}" ${p === prim.path ? "selected" : ""}>${p}</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="property-group">
      <label>Prim Type</label>
      <input type="text" value="${prim.type}" disabled />
    </div>
    <div class="property-group">
      <label>Status</label>
      <select id="prim-status-select" ${canEdit ? "" : "disabled"}>
        ${statuses
          .map(
            (s) =>
              `<option value="${s}" ${s === currentStatus ? "selected" : ""}>${s}</option>`
          )
          .join("")}
      </select>
    </div>
    <div class="property-group">
      <label>Entity Type</label>
      <select id="prim-entityType-select" disabled>
        ${entityTypes
          .map(
            (et) =>
              `<option value="${et}" ${et === currentEntityType ? "selected" : ""}>${et}</option>`
          )
          .join("")}
      </select>
    </div>
  `;

  // Render custom properties grouped by Pset
  propertiesHTML += renderCustomProperties(prim);

  // "Add Custom Attribute" is always available regardless of source-file ownership —
  // new Pset entries are written to statement.usda (the current user's own file),
  // not back to the read-only source layer.  Only existing-property inputs use
  // canEdit to decide whether to render as disabled.
  propertiesHTML += `<button id="add-property-btn" class="add-property-btn">Add Custom Attribute</button>`;

  container.innerHTML = propertiesHTML;

  return propertiesHTML;
});

/**
 * Renders custom properties, grouped by Pset
 * @param {Object} prim - The prim object
 * @returns {string} HTML for custom properties
 */
function renderCustomProperties(prim) {
  const psetGroups = {};
  const ungroupedProperties = [];

  console.log("[PSET DEBUG] prim._psets:", prim._psets);
  console.log("[PSET DEBUG] prim.properties:", Object.keys(prim.properties));

  // Group properties by Pset
  for (const key in prim.properties) {
    // Skip system properties
    if (key !== "displayName" && key !== "status" && key !== "entityType") {
      let value = prim.properties[key];
      if (typeof value === "object" && value !== null) {
        value = `color(${value.r}, ${value.g}, ${value.b})`;
      }

      const isLink =
        typeof value === "string" &&
        (value.startsWith("http") ||
          value.endsWith(".json") ||
          value.endsWith(".csv"));

      // Create unique input ID for ungrouped properties
      const inputId = `ungrouped-input-${key.replace(/[^a-zA-Z0-9]/g, "-")}`;

      let inputHtml = `<input 
        type="text" 
        id="${inputId}"
        class="ungrouped-property-input"
        data-property-key="${key}"
        value="${value}"
      />`;

      if (isLink) {
        inputHtml = `
          <div style="display:flex; gap:5px;">
            <input 
              type="text" 
              id="${inputId}"
              class="ungrouped-property-input"
              data-property-key="${key}"
              value="${value}" 
              style="flex:1;" 
            />
            <button class="data-link-btn" data-uri="${value}">Inspect</button>
          </div>
        `;
      }

      const propertyData = { key, value, inputHtml };

      // Check if this property belongs to a Pset
      if (prim._psets && prim._psets[key]) {
        const psetName = prim._psets[key];
        console.log("[PSET DEBUG] Found Pset for", key, ":", psetName);
        if (!psetGroups[psetName]) {
          psetGroups[psetName] = [];
        }
        psetGroups[psetName].push(propertyData);
      } else {
        console.log("[PSET DEBUG] No Pset for", key);
        ungroupedProperties.push(propertyData);
      }
    }
  }

  console.log("[PSET DEBUG] psetGroups:", Object.keys(psetGroups));
  console.log(
    "[PSET DEBUG] ungroupedProperties count:",
    ungroupedProperties.length
  );

  let html = "";

  // Render Pset groups
  for (const psetName in psetGroups) {
    const properties = psetGroups[psetName];
    const psetId = `pset-${psetName.replace(/[^a-zA-Z0-9]/g, "-")}`;

    html += `
      <div class="pset-group">
        <div class="pset-header" data-pset-id="${psetId}">
          <span class="pset-name">${psetName}</span>
          <span class="toggle-icon">▼</span>
        </div>
        <div class="pset-properties" id="${psetId}">
    `;

    properties.forEach((prop) => {
      const inputId = `pset-input-${psetName.replace(/[^a-zA-Z0-9]/g, "-")}-${prop.key.replace(/[^a-zA-Z0-9]/g, "-")}`;

      html += `
        <div class="property-group">
          <label>${prop.key}</label>
          <input 
            type="text" 
            id="${inputId}"
            class="pset-property-input"
            data-property-key="${prop.key}"
            data-pset-name="${psetName}"
            value="${prop.value}"
          />
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  }

  // Render ungrouped properties
  if (ungroupedProperties.length > 0) {
    ungroupedProperties.forEach((prop) => {
      html += `
        <div class="property-group">
          <label>${prop.key}</label>
          ${prop.inputHtml}
        </div>
      `;
    });
  }

  return html;
}
