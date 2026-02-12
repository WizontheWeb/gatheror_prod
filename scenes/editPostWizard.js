const { WizardScene } = require("telegraf/scenes");
const { getPostById, updatePost } = require("../lib/wp");
const logger = require("../config/logger");
const config = require("../config/env");

const editPostWizard = new WizardScene(
  "edit-post",

  // Step 1: Load post & show current values, ask for new title
  // Step 1: Load post & show current values, ask for new title
  async (ctx) => {
    const postId = ctx.scene.state.postId; // ← read from scene state

    if (!postId) {
      await ctx.reply("No post ID provided. Try /viewposts again.");
      return ctx.scene.leave();
    }

    try {
      const post = await getPostById(postId);
      ctx.wizard.state.original = post;
      ctx.wizard.state.postId = postId; // store for later steps

      await ctx.reply(
        `Editing post #${postId}: ${post.title || "(no title)"}\n\n` +
          `Current title: ${post.title || "(empty)"}\n` +
          `Current status: ${post.status}\n\n` +
          `Send new title (or /skip to keep current):`
      );
      return ctx.wizard.next();
    } catch (err) {
      await ctx.reply("Error loading post. Try again.");
      return ctx.scene.leave();
    }
  },

  // Step 2: New title → ask for new content
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (text && text !== "/skip") {
      ctx.wizard.state.title = text;
    } else {
      ctx.wizard.state.title = ctx.wizard.state.original.title;
    }

    await ctx.reply(`New content (Markdown supported, or /skip to keep current):\n\n` + `Current content preview: ${ctx.wizard.state.original.content.substring(0, 200)}...`);
    return ctx.wizard.next();
  },

  // Step 3: New content → ask for new status
  async (ctx) => {
    const text = ctx.message?.text?.trim();
    if (text && text !== "/skip") {
      // Convert Markdown to HTML (same as create)
      let html = require("marked").parse(text, { breaks: true, gfm: true });
      html = require("sanitize-html")(html, {
        allowedTags: ["p", "br", "strong", "em", "b", "i", "a", "ul", "ol", "li", "code", "pre", "blockquote", "h1", "h2", "h3"],
        allowedAttributes: { a: ["href"], "*": ["class"] },
        allowedSchemes: ["http", "https", "mailto"],
      });
      ctx.wizard.state.content = html;
    } else {
      ctx.wizard.state.content = ctx.wizard.state.original.content;
    }

    await ctx.reply("Choose new status:\n\n" + "1. publish\n" + "2. draft\n" + "3. pending\n" + "4. private\n" + "5. trash (deletes)\n\n" + "Reply with number or word (or /skip to keep current):");
    return ctx.wizard.next();
  },

  // Step 4: New status → confirm & save
  async (ctx) => {
    const text = ctx.message?.text?.trim()?.toLowerCase();
    let newStatus = ctx.wizard.state.original.status;

    if (text !== "/skip") {
      const statusMap = {
        "1": "publish",
        "publish": "publish",
        "2": "draft",
        "draft": "draft",
        "3": "pending",
        "pending": "pending",
        "4": "private",
        "private": "private",
        "5": "trash",
        "trash": "trash",
      };
      if (statusMap[text]) newStatus = statusMap[text];
    }

    ctx.wizard.state.status = newStatus;

    const state = ctx.wizard.state;
    let msg =
      `Confirm update for post #${state.original.id}:\n\n` +
      `Title: ${state.title}\n` +
      `Status: ${state.status}\n` +
      `Content changed: ${state.content !== state.original.content ? "Yes" : "No"}\n\n` +
      `/confirm   /cancel`;

    await ctx.reply(msg);
    return ctx.wizard.next();
  },

  // Step 5: Confirm & update
  async (ctx) => {
    if (ctx.message?.text !== "/confirm") {
      await ctx.reply("Update cancelled.");
      return ctx.scene.leave();
    }

    try {
      await updatePost(ctx.wizard.state.original.id, {
        title: ctx.wizard.state.title,
        content: ctx.wizard.state.content,
        status: ctx.wizard.state.status,
      });

      await ctx.reply(`Post #${ctx.wizard.state.original.id} updated successfully!`);
      logger.info(`Post ${ctx.wizard.state.original.id} updated by user ${ctx.from.id}`);
    } catch (err) {
      logger.error("Update failed:", err);
      await ctx.reply("Error updating post. Check logs.");
    }

    return ctx.scene.leave();
  }
);

module.exports = editPostWizard;
