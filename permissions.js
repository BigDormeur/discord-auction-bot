// ─────────────────────────────────────────────────────────────────────────────
// utils/permissions.js
//
// Vérifie si un membre Discord a le droit d'utiliser les commandes admin.
// Un membre est autorisé s'il :
//   - est Admin Discord (permission ADMINISTRATOR), OU
//   - possède le rôle admin configuré dans /config role-admin
// ─────────────────────────────────────────────────────────────────────────────

const { PermissionFlagsBits } = require('discord.js');

function isAdmin(member, config) {
  // Toujours admin si permission Discord Administrator
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

  // Sinon, vérifier le rôle configuré
  if (config?.admin_role && member.roles.cache.has(config.admin_role)) return true;

  return false;
}

module.exports = { isAdmin };
