const low = require('lowdb');
const FileSync = require('lowdb/adapters/FileSync');
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dbPath)) fs.mkdirSync(dbPath, { recursive: true });

const adapter = new FileSync(path.join(dbPath, 'db.json'));
const db = low(adapter);

// Default structure
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
  bids: [],
}).write();

module.exports = db;
