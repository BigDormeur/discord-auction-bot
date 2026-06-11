// ─────────────────────────────────────────────────────────────────────────────
// utils/initDb.js
//
// Script standalone pour initialiser les tables Turso manuellement.
// Utile si tu veux créer les tables avant de démarrer le bot.
//
// Usage :
//   node utils/initDb.js
// ou via npm :
//   npm run db:init
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();
const { initDatabase } = require('./database');

initDatabase()
  .then(() => {
    console.log('✅ Tables Turso créées avec succès.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Erreur lors de l\'initialisation:', err);
    process.exit(1);
  });
