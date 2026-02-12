// bot.js – FULL FILE (replace your current one)

const config = require("./config/env");
const logger = require("./config/logger");
const { Telegraf, session } = require("telegraf");
const { Stage } = require("telegraf/scenes");
const newPostWizard = require("./scenes/newPostWizard");
const editPostWizard = require("./scenes/editPostWizard");
const handleUserManagement = require("./lib/userManagement");
const callbackHandlers = require("./lib/callbackHandlers");

const bot = new Telegraf(config.TOKEN);

// Import user management
const { getUserLevel, isAdminOrSuper, addUser, addPasscode, tryAddUser, setUserLevel, getAllUsers, removeUser } = require("./lib/users");

// Import WP helpers
const { uploadMedia, createPost, getRecentPosts, getPostById, updatePost, getCachedCategories, createCategory, getAuthHeader } = require("./lib/wp");

// Simple in-memory rate limiter (per user, per command)
const rateLimits = new Map(); // key: userId_command, value: { count, resetTime }

function checkRateLimit(ctx, command, maxAttempts = 5, windowSeconds = 60) {
  const userId = ctx.from?.id;
  if (!userId) return false;

  const key = `${userId}_${command}`;
  const now = Date.now();
  const resetTime = now + windowSeconds * 1000;

  let entry = rateLimits.get(key);

  if (!entry || now > entry.resetTime) {
    // Reset or first attempt
    entry = { count: 1, resetTime };
    rateLimits.set(key, entry);
    return true; // allowed
  }

  if (entry.count >= maxAttempts) {
    const remaining = Math.ceil((entry.resetTime - now) / 1000);
    ctx.reply(`You're doing that too fast. Wait ${remaining} seconds and try again.`);
    return false; // blocked
  }

  entry.count += 1;
  rateLimits.set(key, entry);
  return true; // allowed
}

// Optional: clean up old entries every 10 min (prevents memory leak)
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimits.entries()) {
    if (now > entry.resetTime) rateLimits.delete(key);
  }
}, 10 * 60 * 1000);
// Helper to update per-user command menu based on level
// Helper to update per-user command menu (called in middleware + /start)
async function updateUserCommands(ctx) {
  const level = ctx.userLevel;

  let commands = [
    { command: "newpost", description: "Create a new post" },
    { command: "viewposts", description: "View recent posts" },
    { command: "start", description: "Help & welcome" },
  ];

  if (level <= 1) {
    commands.push({ command: "config", description: "Admin tools & settings" });
  }

  try {
    await ctx.telegram.setMyCommands(commands, {
      scope: { type: "chat", chat_id: ctx.chat.id },
    });
    logger.debug(`Menu updated for user ${ctx.from.id} (level ${level})`);
  } catch (err) {
    logger.error("Failed to set menu:", err);
  }
}

// In authorization middleware – update menu for every authorized message
bot.use((ctx, next) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const level = getUserLevel(fromId);

  if (level === -1) {
    logger.warn(`Unauthorized: ${fromId} (@${ctx.from.username || "unknown"})`);
    return;
  }

  ctx.userLevel = level;
  ctx.userName = [ctx.from.first_name, ctx.from.last_name].filter(Boolean).join(" ") || ctx.from.username || "Unknown";

  updateUserCommands(ctx); // Refresh menu on every interaction

  return next();
});

// ... session & stage middleware ...

// Single callback handler – add these cases to your existing bot.on('callback_query')

// 2. Session & scenes
const stage = new Stage([newPostWizard, editPostWizard]);
bot.use(session());
bot.use(stage.middleware());

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    // 1. Let the separate module handle all user/config-related callbacks first
    const handled = await handleUserManagement(ctx);

    // If the separate handler processed it, stop here
    if (handled) return;
    const handled2 = await callbackHandlers(ctx);
    if (handled2) return;
    // 2. Handle non-config callbacks (edit post, category selection, etc.)
    if (data.startsWith("edit_")) {
      const postId = parseInt(data.split("_")[1], 10);
      if (!isNaN(postId)) {
        ctx.scene.enter("edit-post", { postId });
        await ctx.answerCbQuery("Loading post for edit...");
      }
      return;
    }

    if (data.startsWith("cat_select_")) {
      const catId = parseInt(data.split("_")[2], 10);
      if (!isNaN(catId)) {
        ctx.wizard.state.categoryId = catId;
        await ctx.answerCbQuery("Category selected!");
        await ctx.editMessageText(ctx.callbackQuery.message.text + "\n\nCategory selected. Moving to photo...");
        await ctx.wizard.next();
      }
      return;
    }

    // Add other non-config callbacks here (promote_, demote_, etc. if not moved)

    // Fallback for unknown callbacks
    await ctx.answerCbQuery("Unknown action");
  } catch (err) {
    logger.error("Callback query error:", err);
    await ctx.answerCbQuery("Error processing action");
  }
});
// 3. Commands – AFTER middleware
// /config – the new central admin dashboard
bot.command("config", async (ctx) => {
  if (!checkRateLimit(ctx, "config")) return;
  const level = ctx.userLevel;

  if (level > 1) {
    return ctx.reply("You don't have access to config tools.");
  }

  let msg = "🛠 Config & Admin Tools\n\nChoose an action:";
  const keyboard = { inline_keyboard: [] };

  // Common for admins & superuser
  keyboard.inline_keyboard.push([{ text: "Generate Invite Code", callback_data: "cfg_newcode" }]);

  // Superuser-only tools
  if (level === 0) {
    const keyboard = {
      inline_keyboard: [
        [{ text: "Generate Invite Code", callback_data: "cfg_newcode" }],
        [{ text: "Manage Users", callback_data: "cfg_manageusers" }],
        [{ text: "Refresh Categories", callback_data: "cfg_refreshcats" }],
        [{ text: "Cancel", callback_data: "cfg_cancel" }],
      ],
    };

    await ctx.reply(msg, { reply_markup: keyboard });
  }
});

bot.command("start", async (ctx) => {
  ctx.reply(
    "👋 Welcome!\n\n" +
      "This is your private bot for posting to the website.\n" +
      "Use /newpost to create a post, /viewposts to see recent ones.\n" +
      "Type /cancel anytime to stop.\n\n" +
      "Your menu shows available commands based on your role."
  );
});

bot.command("cancel", async (ctx) => {
  if (ctx.scene?.current) {
    await ctx.scene.leave();
    await ctx.reply("Action cancelled.");
  } else {
    await ctx.reply("Nothing to cancel.");
  }
});

bot.command("newpost", (ctx) => ctx.scene.enter("new-post"));

bot.command("viewposts", async (ctx) => {
  if (!checkRateLimit(ctx, "viewposts")) return;
  try {
    // Parse optional number (default 5, max 20)
    let numPosts = 5;
    const args = ctx.message.text.split(/\s+/).slice(1);
    if (args.length > 0) {
      const parsed = parseInt(args[0], 10);
      if (!isNaN(parsed) && parsed > 0) {
        numPosts = Math.min(parsed, 20);
      }
    }

    await ctx.reply(`Fetching last ${numPosts} published posts...`);

    const url = `${config.WP_URL}/wp-json/wp/v2/posts?` + `per_page=${numPosts}&` + `order=desc&` + `orderby=date&` + `status=publish,draft,pending&` + `_fields=id,title.rendered,link,date,status`;
    const res = await fetch(url, {
      headers: { Authorization: getAuthHeader() },
    });

    if (!res.ok) throw new Error(await res.text());

    const posts = await res.json();

    if (posts.length === 0) {
      return ctx.reply("No posts found (published, draft or pending).");
    }

    let message = `📋 **Last ${posts.length} posts** (any status)\n\n` + "Tap title to edit full, tap status button to quick-change\n\n";

    const keyboard = { inline_keyboard: [] };

    posts.forEach((post) => {
      const title = (post.title.rendered || "(no title)").substring(0, 50) + (post.title.rendered.length > 50 ? "..." : "");
      const status = post.status.charAt(0).toUpperCase() + post.status.slice(1);

      message += `• [${title}](${post.link}) – ${status} \n`;

      // Status change buttons

      keyboard.inline_keyboard.push([
        { text: "Edit :" + title, callback_data: `edit_${post.id}` }, // full edit
      ]);

      keyboard.inline_keyboard.push([]); // spacer
    });

    await ctx.reply(message, {
      parse_mode: "Markdown",
      disable_web_page_preview: true,
      reply_markup: keyboard,
    });
  } catch (err) {
    logger.error("View posts error:", err);
    await ctx.reply("Error fetching posts. Please try again later.");
  }
});

// /newusercode (admin/superuser)
bot.command("newusercode", async (ctx) => {
  if (ctx.userLevel > 1) {
    return ctx.reply("Only admins or superuser can generate invite codes.");
  }

  try {
    const code = await addPasscode();
    const msg = `New invite code created: **${code}**\n\nForward this to the person you want to add. It is single-use.`;

    await ctx.replyWithMarkdown(msg);
    logger.info(`New passcode generated by ${ctx.from.id}: ${code}`);
  } catch (err) {
    await ctx.reply("Error generating code.");
  }
});

// /addmetobot (self-add)
bot.command("addmetobot", async (ctx) => {
  const args = ctx.message.text.split(" ").slice(1);
  if (args.length !== 1) {
    return ctx.reply("Usage: /addmetobot <passcode>");
  }

  const passcode = args[0].trim().toUpperCase();

  const { success, msg, name } = await tryAddUser(ctx.from.id, ctx.from.username, ctx.from.first_name, ctx.from.last_name, passcode);

  if (success) {
    await ctx.reply(`Success! You have been added as an ordinary user. Welcome, ${name}!`);

    const admins = getAllUsers()
      .filter((u) => u.level <= 1)
      .map((u) => u.id);
    const notification = `New user added via passcode:\nID: ${ctx.from.id}\nName: ${name}\nUsername: @${ctx.from.username || "none"}`;

    for (const adminId of admins) {
      try {
        await ctx.telegram.sendMessage(adminId, notification);
      } catch (err) {
        logger.error(`Failed to notify admin ${adminId}:`, err);
      }
    }

    if (!admins.includes(config.SUPERUSER_ID)) {
      await ctx.telegram.sendMessage(config.SUPERUSER_ID, notification);
    }
  } else {
    await ctx.reply(msg || "Failed to add user. Invalid passcode?");
  }
});

bot.command("listusers", async (ctx) => {
  if (ctx.userLevel > 1) return ctx.reply("Not authorized.");
  const currentUsers = getAllUsers();
  if (currentUsers.length === 0) {
    return ctx.reply("No additional users added yet.");
  }

  let msg = "Authorized users:\n\n";

  currentUsers.forEach((u) => {
    msg += `- ID: ${u.id} | Name: ${u.name} | Level: ${u.level}\n`;
  });

  await ctx.reply(msg);
});

// Single callback handler for all config actions

// Fallback for unknown text
bot.on("text", (ctx) => {
  if (ctx.message.text.startsWith("/")) {
    ctx.reply("Unknown command. Use the menu button (/) for available commands.");
  }
});

module.exports = bot;
