const fs = require("fs").promises;
const path = require("path");
const logger = require("../config/logger");
const config = require("../config/env");

const USERS_FILE = path.join(__dirname, "../users.json");
const PASSCODES_FILE = path.join(__dirname, "../passcodes.json");

// In-memory caches
let users = []; // { id: number, name: string, level: number }
let passcodes = []; // { code: string, created: timestamp }

// Superuser (always allowed, not stored)
const SUPERUSER_ID = Number(config.SUPERUSER_ID);

// Load users
async function loadUsers() {
  try {
    const data = await fs.readFile(USERS_FILE, "utf8");
    users = JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      users = [];
      await saveUsers();
    } else {
      logger.error("Failed to load users.json", err);
    }
  }
}

// Load passcodes
async function loadPasscodes() {
  try {
    const data = await fs.readFile(PASSCODES_FILE, "utf8");
    passcodes = JSON.parse(data);
  } catch (err) {
    if (err.code === "ENOENT") {
      passcodes = [];
      await savePasscodes();
    } else {
      logger.error("Failed to load passcodes.json", err);
    }
  }
}

// Save users
async function saveUsers() {
  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2));
}

// Save passcodes
async function savePasscodes() {
  await fs.writeFile(PASSCODES_FILE, JSON.stringify(passcodes, null, 2));
}

// Get user level (-1 = not authorized)
function getUserLevel(userId) {
  if (userId === SUPERUSER_ID) return 0;
  const user = users.find((u) => u.id === userId);
  return user ? user.level : -1;
}

// Is superuser or admin?
function isAdminOrSuper(userId) {
  return getUserLevel(userId) <= 1;
}

// Generate random 8-char passcode
function generatePasscode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Add new passcode (called by /newusercode)
async function addPasscode() {
  const code = generatePasscode();
  passcodes.push({ code, created: Date.now() });
  await savePasscodes();
  return code;
}

// Try to add user via passcode
async function tryAddUser(userId, username, firstName, lastName, passcode) {
  const entry = passcodes.find((p) => p.code === passcode);
  if (!entry) {
    return { success: false, msg: "Invalid or expired passcode." };
  }

  // Remove used passcode
  passcodes = passcodes.filter((p) => p.code !== passcode);
  await savePasscodes();

  const name = [firstName, lastName].filter(Boolean).join(" ") || username || "Unknown";

  // Check user limit (only count level 2)
  const ordinaryCount = users.filter((u) => u.level === 2).length;
  if (ordinaryCount >= config.MAX_NUM_USERS) {
    return { success: false, msg: `Maximum ordinary users reached (${config.MAX_NUM_USERS}).` };
  }

  // Add user as level 2
  users.push({ id: userId, name, level: 2 });
  await saveUsers();

  return { success: true, name };
}

// Change user level (only superuser can call)
async function setUserLevel(userId, newLevel) {
  if (newLevel < 0 || newLevel > 2) {
    throw new Error("Invalid level (0=super, 1=admin, 2=ordinary)");
  }

  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    throw new Error("User not found");
  }

  const oldLevel = users[userIndex].level;
  if (oldLevel === 0) {
    throw new Error("Cannot change superuser level");
  }

  users[userIndex].level = newLevel;
  await saveUsers();

  logger.info(`User ${userId} level changed from ${oldLevel} to ${newLevel}`);
  return { oldLevel, newLevel };
}
function getAllUsers() {
  return [...users]; // return a copy to prevent mutation from outside
}
// Remove a user completely (only superuser can call)
async function removeUser(userId) {
  if (userId === SUPERUSER_ID) {
    throw new Error("Cannot remove the superuser.");
  }

  const userIndex = users.findIndex((u) => u.id === userId);
  if (userIndex === -1) {
    throw new Error("User not found.");
  }

  const removedUser = users.splice(userIndex, 1)[0];
  await saveUsers();

  logger.info(`Removed user ${userId} (${removedUser.name})`);

  return removedUser;
}
loadUsers();
loadPasscodes();

module.exports = {
  getUserLevel,
  isAdminOrSuper,
  addPasscode,
  tryAddUser,
  setUserLevel, // new
  loadUsers,
  getAllUsers,
  removeUser,
};
