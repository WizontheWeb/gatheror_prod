// lib/callbackHandlers.js
const logger = require("../config/logger");
const { setUserLevel, getAllUsers } = require("./users");
const config = require("../config/env");
const { uploadMedia, createPost, getRecentPosts, getPostById, updatePost, getCachedCategories } = require("../lib/wp");
const { addPasscode, updateUserMenu } = require("../lib/users");

module.exports = async (ctx) => {
  const data = ctx.callbackQuery.data;

  try {
    // Promotion (makeadmin)
    if (data.startsWith("promote_")) {
      const targetId = parseInt(data.split("_")[1], 10);
      if (ctx.userLevel !== 0) return ctx.answerCbQuery("Only superuser.");

      const user = getAllUsers().find((u) => u.id === targetId);
      if (!user || user.level !== 2) return ctx.answerCbQuery("Invalid user.");

      ctx.editMessageText(`Promote ${user.name} (ID ${targetId}) to admin?\n\nThis gives them ability to add new users.`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Yes – Promote", callback_data: `confirm_promote_${targetId}` },
              { text: "No – Cancel", callback_data: `cancel_promote_${targetId}` },
            ],
          ],
        },
      });
      ctx.answerCbQuery();
      return;
    }

    if (data.startsWith("confirm_promote_")) {
      const targetId = parseInt(data.split("_")[2], 10);
      if (ctx.userLevel !== 0) return ctx.answerCbQuery("Only superuser.");

      await setUserLevel(targetId, 1);
      const user = getAllUsers().find((u) => u.id === targetId);

      ctx.editMessageText(`User ${user.name} (ID ${targetId}) promoted to admin!`);

      await ctx.telegram.sendMessage(targetId, "You have been promoted to admin!");
      await ctx.telegram.sendMessage(config.SUPERUSER_ID, `Promoted ${user.name} (ID ${targetId}) to admin.`);

      ctx.answerCbQuery("Promoted!");
      return;
    }

    if (data.startsWith("cancel_promote_")) {
      ctx.editMessageText("Promotion cancelled.");
      ctx.answerCbQuery("Cancelled");
      return;
    }

    // Demotion (removeadmin)
    if (data.startsWith("demote_")) {
      const targetId = parseInt(data.split("_")[1], 10);
      if (ctx.userLevel !== 0) return ctx.answerCbQuery("Only superuser.");

      const user = getAllUsers().find((u) => u.id === targetId);
      if (!user || user.level !== 1) return ctx.answerCbQuery("Invalid admin.");

      ctx.editMessageText(`Demote ${user.name} (ID ${targetId}) to ordinary?\n\nThey will lose ability to add users.`, {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "Yes – Demote", callback_data: `confirm_demote_${targetId}` },
              { text: "No – Cancel", callback_data: `cancel_demote_${targetId}` },
            ],
          ],
        },
      });
      ctx.answerCbQuery();
      return;
    }

    if (data.startsWith("confirm_demote_")) {
      const targetId = parseInt(data.split("_")[2], 10);
      if (ctx.userLevel !== 0) return ctx.answerCbQuery("Only superuser.");

      await setUserLevel(targetId, 2);
      const user = getAllUsers().find((u) => u.id === targetId);

      ctx.editMessageText(`User ${user.name} (ID ${targetId}) demoted to ordinary.`);

      await ctx.telegram.sendMessage(targetId, "Your admin privileges have been removed.");
      await ctx.telegram.sendMessage(config.SUPERUSER_ID, `Demoted ${user.name} (ID ${targetId}) to ordinary.`);

      ctx.answerCbQuery("Demoted!");
      return;
    }

    if (data.startsWith("cancel_demote_")) {
      ctx.editMessageText("Demotion cancelled.");
      ctx.answerCbQuery("Cancelled");
      return;
    }

    if (data.startsWith("cfg_")) {
      const action = data.split("_")[1];

      if (action === "newcode") {
        // Reuse your existing newusercode logic
        const code = await addPasscode();
        ctx.editMessageText(`New invite code: **${code}**\n\nSingle-use. Forward to the new user.`);
        ctx.answerCbQuery("Code generated!");
        return true;
      }

      if (action === "makeadmin") {
        // Trigger your makeadmin flow (or inline list here)
        ctx.editMessageText("Make Admin selected – list coming...");
        // You can call the makeadmin logic or show list inline
        ctx.answerCbQuery();
        return;
      }

      if (action === "listusers") {
        if (ctx.userLevel > 1) return ctx.answerCbQuery("Not authorized.");

        const currentUsers = getAllUsers();

        if (currentUsers.length === 0) {
          ctx.editMessageText("No additional users added yet.");
          ctx.answerCbQuery();
          return;
        }

        let msg = "Authorized users:\n\n";

        currentUsers.forEach((u) => {
          msg += `- ID: ${u.id} | Name: ${u.name} | Level: ${u.level}\n`;
        });

        ctx.editMessageText(msg);
        ctx.answerCbQuery("Users listed");
        return;
      }

      if (action === "removeadmin") {
        ctx.editMessageText("Remove Admin selected – list coming...");
        ctx.answerCbQuery();
        return;
      }

      if (action === "removeuser") {
        ctx.editMessageText("Remove User selected – list coming...");
        ctx.answerCbQuery();
        return;
      }

      if (action === "refreshcats") {
        const fresh = await getCachedCategories(true);
        ctx.editMessageText(`Categories refreshed! Now ${fresh.length} available.`);
        ctx.answerCbQuery("Refreshed!");
        return true;
      }

      if (action === "refreshmenu") {
        await updateUserMenu(ctx);
        ctx.editMessageText("Your command menu has been refreshed!");
        ctx.answerCbQuery("Menu refreshed!");
        return;
      }
      if (action === "manageusers") {
        const users = getAllUsers();
        if (users.length === 0) {
          ctx.editMessageText("No users to manage yet.");
          ctx.answerCbQuery();
          return;
        }

        // Show first page
        const { msg, keyboard } = getUserListKeyboard(users, 0);
        ctx.editMessageText(msg, { reply_markup: keyboard });
        ctx.answerCbQuery();
        return;
      }
      if (action === "cancel") {
        ctx.editMessageText("Config cancelled.");
        ctx.answerCbQuery("Cancelled");
        return;
      }
    }

    if (data.startsWith("status_")) {
      const parts = data.split("_");
      const postId = parseInt(parts[1], 10);
      const newStatus = parts[2];

      if (!["publish", "draft", "pending", "trash"].includes(newStatus)) {
        await ctx.answerCbQuery("Invalid status.");
        return;
      }

      if (ctx.userLevel > 1) {
        await ctx.answerCbQuery("Only admins/superuser can change status.");
        return;
      }

      try {
        const url = `${config.WP_URL}/wp-json/wp/v2/posts/${postId}`;
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: getAuthHeader(),
          },
          body: JSON.stringify({ status: newStatus }),
        });

        if (!res.ok) {
          const errText = await res.text();
          throw new Error(`Status update failed: ${errText}`);
        }

        await ctx.answerCbQuery(`Post status changed to ${newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}!`);
        await ctx.editMessageText(ctx.callbackQuery.message.text + `\n\nStatus updated to **${newStatus}**.`);

        // Optional: refresh list after change
        // ctx.scene.reenter() or re-call viewposts logic here if you want auto-refresh
      } catch (err) {
        logger.error("Status change error:", err);
        await ctx.answerCbQuery("Failed to update status.");
      }

      return;
    }
    // Fallback for unknown callbacks
    return false;
    await ctx.answerCbQuery("Unknown action.");
  } catch (err) {
    logger.error("Callback error:", err);
    await ctx.answerCbQuery("Error processing action.");
  }
};
