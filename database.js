// ─────────────────────────────────────────────────────────────────────────────
// utils/database.js
//
// Remplace complètement lowdb. Au lieu d'un fichier JSON local (qui disparaît
// à chaque redéploiement et ne fonctionne que sur une seule machine), on utilise
// Turso : une base SQLite hébergée dans le cloud, accessible depuis n'importe
// quel serveur, gratuite jusqu'à 9 Go et 1 milliard de requêtes/mois.
//
// Toutes les données sont isolées par guild_id → un seul bot peut servir
// des milliers de serveurs Discord sans aucune collision de données.
// ─────────────────────────────────────────────────────────────────────────────

const { createClient } = require('@libsql/client');

// Connexion Turso (les variables viennent du .env)
const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_TOKEN,
});

// ─── Initialisation des tables ───────────────────────────────────────────────
// Appelée une seule fois au démarrage du bot (dans index.js).
// CREATE TABLE IF NOT EXISTS = inoffensif si les tables existent déjà.

async function initDatabase() {
  await db.batch([
    // Configuration par serveur Discord
    // Chaque serveur a sa propre ligne identifiée par guild_id
    `CREATE TABLE IF NOT EXISTS guilds (
      guild_id        TEXT PRIMARY KEY,
      auction_channel TEXT,           -- ID du salon où poster les enchères
      log_channel     TEXT,           -- ID du salon des logs
      admin_role      TEXT,           -- ID du rôle autorisé à gérer les enchères
      currency_symbol TEXT DEFAULT '🪙',
      currency_name   TEXT DEFAULT 'pièces',
      min_increment   INTEGER DEFAULT 1,
      created_at      INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Stock d'objets à mettre aux enchères
    // Également isolé par guild_id
    `CREATE TABLE IF NOT EXISTS items (
      item_id     TEXT PRIMARY KEY,   -- Généré : item_<timestamp>_<random>
      guild_id    TEXT NOT NULL,
      name        TEXT NOT NULL,
      description TEXT DEFAULT '',
      image_url   TEXT DEFAULT '',
      start_price INTEGER NOT NULL,
      created_at  INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Enchères actives et terminées
    `CREATE TABLE IF NOT EXISTS auctions (
      auction_id    TEXT PRIMARY KEY, -- Généré : auc_<timestamp>_<random>
      guild_id      TEXT NOT NULL,
      item_id       TEXT NOT NULL,
      item_name     TEXT NOT NULL,    -- Snapshot du nom au moment du lancement
      item_desc     TEXT DEFAULT '',
      item_image    TEXT DEFAULT '',
      start_price   INTEGER NOT NULL,
      current_price INTEGER NOT NULL,
      current_bidder_id   TEXT DEFAULT NULL,   -- ID Discord du meneur actuel
      current_bidder_name TEXT DEFAULT NULL,   -- Nom affiché du meneur
      message_id    TEXT DEFAULT NULL, -- ID du message Discord à mettre à jour
      channel_id    TEXT DEFAULT NULL, -- ID du salon où est posté le message
      ends_at       INTEGER NOT NULL,  -- Timestamp UNIX de fin
      status        TEXT DEFAULT 'active', -- 'active' | 'ended' | 'cancelled'
      winner_id     TEXT DEFAULT NULL,
      winner_name   TEXT DEFAULT NULL,
      final_price   INTEGER DEFAULT NULL,
      created_at    INTEGER DEFAULT (strftime('%s', 'now'))
    )`,

    // Historique de toutes les enchères (chaque mise)
    `CREATE TABLE IF NOT EXISTS bids (
      bid_id     TEXT PRIMARY KEY,
      auction_id TEXT NOT NULL,
      guild_id   TEXT NOT NULL,
      user_id    TEXT NOT NULL,
      user_name  TEXT NOT NULL,
      amount     INTEGER NOT NULL,
      placed_at  INTEGER DEFAULT (strftime('%s', 'now'))
    )`,
  ]);

  console.log('✅ Base de données initialisée (Turso)');
}

// ─── Guilds ──────────────────────────────────────────────────────────────────

async function getGuildConfig(guildId) {
  const result = await db.execute({
    sql: 'SELECT * FROM guilds WHERE guild_id = ?',
    args: [guildId],
  });
  return result.rows[0] || null;
}

// Crée la config si elle n'existe pas, sinon met à jour les champs fournis
async function upsertGuildConfig(guildId, fields) {
  // S'assurer que la ligne existe d'abord
  await db.execute({
    sql: `INSERT OR IGNORE INTO guilds (guild_id) VALUES (?)`,
    args: [guildId],
  });

  // Construire la requête UPDATE dynamiquement selon les champs passés
  const keys = Object.keys(fields);
  if (keys.length === 0) return;

  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const values = keys.map(k => fields[k]);

  await db.execute({
    sql: `UPDATE guilds SET ${setClause} WHERE guild_id = ?`,
    args: [...values, guildId],
  });
}

// ─── Items ───────────────────────────────────────────────────────────────────

function generateId(prefix) {
  // ID lisible et unique : ex. item_1719000000_a3f2
  return `${prefix}_${Math.floor(Date.now() / 1000)}_${Math.random().toString(36).slice(2, 6)}`;
}

async function createItem(guildId, { name, description, imageUrl, startPrice }) {
  const itemId = generateId('item');
  await db.execute({
    sql: `INSERT INTO items (item_id, guild_id, name, description, image_url, start_price)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [itemId, guildId, name, description || '', imageUrl || '', startPrice],
  });
  return itemId;
}

async function getItem(guildId, itemId) {
  const result = await db.execute({
    sql: 'SELECT * FROM items WHERE item_id = ? AND guild_id = ?',
    args: [itemId, guildId],
  });
  return result.rows[0] || null;
}

async function listItems(guildId) {
  const result = await db.execute({
    sql: 'SELECT * FROM items WHERE guild_id = ? ORDER BY created_at DESC',
    args: [guildId],
  });
  return result.rows;
}

async function deleteItem(guildId, itemId) {
  const result = await db.execute({
    sql: 'DELETE FROM items WHERE item_id = ? AND guild_id = ?',
    args: [itemId, guildId],
  });
  return result.rowsAffected > 0;
}

// ─── Auctions ────────────────────────────────────────────────────────────────

async function createAuction(guildId, item, durationMinutes) {
  const auctionId = generateId('auc');
  const endsAt = Math.floor(Date.now() / 1000) + durationMinutes * 60;

  await db.execute({
    sql: `INSERT INTO auctions
            (auction_id, guild_id, item_id, item_name, item_desc, item_image,
             start_price, current_price, ends_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      auctionId, guildId, item.item_id, item.name,
      item.description || '', item.image_url || '',
      item.start_price, item.start_price, endsAt,
    ],
  });
  return auctionId;
}

async function getAuction(auctionId) {
  const result = await db.execute({
    sql: 'SELECT * FROM auctions WHERE auction_id = ?',
    args: [auctionId],
  });
  return result.rows[0] || null;
}

async function getActiveAuctions(guildId) {
  const result = await db.execute({
    sql: `SELECT * FROM auctions
          WHERE guild_id = ? AND status = 'active'
          ORDER BY ends_at ASC`,
    args: [guildId],
  });
  return result.rows;
}

// Récupère TOUTES les enchères actives de tous les serveurs (pour le check auto)
async function getAllActiveAuctions() {
  const result = await db.execute({
    sql: `SELECT * FROM auctions WHERE status = 'active' ORDER BY ends_at ASC`,
    args: [],
  });
  return result.rows;
}

async function updateAuctionMessage(auctionId, messageId, channelId) {
  await db.execute({
    sql: 'UPDATE auctions SET message_id = ?, channel_id = ? WHERE auction_id = ?',
    args: [messageId, channelId, auctionId],
  });
}

async function placeBid(auctionId, guildId, userId, userName, amount) {
  // Mise à jour de l'enchère courante
  await db.execute({
    sql: `UPDATE auctions
          SET current_price = ?, current_bidder_id = ?, current_bidder_name = ?
          WHERE auction_id = ?`,
    args: [amount, userId, userName, auctionId],
  });

  // Enregistrement dans l'historique des mises
  const bidId = generateId('bid');
  await db.execute({
    sql: `INSERT INTO bids (bid_id, auction_id, guild_id, user_id, user_name, amount)
          VALUES (?, ?, ?, ?, ?, ?)`,
    args: [bidId, auctionId, guildId, userId, userName, amount],
  });
}

async function endAuction(auctionId) {
  const auction = await getAuction(auctionId);
  if (!auction) return null;

  const winnerId   = auction.current_bidder_id   || null;
  const winnerName = auction.current_bidder_name || null;
  const finalPrice = auction.current_bidder_id ? auction.current_price : null;

  await db.execute({
    sql: `UPDATE auctions
          SET status = 'ended', winner_id = ?, winner_name = ?, final_price = ?
          WHERE auction_id = ?`,
    args: [winnerId, winnerName, finalPrice, auctionId],
  });

  return { ...auction, winner_id: winnerId, winner_name: winnerName, final_price: finalPrice };
}

async function cancelAuction(auctionId) {
  await db.execute({
    sql: `UPDATE auctions SET status = 'cancelled' WHERE auction_id = ?`,
    args: [auctionId],
  });
}

async function getAuctionHistory(guildId, limit = 10) {
  const result = await db.execute({
    sql: `SELECT * FROM auctions
          WHERE guild_id = ? AND status != 'active'
          ORDER BY created_at DESC
          LIMIT ?`,
    args: [guildId, limit],
  });
  return result.rows;
}

async function getAuctionBids(auctionId, limit = 5) {
  const result = await db.execute({
    sql: `SELECT * FROM bids WHERE auction_id = ? ORDER BY placed_at DESC LIMIT ?`,
    args: [auctionId, limit],
  });
  return result.rows;
}

module.exports = {
  initDatabase,
  // guilds
  getGuildConfig,
  upsertGuildConfig,
  // items
  createItem,
  getItem,
  listItems,
  deleteItem,
  // auctions
  createAuction,
  getAuction,
  getActiveAuctions,
  getAllActiveAuctions,
  updateAuctionMessage,
  placeBid,
  endAuction,
  cancelAuction,
  getAuctionHistory,
  getAuctionBids,
};
