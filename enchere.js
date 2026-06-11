// ─────────────────────────────────────────────────────────────────────────────
// commands/enchere.js  —  /enchere
//
// Gestion des enchères : lancement, liste, clôture manuelle, historique.
//
// Sous-commandes :
//   /enchere lancer   → lance une enchère sur un objet (admin)
//   /enchere liste    → enchères actives sur ce serveur
//   /enchere terminer → clôture manuellement une enchère (admin)
//   /enchere historique → 10 dernières enchères terminées
// ─────────────────────────────────────────────────────────────────────────────

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const {
  buildAuctionEmbed,
  buildAuctionButtons,
  buildAuctionEndedEmbed,
  errorEmbed,
  warningEmbed,
  discordTimestamp,
} = require('../utils/embedBuilder');
const { isAdmin }    = require('../utils/permissions');
const auctionManager = require('../utils/auctionManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enchere')
    .setDescription('Gérer les enchères')

    .addSubcommand(sub => sub
      .setName('lancer')
      .setDescription('Lancer une enchère (admin)')
      .addStringOption(opt => opt
        .setName('objet-id')
        .setDescription('ID de l\'objet (depuis /objet liste)')
        .setRequired(true))
      .addIntegerOption(opt => opt
        .setName('duree')
        .setDescription('Durée en minutes')
        .setMinValue(1)
        .setMaxValue(10080) // 7 jours max
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('liste')
      .setDescription('Voir les enchères actives sur ce serveur'))

    .addSubcommand(sub => sub
      .setName('terminer')
      .setDescription('Terminer manuellement une enchère (admin)')
      .addStringOption(opt => opt
        .setName('id')
        .setDescription('ID de l\'enchère')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('historique')
      .setDescription('Voir les 10 dernières enchères terminées')),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ embeds: [errorEmbed('Commande réservée aux serveurs.')], ephemeral: true });
    }

    const config = await db.getGuildConfig(interaction.guildId);
    const sub    = interaction.options.getSubcommand();

    // ── /enchere lancer ────────────────────────────────────────────────────
    if (sub === 'lancer') {
      if (!isAdmin(interaction.member, config)) {
        return interaction.reply({ embeds: [errorEmbed('Permission refusée.')], ephemeral: true });
      }

      // Vérifier que le salon d'enchères est configuré
      if (!config?.auction_channel) {
        return interaction.reply({
          embeds: [errorEmbed('Aucun salon d\'enchères configuré. Utilise `/config salon-encheres` d\'abord.')],
          ephemeral: true,
        });
      }

      const itemId  = interaction.options.getString('objet-id').trim();
      const duree   = interaction.options.getInteger('duree');
      const item    = await db.getItem(interaction.guildId, itemId);

      if (!item) {
        return interaction.reply({
          embeds: [errorEmbed(`Objet \`${itemId}\` introuvable. Vérifie l\'ID avec \`/objet liste\`.`)],
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      // Créer l'enchère en BDD
      const auctionId = await db.createAuction(interaction.guildId, item, duree);
      const auction   = await db.getAuction(auctionId);

      // Poster le message dans le salon configuré
      const channel  = await interaction.guild.channels.fetch(config.auction_channel);
      const embed    = buildAuctionEmbed(auction, config);
      const buttons  = buildAuctionButtons(auctionId, config?.min_increment || 1);
      const message  = await channel.send({ embeds: [embed], components: [buttons] });

      // Sauvegarder l'ID du message pour pouvoir l'éditer plus tard
      await db.updateAuctionMessage(auctionId, message.id, channel.id);

      return interaction.editReply({
        embeds: [{
          color: 0x57F287,
          description: `✅ Enchère lancée ! → ${channel} | Se termine ${discordTimestamp(auction.ends_at)}`,
        }],
      });
    }

    // ── /enchere liste ─────────────────────────────────────────────────────
    if (sub === 'liste') {
      await interaction.deferReply({ ephemeral: true });
      const auctions = await db.getActiveAuctions(interaction.guildId);

      if (auctions.length === 0) {
        return interaction.editReply({
          embeds: [warningEmbed('Aucune enchère active en ce moment.')],
        });
      }

      const symbol = config?.currency_symbol || '🪙';
      const lines  = auctions.map(a => {
        const bidder = a.current_bidder_id ? `<@${a.current_bidder_id}>` : '*aucune mise*';
        return (
          `**${a.item_name}** — ${a.current_price} ${symbol} (${bidder})\n` +
          `Fin : ${discordTimestamp(a.ends_at)} | ID : \`${a.auction_id}\``
        );
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`🔨 Enchères actives — ${auctions.length}`)
        .setDescription(lines.join('\n\n'))
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /enchere terminer ──────────────────────────────────────────────────
    if (sub === 'terminer') {
      if (!isAdmin(interaction.member, config)) {
        return interaction.reply({ embeds: [errorEmbed('Permission refusée.')], ephemeral: true });
      }

      const auctionId = interaction.options.getString('id').trim();
      const auction   = await db.getAuction(auctionId);

      if (!auction || auction.guild_id !== interaction.guildId) {
        return interaction.reply({
          embeds: [errorEmbed(`Enchère \`${auctionId}\` introuvable.`)],
          ephemeral: true,
        });
      }

      if (auction.status !== 'active') {
        return interaction.reply({
          embeds: [errorEmbed('Cette enchère est déjà terminée.')],
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      // Forcer la clôture immédiate via auctionManager
      // On met ends_at dans le passé et on appelle checkExpiredAuctions
      await db.endAuction(auctionId);
      // Déclencher le traitement complet (mise à jour message, DM, logs)
      await auctionManager.checkExpiredAuctions(interaction.client);

      return interaction.editReply({
        embeds: [{ color: 0x57F287, description: `✅ Enchère \`${auctionId}\` terminée manuellement.` }],
      });
    }

    // ── /enchere historique ────────────────────────────────────────────────
    if (sub === 'historique') {
      await interaction.deferReply({ ephemeral: true });
      const history = await db.getAuctionHistory(interaction.guildId, 10);

      if (history.length === 0) {
        return interaction.editReply({
          embeds: [warningEmbed('Aucune enchère terminée sur ce serveur.')],
        });
      }

      const symbol = config?.currency_symbol || '🪙';
      const lines  = history.map(a => {
        if (a.winner_id) {
          return `✅ **${a.item_name}** — ${a.final_price} ${symbol} → <@${a.winner_id}> ${discordTimestamp(a.ends_at, 'R')}`;
        }
        return `❌ **${a.item_name}** — Aucune mise ${discordTimestamp(a.ends_at, 'R')}`;
      });

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('📜 Historique des enchères')
        .setDescription(lines.join('\n'))
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }
  },
};
