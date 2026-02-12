// lib/userManagement.js – Full implementation

const { getAllUsers, setUserLevel, removeUser } = require("./users");
const logger = require("../config/logger");
const config = require("../config/env");

const PAGE_SIZE = 10;

/**
 * Builds paginated user list message + keyboard
 * @param {Array} users - Full users array
 * @param {number} page - Current page (0-based)
 * @param {string} [searchTerm=''] - Search filter
 * @returns {{ msg: string, keyboard: object }}
 */
function getUserListKeyboard(users, page = 0, searchTerm = "") {
  let filtered = users;

  if (searchTerm) {
    const term = searchTerm.toLowerCase().trim();
    filtered = users.filter((u) => u.name.toLowerCase().includes(term) || (u.username && u.username.toLowerCase().includes(term)) || String(u.id).includes(term));
  }

  const total = filtered.length;
  const start = page * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, total);
  const pageUsers = filtered.slice(start, end);

  let msg = `Manage Users\n\n`;
  if (searchTerm) msg += `Search: "${searchTerm}"\n`;
  msg += `Showing ${start + 1}–${end} of ${total}\n\n`;

  if (pageUsers.length === 0) {
    msg += "No users match your search.\n";
  } else {
    pageUsers.forEach((user) => {
      const levelText = user.level === 0 ? "Superuser" : user.level === 1 ? "Admin" : "Ordinary";
      msg += `• ${user.name} (@${user.username || "no-username"}) – ${levelText} (ID ${user.id})\n`;
    });
  }

  const keyboard = { inline_keyboard: [] };

  // Pagination row
  const pagination = [];
  if (page > 0) pagination.push({ text: "← Prev", callback_data: `users_page_${page - 1}_search_${encodeURIComponent(searchTerm)}` });
  if (end < total) pagination.push({ text: "Next →", callback_data: `users_page_${page + 1}_search_${encodeURIComponent(searchTerm)}` });
  if (pagination.length) keyboard.inline_keyboard.push(pagination);

  // Action row
  keyboard.inline_keyboard.push([
    { text: "New Search", callback_data: "users_search" },
    { text: "Cancel", callback_data: "cfg_cancel" },
  ]);

  return { msg, keyboard };
}

/**
 * Main handler for Manage Users callbacks
 * @param {object} ctx - Telegraf ctx
 * @returns {boolean} true if handled
 */
module.exports = async (ctx) => {
  const data = ctx.callbackQuery?.data;
  if (!data) return false;

  if (!data.startsWith("cfg_manageusers") && !data.startsWith("users_") && !data.startsWith("manage_user_")) {
    return false;
  }

  try {
    // Open Manage Users (list view)
    if (data === "cfg_manageusers") {
      const users = getAllUsers();
      if (users.length === 0) {
        await ctx.editMessageText("No users to manage yet.");
        await ctx.answerCbQuery();
        return true;
      }

      const { msg, keyboard } = getUserListKeyboard(users, 0);
      await ctx.editMessageText(msg, { reply_markup: keyboard });
      await ctx.answerCbQuery();
      return true;
    }

    // Pagination
    if (data.startsWith("users_page_")) {
      const parts = data.split("_");
      const page = parseInt(parts[2], 10);
      const searchTerm = decodeURIComponent(parts.slice(4).join("_")) || "";

      let users = getAllUsers();
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        users = users.filter((u) => u.name.toLowerCase().includes(term) || (u.username && u.username.toLowerCase().includes(term)) || String(u.id).includes(term));
      }

      const { msg, keyboard } = getUserListKeyboard(users, page, searchTerm);
      await ctx.editMessageText(msg, { reply_markup: keyboard });
      await ctx.answerCbQuery();
      return true;
    }

    // Start new search
    if (data === "users_search") {
      await ctx.editMessageText("Enter search term (name, username or ID fragment):\n\n" + "Send /cancel to go back.");
      ctx.session = ctx.session || {};
      ctx.session.awaitingUserSearch = true;
      await ctx.answerCbQuery();
      return true;
    }

    // Manage a specific user
    if (data.startsWith("manage_user_")) {
      const targetId = parseInt(data.split("_")[2], 10);
      const user = getAllUsers().find((u) => u.id === targetId);

      if (!user) {
        await ctx.editMessageText("User not found.");
        await ctx.answerCbQuery();
        return true;
      }

      if (user.level === 0) {
        await ctx.editMessageText("Superuser cannot be managed.");
        await ctx.answerCbQuery();
        return true;
      }

      let msg = `Manage ${user.name} (ID ${user.id})\nLevel: ${user.level === 1 ? "Admin" : "Ordinary"}`;
      const keyboard = { inline_keyboard: [] };

      if (user.level === 2) {
        keyboard.inline_keyboard.push([{ text: "Promote to Admin", callback_data: `confirm_promote_${targetId}` }]);
      }
      if (user.level === 1) {
        keyboard.inline_keyboard.push([{ text: "Demote to Ordinary", callback_data: `confirm_demote_${targetId}` }]);
      }

      keyboard.inline_keyboard.push([{ text: "Remove User", callback_data: `confirm_remove_${targetId}` }]);
      keyboard.inline_keyboard.push([{ text: "Back to List", callback_data: "cfg_manageusers" }]);

      await ctx.editMessageText(msg, { reply_markup: keyboard });
      await ctx.answerCbQuery();
      return true;
    }

    // Confirmations
    if (data.startsWith("confirm_promote_")) {
      const targetId = parseInt(data.split("_")[2], 10);
      const user = getAllUsers().find((u) => u.id === targetId);

      if (!user || user.level !== 2) {
        await ctx.editMessageText("Cannot promote this user.");
        await ctx.answerCbQuery();
        return true;
      }

      await setUserLevel(targetId, 1);
      await ctx.editMessageText(`Promoted ${user.name} to admin!`);
      await ctx.telegram.sendMessage(targetId, "You are now an admin! You can generate invite codes.");
      await ctx.telegram.sendMessage(config.SUPERUSER_ID, `Promoted ${user.name} (ID ${targetId}) to admin.`);
      await ctx.answerCbQuery("Promoted!");
      return true;
    }

    if (data.startsWith("confirm_demote_")) {
      const targetId = parseInt(data.split("_")[2], 10);
      const user = getAllUsers().find((u) => u.id === targetId);

      if (!user || user.level !== 1) {
        await ctx.editMessageText("Cannot demote this user.");
        await ctx.answerCbQuery();
        return true;
      }

      await setUserLevel(targetId, 2);
      await ctx.editMessageText(`Demoted ${user.name} to ordinary user.`);
      await ctx.telegram.sendMessage(targetId, "You are now an ordinary user.");
      await ctx.telegram.sendMessage(config.SUPERUSER_ID, `Demoted ${user.name} (ID ${targetId}) to ordinary.`);
      await ctx.answerCbQuery("Demoted!");
      return true;
    }

    if (data.startsWith("confirm_remove_")) {
      const targetId = parseInt(data.split("_")[2], 10);
      const user = getAllUsers().find((u) => u.id === targetId);

      if (!user || user.level === 0) {
        await ctx.editMessageText("Cannot remove superuser.");
        await ctx.answerCbQuery();
        return true;
      }

      await removeUser(targetId);
      await ctx.editMessageText(`Removed ${user.name} from the bot.`);
      await ctx.telegram.sendMessage(targetId, "Your access to the bot has been revoked.");
      await ctx.telegram.sendMessage(config.SUPERUSER_ID, `Removed ${user.name} (ID ${targetId}).`);
      await ctx.answerCbQuery("Removed!");
      return true;
    }

    return false;
  } catch (err) {
    logger.error("User management error:", err);
    await ctx.editMessageText("Error processing request.");
    await ctx.answerCbQuery("Error");
    return true;
  }
};
