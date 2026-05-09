const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getDb } = require('../utils/database');

function isAdmin(member, config) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  if (config.adminRoleId && member.roles.cache.has(config.adminRoleId)) return true;
  return false;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('objet')
    .setDescription('📦 Gérer les objets pour les enchères')
    .addSubcommand(sub =>
      sub.setName('ajouter').setDescription('Ajouter un objet au stock')
        .addStringOption(opt => opt.setName('nom').setDescription('Nom de l\'objet').setRequired(true))
        .addIntegerOption(opt => opt.setName('prix-depart').setDescription('Prix de départ').setRequired(true).setMinValue(1))
        .addStringOption(opt => opt.setName('description').setDescription('Description').setRequired(false))
        .addStringOption(opt => opt.setName('image').setDescription('URL image').setRequired(false))
    )
    .addSubcommand(sub => sub.setName('liste').setDescription('Voir la liste des objets'))
    .addSubcommand(sub =>
      sub.setName('supprimer').setDescription('Supprimer un objet')
        .addStringOption(opt => opt.setName('id').setDescription('ID de l\'objet').setRequired(true))
    )
    .addSubcommand(sub =>
      sub.setName('infos').setDescription('Voir les infos d\'un objet')
        .addStringOption(opt => opt.setName('id').setDescription('ID de l\'objet').setRequired(true))
    ),

  async execute(interaction) {
    const db = getDb(interaction.guildId);
    const config = db.get('config').value();

    if (!isAdmin(interaction.member, config)) {
      return interaction.reply({ content: '❌ Tu n\'as pas la permission.', ephemeral: true });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'ajouter') {
      const nom = interaction.options.getString('nom');
      const prixDepart = interaction.options.getInteger('prix-depart');
      const description = interaction.options.getString('description') || '';
      const image = interaction.options.getString('image') || null;

      if (image && !image.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
        return interaction.reply({ content: '❌ URL d\'image invalide.', ephemeral: true });
      }

      const item = {
        id: `item_${Date.now()}`,
        name: nom, description,
        startingPrice: prixDepart,
        image,
        createdAt: Date.now(),
        createdBy: interaction.user.id,
      };

      db.get('items').push(item).write();

      const embed = new EmbedBuilder()
        .setTitle('✅ Objet ajouté')
        .setColor(0x2ecc71)
        .addFields(
          { name: '📦 Nom', value: nom, inline: true },
          { name: '💰 Prix de départ', value: `${prixDepart} ${config.currency}`, inline: true },
          { name: '🆔 ID', value: `\`${item.id}\``, inline: false },
          { name: '📝 Description', value: description || '*Aucune*', inline: false }
        );
      if (image) embed.setImage(image);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'liste') {
      const items = db.get('items').value();
      if (items.length === 0) return interaction.reply({ content: '📦 Aucun objet en stock.', ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`📦 Stock d'objets (${items.length})`)
        .setColor(0x5865f2)
        .setDescription(items.map((item, i) =>
          `**${i + 1}. ${item.name}**\n> 💰 ${item.startingPrice} ${config.currency} | 🆔 \`${item.id}\`${item.description ? `\n> ${item.description}` : ''}`
        ).join('\n\n'));
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'supprimer') {
      const id = interaction.options.getString('id');
      const item = db.get('items').find({ id }).value();
      if (!item) return interaction.reply({ content: `❌ Objet \`${id}\` introuvable.`, ephemeral: true });

      const activeAuction = db.get('auctions').find({ itemId: id, status: 'active' }).value();
      if (activeAuction) return interaction.reply({ content: '❌ Une enchère est en cours pour cet objet.', ephemeral: true });

      db.get('items').remove({ id }).write();
      return interaction.reply({ content: `✅ **${item.name}** supprimé.`, ephemeral: true });
    }

    if (sub === 'infos') {
      const id = interaction.options.getString('id');
      const item = db.get('items').find({ id }).value();
      if (!item) return interaction.reply({ content: `❌ Objet \`${id}\` introuvable.`, ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle(`📦 ${item.name}`)
        .setColor(0x5865f2)
        .addFields(
          { name: '🆔 ID', value: `\`${item.id}\``, inline: true },
          { name: '💰 Prix de départ', value: `${item.startingPrice} ${config.currency}`, inline: true },
          { name: '📝 Description', value: item.description || '*Aucune*', inline: false },
          { name: '👤 Ajouté par', value: `<@${item.createdBy}>`, inline: true }
        );
      if (item.image) embed.setImage(item.image);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
