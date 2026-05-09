const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');

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
      sub
        .setName('ajouter')
        .setDescription('Ajouter un objet au stock')
        .addStringOption(opt =>
          opt.setName('nom').setDescription('Nom de l\'objet').setRequired(true)
        )
        .addIntegerOption(opt =>
          opt.setName('prix-depart').setDescription('Prix de départ de l\'enchère').setRequired(true).setMinValue(1)
        )
        .addStringOption(opt =>
          opt.setName('description').setDescription('Description de l\'objet').setRequired(false)
        )
        .addStringOption(opt =>
          opt.setName('image').setDescription('URL de l\'image de l\'objet').setRequired(false)
        )
    )
    .addSubcommand(sub =>
      sub.setName('liste').setDescription('Voir la liste des objets en stock')
    )
    .addSubcommand(sub =>
      sub
        .setName('supprimer')
        .setDescription('Supprimer un objet du stock')
        .addStringOption(opt =>
          opt.setName('id').setDescription('ID de l\'objet').setRequired(true)
        )
    )
    .addSubcommand(sub =>
      sub
        .setName('infos')
        .setDescription('Voir les infos d\'un objet')
        .addStringOption(opt =>
          opt.setName('id').setDescription('ID de l\'objet').setRequired(true)
        )
    ),

  async execute(interaction) {
    const config = db.get('config').value();

    if (!isAdmin(interaction.member, config)) {
      return interaction.reply({
        content: '❌ Tu n\'as pas la permission d\'utiliser cette commande.',
        ephemeral: true,
      });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'ajouter') {
      const nom = interaction.options.getString('nom');
      const prixDepart = interaction.options.getInteger('prix-depart');
      const description = interaction.options.getString('description') || '';
      const image = interaction.options.getString('image') || null;

      // Validate image URL if provided
      if (image && !image.match(/^https?:\/\/.+\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i)) {
        return interaction.reply({
          content: '❌ L\'URL de l\'image doit pointer vers une image valide (jpg, png, gif, webp).',
          ephemeral: true,
        });
      }

      const item = {
        id: `item_${Date.now()}`,
        name: nom,
        description,
        startingPrice: prixDepart,
        image,
        createdAt: Date.now(),
        createdBy: interaction.user.id,
      };

      db.get('items').push(item).write();

      const embed = new EmbedBuilder()
        .setTitle('✅ Objet ajouté au stock')
        .setColor(0x2ecc71)
        .addFields(
          { name: '📦 Nom', value: nom, inline: true },
          { name: '💰 Prix de départ', value: `${prixDepart} ${config.currency}`, inline: true },
          { name: '🆔 ID', value: `\`${item.id}\``, inline: false },
          { name: '📝 Description', value: description || '*Aucune*', inline: false }
        )
        .setFooter({ text: 'Utilisez /enchere lancer pour démarrer une enchère' });

      if (image) embed.setImage(image);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'liste') {
      const items = db.get('items').value();

      if (items.length === 0) {
        return interaction.reply({
          content: '📦 Aucun objet en stock. Ajoutez-en avec `/objet ajouter`.',
          ephemeral: true,
        });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📦 Stock d'objets (${items.length})`)
        .setColor(0x5865f2)
        .setDescription(
          items
            .map(
              (item, i) =>
                `**${i + 1}. ${item.name}**\n` +
                `> 💰 Prix de départ : **${item.startingPrice} ${config.currency}**\n` +
                `> 🆔 ID : \`${item.id}\`\n` +
                (item.description ? `> 📝 ${item.description}\n` : '')
            )
            .join('\n')
        )
        .setTimestamp();

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (sub === 'supprimer') {
      const id = interaction.options.getString('id');
      const item = db.get('items').find({ id }).value();

      if (!item) {
        return interaction.reply({ content: `❌ Aucun objet trouvé avec l'ID \`${id}\`.`, ephemeral: true });
      }

      // Check if auction is running for this item
      const activeAuction = db.get('auctions').find({ itemId: id, status: 'active' }).value();
      if (activeAuction) {
        return interaction.reply({
          content: '❌ Impossible de supprimer cet objet : une enchère est en cours pour cet objet.',
          ephemeral: true,
        });
      }

      db.get('items').remove({ id }).write();
      return interaction.reply({ content: `✅ Objet **${item.name}** supprimé du stock.`, ephemeral: true });
    }

    if (sub === 'infos') {
      const id = interaction.options.getString('id');
      const item = db.get('items').find({ id }).value();

      if (!item) {
        return interaction.reply({ content: `❌ Aucun objet trouvé avec l'ID \`${id}\`.`, ephemeral: true });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📦 ${item.name}`)
        .setColor(0x5865f2)
        .addFields(
          { name: '🆔 ID', value: `\`${item.id}\``, inline: true },
          { name: '💰 Prix de départ', value: `${item.startingPrice} ${config.currency}`, inline: true },
          { name: '📝 Description', value: item.description || '*Aucune*', inline: false },
          { name: '👤 Ajouté par', value: `<@${item.createdBy}>`, inline: true },
          { name: '📅 Ajouté le', value: new Date(item.createdAt).toLocaleDateString('fr-FR'), inline: true }
        );

      if (item.image) embed.setImage(item.image);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }
  },
};
