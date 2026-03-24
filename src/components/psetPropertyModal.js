// src/components/psetPropertyModal.js

let psetDefinitions = null;

/**
 * Load Pset definitions from JSON file
 */
async function loadPsetDefinitions() {
  if (psetDefinitions) return psetDefinitions;

  try {
    const response = await fetch("./src/data/pset_definitions.json");
    psetDefinitions = await response.json();
    console.log(
      "[PSET] Loaded",
      Object.keys(psetDefinitions).length,
      "Pset categories"
    );
    return psetDefinitions;
  } catch (error) {
    console.error("[PSET] Failed to load pset_definitions.json:", error);
    alert(
      "Failed to load property definitions. Please check console for details."
    );
    return null;
  }
}

/**
 * Show the Pset property selection modal
 * @param {Function} onAdd - Callback function when property is added (propertyName, propertyValue)
 */
export async function showPsetPropertyModal(onAdd) {
  const definitions = await loadPsetDefinitions();
  if (!definitions) return;

  // Get list of Pset categories (not individual properties)
  const psetCategories = Object.keys(definitions).sort();

  // Create modal overlay
  const overlay = document.createElement("div");
  overlay.id = "pset-property-modal";
  overlay.className = "modal-overlay";
  overlay.style.display = "flex";

  overlay.innerHTML = `
    <div class="modal-content pset-modal-content">
      <div class="modal-header pset-modal-header">
        <h2>Add Properties from Pset</h2>
      </div>
      <div class="modal-body pset-modal-body">
        <!-- Left Column: Pset Selection -->
        <div class="pset-modal-left">
          <div class="pset-modal-search-sticky">
            <label class="pset-modal-search-label">Select Property Set</label>
            <input
              type="text"
              id="pset-search-input"
              class="pset-modal-search-input"
              placeholder="Search Psets (e.g., Pset_Wall)..."
              autocomplete="off"
            />
          </div>
          <div id="pset-list"></div>
        </div>

        <!-- Right Column: Attributes Form -->
        <div class="pset-modal-right">
          <div id="attributes-form">
            <div class="pset-modal-placeholder">
              Select a Property Set to view its attributes
            </div>
          </div>
        </div>
      </div>
      <div class="modal-footer pset-modal-footer">
        <div id="selected-pset-name" class="pset-selected-name"></div>
        <div class="pset-modal-footer-buttons">
          <button id="pset-cancel-button" class="pset-cancel-btn">Cancel</button>
          <button id="pset-add-button" class="pset-add-btn" disabled>Add Properties</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  // Get elements
  const searchInput = document.getElementById("pset-search-input");
  const psetList = document.getElementById("pset-list");
  const attributesForm = document.getElementById("attributes-form");
  const selectedPsetName = document.getElementById("selected-pset-name");
  const addButton = document.getElementById("pset-add-button");
  const cancelButton = document.getElementById("pset-cancel-button");

  let currentPset = null;

  // Render Pset list
  function renderPsetList(filter = "") {
    const filterLower = filter.toLowerCase();
    const filtered = psetCategories.filter((pset) =>
      pset.toLowerCase().includes(filterLower)
    );

    if (filtered.length === 0) {
      psetList.innerHTML = `
        <div class="pset-no-results">
          No Psets found matching "${filter}"
        </div>
      `;
      return;
    }

    psetList.innerHTML = filtered
      .map(
        (pset) => `
      <div class="pset-item" data-pset="${pset}">
        <div class="pset-item-name">${pset}</div>
        <div class="pset-item-count">${Object.keys(definitions[pset]).length} attributes</div>
      </div>
    `
      )
      .join("");

    // Add click handlers
    psetList.querySelectorAll(".pset-item").forEach((item) => {
      item.addEventListener("click", () => {
        selectPset(item.dataset.pset);
      });
    });
  }

  // Select a Pset and show its attributes
  function selectPset(psetName) {
    currentPset = psetName;
    selectedPsetName.textContent = `Selected: ${psetName}`;

    // Update visual selection
    psetList.querySelectorAll(".pset-item").forEach((item) => {
      item.classList.toggle("selected", item.dataset.pset === psetName);
    });

    // Render attributes form
    const attributes = definitions[psetName];
    const attributeNames = Object.keys(attributes).sort();

    attributesForm.innerHTML = `
      <div class="pset-form-header">
        <h3>${psetName}</h3>
        <p>Fill in values for the attributes you want to add (leave blank to skip)</p>
      </div>
      ${attributeNames
        .map(
          (attr) => `
        <div class="attribute-input-group">
          <label>${attr}</label>
          <input
            type="text"
            data-attribute="${attr}"
            placeholder="Enter value (optional)..."
          />
        </div>
      `
        )
        .join("")}
    `;

    // Enable add button
    addButton.disabled = false;
  }

  // Handle search
  searchInput.addEventListener("input", () => {
    renderPsetList(searchInput.value);
  });

  // Handle Enter key on search
  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const firstPset = psetList.querySelector(".pset-item");
      if (firstPset) {
        selectPset(firstPset.dataset.pset);
      }
    }
  });

  // Handle add button
  addButton.addEventListener("click", () => {
    if (!currentPset) {
      alert("Please select a Property Set first.");
      return;
    }

    // Collect all filled-in attributes
    const inputs = attributesForm.querySelectorAll("input[data-attribute]");
    const propertiesToAdd = [];

    inputs.forEach((input) => {
      const value = input.value.trim();
      if (value) {
        propertiesToAdd.push({
          name: input.dataset.attribute,
          value: value,
        });
      }
    });

    if (propertiesToAdd.length === 0) {
      alert("Please enter at least one attribute value.");
      return;
    }

    console.log(
      "[PSET] Adding",
      propertiesToAdd.length,
      "properties from",
      currentPset
    );

    // Close modal
    document.body.removeChild(overlay);

    // Call callback ONCE with all properties AND the Pset name
    if (onAdd) {
      onAdd(propertiesToAdd, currentPset);
    }
  });

  // Handle cancel button
  cancelButton.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  // Close on overlay click
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });

  // Initial render
  renderPsetList();

  // Focus on search input
  setTimeout(() => searchInput.focus(), 100);
}
