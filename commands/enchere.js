const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
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
      sub
        .setName('lancer')
        .setDescription('Lancer une enchère pour un objet du stock')
        .addStringOption(opt =>
          opt.setName('id-objet').setDescription('ID de l\'objet (voir /objet liste)').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('duree').setDescription('Durée en minutes').setRequired(true).setMinValue(1).setMaxValue(10080)
        )
    )
    .addSubcommand(sub =>
      sub.setName('liste').setDescription('Voir les enchères en cours')
    )
    .addSubcommand(sub =>
      sub
        .setName('terminer')
        .setDescription('Terminer manuellement une enchère')
        .addStringOption(opt =>
          opt.setName('id').setDescription('ID de l\'enchère').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('historique')
        .setDescription('Voir l\'historique des enchères terminées')
    ),

  async execute(interaction) {
    const config = db.get('config').value();
    const sub = interaction.options.getSubcommand();

    // Admin-only commands
    if (['lancer', 'terminer'].includes(sub) && !isAdmin(interaction.member, config)) {
      return interaction.reply({
        content: '❌ Tu n\'as pas la permission d\'utiliser cette commande.',
        ephemeral: true,
      });
    }

    if (sub === 'lancer') {
      const itemId = interaction.options.getString('id-objet');
      const duree = interaction.options.getInteger('duree');

      const item = db.get('items').find({ id: itemId }).value();
      if (!item) {
        return interaction.reply({ content: `❌ Aucun objet trouvé avec l'ID \`${itemId}\`. Vérifiez avec \`/objet liste\`.`, ephemeral: true });
      }

      // Check if already an active auction for this item
      const existing = db.get('auctions').find({ itemId, status: 'active' }).value();
      if (existing) {
        return interaction.reply({
          content: `❌ Une enchère est déjà en cours pour **${item.name}**.`,
          ephemeral: true,
        });
      }

      if (!config.auctionChannelId) {
        return interaction.reply({
          content: '❌ Aucun salon d\'enchères configuré. Utilisez `/config salon-encheres`.',
          ephemeral: true,
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const result = await createAuction(interaction.client, item, duree, interaction.guildId);

      if (result.error) {
        return interaction.editReply({ content: `❌ ${result.error}` });
      }

      return interaction.editReply({
        content: `✅ Enchère lancée pour **${item.name}** pendant **${duree} minutes** dans <#${config.auctionChannelId}> !`,
      });
    }

    if (sub === 'liste') {
      const auctions = db.get('auctions').filter({ status: 'active' }).value();

      if (auctions.length === 0) {
        return interaction.reply({ content: '🔨 Aucune enchère en cours.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`🔨 Enchères en cours (${auctions.length})`)
        .setColor(0x2ecc71)
        .setDescription(
          auctions
            .map((a, i) => {
              const remaining = Math.max(0, a.endsAt - Date.now());
              const min = Math.floor(remaining / 60000);
              const sec = Math.floor((remaining % 60000) / 1000);
              return (
                `**${i + 1}. ${a.itemName}**\n` +
                `> 💰 Enchère actuelle : **${a.currentPrice} ${a.currency}**\n` +
                `> 👤 Enchérisseur : ${a.currentBidderTag ? `<@${a.currentBidderId}>` : '*Aucun*'}\n` +
                `> ⏳ Temps restant : ${min}min ${sec}s\n` +
                `> 🆔 ID : \`${a.id}\``
              );
            })
            .join('\n\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'terminer') {
      const id = interaction.options.getString('id');
      const auction = db.get('auctions').find({ id, status: 'active' }).value();

      if (!auction) {
        return interaction.reply({ content: `❌ Aucune enchère active trouvée avec l'ID \`${id}\`.`, ephemeral: true });
      }

      await interaction.deferReply({ ephemeral: true });
      await closeAuction(interaction.client, id);
      return interaction.editReply({ content: `✅ Enchère **${auction.itemName}** terminée manuellement.` });
    }

    if (sub === 'historique') {
      const ended = db.get('auctions').filter({ status: 'ended' }).value().slice(-10).reverse();

      if (ended.length === 0) {
        return interaction.reply({ content: '📜 Aucune enchère terminée.', ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle('📜 Historique des enchères (10 dernières)')
        .setColor(0x808080)
        .setDescription(
          ended
            .map((a, i) =>
              `**${i + 1}. ${a.itemName}**\n` +
              `> 🏆 Gagnant : ${a.currentBidderTag ? `<@${a.currentBidderId}>` : '*Aucun enchérisseur*'}\n` +
              `> 💰 Prix final : **${a.currentPrice} ${a.currency}**\n` +
              `> 📅 Terminée le ${new Date(a.endsAt).toLocaleDateString('fr-FR')}`
            )
            .join('\n\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
