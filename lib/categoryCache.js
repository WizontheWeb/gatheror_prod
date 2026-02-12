// lib/categoryCache.js
let cachedCategories = null;
let lastFetchTime = 0;
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour – adjust as needed

const { getCachedCategories: fetchCategories } = require("./wp"); // your WP helper

// Fetch or return cached categories
async function getCategories() {
  const now = Date.now();

  // Refresh if cache is missing or stale
  if (!cachedCategories || now - lastFetchTime > CACHE_DURATION_MS) {
    console.log("Fetching fresh categories on startup / refresh...");
    try {
      cachedCategories = await fetchCategories(true); // force refresh
      lastFetchTime = now;
      console.log(`Categories cached: ${cachedCategories.length} items`);
    } catch (err) {
      console.error("Failed to cache categories on startup:", err);
      // Fallback: keep old cache if exists, or empty array
      cachedCategories = cachedCategories || [];
    }
  }

  return cachedCategories;
}

// Optional: manual refresh (can call from /config if needed)
async function refreshCategories() {
  cachedCategories = null; // force next getCategories() to refetch
  return getCategories();
}

module.exports = {
  getCategories,
  refreshCategories,
};
