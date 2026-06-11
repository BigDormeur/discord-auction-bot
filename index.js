// ─────────────────────────────────────────────────────────────────────────────
// index.js  —  Point d'entrée du bot
//
// Ce fichier fait 3 choses :
//   1. Crée le client Discord avec les bons intents (sans MessageContent !)
//   2. Charge dynamiquement les commandes et les events depuis leurs dossiers
//   3. Au démarrage : initialise la BDD, enregistre les slash commands,
//      démarre la vérification automatique des enchères expirées
//
// Ce qui a changé par rapport à l'ancienne version :
//   - Suppression de GatewayIntentBits.MessageContent (économie de RAM)
//   - Initialisation de Turso (db.initDatabase()) avant tout
//   - Enregistrement global des commandes (pas lié à un GUILD_ID)
//     → fonctionne sur tous les serveurs automatiquement
// ─────────────────────────────────────────────────────────────────────────────

require('dotenv').config();

const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const db             = require('./utils/database');
const auctionManager = require('./utils/auctionManager');

// ─── Client Discord ───────────────────────────────────────────────────────────
// On n'utilise QUE les intents nécessaires aux slash commands et boutons :
//   - Guilds           : accéder aux infos des serveurs (salons, rôles)
//   - GuildMessages    : (pas obligatoire mais utile pour les erreurs de salon)
//
// On a SUPPRIMÉ MessageContent : cet intent demande à Discord de nous envoyer
// le contenu de CHAQUE message de CHAQUE serveur. Inutile avec des slash
// commands, et très coûteux en RAM (+50 à 150 Mo selon le nombre de serveurs).

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Collection pour stocker les commandes chargées
client.commands = new Collection();

// ─── Chargement des commandes ─────────────────────────────────────────────────
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (command.data && command.execute) {
    client.commands.set(command.data.name, command);
    console.log(`📦 Commande chargée : /${command.data.name}`);
  }
}

// ─── Chargement des events ────────────────────────────────────────────────────
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(f => f.endsWith('.js'));

for (const file of eventFiles) {
  const event = require(path.join(eventsPath, file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log(`🎧 Event chargé : ${event.name}`);
}

// ─── Enregistrement des slash commands ───────────────────────────────────────
// Routes.applicationCommands(CLIENT_ID) = enregistrement GLOBAL
// → Les commandes apparaissent sur tous les serveurs où le bot est invité.
// → Propagation : ~1h (normal, côté Discord)
//
// En dev, tu peux utiliser Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID)
// pour un enregistrement instantané sur un seul serveur de test.

async function registerCommands() {
  const commandsData = [];
  for (const file of commandFiles) {
    const cmd = require(path.join(commandsPath, file));
    if (cmd.data) commandsData.push(cmd.data.toJSON());
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('🔄 Enregistrement des commandes slash...');

    // Mode dev : enregistrement instantané sur un serveur de test
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commandsData }
      );
      console.log(`✅ Commandes enregistrées (mode dev — serveur ${process.env.GUILD_ID})`);
    } else {
      // Production : enregistrement global sur tous les serveurs
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commandsData }
      );
      console.log('✅ Commandes slash enregistrées globalement !');
    }
  } catch (err) {
    console.error('❌ Erreur lors de l\'enregistrement des commandes:', err);
  }
}

// ─── Événement ready ─────────────────────────────────────────────────────────
client.once('ready', async () => {
  console.log(`\n✅ Bot connecté : ${client.user.tag}`);
  console.log(`📊 Serveurs actifs : ${client.guilds.cache.size}`);

  // 1. Initialiser les tables Turso (inoffensif si elles existent déjà)
  await db.initDatabase();

  // 2. Enregistrer les slash commands
  await registerCommands();

  // 3. Vérifier toutes les 10s si des enchères ont expiré
  //    checkExpiredAuctions parcourt toutes les enchères actives de tous les serveurs
  setInterval(() => auctionManager.checkExpiredAuctions(client), 10_000);

  console.log('\n🔨 Bot prêt — enchères actives surveillées toutes les 10s\n');
});

// ─── Connexion ────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
