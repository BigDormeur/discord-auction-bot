// ─────────────────────────────────────────────────────────────────────────────
// commands/config.js  —  /config
//
// Permet aux admins de configurer le bot pour leur serveur.
// Toute la config est stockée en BDD avec guild_id comme clé → chaque
// serveur a sa propre configuration indépendante.
//
// Sous-commandes :
//   /config voir             → affiche la config actuelle
//   /config salon-encheres   → définit le salon où les enchères sont postées
//   /config salon-logs       → définit le salon de logs
//   /config role-admin       → définit le rôle qui peut gérer les enchères
//   /config monnaie          → définit le symbole et le nom de la monnaie
//   /config increment        → définit l'incrément minimum entre deux mises
// ─────────────────────────────────────────────────────────────────────────────

const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const db = require('../utils/database');
const { buildConfigEmbed, successEmbed, errorEmbed } = require('../utils/embedBuilder');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configurer le bot d\'enchères pour ce serveur')
    // Visible uniquement des admins dans la liste de commandes Discord
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)

    .addSubcommand(sub => sub
      .setName('voir')
      .setDescription('Afficher la configuration actuelle'))

    .addSubcommand(sub => sub
      .setName('salon-encheres')
      .setDescription('Salon où les enchères seront postées')
      .addChannelOption(opt => opt
        .setName('salon')
        .setDescription('Le salon texte')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('salon-logs')
      .setDescription('Salon où les logs seront envoyés')
      .addChannelOption(opt => opt
        .setName('salon')
        .setDescription('Le salon texte')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('role-admin')
      .setDescription('Rôle autorisé à gérer les enchères (en plus des admins Discord)')
      .addRoleOption(opt => opt
        .setName('role')
        .setDescription('Le rôle')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('monnaie')
      .setDescription('Symbole et nom de la monnaie utilisée')
      .addStringOption(opt => opt
        .setName('symbole')
        .setDescription('Ex: 🪙 ou $ ou PO')
        .setRequired(true))
      .addStringOption(opt => opt
        .setName('nom')
        .setDescription('Ex: pièces ou dollars ou PO')
        .setRequired(true)))

    .addSubcommand(sub => sub
      .setName('increment')
      .setDescription('Montant minimum à ajouter à chaque enchère rapide')
      .addIntegerOption(opt => opt
        .setName('montant')
        .setDescription('Ex: 10')
        .setMinValue(1)
        .setRequired(true))),

  async execute(interaction) {
    // Sécurité : seulement dans un serveur
    if (!interaction.guildId) {
      return interaction.reply({ embeds: [errorEmbed('Cette commande doit être utilisée dans un serveur.')], ephemeral: true });
    }

    const config = await db.getGuildConfig(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    // Vérification des permissions (sauf pour /config voir)
    if (sub !== 'voir' && !isAdmin(interaction.member, config)) {
      return interaction.reply({
        embeds: [errorEmbed('Tu n\'as pas la permission d\'utiliser cette commande.')],
        ephemeral: true,
      });
    }

    // ── /config voir ──────────────────────────────────────────────────────────
    if (sub === 'voir') {
      const embed = buildConfigEmbed(config, interaction.guild);
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    // ── /config salon-encheres ────────────────────────────────────────────────
    if (sub === 'salon-encheres') {
      const channel = interaction.options.getChannel('salon');
      await db.upsertGuildConfig(interaction.guildId, { auction_channel: channel.id });
      return interaction.reply({
        embeds: [successEmbed(`Salon d'enchères défini : ${channel}`)],
        ephemeral: true,
      });
    }

    // ── /config salon-logs ────────────────────────────────────────────────────
    if (sub === 'salon-logs') {
      const channel = interaction.options.getChannel('salon');
      await db.upsertGuildConfig(interaction.guildId, { log_channel: channel.id });
      return interaction.reply({
        embeds: [successEmbed(`Salon de logs défini : ${channel}`)],
        ephemeral: true,
      });
    }

    // ── /config role-admin ────────────────────────────────────────────────────
    if (sub === 'role-admin') {
      const role = interaction.options.getRole('role');
      await db.upsertGuildConfig(interaction.guildId, { admin_role: role.id });
      return interaction.reply({
        embeds: [successEmbed(`Rôle admin défini : ${role}`)],
        ephemeral: true,
      });
    }

    // ── /config monnaie ───────────────────────────────────────────────────────
    if (sub === 'monnaie') {
      const symbole = interaction.options.getString('symbole');
      const nom     = interaction.options.getString('nom');
      await db.upsertGuildConfig(interaction.guildId, {
        currency_symbol: symbole,
        currency_name: nom,
      });
      return interaction.reply({
        embeds: [successEmbed(`Monnaie définie : **${symbole} ${nom}**`)],
        ephemeral: true,
      });
    }

    // ── /config increment ─────────────────────────────────────────────────────
    if (sub === 'increment') {
      const montant = interaction.options.getInteger('montant');
      await db.upsertGuildConfig(interaction.guildId, { min_increment: montant });
      return interaction.reply({
        embeds: [successEmbed(`Incrément minimum défini : **${montant}**`)],
        ephemeral: true,
      });
    }
  },
};
