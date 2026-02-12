// lib/messages.js
const messages = {
  // Welcome / general
  WELCOME:
    "👋 Welcome!\n\n" +
    "This is your private bot for posting to the website.\n" +
    "Use /newpost to create a post, /viewposts to see recent ones.\n" +
    "Type /cancel anytime to stop.\n\n" +
    "Your menu shows available commands based on your role.",

  // Wizard prompts
  TITLE_PROMPT: "What should be the **post title**? (plain text)",
  CONTENT_PROMPT:
    "Now send the **post content** (main body text).\n\n" +
    "You can use basic Markdown:\n" +
    "• *italic* or _italic_\n" +
    "• **bold** or __bold__\n" +
    "• [link text](https://example.com)\n" +
    "• - unordered list\n" +
    "• 1. ordered list\n" +
    "Send your content (multiple lines OK).",
  CATEGORY_PROMPT: "Select a category for this post (required):\nTap one of the buttons below.",
  PHOTO_PROMPT: "Send a photo to use as the featured image (optional).\nOr send /skip if you don't want one.",
  CAPTION_PROMPT: "Optional caption for the featured image (or /skip):",
  VIDEO_LINK_PROMPT: "Optional: Paste a video link to embed (Telegram channel, YouTube unlisted, etc.):\nOr type /skip.",

  // Confirmation screen
  CONFIRMATION:
    "Ready to post?\n\n" +
    "**Title:** {{title}}\n\n" +
    "**Content preview:**\n{{content}}...\n\n" +
    "**Category:** {{categoryName}}\n\n" +
    "**Featured image:** {{hasPhoto}}\n\n" +
    "**Embedded video:** {{hasVideo}}\n\n" +
    "/confirm   /cancel",

  // Status / feedback
  TOO_FAST: "You're doing that too fast. Wait {{seconds}} seconds and try again.",
  INVALID_URL: "Please send a valid URL or type /skip.",
  POST_SUCCESS: "Posted successfully!\n\n{{permalink}}\n\nEdit: {{editLink}}",
  POST_ERROR: "Error posting. Check logs.",

  // Config menu
  CONFIG_HEADER: "🛠 Config & Admin Tools\n\nChoose an action:",

  // Add more as needed (e.g. errors, user management messages, etc.)
  USER_NOT_FOUND: "User not found.",
  PROMOTED_SUCCESS: "Promoted {{name}} to admin!",
  // ...
};

//module.exports = messages;
// lib/messages.js (add this)
module.exports = {
  messages,
  // ... other messages ...

  CONFIRMATION_TEMPLATE: `Ready to post?
  
  **Title:** {{title}}
  
  **Content preview:**
  {{contentPreview}}...
  
  **Category:** {{categoryName}}
  
  **Featured image:** {{hasPhoto}} {{#photoCaption}}(caption: {{photoCaption}}){{/photoCaption}}
  
  **Embedded video:** {{hasVideo}}
  
  /confirm   /cancel`,
};
