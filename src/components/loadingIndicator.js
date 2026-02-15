// src/components/loadingIndicator.js

/**
 * Loading Indicator Manager
 * Provides a centralized way to show/hide loading indicators with progress tracking
 */

class LoadingIndicator {
  constructor() {
    this.modal = null;
    this.titleElement = null;
    this.messageElement = null;
    this.progressBar = null;
    this.progressFill = null;
    this.progressPercentage = null;
    this.isVisible = false;
    this.currentProgress = 0;
  }

  /**
   * Initialize the loading indicator (called once on app start)
   */
  init() {
    this.modal = document.getElementById("loading-modal");
    this.titleElement = document.getElementById("loading-title");
    this.messageElement = document.getElementById("loading-message");
    this.progressBar = document.querySelector(".progress-bar");
    this.progressFill = document.getElementById("progress-bar-fill");
    this.progressPercentage = document.getElementById("progress-percentage");

    if (!this.modal) {
      console.error("[LoadingIndicator] Modal element not found");
    }
  }

  /**
   * Show the loading indicator
   * @param {Object} options - Configuration options
   * @param {string} options.title - Title text (e.g., "Loading File...")
   * @param {string} options.message - Message text (e.g., "Please wait...")
   * @param {boolean} options.indeterminate - Whether to show indeterminate progress (no percentage)
   */
  show(options = {}) {
    if (!this.modal) {
      console.error("[LoadingIndicator] Not initialized. Call init() first.");
      return;
    }

    const {
      title = "Loading...",
      message = "Please wait while we process your file",
      indeterminate = false,
    } = options;

    // Update text
    this.titleElement.textContent = title;
    this.messageElement.textContent = message;

    // Reset progress
    this.currentProgress = 0;
    this.updateProgress(0);

    // Set indeterminate mode if specified
    if (indeterminate) {
      this.progressBar.classList.add("indeterminate");
      this.progressPercentage.style.display = "none";
    } else {
      this.progressBar.classList.remove("indeterminate");
      this.progressPercentage.style.display = "block";
    }

    // Show modal
    this.modal.style.display = "flex";
    this.isVisible = true;

    console.log(`[LoadingIndicator] Shown: ${title}`);
  }

  /**
   * Update the loading message (without changing title or progress)
   * @param {string} message - New message text
   */
  updateMessage(message) {
    if (!this.isVisible) return;
    this.messageElement.textContent = message;
    console.log(`[LoadingIndicator] Message updated: ${message}`);
  }

  /**
   * Update the progress bar
   * @param {number} percentage - Progress percentage (0-100)
   * @param {string} message - Optional message to update
   */
  updateProgress(percentage, message = null) {
    if (!this.isVisible) return;

    this.currentProgress = Math.max(0, Math.min(100, percentage));

    // Remove indeterminate class if present
    this.progressBar.classList.remove("indeterminate");
    this.progressPercentage.style.display = "block";

    // Update UI
    this.progressFill.style.width = `${this.currentProgress}%`;
    this.progressPercentage.textContent = `${Math.round(this.currentProgress)}%`;

    if (message) {
      this.updateMessage(message);
    }

    console.log(`[LoadingIndicator] Progress: ${this.currentProgress}%`);
  }

  /**
   * Set indeterminate mode (animated progress without percentage)
   */
  setIndeterminate() {
    if (!this.isVisible) return;

    this.progressBar.classList.add("indeterminate");
    this.progressPercentage.style.display = "none";
    this.progressFill.style.width = "40%";
  }

  /**
   * Hide the loading indicator
   */
  hide() {
    if (!this.modal) return;

    this.modal.style.display = "none";
    this.isVisible = false;
    this.currentProgress = 0;

    // Reset UI
    this.progressFill.style.width = "0%";
    this.progressPercentage.textContent = "0%";
    this.progressBar.classList.remove("indeterminate");

    console.log("[LoadingIndicator] Hidden");
  }

  /**
   * Check if the loading indicator is currently visible
   * @returns {boolean}
   */
  get visible() {
    return this.isVisible;
  }
}

// Export singleton instance
export const loadingIndicator = new LoadingIndicator();

/**
 * Helper function to show loading for an async operation
 * @param {Function} asyncFn - Async function to execute
 * @param {Object} options - Loading indicator options
 * @returns {Promise} - Result of the async function
 */
export async function withLoading(asyncFn, options = {}) {
  try {
    loadingIndicator.show(options);
    const result = await asyncFn(loadingIndicator);
    return result;
  } finally {
    loadingIndicator.hide();
  }
}
