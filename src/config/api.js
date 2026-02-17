const isGitHubPages = window.location.hostname === "huskycorp.github.io";

export const API_BASE_URL = isGitHubPages
  ? import.meta.env.VITE_API_URL ||
    "https://bim-composer-production.up.railway.app"
  : "";

export const API_ENDPOINTS = {
  convert: `${API_BASE_URL}/api/convert`,
  health: `${API_BASE_URL}/api/health`,
};
