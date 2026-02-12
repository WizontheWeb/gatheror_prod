// lib/wp.js

const fetch = require("node-fetch").default;
const FormData = require("form-data");
const logger = require("../config/logger");

// Import config FIRST – before anything else uses it
const config = require("../config/env");

// Now safely destructure
const { WP_URL, WP_USER, WP_APP_PASS, WP_POST_TYPE, WP_STATUS } = config;

// Helper for Basic Auth header
const getAuthHeader = () => {
  const credentials = `${WP_USER}:${WP_APP_PASS}`;
  const encoded = Buffer.from(credentials).toString("base64");

  // Optional debug – comment out in production
  console.log("DEBUG [wp.js] Auth header generated (length):", encoded.length);
  console.log("DEBUG [wp.js] Username used:", WP_USER);

  return `Basic ${encoded}`;
};

// Category cache – global, in-memory
let cachedCategories = null;
let lastCategoryFetchTime = 0;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Helper to get categories with cache
async function getCachedCategories(forceRefresh = false) {
  const now = Date.now();

  if (!forceRefresh && cachedCategories && now - lastCategoryFetchTime < CACHE_TTL_MS) {
    logger.debug("Returning cached categories");
    return cachedCategories;
  }

  logger.info("Fetching fresh categories from WordPress");
  try {
    const url = `${WP_URL}/wp-json/wp/v2/categories?per_page=100&orderby=id&order=asc`;
    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch categories: ${await res.text()}`);
    }

    const data = await res.json();
    cachedCategories = data.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));

    lastCategoryFetchTime = now;
    return cachedCategories;
  } catch (err) {
    logger.error("Category fetch error:", err);
    // Return cached if available, even if stale
    if (cachedCategories) return cachedCategories;
    throw err; // No cache → error
  }
}

async function uploadMedia(buffer, caption = "") {
  try {
    const form = new FormData();
    form.append("file", buffer, { filename: "featured.jpg" });

    console.log("DEBUG [wp.js] Uploading media to:", `${WP_URL}/wp-json/wp/v2/media`);

    const res = await fetch(`${WP_URL}/wp-json/wp/v2/media`, {
      method: "POST",
      headers: {
        Authorization: getAuthHeader(),
      },
      body: form,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Media upload failed: ${res.status} - ${errorText}`);
    }

    const json = await res.json();

    if (caption) {
      await fetch(`${WP_URL}/wp-json/wp/v2/media/${json.id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: getAuthHeader(),
        },
        body: JSON.stringify({ alt_text: caption, caption }),
      });
    }

    return json.id;
  } catch (err) {
    console.error("Media upload error:", err.message);
    throw err;
  }
}

async function createPost(title, content, mediaId, categoryId) {
  try {
    const url = `${WP_URL}/wp-json/wp/v2/posts`;

    // Build the payload correctly (one object)
    const payload = {
      title,
      content: content ? content.replace(/</g, "&lt;").replace(/>/g, "&gt;") : "",
      status: WP_STATUS || "draft",
      featured_media: mediaId || undefined,
      categories: categoryId ? [categoryId] : [1], // default to Uncategorized ID
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(payload), // ← stringify the full payload here
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Post creation failed: ${res.status} - ${errorText}`);
    }

    return await res.json();
  } catch (err) {
    logger.error("Post creation error:", err);
    throw err;
  }
}
async function getRecentPosts(limit = 10) {
  try {
    const url = `${config.WP_URL}/wp-json/wp/v2/posts?per_page=${limit}&order=desc&orderby=date&status=publish`;

    const res = await fetch(url, {
      headers: {
        Authorization: getAuthHeader(),
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch posts: ${await res.text()}`);
    }

    const posts = await res.json();

    return posts.map((post) => ({
      id: post.id,
      title: post.title.rendered || "(no title)",
      link: post.link,
      date: new Date(post.date).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      }),
    }));
  } catch (err) {
    logger.error("Error fetching recent posts:", err);
    throw err;
  }
}
// Fetch single post by ID (with current title, content, status)
async function getPostById(postId) {
  try {
    const url = `${WP_URL}/wp-json/wp/v2/posts/${postId}?_embed=wp:featuredmedia`;

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
    });

    if (!res.ok) throw new Error(`Failed to fetch post ${postId}: ${await res.text()}`);

    const post = await res.json();

    return {
      id: post.id,
      title: post.title.rendered || "",
      content: post.content.rendered || "",
      status: post.status,
      link: post.link,
    };
  } catch (err) {
    logger.error(`Error fetching post ${postId}:`, err);
    throw err;
  }
}

// Update existing post (title, content, status)
async function updatePost(postId, updates) {
  try {
    const url = `${WP_URL}/wp-json/wp/v2/posts/${postId}`;

    const body = {
      title: updates.title,
      content: updates.content ? updates.content.replace(/</g, "&lt;").replace(/>/g, "&gt;") : undefined,
      status: updates.status,
    };

    const res = await fetch(url, {
      method: "POST", // WordPress REST uses POST for updates too (not PUT)
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) throw new Error(`Failed to update post ${postId}: ${await res.text()}`);

    return await res.json();
  } catch (err) {
    logger.error(`Error updating post ${postId}:`, err);
    throw err;
  }
}

// Fetch all categories, sorted by creation date (oldest first)
async function getCategories() {
  try {
    const url = `${WP_URL}/wp-json/wp/v2/categories?per_page=100&orderby=id&order=asc`;

    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch categories: ${await res.text()}`);
    }

    const categories = await res.json();

    return categories.map((cat) => ({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
    }));
  } catch (err) {
    logger.error("Error fetching categories:", err);
    throw err;
  }
}

// Create new category
async function createCategory(name, slug = "") {
  try {
    const autoSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

    const res = await fetch(`${WP_URL}/wp-json/wp/v2/categories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: getAuthHeader(),
      },
      body: JSON.stringify({
        name,
        slug: autoSlug,
      }),
    });

    if (!res.ok) {
      throw new Error(`Failed to create category: ${await res.text()}`);
    }

    const cat = await res.json();
    return cat.id;
  } catch (err) {
    logger.error("Error creating category:", err);
    throw err;
  }
}

module.exports = {
  uploadMedia,
  createPost: (title, content, mediaId, categoryId) => createPost(title, content, mediaId, categoryId),
  getRecentPosts,
  getPostById,
  updatePost,
  getCachedCategories, // new
  createCategory,
  getAuthHeader, // new
};
