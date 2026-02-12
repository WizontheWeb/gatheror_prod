const { WizardScene } = require("telegraf/scenes");
const logger = require("../config/logger");
const config = require("../config/env");
const { downloadAndCompress } = require("../lib/image");
const { uploadMedia, createPost, getCachedCategories } = require("../lib/wp");
const marked = require("marked");
const sanitizeHtml = require("sanitize-html");

// Helper function for preview message
async function generatePreviewMessage(ctx) {
  const state = ctx.wizard.state;
  let msg = `Ready to post?\n\n**Title:** ${state.title}\n\n**Content preview:**\n${state.content.substring(0, 200) || "(empty)"}...\n\n`;

  let categoryName = "Uncategorized";
  if (state.categoryId && state.categoryId !== 1) {
    try {
      const categories = await getCachedCategories();
      const selected = categories.find((c) => c.id === state.categoryId);
      categoryName = selected ? selected.name : `ID ${state.categoryId}`;
    } catch (err) {
      logger.error("Failed to fetch category name for preview:", err);
      categoryName = `ID ${state.categoryId}`;
    }
  }
  msg += `**Category:** ${categoryName}\n\n`;

  if (state.photoFileId) {
    msg += `**Featured image:** Yes (caption: ${state.caption || "none"})\n\n`;
  } else {
    msg += "**Featured image:** No\n\n";
  }

  msg += "/confirm   /cancel";

  return msg;
}

const newPostWizard = new WizardScene(
  "new-post",

  // Step 1: Title
  async (ctx) => {
    await ctx.reply("What should be the **post title**? (plain text)");
    return ctx.wizard.next();
  },

  // Step 2: Content
  async (ctx) => {
    const title = ctx.message?.text?.trim();
    if (!title) {
      await ctx.reply("Please send a title (text required).");
      return;
    }
    ctx.wizard.state.title = title;

    await ctx.reply(
      "Now send the **post content** (main body text).\n\n" +
        "You can use basic Markdown:\n" +
        "• *italic* or _italic_\n" +
        "• **bold** or __bold__\n" +
        "• [link text](https://example.com)\n" +
        "• - unordered list\n" +
        "• 1. ordered list\n" +
        "• `inline code`\n" +
        "• ```code block```\n\n" +
        "Send your content (multiple lines OK)."
    );
    return ctx.wizard.next();
  },

  // Step 3: Category selection (mandatory – buttons only)
  // Step 3: Category selection (mandatory – buttons only)
  async (ctx) => {
    // If category already selected (from callback), skip directly to photo
    if (ctx.wizard.state.categoryId) {
      return ctx.wizard.next();
    }

    // Content already validated in Step 2 – no need to check again
    const rawContent = ctx.message.text; // keep raw for display if needed
    let htmlContent = marked.parse(rawContent, { breaks: true, gfm: true });
    htmlContent = sanitizeHtml(htmlContent, {
      allowedTags: ["p", "br", "strong", "em", "b", "i", "a", "ul", "ol", "li", "code", "pre", "blockquote", "h1", "h2", "h3"],
      allowedAttributes: { a: ["href"], "*": ["class"] },
      allowedSchemes: ["http", "https", "mailto"],
    });

    ctx.wizard.state.content = htmlContent;

    // Fetch categories
    let categories = [];
    try {
      categories = await getCachedCategories();
    } catch (err) {
      logger.error("Failed to load categories:", err);
      ctx.wizard.state.categoryId = 1;
      await ctx.reply("Error loading categories. Using default (Uncategorized).");
      return ctx.wizard.next();
    }

    if (categories.length === 0) {
      ctx.wizard.state.categoryId = 1;
      await ctx.reply("No categories found – auto-assigned to Uncategorized.");
      return ctx.wizard.next();
    }

    const keyboard = {
      inline_keyboard: categories.map((cat) => [
        {
          text: cat.name,
          callback_data: `cat_select_${cat.id}`,
        },
      ]),
    };

    await ctx.reply("Select a category for this post (required):\nTap one of the buttons below.", { reply_markup: keyboard });
    return ctx.wizard.next();
    // No next() – wait for callback
  },

  // Step 4: Handle category selection (only via buttons)
  async (ctx) => {
    // Callback handling
    if (ctx.callbackQuery) {
      const data = ctx.callbackQuery.data;

      if (data.startsWith("cat_select_")) {
        const catId = parseInt(data.split("_")[2], 10);
        if (!isNaN(catId)) {
          // Set state
          ctx.wizard.state.categoryId = catId;

          // Acknowledge
          await ctx.answerCbQuery("Category selected!");

          // Remove buttons from original message
          await ctx.editMessageReplyMarkup({ inline_keyboard: [] });

          // Tell user and advance to photo step
          await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\nCategory selected. Moving to photo...");

          // Directly trigger the photo prompt (bypass re-entry loop)
          await ctx.reply("Step 4 Send a photo to use as the featured image (optional).\nOr send /skip if you don't want one.");

          // Manually advance wizard cursor
          ctx.wizard.cursor += 1;
          return ctx.wizard.next();
        }
        return;
      }
    }

    // If text input or other update (e.g. /skip attempt)
    await ctx.reply("Please select a category using the buttons above.\n" + "Category is required – tap one to continue.");
    // Do NOT advance – stay in step
  },

  // Step 5: Photo (optional)
  async (ctx) => {
    if (ctx.message?.text === "/skip") {
      ctx.wizard.state.photoFileId = null;
      ctx.wizard.state.caption = "";
      const previewMsg = await generatePreviewMessage(ctx);
      await ctx.replyWithMarkdown(previewMsg);

      ctx.wizard.cursor += 3;
      return ctx.wizard.next();
    }
    await ctx.reply("Step 5 Send a photo to use as the featured image (optional).\n" + "Or send /skip if you don't want one.");
    return ctx.wizard.next();
  },

  // Step 6: Photo or /skip
  async (ctx) => {
    if (ctx.message?.text === "/skip") {
      ctx.wizard.state.photoFileId = null;
      ctx.wizard.state.caption = "";
      ctx.wizard.cursor += 1;
      return ctx.wizard.next();
    }

    if (!ctx.message?.photo) {
      await ctx.reply("Step 6 Please send a photo or type /skip.");
      return;
    }

    const photo = ctx.message.photo.pop();
    if (photo.file_size / 1024 / 1024 > config.MAX_IMG_MB + 1) {
      await ctx.reply(`Image too large (> ${config.MAX_IMG_MB} MB). Send smaller or /skip.`);
      return;
    }

    ctx.wizard.state.photoFileId = photo.file_id;

    await ctx.reply("Optional caption for the featured image (or /skip):");
    return ctx.wizard.next();
  },

  // Step 7: Caption
  async (ctx) => {
    if (ctx.message?.text === "/skip") {
      ctx.wizard.state.caption = "";
    } else if (ctx.message?.text) {
      ctx.wizard.state.caption = ctx.message.text.trim();
    }

    return ctx.wizard.next();
  },

  // Step 8: Confirmation
  async (ctx) => {
    const previewMsg = await generatePreviewMessage(ctx);
    await ctx.replyWithMarkdown(previewMsg);
    return ctx.wizard.next();
  },

  // Step 9: Confirm and post
  async (ctx) => {
    if (ctx.message?.text !== "/confirm") {
      await ctx.reply("Cancelled or invalid. Use /newpost to start again.");
      return ctx.scene.leave();
    }

    await ctx.reply("Posting to WordPress...");

    try {
      let mediaId = null;
      const state = ctx.wizard.state;

      if (state.photoFileId) {
        const buffer = await downloadAndCompress(config.TOKEN, state.photoFileId, config.MAX_IMG_MB);
        mediaId = await uploadMedia(buffer, state.caption);
      }

      const post = await createPost(state.title, state.content, mediaId, state.categoryId || 1);

      const permalink = post.link;
      const editLink = `${config.WP_URL}/wp-admin/post.php?post=${post.id}&action=edit`;

      await ctx.reply(`Posted successfully!\n\n${permalink}\n\nEdit: ${editLink}`);
      logger.info(`Posted: ${permalink} by user ${ctx.from.id}`);
    } catch (err) {
      logger.error("Posting error", err);
      await ctx.reply("Error posting. Check logs.");
    }

    return ctx.scene.leave();
  }
);

module.exports = newPostWizard;
