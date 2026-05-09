const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDb } = require('../utils/database');
const { createAuction, closeAuction } = require('../utils/auctionManager');

function isAdmin(member, config) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('enchere')
    .setDescription('🔨 Gérer les enchères')
    .addSubcommand(sub =>
      sub.setName('lancer').setDescription('Lancer une enchère')
        .addStringOption(opt => opt.setName('id-objet').setDescription('ID de l\'objet').setRequired(true))
        .addIntegerOption(opt => opt.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(10080))
    )
    .addSubcommand(sub => sub.setName('liste').setDescription('Voir les enchères en cours'))
    .addSubcommand(sub =>
      sub.setName('terminer').setDescription('Terminer manuellement une enchère')
        .addStringOption(opt => opt.setName('id').setDescription('ID de l\'enchère').setRequired(true))
    )
    .addSubcommand(sub => sub.setName('historique').setDescription('Voir les 10 dernières enchères')),

  async execute(interaction) {
    const db = getDb(interaction.guildId);
    const config = db.get('config').value();
    const sub = interaction.options.getSubcommand();

    if (['lancer', 'terminer'].includes(sub) && !isAdmin(interaction.member, config)) {
      return interaction.reply({ content: '❌ Permission refusée.', ephemeral: true });
    }

    if (sub === 'lancer') {
      const itemId = interaction.options.getString('id-objet');
      const duree = interaction.options.getInteger('duree');
      const item = db.get('items').find({ id: itemId }).value();

      if (!item) return interaction.reply({ content: `❌ Objet \`${itemId}\` introuvable. Vérifiez avec \`/objet liste\`.`, ephemeral: true });
      if (db.get('auctions').find({ itemId, status: 'active' }).value()) {
        return interaction.reply({ content: `❌ Une enchère est déjà en cours pour **${item.name}**.`, ephemeral: true });
      }
      if (!config.auctionChannelId) return interaction.reply({ content: '❌ Aucun salon configuré. Faites \`/config salon-encheres\`.', ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      const result = await createAuction(interaction.client, item, duree, interaction.guildId);
      if (result.error) return interaction.editReply({ content: `❌ ${result.error}` });
      return interaction.editReply({ content: `✅ Enchère lancée pour **${item.name}** pendant **${duree} minutes** !` });
    }

    if (sub === 'liste') {
      const auctions = db.get('auctions').filter({ status: 'active' }).value();
      if (auctions.length === 0) return interaction.reply({ content: '🔨 Aucune enchère en cours.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`🔨 Enchères en cours (${auctions.length})`)
        .setColor(0x2ecc71)
        .setDescription(auctions.map((a, i) => {
          const min = Math.floor(Math.max(0, a.endsAt - Date.now()) / 60000);
          const sec = Math.floor((Math.max(0, a.endsAt - Date.now()) % 60000) / 1000);
          return `**${i + 1}. ${a.itemName}**\n> 💰 ${a.currentPrice} ${a.currency} | ⏳ ${min}min ${sec}s | 🆔 \`${a.id}\``;
        }).join('\n\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'terminer') {
      const id = interaction.options.getString('id');
      const auction = db.get('auctions').find({ id, status: 'active' }).value();
      if (!auction) return interaction.reply({ content: `❌ Enchère active \`${id}\` introuvable.`, ephemeral: true });

      await interaction.deferReply({ ephemeral: true });
      await closeAuction(interaction.client, id, interaction.guildId);
      return interaction.editReply({ content: `✅ Enchère **${auction.itemName}** terminée manuellement.` });
    }

    if (sub === 'historique') {
      const ended = db.get('auctions').filter({ status: 'ended' }).value().slice(-10).reverse();
      if (ended.length === 0) return interaction.reply({ content: '📜 Aucune enchère terminée.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle('📜 Historique (10 dernières)')
        .setColor(0x808080)
        .setDescription(ended.map((a, i) =>
          `**${i + 1}. ${a.itemName}**\n> 🏆 ${a.currentBidderTag ? `<@${a.currentBidderId}>` : '*Aucun*'} | 💰 ${a.currentPrice} ${a.currency}`
        ).join('\n\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
