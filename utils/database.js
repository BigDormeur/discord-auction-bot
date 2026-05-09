const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

// Cache pour éviter de recharger le fichier à chaque fois
const dbCache = {};

/**
 * Retourne la base de données isolée pour un serveur donné
 */
function getDb(guildId) {
  if (!guildId) throw new Error('guildId requis');
  if (dbCache[guildId]) return dbCache[guildId];

  const adapter = new FileSync(path.join(dbPath, `guild_${guildId}.json`));
  const db = low(adapter);

  db.defaults({
    config: {
      adminRoleId: null,
      auctionChannelId: null,
      logChannelId: null,
      currency: '🪙',
      currencyName: 'pièces',
      minBidIncrement: 1,
    },
    auctions: [],
    items: [],
    bannedUsers: [],
  }).write();

  dbCache[guildId] = db;
  return db;
}

module.exports = { getDb };
