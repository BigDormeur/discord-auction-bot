// ─────────────────────────────────────────────────────────────────────────────
// commands/objet.js  —  /objet
//
// Gestion du stock d'objets à mettre aux enchères.
// Chaque objet appartient à un guild_id → les serveurs ne se voient pas.
//
// Sous-commandes :
//   /objet ajouter   → ajoute un objet au stock
//   /objet liste     → liste tous les objets du serveur
//   /objet infos     → détails d'un objet précis
//   /objet supprimer → supprime un objet du stock
// ─────────────────────────────────────────────────────────────────────────────

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const db = require('../utils/database');
const { successEmbed, errorEmbed, warningEmbed } = require('../utils/embedBuilder');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('objet')
    .setDescription('Gérer les objets disponibles aux enchères')

    .addSubcommand(sub => sub
      .setName('ajouter')
      .setDescription('Ajouter un objet au stock')
      .addStringOption(opt => opt
        .setName('nom')
        .setDescription('Nom de l\'objet')
        .setMaxLength(100)
        .setRequired(true))
      .addIntegerOption(opt => opt
        .setName('prix-depart')
        .setDescription('Prix de départ de l\'enchère')
        .setMinValue(1)
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('description')
        .setDescription('Description de l\'objet (optionnel)')
        .setMaxLength(500))
      .addStringOption(opt => opt
        .setName('image')
        .setDescription('URL d\'une image (optionnel)')))

    .addSubcommand(sub => sub
      .setName('liste')
      .setDescription('Voir tous les objets en stock'))

    .addSubcommand(sub => sub
      .setName('infos')
      .setDescription('Voir les détails d\'un objet')
      .addStringOption(opt => opt
        .setName('id')
        .setDescription('ID de l\'objet (visible dans /objet liste)')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('supprimer')
      .setDescription('Supprimer un objet du stock')
      .addStringOption(opt => opt
        .setName('id')
        .setDescription('ID de l\'objet')
        .setRequired(true))),

  async execute(interaction) {
    if (!interaction.guildId) {
      return interaction.reply({ embeds: [errorEmbed('Commande réservée aux serveurs.')], ephemeral: true });
    }

    const config = await db.getGuildConfig(interaction.guildId);
    const sub    = interaction.options.getSubcommand();

    // ── Vérification des permissions pour les actions destructives ─────────
    const needsAdmin = ['ajouter', 'supprimer'];
    if (needsAdmin.includes(sub) && !isAdmin(interaction.member, config)) {
      return interaction.reply({
        embeds: [errorEmbed('Tu n\'as pas la permission d\'utiliser cette commande.')],
        ephemeral: true,
      });
    }

    // ── /objet ajouter ─────────────────────────────────────────────────────
    if (sub === 'ajouter') {
      const nom        = interaction.options.getString('nom');
      const prixDepart = interaction.options.getInteger('prix-depart');
      const desc       = interaction.options.getString('description') || '';
      const image      = interaction.options.getString('image') || '';

      // Validation basique de l'URL image
      if (image && !image.startsWith('http')) {
        return interaction.reply({
          embeds: [errorEmbed('L\'URL de l\'image doit commencer par `http`.')],
          ephemeral: true,
        });
      }

      const itemId = await db.createItem(interaction.guildId, {
        name: nom,
        description: desc,
        imageUrl: image,
        startPrice: prixDepart,
      });

      const symbol = config?.currency_symbol || '🪙';
      return interaction.reply({
        embeds: [successEmbed(
          `Objet ajouté avec succès !\n\n` +
          `**Nom :** ${nom}\n` +
          `**Prix de départ :** ${prixDepart} ${symbol}\n` +
          `**ID :** \`${itemId}\``
        )],
        ephemeral: true,
      });
    }

    // ── /objet liste ───────────────────────────────────────────────────────
    if (sub === 'liste') {
      await interaction.deferReply({ ephemeral: true });
      const items = await db.listItems(interaction.guildId);

      if (items.length === 0) {
        return interaction.editReply({
          embeds: [warningEmbed('Aucun objet en stock. Utilise `/objet ajouter` pour en créer.')],
        });
      }

      const symbol = config?.currency_symbol || '🪙';

      // Affichage par lots de 10 objets maximum (limite des embeds Discord)
      const lines = items.slice(0, 20).map(item =>
        `\`${item.item_id}\` — **${item.name}** — ${item.start_price} ${symbol}`
      );

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📦 Stock d'objets — ${items.length} objet(s)`)
        .setDescription(lines.join('\n'))
        .setFooter({ text: 'Utilise /objet infos <id> pour plus de détails' })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    }

    // ── /objet infos ────────────────────────────────────────────────────────
    if (sub === 'infos') {
      const itemId = interaction.options.getString('id').trim();
      const item   = await db.getItem(interaction.guildId, itemId);

      if (!item) {
        return interaction.reply({
          embeds: [errorEmbed(`Objet \`${itemId}\` introuvable.`)],
          ephemeral: true,
        });
      }

      const symbol = config?.currency_symbol || '🪙';
      const embed  = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📦 ${item.name}`)
        .setDescription(item.description || '*Aucune description.*')
        .addFields(
          { name: 'Prix de départ', value: `${item.start_price} ${symbol}`, inline: true },
          { name: 'ID',             value: `\`${item.item_id}\``,            inline: true },
        )
        .setTimestamp();

      if (item.image_url) embed.setThumbnail(item.image_url);

      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /objet supprimer ───────────────────────────────────────────────────
    if (sub === 'supprimer') {
      const itemId = interaction.options.getString('id').trim();
      const deleted = await db.deleteItem(interaction.guildId, itemId);

      if (!deleted) {
        return interaction.reply({
          embeds: [errorEmbed(`Objet \`${itemId}\` introuvable.`)],
          ephemeral: true,
        });
      }

      return interaction.reply({
        embeds: [successEmbed(`Objet \`${itemId}\` supprimé du stock.`)],
        ephemeral: true,
      });
    }
  },
};
