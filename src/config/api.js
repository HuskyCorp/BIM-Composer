/**
 * API Configuration
 * Detects environment and uses appropriate backend URL
 */

const isGitHubPages = window.location.hostname === "huskycorp.github.io";

export const API_BASE_URL = isGitHubPages
  ? import.meta.env.VITE_API_URL || ""
  : ""; // Use Vite proxy in development

export const API_ENDPOINTS = {
  convert: `${API_BASE_URL}/api/convert`,
  health: `${API_BASE_URL}/api/health`,
};
